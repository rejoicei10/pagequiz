/**
 * The live room. One URL for everyone: the host sees the "big screen"
 * controls, players see answer pads. Every state change arrives over the
 * RecordRoom subscription in useGame; buttons only call server actions.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, usePresenceRoom } from 'deepspace'
import { ArrowRight, Check, Copy, ExternalLink, Play, Trophy, Users, X } from 'lucide-react'
import { Button, Input, Label, buttonVariants, useToast } from '@/components/ui'
import { AnswerTile, CountdownRing, Leaderboard, Panel, RoomCode } from '@/components/quiz/parts'
import { callAction } from '@/lib/api'
import { QUIZ_LIMITS, normalizeRoomCode } from '@/lib/quiz'
import { useCountdown, useGame, type Game, type MyAnswer, type PublicQuestion } from '@/lib/useGame'
import { cn } from '@/lib/utils'

type Ranked = ReturnType<typeof useGame>['players']

export default function GameRoute() {
  const params = useParams()
  const code = normalizeRoomCode(params.code)
  if (!code) return <Missing />
  return <GameRoom code={code} />
}

function GameRoom({ code }: { code: string }) {
  const { userId } = useAuth()
  const { status, game, current, players, playersReady, myAnswers } = useGame(code)
  const { peers } = usePresenceRoom(`game:${code}`)
  const online = useMemo(() => {
    const s = new Set(peers.map((p) => p.userId))
    if (userId) s.add(userId)
    return s
  }, [peers, userId])

  if (status === 'loading') return <Centered className="pq-pulse text-muted-foreground">Connecting to room…</Centered>
  if (!game) return <Missing />

  const isHost = game.hostId === userId
  const me = players.find((p) => p.userId === userId)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <Header game={game} />
      {isHost ? (
        <HostView game={game} current={current} players={players} online={online} />
      ) : !playersReady ? (
        <Centered className="pq-pulse text-muted-foreground">Loading players…</Centered>
      ) : !me && game.status === 'finished' ? (
        <FinalResults game={game} players={players} />
      ) : !me ? (
        <JoinInline game={game} />
      ) : (
        <PlayerView game={game} current={current} players={players} myAnswers={myAnswers} meId={userId!} />
      )}
    </div>
  )
}

function Header({ game }: { game: Game }) {
  const progress =
    game.status === 'lobby'
      ? 'Lobby'
      : game.status === 'finished'
        ? 'Final results'
        : `Question ${game.currentIndex + 1} of ${game.questionCount}`
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{progress}</p>
        <h1 className="font-display truncate text-2xl font-bold sm:text-3xl">{game.title}</h1>
        {game.sourceUrl && (
          <a
            href={game.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
          >
            {game.sourceTitle || new URL(game.sourceUrl).hostname} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      {game.status !== 'lobby' && <RoomCode code={game.code} size="sm" />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

function useHostAction() {
  const { error } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  async function run(name: string, code: string) {
    setBusy(name)
    const res = await callAction(name, { code })
    setBusy(null)
    // wrong_phase means another tab (or the auto-reveal) already did it.
    if (!res.success && res.code !== 'wrong_phase') error('Something went wrong', res.error)
  }
  return { busy, run }
}

function HostView({
  game,
  current,
  players,
  online,
}: {
  game: Game
  current?: PublicQuestion
  players: Ranked
  online: Set<string>
}) {
  const { busy, run } = useHostAction()
  const live = game.status === 'question'
  const secondsLeft = useCountdown(game.questionStartedAt, game.secondsPerQuestion, live)
  const answered = players.filter((p) => p.lastAnsweredIndex >= game.currentIndex).length
  const everyoneIn = players.length > 0 && answered >= players.length

  // Auto-reveal when time runs out or everyone has answered — once per question.
  // Keyed on the boolean (not the ticking clock) so the pending timer is not
  // cancelled by the next countdown tick.
  const shouldReveal = live && (secondsLeft === 0 || everyoneIn)
  const revealedFor = useRef(-1)
  useEffect(() => {
    if (!shouldReveal || revealedFor.current === game.currentIndex) return
    const index = game.currentIndex
    // A short beat after the last answer feels less abrupt than an instant cut.
    const delay = secondsLeft > 0 ? 700 : 0
    const t = setTimeout(() => {
      revealedFor.current = index
      void run('revealQuestion', game.code)
    }, delay)
    return () => clearTimeout(t)
  }, [shouldReveal, game.currentIndex, game.code])

  if (game.status === 'lobby') {
    return <HostLobby game={game} players={players} online={online} busy={busy} onStart={() => run('startGame', game.code)} />
  }
  if (game.status === 'finished') return <FinalResults game={game} players={players} />
  if (!current) return <Centered className="pq-pulse text-muted-foreground">Opening question…</Centered>

  const revealed = game.status === 'reveal' && current.correctIndex >= 0
  const total = current.tally?.reduce((a, b) => a + b, 0) ?? 0
  const last = game.currentIndex + 1 >= game.questionCount

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Panel className="pq-pop flex items-start gap-4" key={`q-${game.currentIndex}`}>
          <p className="font-display flex-1 text-2xl font-bold leading-tight sm:text-3xl" data-testid="host-prompt">
            {current.prompt}
          </p>
          {live && <CountdownRing secondsLeft={secondsLeft} total={game.secondsPerQuestion} />}
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          {current.options.map((opt, i) => (
            <AnswerTile
              key={`${game.currentIndex}-${i}`}
              index={i}
              label={opt}
              big
              state={!revealed ? 'idle' : i === current.correctIndex ? 'correct' : 'wrong'}
              count={revealed ? (current.tally?.[i] ?? 0) : undefined}
              total={revealed ? total : undefined}
            />
          ))}
        </div>
        {revealed && current.explanation && (
          <p className="pq-pop rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Why: </span>
            {current.explanation}
          </p>
        )}
      </div>

      <aside className="space-y-4">
        <Panel className="space-y-3">
          {live ? (
            <>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" aria-hidden />
                <span data-testid="answered-count">
                  <span className="font-display text-lg font-bold text-foreground">{answered}</span> of {players.length}{' '}
                  answered
                </span>
              </p>
              <Button
                variant="secondary"
                className="w-full"
                loading={busy === 'revealQuestion'}
                onClick={() => run('revealQuestion', game.code)}
              >
                Reveal answer now
              </Button>
            </>
          ) : (
            <Button className="w-full" size="lg" loading={busy === 'nextQuestion'} onClick={() => run('nextQuestion', game.code)}>
              {last ? (
                <>
                  <Trophy /> Final results
                </>
              ) : (
                <>
                  Next question <ArrowRight />
                </>
              )}
            </Button>
          )}
        </Panel>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Leaderboard</h2>
          <Leaderboard rows={players} online={online} limit={8} highlightTop={revealed} />
        </div>
      </aside>
    </div>
  )
}

function HostLobby({
  game,
  players,
  online,
  busy,
  onStart,
}: {
  game: Game
  players: Ranked
  online: Set<string>
  busy: string | null
  onStart: () => void
}) {
  const { success } = useToast()
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/home?code=${game.code}` : ''
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Panel className="pq-pop flex flex-col items-center justify-center gap-5 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Go to <span className="font-semibold text-foreground">{window.location.host}</span> and enter
        </p>
        <span data-testid="lobby-code">
          <RoomCode code={game.code} />
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(joinUrl)
            success('Join link copied')
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-4 w-4" aria-hidden /> Copy join link
        </button>
        <p className="text-sm text-muted-foreground">
          {game.questionCount} questions · {game.secondsPerQuestion}s each
        </p>
      </Panel>
      <aside className="space-y-4">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Players</h2>
            <span className="font-display text-lg font-bold tabular-nums" data-testid="player-count">
              {players.length}
            </span>
          </div>
          {players.length === 0 ? (
            <p className="pq-pulse py-6 text-center text-sm text-muted-foreground">Waiting for players to join…</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {players.map((p) => (
                <li
                  key={p.userId}
                  className="pq-pop inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-sm"
                >
                  <span
                    className={cn('h-2 w-2 rounded-full', online.has(p.userId) ? 'bg-opt-3' : 'bg-muted-foreground/40')}
                    aria-label={online.has(p.userId) ? 'connected' : 'not connected'}
                  />
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Button
          size="lg"
          className="w-full"
          disabled={players.length === 0}
          loading={busy === 'startGame'}
          onClick={onStart}
          data-testid="start-game"
        >
          <Play /> Start game
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          You're the host: show this screen to the room. Players answer on their own devices.
        </p>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function JoinInline({ game }: { game: Game }) {
  const { error } = useToast()
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await callAction('joinGame', { code: game.code, nickname })
    setBusy(false)
    if (!res.success) error("Couldn't join", res.error)
  }
  return (
    <Panel className="pq-pop mx-auto max-w-md">
      <h2 className="font-display text-2xl font-bold">Join {game.hostName ? `${game.hostName}'s` : 'this'} game</h2>
      <form onSubmit={join} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nick-inline">Nickname (optional)</Label>
          <Input
            id="nick-inline"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={QUIZ_LIMITS.maxNicknameLength}
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Join game <ArrowRight />
        </Button>
      </form>
    </Panel>
  )
}

function PlayerView({
  game,
  current,
  players,
  myAnswers,
  meId,
}: {
  game: Game
  current?: PublicQuestion
  players: Ranked
  myAnswers: MyAnswer[]
  meId: string
}) {
  const { error } = useToast()
  const me = players.find((p) => p.userId === meId)!
  const live = game.status === 'question'
  const secondsLeft = useCountdown(game.questionStartedAt, game.secondsPerQuestion, live)
  const saved = myAnswers.find((a) => a.index === game.currentIndex)
  // Optimistic pick so the tile locks instantly; the server answer row confirms it.
  const [pending, setPending] = useState<{ index: number; choice: number } | null>(null)
  const myChoice = saved?.choice ?? (pending?.index === game.currentIndex ? pending.choice : undefined)

  async function pick(choice: number) {
    if (myChoice !== undefined) return
    const index = game.currentIndex
    setPending({ index, choice })
    const res = await callAction('submitAnswer', { code: game.code, index, choice })
    if (!res.success && res.code !== 'already_answered') {
      setPending(null)
      error("Answer not counted", res.error)
    }
  }

  if (game.status === 'lobby') {
    return (
      <Panel className="pq-pop mx-auto max-w-md text-center">
        <Check className="mx-auto h-10 w-10 rounded-full bg-opt-3 p-2 text-[#14122a]" aria-hidden />
        <h2 className="font-display mt-4 text-2xl font-bold">You're in, {me.name}!</h2>
        <p className="pq-pulse mt-1 text-sm text-muted-foreground">Waiting for the host to start…</p>
        <p className="mt-6 text-xs text-muted-foreground">{players.length} player{players.length === 1 ? '' : 's'} in the room</p>
      </Panel>
    )
  }
  if (game.status === 'finished') return <FinalResults game={game} players={players} meId={meId} />
  if (!current) return <Centered className="pq-pulse text-muted-foreground">Get ready…</Centered>

  const revealed = game.status === 'reveal' && current.correctIndex >= 0
  const timeUp = live && secondsLeft === 0

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Panel className="pq-pop flex items-start gap-4" key={`pq-${game.currentIndex}`}>
        <p className="font-display flex-1 text-xl font-bold leading-snug sm:text-2xl" data-testid="player-prompt">
          {current.prompt}
        </p>
        {live && <CountdownRing secondsLeft={secondsLeft} total={game.secondsPerQuestion} />}
      </Panel>

      {revealed && <RevealBanner answer={saved} me={me} />}

      <div className="grid gap-3">
        {current.options.map((opt, i) => {
          let state: 'idle' | 'picked' | 'dimmed' | 'correct' | 'wrong' = 'idle'
          if (revealed) state = i === current.correctIndex ? 'correct' : 'wrong'
          else if (myChoice !== undefined) state = i === myChoice ? 'picked' : 'dimmed'
          return (
            <AnswerTile
              key={`${game.currentIndex}-${i}`}
              index={i}
              label={opt}
              state={state}
              onClick={live && myChoice === undefined && !timeUp ? () => void pick(i) : undefined}
            />
          )
        })}
      </div>

      {live && myChoice !== undefined && (
        <p className="pq-pulse text-center text-sm text-muted-foreground" aria-live="polite">
          Locked in. Waiting for everyone else…
        </p>
      )}
      {live && myChoice === undefined && timeUp && (
        <p className="text-center text-sm text-muted-foreground" aria-live="polite">
          Time's up!
        </p>
      )}
      {revealed && current.explanation && (
        <p className="rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          {current.explanation}
        </p>
      )}
      {revealed && <p className="pq-pulse text-center text-xs text-muted-foreground">Next question soon…</p>}
    </div>
  )
}

function RevealBanner({ answer, me }: { answer?: MyAnswer; me: Ranked[number] }) {
  const graded = answer && answer.correct !== -1
  const right = graded && answer.correct === 1
  return (
    <div
      className={cn(
        'pq-pop flex items-center gap-3 rounded-xl px-4 py-3 font-semibold text-[#14122a]',
        !answer ? 'bg-muted text-foreground' : right ? 'bg-opt-3' : 'bg-opt-0',
      )}
      data-testid="reveal-banner"
      aria-live="polite"
    >
      {!answer ? null : right ? <Check className="h-6 w-6" aria-hidden /> : <X className="h-6 w-6" aria-hidden />}
      <span className="flex-1">
        {!answer ? 'No answer this round' : !graded ? 'Scoring…' : right ? `Correct! +${answer.points}` : 'Not this time'}
      </span>
      <span className="text-sm opacity-80">
        #{me.rank} · {me.score.toLocaleString()} pts
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function FinalResults({ game, players, meId }: { game: Game; players: Ranked; meId?: string }) {
  const podium = players.slice(0, 3)
  const me = meId ? players.find((p) => p.userId === meId) : undefined
  const order = [1, 0, 2] // silver, gold, bronze
  const heights = ['h-28', 'h-20', 'h-14']
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {me && (
        <p className="pq-pop text-center text-lg">
          You finished <span className="font-display text-2xl font-bold text-primary">#{me.rank}</span> with{' '}
          {me.score.toLocaleString()} points ({me.correctCount}/{game.questionCount} right).
        </p>
      )}
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-3" aria-label="Podium">
          {order.map((slot) => {
            const p = podium[slot]
            if (!p) return <div key={slot} className="w-28" />
            return (
              <div key={p.userId} className="pq-pop flex w-28 flex-col items-center gap-2" style={{ animationDelay: `${(2 - slot) * 150}ms` }}>
                {slot === 0 && <Trophy className="h-7 w-7 text-primary" aria-hidden />}
                <span className="w-full truncate text-center text-sm font-semibold">{p.name}</span>
                <span className="font-display text-sm tabular-nums text-muted-foreground">{p.score.toLocaleString()}</span>
                <div
                  className={cn(
                    'font-display flex w-full items-start justify-center rounded-t-lg pt-2 text-2xl font-bold text-[#14122a]',
                    heights[slot],
                    slot === 0 ? 'bg-primary' : slot === 1 ? 'bg-opt-1' : 'bg-opt-0',
                  )}
                >
                  {p.rank}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {players.length > 0 && <Leaderboard rows={players} meId={meId} />}
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/host" className={buttonVariants({})}>
          Host your own quiz
        </Link>
        {game.sourceUrl && (
          <a href={game.sourceUrl} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: 'outline' })}>
            Read the article <ExternalLink />
          </a>
        )}
      </div>
    </div>
  )
}

function Centered({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-[40vh] items-center justify-center text-center', className)}>{children}</div>
}

function Missing() {
  return (
    <Centered>
      <div>
        <h1 className="font-display text-2xl font-bold">No game here</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check the code and try again.</p>
        <Link to="/home" className={buttonVariants({ className: 'mt-5' })}>
          Enter a code
        </Link>
      </div>
    </Centered>
  )
}
