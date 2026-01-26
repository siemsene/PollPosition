import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { ensureAnonymousAuth } from '../firebase'
import { ArrowRight, QrCode } from 'lucide-react'

export default function StudentHome() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomFromUrl = params.get('room') ?? ''
  const [room, setRoom] = useState(roomFromUrl)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ensureAnonymousAuth().catch(() => {})
  }, [])

  async function join() {
    if (!room.trim()) return
    setBusy(true)
    try {
      await ensureAnonymousAuth()
      nav(`/room?room=${encodeURIComponent(room.trim().toUpperCase())}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <TopBar mode="student" />
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card p-6">
          <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/10 border border-slate-800 flex items-center justify-center">
                <QrCode size={20} />
              </div>
              <div>
                <div className="text-lg font-semibold">Join a room</div>
                <div className="text-sm text-slate-400">Scan the QR code or enter the 6-character room code.</div>
              </div>
          </div>

          <div className="mt-6 space-y-3">
            <div>
              <div className="label mb-1">Room code</div>
              <input
                className="input text-lg tracking-widest uppercase"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="ABC123"
              />
            </div>

            <button className="btn w-full" onClick={join} disabled={busy || room.trim().length < 4}>
              <ArrowRight size={18} /> {busy ? 'Joining...' : 'Join'}
            </button>

            <div className="text-xs text-slate-500">
              Tip: if you scanned a QR code, you should land directly in the room.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
