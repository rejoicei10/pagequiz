/**
 * Quiz server actions — the only code that writes game state.
 *
 * Actions run RBAC-off (see src/server/action-routes.ts), so every handler
 * here does its own authorization: host-only steps compare `userId` with the
 * game's `hostId`, and player steps check the phase and the server clock.
 * Clients never send a score, a timestamp, or a correctness flag.
 */

import type { ActionContext, ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  QUIZ_LIMITS,
  buildQuizPrompts,
  cleanNickname,
  extractJsonObject,
  isWithinWindow,
  makeRoomCode,
  normalizeQuiz,
  normalizeRoomCode,
  prepareSourceText,
  scoreAnswer,
  tallyChoices,
  tallyScores,
  validateSourceUrl,
  type GameStatus,
} from '../lib/quiz'

/** Balanced quality/latency for question writing; see DEEPSPACE_AI_MODELS in the SDK. */
export const QUIZ_MODEL = 'claude-sonnet-5-5'

type Ctx = ActionContext<Env>
type Fail = { success: false; error: string; code?: string }

interface GameRow extends Record<string, unknown> {
  code: string
  hostId: string
  hostName: string
  title: string
  sourceUrl: string
  sourceTitle: string
  status: GameStatus
  currentIndex: number
  questionCount: number
  secondsPerQuestion: number
  questionStartedAt: number
}

