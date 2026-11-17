# PageQuiz

**Turn any article into a live party quiz.** Paste a link (or text), PageQuiz
reads it, writes a fair multiple-choice quiz from that page only, and opens a
room. Friends join from their phones with a 5-letter code and answer against
the clock. Faster correct answers score more, and a live leaderboard and final
podium close it out.

Built on the [DeepSpace SDK](https://docs.deep.space).

Live: `https://<your-name>.app.space` (see [DEPLOY.md](./DEPLOY.md))

## How it works

```
Host browser ──createGame──▶ worker action ──firecrawl/scrape──▶ page markdown
                                   │        ──anthropic/chat-completion──▶ quiz JSON
                                   ▼                     (validated + reshuffled)
                        RecordRoom (Durable Object)
   games · questions · players   ◀── live subscriptions ──▶ every browser
   question_bank (private)  ·  answers (own-only)
                                   ▲
Player browser ──joinGame / submitAnswer──┘   Host ──startGame / revealQuestion / nextQuestion
```

- **All writes go through six server actions** (`src/actions/quiz.ts`). Clients
  have read-only access to game state, enforced by schema RBAC
  (`src/schemas/quiz-schemas.ts`).
- **The answer key never reaches a browser early.** Questions live in a
  `question_bank` collection no client role can read. The host's "open
  question" copies one question to the public `questions` collection, and its
  `correctIndex` is written only at reveal. Answers are graded at reveal too,
  because a player can read their own answer row.
- **The server owns time and scoring.** The server stamps the question start.
  `submitAnswer` refuses answers after the deadline (+1.5s grace) and stores
  the server-measured time. Points are 500–1000 based on speed. Reveal
  recomputes every score from the answer log, so a double reveal can't
  double-award points.
- **Real-time** comes from DeepSpace RecordRoom subscriptions (`useQuery`).
  The host's screen updates the moment someone answers, and every phone flips
  to the reveal together. A PresenceRoom (`usePresenceRoom`) shows who is
  connected in the lobby and on the leaderboard.

## DeepSpace features used, and why

| Feature | Why it's here |
|---|---|
| Auth (`AuthGate`, JWT on actions) | Leaderboard identity and anti-cheat: every answer is tied to a verified user. |
| RecordRoom + schema RBAC | Live game state for everyone, with private answer key and own-only answers enforced server-side. |
| Server actions | The single trusted path for game logic (host checks, phase checks, clock, scoring). |
| PresenceRoom | "Who's actually connected" in the lobby and on the leaderboard. |
| `firecrawl/scrape` integration | Reliable article text from arbitrary pages (JS rendering, boilerplate stripping). |
| `anthropic/chat-completion` integration | Writing the questions, distractors and explanations. |

### Integrations deliberately left out

- **ElevenLabs narration:** reading questions aloud sounds fun, but in a room
  the host's screen is the shared focus and phones would talk over each other.
  It adds cost per question without adding to the game.
- **Image generation (Gemini/Freepik):** decorative images per question would
  slow generation by tens of seconds and cost more than the quiz text, and the
  questions are about the text.
- **Firecrawl search / "quiz me on a topic":** this would turn PageQuiz into a
  generic trivia generator. Quizzing on a page you chose (the article your
  book club read, the doc your team should know) is the point. It also keeps
  questions grounded and checkable.
- **Payments/credits:** out of scope for a 5-day build. Spend is bounded by a
  per-host daily cap instead (see tradeoffs).

## Tradeoffs

- **Sign-in required for players.** A party game ideally has no login. But
  anonymous answers would make the leaderboard trivially spoofable, and
  server actions need a verified caller. I chose integrity over zero friction,
  and the join link pre-fills the code so it's one sign-in, once.
- **Synchronous generation.** `createGame` does scrape + LLM in one request
  (~10–40s) with staged progress copy. It could be a durable job (the scaffold
  ships a JobRoom). For a single bounded call, a request was simpler and its
  failure modes are clearer to the user.
- **Host-driven clock.** Auto-reveal runs in the host's browser when time is
  up or everyone has answered. If the host closes the tab mid-question, the
  game pauses until they come back (the server still refuses late answers). A
  scheduled server-side reveal would remove that dependency.
- **Owner-billed AI.** Integrations bill the app owner, so guests need no
  credits. That spend is capped at 15 quizzes per host per 24h, and private/
  local URLs are refused so the scraper can't be used as a network probe.

## What I'd do next

1. Server-side auto-reveal (a timer per open question) so the host tab isn't load-bearing.
2. Let the host edit or regenerate a question in the lobby before starting.
3. Guest play with a nickname-only session for players, keeping the host signed in.
4. Team mode and a "study" mode (self-paced, same quiz) for teachers.
5. QR code on the lobby screen.

## Verification

- `npm run test:unit`: 40 unit tests (incl. the scaffold's prerender checks) covering scoring, room codes, URL
  validation (incl. SSRF-style addresses), model-output parsing and shuffling,
  and the **permission model checked with the SDK's own `canRead`/`canCreate`**.
- `bash scripts/local-harness/run.sh` runs the **real built worker** under
  wrangler with locally minted JWTs and mocked integrations, and plays a 3-account
  game through every action (41 checks: host-only controls, phases, idempotent
  join, one answer per question, server deadline, double start/reveal). See
  [scripts/local-harness](./scripts/local-harness/README.md).
- `npx deepspace test run all` runs the scaffold's specs plus `tests/quiz.spec.ts`
  (two browsers; the full generated game runs with `PAGEQUIZ_E2E_AI=1`).

## Develop

```bash
npm install
npx deepspace auth login
npx deepspace dev start
```

Key files: `src/actions/quiz.ts` (game logic), `src/lib/quiz.ts` (pure
rules, unit-tested), `src/schemas/quiz-schemas.ts` (data + RBAC),
`src/pages/(app)/(protected)/g/[code].tsx` (live room).
