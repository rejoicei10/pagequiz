/**
 * PageQuiz building blocks. Answer options are always a color AND a shape,
 * so the game works for color-blind players and on a washed-out projector.
 */

import type { ReactNode } from 'react'
import { Check, Crown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTION_BG = ['bg-opt-0', 'bg-opt-1', 'bg-opt-2', 'bg-opt-3']
const OPTION_TEXT = ['text-opt-0', 'text-opt-1', 'text-opt-2', 'text-opt-3']
export const OPTION_NAMES = ['triangle', 'diamond', 'circle', 'square']

export function Shape({ index, className }: { index: number; className?: string }) {
  const common = { className: cn('h-5 w-5 shrink-0', className), viewBox: '0 0 24 24', 'aria-hidden': true }
  switch (index) {
    case 0:
      return (
        <svg {...common}>
          <path d="M12 3 22 20H2Z" fill="currentColor" />
        </svg>
      )
    case 1:
      return (
        <svg {...common}>
          <path d="M12 2 22 12 12 22 2 12Z" fill="currentColor" />
        </svg>
      )
    case 2:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
        </svg>
      )
  }
}

type TileState = 'idle' | 'picked' | 'dimmed' | 'correct' | 'wrong'

export function AnswerTile({
  index,
  label,
  state = 'idle',
  onClick,
  disabled,
  count,
  total,
  big,
}: {
  index: number
  label: string
  state?: TileState
  onClick?: () => void
  disabled?: boolean
  /** Reveal: how many players picked this. */
  count?: number
  total?: number
  big?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  const share = total && count !== undefined ? Math.round((count / total) * 100) : null
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick ? state === 'picked' : undefined}
      aria-label={onClick ? `${OPTION_NAMES[index]}: ${label}` : undefined}
      className={cn(
        'pq-pop relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-4 text-left font-semibold text-[#14122a] shadow-[var(--shadow-card)] transition',
        big ? 'min-h-24 py-4 text-lg sm:text-xl' : 'min-h-16 py-3 text-base',
        OPTION_BG[index],
        onClick && !disabled && 'cursor-pointer hover:brightness-110 active:scale-[0.98]',
        state === 'picked' && 'ring-4 ring-foreground ring-offset-2 ring-offset-background',
        state === 'dimmed' && 'opacity-35',
        state === 'wrong' && 'opacity-35 grayscale',
        state === 'correct' && 'ring-4 ring-foreground ring-offset-2 ring-offset-background',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {share !== null && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-black/15 transition-[width] duration-700"
          style={{ width: `${share}%` }}
        />
      )}
      <Shape index={index} className="relative" />
      <span className="relative flex-1 leading-snug">{label}</span>
      {state === 'correct' && <Check className="relative h-6 w-6" aria-label="correct answer" />}
      {state === 'wrong' && <X className="relative h-5 w-5" aria-hidden />}
      {count !== undefined && (
        <span className="relative rounded-full bg-black/20 px-2 py-0.5 text-sm tabular-nums">{count}</span>
      )}
    </Tag>
  )
}

export function CountdownRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const frac = total > 0 ? secondsLeft / total : 0
  const urgent = secondsLeft <= 5
  return (
    <div className="relative h-16 w-16 shrink-0" role="timer" aria-label={`${secondsLeft} seconds left`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={urgent ? 'var(--color-opt-0)' : 'var(--color-primary)'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span
        className={cn(
          'font-display absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums',
          urgent && 'text-opt-0',
        )}
      >
        {secondsLeft}
      </span>
    </div>
  )
}

export function RoomCode({ code, size = 'lg' }: { code: string; size?: 'lg' | 'sm' }) {
  return (
    <span
      className={cn(
        'font-display inline-flex select-all rounded-xl border border-border bg-card font-bold tracking-[0.25em] text-primary',
        size === 'lg' ? 'px-5 py-2 text-4xl sm:text-6xl' : 'px-2.5 py-1 text-base',
      )}
      aria-label={`Room code ${code.split('').join(' ')}`}
    >
      {code}
    </span>
  )
}

export interface BoardRow {
  userId: string
  name: string
  score: number
  correctCount: number
  rank: number
}

export function Leaderboard({
  rows,
  meId,
  online,
  limit,
  highlightTop,
}: {
  rows: BoardRow[]
  meId?: string | null
  online?: Set<string>
  limit?: number
  highlightTop?: boolean
}) {
  const shown = limit ? rows.slice(0, limit) : rows
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No players yet.</p>
  }
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {shown.map((p) => (
        <li
          key={p.userId}
          className={cn(
            'flex items-center gap-3 px-4 py-2.5',
            p.userId === meId && 'bg-primary/10',
            highlightTop && p.rank === 1 && 'bg-primary/15',
          )}
        >
          <span className="font-display w-6 text-right font-bold tabular-nums text-muted-foreground">{p.rank}</span>
          {online && (
            <span
              className={cn('h-2 w-2 rounded-full', online.has(p.userId) ? 'bg-opt-3' : 'bg-muted-foreground/40')}
              aria-label={online.has(p.userId) ? 'connected' : 'not connected'}
            />
          )}
          <span className="flex-1 truncate font-medium">
            {p.name}
            {p.userId === meId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
          </span>
          {highlightTop && p.rank === 1 && <Crown className="h-4 w-4 text-primary" aria-label="leader" />}
          <span className="font-display font-bold tabular-nums">{p.score.toLocaleString()}</span>
        </li>
      ))}
      {limit && rows.length > limit && (
        <li className="px-4 py-2 text-center text-xs text-muted-foreground">+{rows.length - limit} more</li>
      )}
    </ol>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6', className)}>
      {children}
    </section>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('font-display inline-flex items-center gap-2 font-bold', className)}>
      <span className="grid grid-cols-2 gap-0.5" aria-hidden>
        <Shape index={0} className="h-2.5 w-2.5 text-opt-0" />
        <Shape index={1} className="h-2.5 w-2.5 text-opt-1" />
        <Shape index={2} className="h-2.5 w-2.5 text-opt-2" />
        <Shape index={3} className="h-2.5 w-2.5 text-opt-3" />
      </span>
      PageQuiz
    </span>
  )
}

export { OPTION_TEXT }