interface BankRow extends Record<string, unknown> {
  gameId: string
  index: number
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

interface PlayerRow extends Record<string, unknown> {
  gameId: string
  userId: string
  name: string
  score: number
  correctCount: number
  lastAnsweredIndex: number
}

interface AnswerRow extends Record<string, unknown> {
  gameId: string
  userId: string
  index: number
  choice: number
  correct: number
  points: number
  msTaken: number
}

// Deterministic record ids make joins and answers idempotent: a retried
// request upserts the same row instead of creating a duplicate.
export const ids = {
  bank: (code: string, index: number) => `${code}-q${index}`,
  question: (code: string, index: number) => `${code}-q${index}`,
  player: (code: string, userId: string) => `${code}-p-${userId}`,
  answer: (code: string, index: number, userId: string) => `${code}-a${index}-${userId}`,
}

const fail = (error: string, code?: string): Fail => ({ success: false, error, code })

async function loadGame(tools: ActionTools, rawCode: unknown): Promise<{ game: GameRow; code: string } | Fail> {
  const code = normalizeRoomCode(rawCode)
  if (!code) return fail('That room code is not valid.', 'bad_code')
  const res = await tools.get<GameRow>('games', code)
  if (!res.success) return fail('No game with that code.', 'game_not_found')
  return { game: res.data.record.data, code }
}

function isFail(v: unknown): v is Fail {
  return !!v && typeof v === 'object' && (v as { success?: unknown }).success === false
}

/** Reads every matching row, following the room's `nextOffset` paging. */
async function queryAll<T extends Record<string, unknown>>(
  tools: ActionTools,
  collection: string,
  where: Record<string, unknown>,
): Promise<T[]> {
  const out: T[] = []
  let offset = 0
  for (let page = 0; page < 50; page++) {
    // `offset` is accepted by records.query but is not in the published
    // ActionTools option type yet.
    const res = (await tools.query<T>(collection, { where, limit: 200, offset } as never)) as ActionResult<{
      records: Array<{ data: T }>
      nextOffset?: number
    }>
    if (!res.success) throw new Error(`query_failed:${collection}:${res.error}`)
    out.push(...res.data.records.map((r) => r.data))
    if (typeof res.data.nextOffset !== 'number' || res.data.records.length === 0) break
    offset = res.data.nextOffset
  }
  return out
}

async function displayNameOf(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  if (!res.success) return 'Player'
  const { name, email } = res.data.record.data
  return name?.trim() || email?.split('@')[0] || 'Player'
}

// ---------------------------------------------------------------------------
// Source fetching + generation (integrations)
// ---------------------------------------------------------------------------

interface ScrapeData {
  markdown?: string
  metadata?: { title?: string }
}

/** Firecrawl's response nests differently depending on proxy version; find the page. */
function pickScrape(payload: unknown): ScrapeData | null {
  let cur: unknown = payload
  for (let depth = 0; depth < 3 && cur && typeof cur === 'object'; depth++) {
    const obj = cur as Record<string, unknown>
    if (typeof obj.markdown === 'string') return obj as ScrapeData
    cur = obj.data
  }
  return null
}

async function scrapeArticle(tools: ActionTools, url: string): Promise<{ text: string; title: string } | Fail> {
  const res = await tools.integration('firecrawl/scrape', {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    timeout: 30_000,
  })
  if (!res.success) {
    console.warn(`[quiz] scrape failed url=${JSON.stringify(url)} code=${res.code ?? ''} status=${res.status ?? ''}`)
    return fail("We couldn't read that page (it may be paywalled or block bots). Try pasting the text instead.", 'scrape_failed')
  }
  const page = pickScrape(res.data)
  const text = page?.markdown ?? ''
  if (text.trim().length < QUIZ_LIMITS.minSourceChars) {
    return fail("That page didn't have enough readable text. Try another link or paste the text.", 'too_short')
  }
  return { text, title: page?.metadata?.title?.slice(0, 200) ?? '' }
}

interface AnthropicReply {
  content?: Array<{ type?: string; text?: string }>
  response?: { content?: Array<{ type?: string; text?: string }> }
}

async function generateQuiz(tools: ActionTools, source: string, wanted: number, label: string) {
  const { system, user } = buildQuizPrompts(source, wanted, label)
  const res = await tools.integration<AnthropicReply>('anthropic/chat-completion', {
    model: QUIZ_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: user }],
  })
  if (!res.success) {
    console.warn(`[quiz] generation failed code=${res.code ?? ''} status=${res.status ?? ''}`)
    return fail('The quiz writer is unavailable right now. Please try again in a minute.', 'ai_failed')
  }
  const blocks = res.data.content ?? res.data.response?.content ?? []
  const text = blocks.map((b) => b.text ?? '').join('')
  try {
    return normalizeQuiz(extractJsonObject(text), wanted)
  } catch (err) {
    console.warn(`[quiz] unusable model output: ${String(err)}`)
    return fail("Couldn't build a good quiz from that source. Try a longer or more factual article.", 'bad_quiz')
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Host: turn a URL (or pasted text) into a quiz and open a lobby. */
const createGame: ActionHandler<Env> = async ({ userId, params, tools }: Ctx) => {
  const questionCount = QUIZ_LIMITS.questionCounts.includes(params.questionCount as 5)
    ? (params.questionCount as number)
    : 8
  const secondsPerQuestion = QUIZ_LIMITS.secondsOptions.includes(params.seconds as 20)
    ? (params.seconds as number)
    : 20

  // Each quiz spends the app owner's AI + scraping credits, so cap per host.
  const since = Date.now() - 24 * 60 * 60 * 1000
  const mine = await tools.query('games', { where: { hostId: userId }, orderBy: 'createdAt', orderDir: 'desc', limit: 50 })
  if (mine.success) {
    const recent = mine.data.records.filter((r) => Date.parse(r.createdAt) > since).length
    if (recent >= QUIZ_LIMITS.maxGamesPerDay) {
      return fail(`You've made ${recent} quizzes today. Come back tomorrow for more.`, 'rate_limited')
    }
  }

  let sourceText: string
  let sourceUrl = ''
  let sourceTitle = ''
  const pasted = typeof params.text === 'string' ? params.text.trim() : ''
  if (pasted) {
    if (pasted.length < QUIZ_LIMITS.minSourceChars) {
      return fail(`Paste at least ${QUIZ_LIMITS.minSourceChars} characters of text.`, 'too_short')
    }
    sourceText = pasted
  } else {
    const checked = validateSourceUrl(params.url)
    if (!checked.ok) return fail(checked.error, 'bad_url')
    const scraped = await scrapeArticle(tools, checked.url)
    if (isFail(scraped)) return scraped
    sourceText = scraped.text
    sourceUrl = checked.url
    sourceTitle = scraped.title
  }

  const quiz = await generateQuiz(tools, prepareSourceText(sourceText), questionCount, pasted ? 'text' : 'article')
  if (isFail(quiz)) return quiz

  let code = ''
  for (let attempt = 0; attempt < 6 && !code; attempt++) {
    const candidate = makeRoomCode()
    const existing = await tools.get('games', candidate)
    if (!existing.success) code = candidate
  }
  if (!code) return fail('Could not allocate a room code. Please try again.', 'code_exhausted')

  // Write the private answer key first, so a lobby never exists without it.
  for (const [index, q] of quiz.questions.entries()) {
    const res = await tools.create<BankRow>('question_bank', { gameId: code, index, ...q }, ids.bank(code, index))
    if (!res.success) return fail('Could not save the quiz. Please try again.', 'save_failed')
  }

  const game: GameRow = {
    code,
    hostId: userId,
    hostName: await displayNameOf(tools, userId),
    title: quiz.title,
    sourceUrl,
    sourceTitle,
    status: 'lobby',
    currentIndex: -1,
    questionCount: quiz.questions.length,
    secondsPerQuestion,
    questionStartedAt: 0,
  }
  const created = await tools.create<GameRow>('games', game, code)
  if (!created.success) return fail('Could not open the lobby. Please try again.', 'save_failed')
  console.info(`[quiz] created code=${code} questions=${quiz.questions.length} host=${userId}`)
  return { success: true, data: { code } }
}

/** Player: join a lobby (or a game in progress) under a nickname. Idempotent. */
const joinGame: ActionHandler<Env> = async ({ userId, params, tools }: Ctx) => {
  const loaded = await loadGame(tools, params.code)
  if (isFail(loaded)) return loaded
  const { game, code } = loaded
  if (game.hostId === userId) return fail("You're hosting this game. Open it on another account to play.", 'is_host')
  if (game.status === 'finished') return fail('That game has already finished.', 'finished')

  const playerId = ids.player(code, userId)
  const existing = await tools.get<PlayerRow>('players', playerId)
  const name = cleanNickname(params.nickname, await displayNameOf(tools, userId))
  if (existing.success) {
    if (existing.data.record.data.name !== name) await tools.update<PlayerRow>('players', playerId, { name })
    return { success: true, data: { code } }
  }

  const roster = await queryAll<PlayerRow>(tools, 'players', { gameId: code })
  if (roster.length >= QUIZ_LIMITS.maxPlayers) return fail('This game is full.', 'full')

  const res = await tools.create<PlayerRow>(
    'players',
    { gameId: code, userId, name, score: 0, correctCount: 0, lastAnsweredIndex: -1 },
    playerId,
  )
  if (!res.success) return fail('Could not join. Please try again.', 'save_failed')
  return { success: true, data: { code } }
}

async function requireHost(ctx: Ctx, expected: GameStatus[]): Promise<{ game: GameRow; code: string } | Fail> {
  const loaded = await loadGame(ctx.tools, ctx.params.code)
  if (isFail(loaded)) return loaded
  if (loaded.game.hostId !== ctx.userId) return fail('Only the host can do that.', 'forbidden')
  if (!expected.includes(loaded.game.status)) return fail('The game has already moved on.', 'wrong_phase')
  return loaded
}

/** Copies question `index` from the private bank to the public collection and starts its clock. */
async function openQuestion(tools: ActionTools, code: string, index: number): Promise<ActionResult | Fail> {
  const bank = await tools.get<BankRow>('question_bank', ids.bank(code, index))
  if (!bank.success) return fail('That question is missing.', 'missing_question')
  const q = bank.data.record.data
  const pub = await tools.create(
    'questions',
    { gameId: code, index, prompt: q.prompt, options: q.options, correctIndex: -1, explanation: '', tally: [] },
    ids.question(code, index),
  )
  if (!pub.success) return fail('Could not open the question.', 'save_failed')
  return tools.update<GameRow>('games', code, {
    status: 'question',
    currentIndex: index,
    questionStartedAt: Date.now(),
  })
}

/** Host: leave the lobby and open question 1. */
const startGame: ActionHandler<Env> = async (ctx: Ctx) => {
  const host = await requireHost(ctx, ['lobby'])
  if (isFail(host)) return host
  const roster = await queryAll<PlayerRow>(ctx.tools, 'players', { gameId: host.code })
  if (roster.length === 0) return fail('Wait for at least one player to join.', 'no_players')
  return openQuestion(ctx.tools, host.code, 0)
}

/** Player: lock in an answer. Correctness and points are decided here, never by the client. */
const submitAnswer: ActionHandler<Env> = async ({ userId, params, tools }: Ctx) => {
  const now = Date.now()
  const loaded = await loadGame(tools, params.code)
  if (isFail(loaded)) return loaded
  const { game, code } = loaded
  const index = Number(params.index)
  const choice = Number(params.choice)
  if (game.status !== 'question' || game.currentIndex !== index) return fail('Time is up for that question.', 'closed')
  if (!isWithinWindow({ now, startedAt: game.questionStartedAt, secondsPerQuestion: game.secondsPerQuestion })) {
    return fail('Time is up for that question.', 'closed')
  }
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) return fail('Pick one of the four answers.', 'bad_choice')

  const playerId = ids.player(code, userId)
  const player = await tools.get<PlayerRow>('players', playerId)
  if (!player.success) return fail("You haven't joined this game.", 'not_joined')

  const answerId = ids.answer(code, index, userId)
  const already = await tools.get('answers', answerId)
  if (already.success) return fail('You already answered this one.', 'already_answered')

  const bank = await tools.get<BankRow>('question_bank', ids.bank(code, index))
  if (!bank.success) return fail('That question is missing.', 'missing_question')
  const correct = bank.data.record.data.correctIndex === choice
  const msTaken = now - game.questionStartedAt
  const points = scoreAnswer({ correct, msTaken, secondsPerQuestion: game.secondsPerQuestion })

  const saved = await tools.create<AnswerRow>(
    'answers',
    { gameId: code, userId, index, choice, correct: correct ? 1 : 0, points, msTaken },
    answerId,
  )
  if (!saved.success) return fail('Could not save your answer. Try again.', 'save_failed')
  await tools.update<PlayerRow>('players', playerId, { lastAnsweredIndex: index })
  // Deliberately do not tell the player whether they were right: that is the reveal's job.
  return { success: true, data: { locked: true } }
}

