import { describe, expect, it } from 'vitest'
import {
  CODE_LENGTH,
  QUIZ_LIMITS,
  cleanNickname,
  extractJsonObject,
  isWithinWindow,
  makeRoomCode,
  normalizeQuiz,
  normalizeRoomCode,
  prepareSourceText,
  rankPlayers,
  scoreAnswer,
  shuffleOptions,
  tallyChoices,
  tallyScores,
  validateSourceUrl,
} from './quiz'

/** Deterministic PRNG so shuffles are reproducible. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const goodQuestion = (n: number, correctIndex = 0) => ({
  prompt: `Question ${n}?`,
  options: [`right ${n}`, `wrong a ${n}`, `wrong b ${n}`, `wrong c ${n}`],
  correctIndex,
  explanation: `Because ${n}.`,
})

describe('room codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    const rand = seeded(1)
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode(rand)
      expect(code).toHaveLength(CODE_LENGTH)
      expect(code).not.toMatch(/[01OIL]/)
      expect(normalizeRoomCode(code)).toBe(code)
    }
  })

  it('normalizes what people type', () => {
    expect(normalizeRoomCode(' ab cd2 ')).toBe('ABCD2')
    expect(normalizeRoomCode('abc')).toBeNull()
    expect(normalizeRoomCode('ABCD0')).toBeNull() // 0 is not in the alphabet
    expect(normalizeRoomCode(42)).toBeNull()
  })
})

describe('scoring', () => {
  it('awards 1000 for an instant correct answer and 500 at the buzzer', () => {
    expect(scoreAnswer({ correct: true, msTaken: 0, secondsPerQuestion: 20 })).toBe(1000)
    expect(scoreAnswer({ correct: true, msTaken: 10_000, secondsPerQuestion: 20 })).toBe(750)
    expect(scoreAnswer({ correct: true, msTaken: 20_000, secondsPerQuestion: 20 })).toBe(500)
  })

  it('clamps answers in the grace window and never goes negative', () => {
    expect(scoreAnswer({ correct: true, msTaken: 21_000, secondsPerQuestion: 20 })).toBe(500)
    expect(scoreAnswer({ correct: true, msTaken: -50, secondsPerQuestion: 20 })).toBe(1000)
  })

  it('gives nothing for a wrong answer', () => {
    expect(scoreAnswer({ correct: false, msTaken: 0, secondsPerQuestion: 20 })).toBe(0)
  })

  it('accepts answers until the timer plus grace', () => {
    const startedAt = 1_000_000
    const end = startedAt + 20_000
    expect(isWithinWindow({ now: end, startedAt, secondsPerQuestion: 20 })).toBe(true)
    expect(isWithinWindow({ now: end + QUIZ_LIMITS.graceMs, startedAt, secondsPerQuestion: 20 })).toBe(true)
    expect(isWithinWindow({ now: end + QUIZ_LIMITS.graceMs + 1, startedAt, secondsPerQuestion: 20 })).toBe(false)
  })
})

describe('tallyScores', () => {
  const answers = [
    { userId: 'a', index: 0, points: 900, correct: 1 },
    { userId: 'b', index: 0, points: 0, correct: 0 },
    { userId: 'a', index: 1, points: 600, correct: 1 },
    { userId: 'b', index: 1, points: 800, correct: 1 },
    { userId: 'a', index: 2, points: 700, correct: 1 }, // not revealed yet
    { userId: 'c', index: 1, points: 0, correct: -1 }, // ungraded never scores
  ]

  it('sums only revealed questions', () => {
    const t = tallyScores(answers, 1)
    expect(t.get('a')).toEqual({ score: 1500, correctCount: 2 })
    expect(t.get('b')).toEqual({ score: 800, correctCount: 1 })
    expect(t.get('c')).toEqual({ score: 0, correctCount: 0 })
  })

  it('is idempotent: running it twice yields the same totals', () => {
    expect(tallyScores(answers, 1)).toEqual(tallyScores(answers, 1))
  })
})

describe('tallyChoices', () => {
  it('counts picks per option and ignores junk', () => {
    expect(tallyChoices([0, 2, 2, 3, 9, -1], 4)).toEqual([1, 0, 2, 1])
  })
})

describe('rankPlayers', () => {
  it('shares ranks on ties', () => {
    const ranked = rankPlayers([
      { userId: '1', name: 'Cy', score: 500, correctCount: 1 },
      { userId: '2', name: 'Al', score: 900, correctCount: 1 },
      { userId: '3', name: 'Bo', score: 500, correctCount: 1 },
      { userId: '4', name: 'Di', score: 100, correctCount: 0 },
    ])
    expect(ranked.map((p) => [p.name, p.rank])).toEqual([
      ['Al', 1],
      ['Bo', 2],
      ['Cy', 2],
      ['Di', 4],
    ])
  })
})

describe('validateSourceUrl', () => {
  it('accepts public http(s) links', () => {
    expect(validateSourceUrl('https://en.wikipedia.org/wiki/Octopus')).toEqual({
      ok: true,
      url: 'https://en.wikipedia.org/wiki/Octopus',
    })
  })

  it.each([
    'ftp://example.com/file',
    'javascript:alert(1)',
    'http://localhost:8080',
    'http://127.0.0.1/admin',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.20.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'not a url',
    '',
  ])('rejects %s', (input) => {
    expect(validateSourceUrl(input).ok).toBe(false)
  })
})

describe('prepareSourceText', () => {
  it('drops images and collapses whitespace', () => {
    expect(prepareSourceText('Hello   world\n\n\n\n![alt](x.png)Next')).toBe('Hello world\n\nNext')
  })

  it('cuts long text at a paragraph boundary', () => {
    const para = 'x'.repeat(90)
    const text = Array.from({ length: 20 }, () => para).join('\n\n')
    const out = prepareSourceText(text, 1000)
    expect(out.length).toBeLessThanOrEqual(1000)
    expect(out.endsWith('x')).toBe(true)
  })
})

describe('extractJsonObject', () => {
  it('reads fenced and bare JSON', () => {
    expect(extractJsonObject('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJsonObject('here you go {"a":{"b":2}} enjoy')).toEqual({ a: { b: 2 } })
  })

  it('throws on no JSON', () => {
    expect(() => extractJsonObject('sorry, I cannot')).toThrow()
  })
})

describe('shuffleOptions', () => {
  it('keeps track of the correct answer', () => {
    const rand = seeded(7)
    for (let i = 0; i < 50; i++) {
      const { options, correctIndex } = shuffleOptions(['A', 'B', 'C', 'D'], 2, rand)
      expect(options[correctIndex]).toBe('C')
      expect([...options].sort()).toEqual(['A', 'B', 'C', 'D'])
    }
  })
})

describe('normalizeQuiz', () => {
  it('keeps valid questions and preserves which option is right after shuffling', () => {
    const quiz = normalizeQuiz(
      { title: '  Octopus   facts ', questions: [1, 2, 3, 4].map((n) => goodQuestion(n, n % 4)) },
      4,
      seeded(3),
    )
    expect(quiz.title).toBe('Octopus facts')
    expect(quiz.questions).toHaveLength(4)
    quiz.questions.forEach((q, i) => {
      const n = i + 1
      const originallyRight = goodQuestion(n, n % 4).options[n % 4]
      expect(q.options[q.correctIndex]).toBe(originallyRight)
    })
  })

  it('drops malformed questions and caps at the requested count', () => {
    const quiz = normalizeQuiz(
      {
        title: 'Mixed',
        questions: [
          goodQuestion(1),
          { ...goodQuestion(2), options: ['only', 'three', 'options'] },
          { ...goodQuestion(3), correctIndex: 4 },
          { ...goodQuestion(4), options: ['same', 'same', 'x', 'y'] },
          goodQuestion(1), // duplicate prompt
          goodQuestion(5),
          goodQuestion(6),
          goodQuestion(7),
        ],
      },
      3,
    )
    expect(quiz.questions.map((q) => q.prompt)).toEqual(['Question 1?', 'Question 5?', 'Question 6?'])
  })

  it('fails when too few questions survive', () => {
    expect(() => normalizeQuiz({ questions: [goodQuestion(1), goodQuestion(2)] }, 5)).toThrow('too_few_valid_questions')
    expect(() => normalizeQuiz('nope', 5)).toThrow()
  })
})

describe('cleanNickname', () => {
  it('trims, caps, and falls back', () => {
    expect(cleanNickname('  Quiz   Queen  ', 'x')).toBe('Quiz Queen')
    expect(cleanNickname('', 'Ada Lovelace')).toBe('Ada Lovelace')
    expect(cleanNickname(undefined, '')).toBe('Player')
    expect(cleanNickname('a'.repeat(40), 'x').length).toBe(QUIZ_LIMITS.maxNicknameLength)
  })
})
