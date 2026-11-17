/**
 * Live view of one game: every hook here is a real-time RecordRoom
 * subscription, so host and players re-render the moment an action writes.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'deepspace'
import { rankPlayers, type GameStatus } from './quiz'

export interface Game {
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

export interface PublicQuestion {
  gameId: string
  index: number
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  tally: number[]
}

export interface Player {
  gameId: string
  userId: string
  name: string
  score: number
  correctCount: number
  lastAnsweredIndex: number
}

export interface MyAnswer {
  gameId: string
  userId: string
  index: number
  choice: number
  correct: number
  points: number
  msTaken: number
}

export function useGame(code: string) {
  const games = useQuery<Game>('games', { where: { code }, limit: 1 })
  const questions = useQuery<PublicQuestion>('questions', { where: { gameId: code }, limit: 20 })
  const players = useQuery<Player>('players', { where: { gameId: code }, limit: 100 })
  // RBAC returns only the caller's own answers.
  const myAnswers = useQuery<MyAnswer>('answers', { where: { gameId: code }, limit: 20 })

  const game = games.records[0]?.data
  const current = useMemo(
    () => questions.records.find((q) => q.data.index === game?.currentIndex)?.data,
    [questions.records, game?.currentIndex],
  )
  const ranked = useMemo(() => rankPlayers(players.records.map((p) => p.data)), [players.records])

  return {
    status: games.status,
    playersReady: players.status === 'ready',
    game,
    current,
    players: ranked,
    myAnswers: myAnswers.records.map((r) => r.data),
  }
}

/**
 * Estimates (server clock − this device's clock) in ms from the HTTP Date
 * header, so a phone whose clock is a few seconds off still shows the right
 * countdown. Date has 1s resolution; the +500 centers that error.
 */
let cachedOffset: Promise<number> | null = null
function serverClockOffset(): Promise<number> {
  cachedOffset ??= (async () => {
    try {
      const t0 = Date.now()
      const res = await fetch('/robots.txt', { method: 'HEAD', cache: 'no-store' })
      const t1 = Date.now()
      const date = Date.parse(res.headers.get('date') ?? '')
      if (Number.isNaN(date)) return 0
      const offset = date + 500 - (t0 + t1) / 2
      return Math.abs(offset) < 1500 ? 0 : offset // ignore sub-resolution noise
    } catch {
      return 0
    }
  })()
  return cachedOffset
}

/**
 * Seconds left on the current question. The server clock is the authority
 * (it rejects late answers after a short grace); this is only the display.
 */
export function useCountdown(startedAt: number, seconds: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    void serverClockOffset().then(setOffset)
  }, [])
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [active])
  if (!active || !startedAt) return seconds
  return Math.max(0, Math.ceil((startedAt + seconds * 1000 - (now + offset)) / 1000))
}
