import { Copy, ExternalLink, HelpCircle } from 'lucide-react'
import { useMemo } from 'react'

export default function PublicResultsCard({ roomCode }: { roomCode: string }) {
  const url = useMemo(() => {
    const u = new URL(window.location.href)
    u.pathname = '/results'
    u.search = `?room=${encodeURIComponent(roomCode)}`
    u.hash = ''
    return u.toString()
  }, [roomCode])
  const graphUrl = useMemo(() => {
    const u = new URL(window.location.href)
    u.pathname = '/results/graph'
    u.search = `?room=${encodeURIComponent(roomCode)}`
    u.hash = ''
    return u.toString()
  }, [roomCode])

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold">Live results link</div>
          <div className="text-sm text-slate-400 mt-1">
            Share live results using either option below.
          </div>
        </div>
        <div>
          <a className="btn-ghost" href="/instructions">
            <HelpCircle size={16} /> How to display results
          </a>
        </div>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/30 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Option A</div>
          <div className="text-sm font-semibold mt-1">Live results page</div>
          <div className="text-sm text-slate-400 mt-1">
            Share this page to show the current graph without login.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              className="btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(url)
              }}
              title="Copy link"
            >
              <Copy size={16} />
            </button>
            <a className="btn-ghost" href={url} target="_blank" rel="noreferrer" title="Open link">
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="mt-2 text-xs text-slate-500 break-all">{url}</div>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/30 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Option B</div>
          <div className="text-sm font-semibold mt-1">Graph-only link (embed ready)</div>
          <div className="text-sm text-slate-400 mt-1">
            Use this link with the PowerPoint add-in to embed the graph directly.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              className="btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(graphUrl)
              }}
              title="Copy graph link"
            >
              <Copy size={16} />
            </button>
            <a className="btn-ghost" href={graphUrl} target="_blank" rel="noreferrer" title="Open graph link">
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="mt-2 text-xs text-slate-500 break-all">{graphUrl}</div>
        </div>
      </div>
    </div>
  )
}
