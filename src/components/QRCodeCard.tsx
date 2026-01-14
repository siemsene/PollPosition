import { QRCodeCanvas } from 'qrcode.react'
import { Copy } from 'lucide-react'
import { useMemo } from 'react'

export default function QRCodeCard({ roomCode }: { roomCode: string }) {
  const url = useMemo(() => {
    const u = new URL(window.location.href)
    u.pathname = '/room'
    u.search = `?room=${encodeURIComponent(roomCode)}`
    u.hash = ''
    return u.toString()
  }, [roomCode])

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">Student link</div>
          <div className="text-sm text-slate-400 mt-1">
            Students can scan this QR or open the link.
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
          </div>
          <div className="mt-2 text-xs text-slate-500 break-all">{url}</div>
        </div>
        <div className="bg-white rounded-2xl p-3">
          <QRCodeCanvas value={url} size={132} includeMargin />
        </div>
      </div>
    </div>
  )
}
