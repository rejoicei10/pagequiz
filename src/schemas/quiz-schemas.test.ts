/**
 * The security model, checked with the SDK's own permission evaluator
 * (the same canRead/canCreate/canUpdate the RecordRoom runs server-side).
 */
import { describe, expect, it } from 'vitest'
import { ROLE_ANONYMOUS, canCreate, canDelete, canRead, canUpdate, lintSchemas } from 'deepspace/worker'
import { answersSchema, gamesSchema, playersSchema, questionBankSchema, questionsSchema, quizSchemas } from './quiz-schemas'

const HOST = 'user-host'
const ALICE = 'user-alice'
const BOB = 'user-bob'

const rec = (createdBy: string, data: Record<string, unknown> = {}) => ({ createdBy, data })

describe('quiz schemas', () => {
  it('pass the SDK schema lint', () => {
    expect(lintSchemas(quizSchemas)).toEqual([])
  })

  it('no member can write any quiz collection directly (actions only)', () => {
    for (const schema of quizSchemas) {
      expect(canCreate(schema, 'member'), schema.name).toBe(false)
      expect(canUpdate(schema, 'member', rec(ALICE), ALICE), schema.name).toBe(false)
      expect(canDelete(schema, 'member', rec(ALICE), ALICE), schema.name).toBe(false)
    }
  })

  it('the answer key is unreadable, even by the host who created the game', () => {
    const key = rec(HOST, { gameId: 'ABCDE', correctIndex: 2 })
    expect(canRead(questionBankSchema, 'member', key, HOST)).toBe(false)
    expect(canRead(questionBankSchema, 'member', key, ALICE)).toBe(false)
    expect(canRead(questionBankSchema, 'admin', key, HOST)).toBe(false)
  })

  it('players can read only their own answers', () => {
    const alicesAnswer = rec(ALICE, { gameId: 'ABCDE', choice: 1 })
    expect(canRead(answersSchema, 'member', alicesAnswer, ALICE)).toBe(true)
    expect(canRead(answersSchema, 'member', alicesAnswer, BOB)).toBe(false)
    expect(canRead(answersSchema, 'member', alicesAnswer, HOST)).toBe(false)
  })

  it('live game state is readable by any signed-in member', () => {
    for (const schema of [gamesSchema, questionsSchema, playersSchema]) {
      expect(canRead(schema, 'member', rec(HOST), BOB), schema.name).toBe(true)
    }
  })

  it('signed-out visitors cannot read anything', () => {
    for (const schema of quizSchemas) {
      expect(canRead(schema, ROLE_ANONYMOUS, rec(HOST), 'anon-123'), schema.name).toBe(false)
    }
  })
})
