/**
 * Hub: join a room by code, or go host one. Lives under (app)/ but not
 * (protected)/ so a player who scanned a join link sees the code prefilled
 * before being asked to sign in.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuth, useQuery } from 'deepspace'
import { ArrowRight, Link2, Sparkles } from 'lucide-react'
import { Button, Input, Label, buttonVariants, useToast } from '@/components/ui'
import { Panel, RoomCode } from '@/components/quiz/parts'
import { callAction } from '@/lib/api'
import { CODE_LENGTH, QUIZ_LIMITS, normalizeRoomCode } from '@/lib/quiz'
import type { Game } from '@/lib/useGame'

export default function HomePage() {
  const [params] = useSearchParams()
  const { isSignedIn, userId } = useAuth()
  const navigate = useNavigate()
  const { error } = useToast()
  const [code, setCode] = useState(() => params.get('code')?.toUpperCase() ?? '')
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  async function join(e: FormEvent) {
    e.preventDefault()
    const clean = normalizeRoomCode(code)
    if (!clean) return error('Check the code', `Room codes are ${CODE_LENGTH} letters and numbers.`)
    if (!isSignedIn) return setShowAuth(true)
    setJoining(true)
    const res = await callAction<{ code: string }>('joinGame', { code: clean, nickname })
    setJoining(false)
    if (!res.success) {
      // The host's own join link lands here too: send them to their room.
      if (res.code === 'is_host') return navigate(`/g/${clean}`)
      return error("Couldn't join", res.error)
    }
    navigate(`/g/${res.data.code}`)
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
      <Panel className="pq-pop">
        <h1 className="font-display text-3xl font-bold">Join a game</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter the code on the host's screen.</p>
        <form onSubmit={join} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Room code</Label>
            <Input
              id="code"
              data-testid="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={CODE_LENGTH + 2}
              className="font-display h-14 text-center text-3xl font-bold tracking-[0.3em]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nick">Nickname (optional)</Label>
            <Input
              id="nick"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your account name is used if blank"
              maxLength={QUIZ_LIMITS.maxNicknameLength}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={joining} data-testid="join-submit">
            {isSignedIn ? 'Join' : 'Sign in to join'}
            <ArrowRight />
          </Button>
        </form>
      </Panel>

      <div className="space-y-6">
        <Panel className="pq-pop [animation-delay:80ms]">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          <h2 className="font-display mt-3 text-2xl font-bold">Host a quiz</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a link to any article. PageQuiz reads it, writes the questions, and opens a room your friends join
            from their phones.
          </p>
          <Link to="/host" className={buttonVariants({ variant: 'secondary', className: 'mt-5 w-full' })}>
            <Link2 /> Turn a page into a quiz
          </Link>
        </Panel>
        {isSignedIn && userId && <MyGames userId={userId} />}
      </div>

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

const STATUS_LABEL: Record<Game['status'], string> = {
  lobby: 'Lobby open',
  question: 'Live',
  reveal: 'Live',
  finished: 'Finished',
}

function MyGames({ userId }: { userId: string }) {
  const { records, status } = useQuery<Game>('games', {
    where: { hostId: userId },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 6,
  })
  if (status !== 'ready' || records.length === 0) return null
  return (
    <Panel className="pq-pop [animation-delay:160ms]">
      <h2 className="text-sm font-semibold text-muted-foreground">Your recent quizzes</h2>
      <ul className="mt-3 space-y-2">
        {records.map((r) => (
          <li key={r.recordId}>
            <Link
              to={`/g/${r.data.code}`}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <RoomCode code={r.data.code} size="sm" />
              <span className="flex-1 truncate text-sm">{r.data.title}</span>
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[r.data.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
