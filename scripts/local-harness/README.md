# Local server-side harness

`bash scripts/local-harness/run.sh` runs the real built worker (actions,
RecordRoom Durable Object, schemas) under `wrangler dev`, with:

- **auth**: an ES256 keypair minted on the spot; the worker is given the public
  key, and the script signs JWTs for `user-host`, `user-alice`, `user-bob`;
- **integrations**: `mock-api.mjs` stands in for the DeepSpace api-worker and
  answers `firecrawl/scrape` and `anthropic/chat-completion` with canned data.

`flow.mjs` then plays a full 5-question game through the server actions and
asserts 41 rules: URL/size validation, host-only controls, phase checks,
idempotent joins, one answer per question, the server-side deadline, double
start/reveal protection, and finishing. It is the check for logic that the
browser can't fake; the two-user browser test is `tests/quiz.spec.ts`.

The game state it leaves behind can be read from
`dist/pagequiz/.wrangler/state/v3/do/pagequiz-AppRecordRoom/*.sqlite`.
