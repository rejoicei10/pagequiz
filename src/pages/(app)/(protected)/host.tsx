/**
 * Host setup: a link (or pasted text) in, a live lobby out.
 * Generation takes ~10–40s (scrape + model), so the wait gets honest,
 * staged copy instead of a bare spinner.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Link2, Wand2 } from 'lucide-react'
import { Button, Input, Label, Textarea, useToast } from '@/components/ui'
import { Panel } from '@/components/quiz/parts'
import { callAction } from '@/lib/api'
import { QUIZ_LIMITS } from '@/lib/quiz'
import { cn } from '@/lib/utils'

type Source = 'url' | 'text'

const STAGES = ['Reading the page…', 'Picking out the key ideas…', 'Writing questions…', 'Shuffling answers…', 'Almost there…']

export default function HostPage() {
  const navigate = useNavigate()
  const { error } = useToast()
  const [source, setSource] = useState<Source>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [questionCount, setQuestionCount] = useState<number>(8)
  const [seconds, setSeconds] = useState<number>(20)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!busy) return setStage(0)
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000)
    return () => clearInterval(t)
  }, [busy])

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await callAction<{ code: string }>('createGame', {
      ...(source === 'url' ? { url } : { text }),
      questionCount,
      seconds,
    })
    setBusy(false)
    if (!res.success) {
      if (res.code === 'scrape_failed' || res.code === 'too_short') setSource('text')
      return error("Couldn't make that quiz", res.error)
    }
    navigate(`/g/${res.data.code}`)
  }

  const canSubmit = source === 'url' ? url.trim().length > 8 : text.trim().length >= QUIZ_LIMITS.minSourceChars

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Turn a page into a quiz</h1>
      <p className="mt-2 text-muted-foreground">
        Questions come only from what's on the page, so whoever read it closest wins.
      </p>

      <Panel className="pq-pop mt-8">
        <form onSubmit={create} className="space-y-6">
          <div role="tablist" aria-label="Quiz source" className="inline-flex rounded-lg bg-muted p-1">
            {(
              [
                ['url', 'Link', Link2],
                ['text', 'Paste text', FileText],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={source === id}
                onClick={() => setSource(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  source === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          {source === 'url' ? (
            <div className="space-y-1.5">
              <Label htmlFor="url">Article link</Label>
              <Input
                id="url"
                data-testid="host-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/Octopus"
                className="h-12"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                News, blog posts, Wikipedia, docs. Paywalled pages usually fail; paste their text instead.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="text">Text</Label>
              <Textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste an article, chapter, meeting notes, study guide…"
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                {text.trim().length.toLocaleString()} characters
                {text.trim().length < QUIZ_LIMITS.minSourceChars && ` (at least ${QUIZ_LIMITS.minSourceChars})`}
                {text.length > QUIZ_LIMITS.maxSourceChars && ` · only the first ${QUIZ_LIMITS.maxSourceChars.toLocaleString()} are used`}
              </p>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <ChoiceRow
              label="Questions"
              options={QUIZ_LIMITS.questionCounts}
              value={questionCount}
              onChange={setQuestionCount}
            />
            <ChoiceRow
              label="Seconds per question"
              options={QUIZ_LIMITS.secondsOptions}
              value={seconds}
              onChange={setSeconds}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={!canSubmit}
            data-testid="host-submit"
          >
            {busy ? (
              <span aria-live="polite">{STAGES[stage]}</span>
            ) : (
              <>
                <Wand2 /> Generate quiz
              </>
            )}
          </Button>
        </form>
      </Panel>
    </div>
  )
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly number[]
  value: number
  onChange: (n: number) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cn(
              'font-display h-10 flex-1 rounded-lg border text-sm font-bold tabular-nums transition-colors',
              value === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
