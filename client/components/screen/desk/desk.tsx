import { Link } from 'react-router'
import { useEffect, useState } from 'react'

import { CitationList } from '@/components/screen/desk/citation-list'
import { Container } from '@/components/layout'
import { Main } from '@/components/shell/main'
import { ThemeSelector } from '@/components/shell/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  answerDeskAsk,
  askDesk,
  createDeskRun,
  fetchDeskRun,
  type CitationDto,
  type DeskLibraryItemDto,
  type DeskRunDetail,
} from '@/lib/api'

export type DeskProps = {
  email: string
  library: DeskLibraryItemDto[]
}

type Mode = 'rag' | 'agent'

const TERMINAL = new Set(['done', 'failed', 'awaiting_human', 'cancelled'])

export function Desk({ email, library }: DeskProps) {
  const [mode, setMode] = useState<Mode>('agent')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // RAG mode
  const [answer, setAnswer] = useState<string | null>(null)
  const [citations, setCitations] = useState<CitationDto[]>([])
  const [refused, setRefused] = useState(false)

  // Agent mode
  const [threadId, setThreadId] = useState<string | null>(null)
  const [runDetail, setRunDetail] = useState<DeskRunDetail | null>(null)
  const [askReply, setAskReply] = useState('')

  useEffect(() => {
    const runId = runDetail?.run.id
    const status = runDetail?.run.status
    if (!runId || !status || TERMINAL.has(status)) return
    const t = setInterval(() => {
      void fetchDeskRun(runId)
        .then(setRunDetail)
        .catch(() => {})
    }, 800)
    return () => clearInterval(t)
  }, [runDetail?.run.id, runDetail?.run.status])

  return (
    <Main className="my-0 py-12">
      <Container className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-sm">
              <Link
                to="/dashboard"
                className="underline-offset-4 hover:underline"
              >
                Dashboard
              </Link>
              {' · '}
              Ops Desk
            </p>
            <h1 className="font-bold text-3xl tracking-tight">Ops Desk</h1>
            <p className="text-muted-foreground text-sm">
              Grounded ops answers with citations, plus an agent loop with HITL
              escalate and inspectable steps. Signed in as {email}.
            </p>
          </div>
          <ThemeSelector />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === 'agent' ? 'default' : 'outline'}
            onClick={() => setMode('agent')}
          >
            Agent
          </Button>
          <Button
            type="button"
            variant={mode === 'rag' ? 'default' : 'outline'}
            onClick={() => setMode('rag')}
          >
            Quick RAG
          </Button>
        </div>

        <section>
          <h2 className="font-heading text-lg tracking-tight">Library</h2>
          {library.length === 0 ? (
            <p className="mt-3 text-muted-foreground text-sm">
              No uploads yet. Upload fixtures from{' '}
              <code className="text-xs">fixtures/ops-corpus/</code> on the{' '}
              <Link
                to="/dashboard"
                className="underline-offset-4 hover:underline"
              >
                dashboard
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {library.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-border border-b pb-2 last:border-0"
                >
                  <span className="font-medium">{d.filename}</span>
                  <span className="text-muted-foreground text-xs">
                    {d.status}
                    {d.indexedAt ? ' · indexed' : ' · not embedded yet'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {mode === 'rag' ? (
          <>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault()
                const q = question.trim()
                if (!q || busy) return
                setBusy(true)
                setError(null)
                setRefused(false)
                try {
                  const res = await askDesk(q)
                  setAnswer(res.answer)
                  setCitations(res.citations)
                  setRefused(Boolean(res.refused))
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ask failed')
                  setAnswer(null)
                  setCitations([])
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Input
                className="flex-1"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Quick RAG ask…"
                disabled={busy}
                required
              />
              <Button type="submit" disabled={busy}>
                {busy ? 'Asking…' : 'Ask'}
              </Button>
            </form>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            {answer ? (
              <section className="space-y-2">
                <h2 className="font-heading text-lg tracking-tight">Answer</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {refused ? (
                    <span className="text-muted-foreground">{answer}</span>
                  ) : (
                    answer
                  )}
                </p>
                <CitationList citations={citations} />
              </section>
            ) : null}
          </>
        ) : (
          <>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault()
                const q = question.trim()
                if (!q || busy) return
                setBusy(true)
                setError(null)
                try {
                  const accepted = await createDeskRun({
                    input: q,
                    threadId: threadId ?? undefined,
                  })
                  setThreadId(accepted.threadId)
                  setQuestion('')
                  const detail = await fetchDeskRun(accepted.runId)
                  setRunDetail(detail)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Run failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Input
                className="flex-1"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Agent: search docs, escalate with ask_user…"
                disabled={busy}
                required
              />
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send'}
              </Button>
            </form>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            {runDetail ? (
              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="font-heading text-lg tracking-tight">
                    Run inspect
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {runDetail.run.id.slice(0, 8)}… · {runDetail.run.status}
                    {runDetail.run.stopReason
                      ? ` · ${runDetail.run.stopReason}`
                      : ''}
                  </p>
                  {runDetail.run.output ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {runDetail.run.output}
                    </p>
                  ) : null}
                  {runDetail.run.error ? (
                    <p className="text-destructive text-sm">
                      {runDetail.run.error}
                    </p>
                  ) : null}
                </div>

                <div>
                  <h3 className="font-medium text-sm">Steps</h3>
                  {runDetail.steps.length === 0 ? (
                    <p className="mt-1 text-muted-foreground text-xs">
                      Waiting for worker…
                    </p>
                  ) : (
                    <ol className="mt-2 space-y-2 text-xs">
                      {runDetail.steps.map((s) => (
                        <li
                          key={`${s.seq}-${s.type}`}
                          className="border-border border-l-2 pl-3"
                        >
                          <span className="font-medium">
                            {s.seq}. {s.type}
                          </span>
                          {s.name ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {s.name}
                            </span>
                          ) : null}
                          {s.payload ? (
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                              {s.payload}
                            </pre>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {runDetail.pendingAsk ? (
                  <form
                    className="space-y-3 border-border border-t pt-4"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const text = askReply.trim()
                      if (!text || busy || !runDetail.pendingAsk) return
                      setBusy(true)
                      setError(null)
                      try {
                        const accepted = await answerDeskAsk(
                          runDetail.pendingAsk.id,
                          text,
                          runDetail.run.threadId,
                        )
                        setAskReply('')
                        setThreadId(accepted.threadId)
                        const detail = await fetchDeskRun(accepted.runId)
                        setRunDetail(detail)
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : 'Answer failed',
                        )
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    <h3 className="font-medium text-sm">HITL — answer ask</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {runDetail.pendingAsk.questions.map((q) => (
                        <li key={q.id}>{q.prompt}</li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Input
                        className="flex-1"
                        value={askReply}
                        onChange={(e) => setAskReply(e.target.value)}
                        placeholder="Your reply / escalate decision…"
                        disabled={busy}
                        required
                      />
                      <Button type="submit" disabled={busy}>
                        Reply
                      </Button>
                    </div>
                  </form>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </Container>
    </Main>
  )
}
