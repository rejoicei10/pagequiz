/**
 * PageQuiz end-to-end: a host and a player in separate browsers.
 *
 * The cheap specs always run. The full-game spec generates a real quiz
 * (one Anthropic call on the app owner's account, a few cents), so it only
 * runs when PAGEQUIZ_E2E_AI=1:
 *   PAGEQUIZ_E2E_AI=1 npx deepspace test run all
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const SOURCE = `The octopus is a soft-bodied, eight-limbed mollusc of the order Octopoda.
An octopus has three hearts: two pump blood through the gills, while the third circulates it
through the rest of the body. Its blood is blue because it uses the copper-rich protein
hemocyanin, rather than iron-based hemoglobin, to carry oxygen. Around two-thirds of an
octopus's neurons are located in its arms, which can act with a degree of independence.
Octopuses are known for camouflage: specialised skin cells called chromatophores let them
change colour and texture in a fraction of a second. Most species live for only one to two
years, and many die shortly after reproducing. When threatened, many octopuses release a
cloud of ink to confuse predators and escape. The largest known species is the giant Pacific
octopus, which can weigh more than 50 kilograms.`

test('server actions refuse signed-out callers', async ({ request }) => {
  const res = await request.post('/api/actions/createGame', { data: { text: SOURCE } })
  expect(res.status()).toBe(401)
})

const accounts = loadAllTestAccounts().length

test.describe('with test accounts', () => {
  test.skip(accounts < 2, `Needs 2 test accounts, found ${accounts}. See tests/collab.spec.ts.`)

  test('joining an unknown room shows a clear error', async ({ users }) => {
    const [a] = await users(1)
    await a.page.goto('/home')
    await a.page.getByTestId('join-code').fill('ZZZZZ')
    await a.page.getByTestId('join-submit').click()
    await expect(a.page.getByText('No game with that code.')).toBeVisible({ timeout: 15_000 })
  })

  test('a full game: generate, join, answer, reveal, finish', async ({ users }) => {
    test.skip(process.env.PAGEQUIZ_E2E_AI !== '1', 'Set PAGEQUIZ_E2E_AI=1 to spend one real generation.')
    test.setTimeout(180_000)
    const [host, player] = await users(2)

    // Host generates from pasted text (no scraping, so the test is stable).
    await host.page.goto('/host')
    await host.page.getByRole('tab', { name: /Paste text/ }).click()
    await host.page.getByLabel('Text').fill(SOURCE)
    await host.page.getByRole('button', { name: '5', exact: true }).click()
    await host.page.getByTestId('host-submit').click()
    await host.page.waitForURL(/\/g\/[A-Z0-9]{5}$/, { timeout: 120_000 })
    const code = host.page.url().split('/').pop()!

    // Player joins through the share link.
    await player.page.goto(`/home?code=${code}`)
    await player.page.getByLabel('Nickname (optional)').fill('E2E Player')
    await player.page.getByTestId('join-submit').click()
    await expect(player.page.getByText("You're in, E2E Player!")).toBeVisible({ timeout: 20_000 })

    // The host sees them arrive live, then starts.
    await expect(host.page.getByTestId('player-count')).toHaveText('1', { timeout: 15_000 })
    await host.page.getByTestId('start-game').click()

    for (let q = 0; q < 5; q++) {
      await expect(player.page.getByTestId('player-prompt')).toBeVisible({ timeout: 20_000 })
      await player.page.getByRole('button', { name: /^triangle:/ }).click()
      // Everyone answered, so the host auto-reveals.
      await expect(player.page.getByTestId('reveal-banner')).toBeVisible({ timeout: 20_000 })
      await expect(player.page.getByTestId('reveal-banner')).not.toHaveText(/Scoring/, { timeout: 10_000 })
      await host.page.getByRole('button', { name: q === 4 ? /Final results/ : /Next question/ }).click()
    }

    await expect(player.page.getByText(/You finished/)).toBeVisible({ timeout: 20_000 })
    await expect(host.page.getByLabel('Podium')).toBeVisible()
  })
})
