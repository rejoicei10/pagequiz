# Deploying PageQuiz (on your own computer)

Requirements: Node 22.15+ (or 24/26) and **npm 11.6+** (`npm i -g npm@11` if `npm -v` says 10).

```bash
cd pagequiz
npm install

# 1. Sign in (opens a browser). Check it's the account you want to own the app.
npx deepspace auth login
npx deepspace auth whoami

# 2. (Optional) rename: the subdomain is `name` in wrangler.toml and APP_NAME in
#    src/constants.ts + [vars] APP_NAME in wrangler.toml. If "pagequiz" is taken,
#    pick e.g. "pagequiz-yourname" and change all three.

# 3. Register the app. This writes a server-minted DEEPSPACE_APP_ID into wrangler.toml.
npx deepspace app init --json
git add -A && git commit -m "Register app"

# 4. Run it locally and try a game with two browsers (one normal, one private window).
npx deepspace dev start

# 5. Tests: quick suite, then everything (needs 2 test accounts, see tests/collab.spec.ts)
npm run test:unit
npx deepspace test run
PAGEQUIZ_E2E_AI=1 npx deepspace test run all   # spends one real quiz generation

# 6. Ship it
npx deepspace deploy            # -> https://<name>.app.space
npx deepspace logs --follow --json   # watch a real game's actions
```

## Source control: decide before the first deploy

DeepSpace latches the app's source of truth **permanently** on the first
deploy/push:

- **GitHub (what the submission asks for: "the repository").** Create an
  empty GitHub repo, then *before* `npx deepspace deploy`:
  ```bash
  git remote add origin git@github.com:<you>/pagequiz.git
  git push -u origin HEAD
  ```
  The first deploy then claims that GitHub repo.
- **DeepSpace source.** Deploy without a GitHub remote, and use
  `npx deepspace push`. Don't mix the two.

## If something refuses

DeepSpace CLI refusals carry a stable `code` and sometimes an `action`. Run
the `action` if one is given. If there is none (e.g. a quota/slot refusal),
it's a choice for you to make, not a retry.
