/**
 * Landing — a STATIC page (no providers, prerendered at build). Keep it
 * renderable without a browser: no window/document during render.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Logo, Shape } from '../components/quiz/parts'
import { seo } from '../seo'

const STEPS = [
  { title: 'Paste a link', body: 'Any article, blog post, or Wikipedia page. Or paste the text.' },
  { title: 'AI writes the quiz', body: 'Questions come only from the page, with an answer key players never see.' },
  { title: 'Play live', body: 'Friends join with a 5-letter code. Fast right answers score more.' },
]

const DEMO = ['A tentacle', 'Three hearts', 'Blue blood', 'Nine brains']

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo className="text-lg" />
          <Link to="/home" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Have a code?
          </Link>
        </header>

        <main className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 md:grid-cols-2 md:pt-16">
          <section>
            <p className="pq-pop mb-4 text-sm font-semibold uppercase tracking-widest text-primary">Live party quiz</p>
            <h1 className="pq-pop font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl [animation-delay:60ms]">
              Turn any page into a game night.
            </h1>
            <p className="pq-pop mt-5 max-w-md text-lg text-muted-foreground [animation-delay:120ms]">
              Drop in a link. PageQuiz reads it, writes a fair multiple-choice quiz, and opens a room your friends,
              class, or team join from their phones.
            </p>
            <div className="pq-pop mt-8 flex flex-wrap gap-3 [animation-delay:180ms]">
              <Link
                to="/host"
                className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground transition hover:brightness-110"
              >
                Host a quiz
              </Link>
              <Link
                to="/home"
                className="inline-flex h-12 items-center rounded-lg border border-border px-6 font-semibold transition hover:bg-accent"
              >
                Join with a code
              </Link>
            </div>
          </section>

          <section aria-label="Example question" className="pq-pop [animation-delay:240ms]">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card-hover)]">
              <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span>Question 3 of 8</span>
                <span className="font-display rounded-md border border-border px-2 py-0.5 tracking-[0.25em] text-primary">
                  KQ7RM
                </span>
              </div>
              <p className="font-display text-xl font-bold">According to the article, what does an octopus have three of?</p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {DEMO.map((label, i) => (
                  <div
                    key={label}
                    className={[
                      'flex min-h-14 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#14122a]',
                      ['bg-opt-0', 'bg-opt-1', 'bg-opt-2', 'bg-opt-3'][i],
                      i === 1 ? 'ring-4 ring-foreground ring-offset-2 ring-offset-card' : 'opacity-40',
                    ].join(' ')}
                  >
                    <Shape index={i} className="h-4 w-4" />
                    {label}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Why:</span> two pump blood through the gills, one
                through the body.
              </p>
            </div>
          </section>
        </main>

        <section className="border-t border-border bg-[var(--color-shell)]">
          <ol className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="font-display text-sm font-bold text-primary">0{i + 1}</span>
                <h2 className="font-display mt-1 text-xl font-bold">{s.title}</h2>
                <p className="mt-1 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mx-auto max-w-6xl px-5 py-8 text-xs text-muted-foreground">
          Built on DeepSpace. Quizzes are AI-generated from the page you provide; double-check anything that matters.
        </footer>
      </div>
    </>
  )
}
