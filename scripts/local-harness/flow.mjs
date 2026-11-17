import { SignJWT, importPKCS8 } from 'jose'
import fs from 'node:fs'
const BASE = 'http://127.0.0.1:8799'
const key = await importPKCS8(fs.readFileSync(new URL('./.keys/priv.pem', import.meta.url), 'utf8'), 'ES256')
const tok = (sub) => new SignJWT({ name: sub }).setProtectedHeader({ alg: 'ES256' }).setSubject(sub).setIssuer('local-test').setIssuedAt().setExpirationTime('1h').sign(key)
const T = { host: await tok('user-host'), alice: await tok('user-alice'), bob: await tok('user-bob') }
async function act(who, name, params) {
  const r = await fetch(`${BASE}/api/actions/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${T[who]}` }, body: JSON.stringify(params) })
  const j = await r.json(); return j
}
let pass = 0, failn = 0
const check = (label, cond, extra='') => { (cond ? pass++ : failn++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} ${cond ? '' : JSON.stringify(extra)}`) }

let r = await act('host', 'createGame', { url: 'http://localhost/admin' })
check('rejects private URL', r.success === false && r.code === 'bad_url', r)
r = await act('host', 'createGame', { text: 'too short' })
check('rejects short text', r.success === false && r.code === 'too_short', r)
r = await act('host', 'createGame', { url: 'https://en.wikipedia.org/wiki/Octopus', questionCount: 5, seconds: 15 })
check('createGame from URL', r.success && /^[A-Z0-9]{5}$/.test(r.data.code), r)
const code = r.data?.code
r = await act('host', 'startGame', { code })
check('cannot start with no players', r.code === 'no_players', r)
r = await act('host', 'joinGame', { code })
check('host cannot join own game', r.code === 'is_host', r)
r = await act('alice', 'joinGame', { code: 'zzzzz' })
check('unknown code', r.code === 'game_not_found', r)
r = await act('alice', 'joinGame', { code: code.toLowerCase(), nickname: '  Alice  ' })
check('alice joins (lowercase code)', r.success, r)
r = await act('alice', 'joinGame', { code, nickname: 'Alice' })
check('join is idempotent', r.success, r)
r = await act('bob', 'joinGame', { code, nickname: 'Bob' })
check('bob joins', r.success, r)
r = await act('alice', 'startGame', { code })
check('player cannot start', r.code === 'forbidden', r)
r = await act('alice', 'submitAnswer', { code, index: 0, choice: 0 })
check('cannot answer in lobby', r.code === 'closed', r)
r = await act('host', 'startGame', { code })
check('host starts', r.success, r)
r = await act('host', 'startGame', { code })
check('double start refused', r.code === 'wrong_phase', r)

r = await act('alice', 'submitAnswer', { code, index: 1, choice: 0 })
check('cannot answer a future question', r.code === 'closed', r)
r = await act('alice', 'submitAnswer', { code, index: 0, choice: 7 })
check('invalid choice', r.code === 'bad_choice', r)
r = await act('alice', 'submitAnswer', { code, index: 0, choice: 0 })
check('alice answers', r.success && r.data.locked === true && !('correct' in r.data), r)
r = await act('alice', 'submitAnswer', { code, index: 0, choice: 1 })
check('no second answer', r.code === 'already_answered', r)
r = await act('bob', 'revealQuestion', { code })
check('player cannot reveal', r.code === 'forbidden', r)
await new Promise((res) => setTimeout(res, 1500))
r = await act('bob', 'submitAnswer', { code, index: 0, choice: 2 })
check('bob answers (slower, wrong)', r.success, r)
r = await act('host', 'revealQuestion', { code })
check('host reveals', r.success, r)
r = await act('host', 'revealQuestion', { code })
check('double reveal refused', r.code === 'wrong_phase', r)
r = await act('bob', 'submitAnswer', { code, index: 0, choice: 0 })
check('no answers after reveal', r.code === 'closed', r)

// Play the remaining 4 questions; alice always right, bob always wrong.
for (let i = 1; i < 5; i++) {
  r = await act('host', 'nextQuestion', { code }); check(`next -> q${i}`, r.success, r)
  r = await act('alice', 'submitAnswer', { code, index: i, choice: 0 })
  check(`alice answers q${i}`, r.success, r)
  if (i === 3) {
    // bob doesn't answer q3; also test the deadline: wait past 15s + grace
    console.log('   (waiting 17s to test the deadline)')
    await new Promise((res) => setTimeout(res, 17000))
    r = await act('bob', 'submitAnswer', { code, index: i, choice: 1 })
    check('late answer refused by server clock', r.code === 'closed', r)
  } else {
    r = await act('bob', 'submitAnswer', { code, index: i, choice: 1 }); check(`bob answers q${i}`, r.success, r)
  }
  r = await act('host', 'revealQuestion', { code }); check(`reveal q${i}`, r.success, r)
}
r = await act('host', 'nextQuestion', { code }); check('finish', r.success, r)
r = await act('host', 'nextQuestion', { code }); check('cannot advance a finished game', r.code === 'wrong_phase', r)
r = await act('alice', 'joinGame', { code }); check('re-join after finish refused', r.code === 'finished', r)
console.log(`\ncode=${code}  ${pass} passed, ${failn} failed`)