/** Host: close the current question, publish the answer + pick counts, and recompute scores. */
const revealQuestion: ActionHandler<Env> = async (ctx: Ctx) => {
  const host = await requireHost(ctx, ['question'])
  if (isFail(host)) return host
  const { game, code } = host
  const index = game.currentIndex
  // Flip the phase first so late submissions are refused while we tally.
  const closed = await ctx.tools.update<GameRow>('games', code, { status: 'reveal' })
  if (!closed.success) return closed

  const bank = await ctx.tools.get<BankRow>('question_bank', ids.bank(code, index))
  if (!bank.success) return fail('That question is missing.', 'missing_question')
  const answers = await queryAll<AnswerRow>(ctx.tools, 'answers', { gameId: code })
  const thisRound = answers.filter((a) => a.index === index)

  await ctx.tools.update('questions', ids.question(code, index), {
    correctIndex: bank.data.record.data.correctIndex,
    explanation: bank.data.record.data.explanation,
    tally: tallyChoices(
      thisRound.map((a) => a.choice),
      bank.data.record.data.options.length,
    ),
  })

  const totals = tallyScores(answers, index)
  const roster = await queryAll<PlayerRow>(ctx.tools, 'players', { gameId: code })
  for (const p of roster) {
    const t = totals.get(p.userId) ?? { score: 0, correctCount: 0 }
    if (t.score !== p.score || t.correctCount !== p.correctCount) {
      await ctx.tools.update<PlayerRow>('players', ids.player(code, p.userId), t)
    }
  }
  return { success: true, data: { index } }
}

/** Host: go to the next question, or finish after the last one. */
const nextQuestion: ActionHandler<Env> = async (ctx: Ctx) => {
  const host = await requireHost(ctx, ['reveal'])
  if (isFail(host)) return host
  const next = host.game.currentIndex + 1
  if (next >= host.game.questionCount) {
    return ctx.tools.update<GameRow>('games', host.code, { status: 'finished' })
  }
  return openQuestion(ctx.tools, host.code, next)
}

export const quizActions: Record<string, ActionHandler<Env>> = {
  createGame,
  joinGame,
  startGame,
  submitAnswer,
  revealQuestion,
  nextQuestion,
}
