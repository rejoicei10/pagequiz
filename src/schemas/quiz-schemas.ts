/**
 * Quiz collections.
 *
 * Security model: clients may READ live game state but never WRITE it.
 * Every write goes through a server action in src/actions/, which checks who
 * the caller is (host vs player), the game phase, and the clock. That is why
 * every member `create/update/delete` below is false.
 *
 * The answer key lives in `question_bank`, which no client role can read.
 * A question is copied into the public `questions` collection only when the
 * host opens it, and its `correctIndex` is filled in only at reveal — so
 * neither future questions nor the right answer ever reach a browser early.
 * Individual `answers` are readable only by the player who gave them, so
 * nobody can watch what others picked before the reveal.
 */

import type { CollectionSchema } from 'deepspace/schema'

const serverOnlyWrites = { create: false, update: false, delete: false } as const

export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain', required: true, maxLength: 8 },
    { name: 'hostId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'hostName', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'title', storage: 'text', interpretation: 'plain', maxLength: 120 },
    { name: 'sourceUrl', storage: 'text', interpretation: { kind: 'url' }, maxLength: 2048 },
    { name: 'sourceTitle', storage: 'text', interpretation: 'plain', maxLength: 200 },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['lobby', 'question', 'reveal', 'finished'] },
    },
    { name: 'currentIndex', storage: 'number', interpretation: 'plain' },
    { name: 'questionCount', storage: 'number', interpretation: 'plain' },
    { name: 'secondsPerQuestion', storage: 'number', interpretation: 'plain' },
    /** Server clock (ms) when the current question opened. */
    { name: 'questionStartedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    member: { read: true, ...serverOnlyWrites },
    admin: { read: true, create: false, update: false, delete: true },
  },
}

/** Private answer key. Only server actions (RBAC-off) read it. */
export const questionBankSchema: CollectionSchema = {
  name: 'question_bank',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'index', storage: 'number', interpretation: 'plain' },
    { name: 'prompt', storage: 'text', interpretation: 'plain', maxLength: 400 },
    { name: 'options', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'correctIndex', storage: 'number', interpretation: 'plain' },
    { name: 'explanation', storage: 'text', interpretation: 'plain', maxLength: 400 },
  ],
  permissions: {
    member: { read: false, ...serverOnlyWrites },
    admin: { read: false, create: false, update: false, delete: true },
  },
}

/** Questions as players see them. Present only once opened; answer filled at reveal. */
export const questionsSchema: CollectionSchema = {
  name: 'questions',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'index', storage: 'number', interpretation: 'plain' },
    { name: 'prompt', storage: 'text', interpretation: 'plain', maxLength: 400 },
    { name: 'options', storage: 'text', interpretation: { kind: 'json' } },
    /** -1 until revealed. */
    { name: 'correctIndex', storage: 'number', interpretation: 'plain' },
    { name: 'explanation', storage: 'text', interpretation: 'plain', maxLength: 400 },
    /** Per-option pick counts, written at reveal. */
    { name: 'tally', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: {
    member: { read: true, ...serverOnlyWrites },
    admin: { read: true, create: false, update: false, delete: true },
  },
}

export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain', maxLength: 40 },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'correctCount', storage: 'number', interpretation: 'plain' },
    /** Highest question index this player has answered; drives "7/9 answered". */
    { name: 'lastAnsweredIndex', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    member: { read: true, ...serverOnlyWrites },
    admin: { read: true, create: false, update: false, delete: true },
  },
}

export const answersSchema: CollectionSchema = {
  name: 'answers',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'index', storage: 'number', interpretation: 'plain' },
    { name: 'choice', storage: 'number', interpretation: 'plain' },
    { name: 'correct', storage: 'number', interpretation: 'plain' },
    { name: 'points', storage: 'number', interpretation: 'plain' },
    { name: 'msTaken', storage: 'number', interpretation: 'plain' },
  ],
  // `own` = the record's creator. Actions write as the calling player, so each
  // player can read back only their own answers.
  permissions: {
    member: { read: 'own', ...serverOnlyWrites },
    admin: { read: 'own', create: false, update: false, delete: true },
  },
}

export const quizSchemas = [gamesSchema, questionBankSchema, questionsSchema, playersSchema, answersSchema]
