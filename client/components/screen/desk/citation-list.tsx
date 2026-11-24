import type { CitationDto } from '@/lib/api'

/** Visible source passages for Ops Desk answers. */
export function CitationList({ citations }: { citations: CitationDto[] }) {
  if (citations.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      <p className="font-medium text-muted-foreground text-xs tracking-wide uppercase">
        Citations
      </p>
      <ol className="space-y-2 text-sm">
        {citations.map((c, i) => (
          <li
            key={`${c.chunkId}-${i}`}
            className="border-border border-l-2 pl-3 text-muted-foreground"
          >
            <p className="font-medium text-foreground text-xs">
              [{i + 1}] {c.filename}
              {typeof c.score === 'number' ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  score {c.score.toFixed(3)}
                </span>
              ) : null}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
              {c.content}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}
