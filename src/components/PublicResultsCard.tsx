import { Copy, ExternalLink } from 'lucide-react'
import { useMemo } from 'react'

export default function PublicResultsCard({ roomCode }: { roomCode: string }) {
  const url = useMemo(() => {
    const u = new URL(window.location.href)
    u.pathname = '/results'
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
            Share this page to show the current graph without login.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-mono bg-slate-950/50 border border-slate-800 rounded-lg px-2 py-1">
              Room: <span className="text-white">{roomCode}</span>
            </span>
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
      </div>
    </div>
  )
}
