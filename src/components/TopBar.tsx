import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Presentation, Users } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

export default function TopBar({ mode }: { mode: 'student' | 'instructor' }) {
  const loc = useLocation()
  const nav = useNavigate()
  return (
    <div className="sticky top-0 z-10 bg-slate-950/70 backdrop-blur border-b border-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-white text-slate-950 flex items-center justify-center font-black">
            M
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Menti-Lite</div>
            <div className="text-xs text-slate-400">{mode === 'instructor' ? 'Instructor' : 'Student'}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === 'student' ? (
            <Link className="btn-ghost" to="/admin" state={{ from: loc.pathname }}>
              <Presentation size={18} /> Instructor
            </Link>
          ) : (
            <>
              <Link className="btn-ghost" to="/">
                <Users size={18} /> Student view
              </Link>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await signOut(auth)
                  nav('/admin')
                }}
              >
                <LogOut size={18} /> Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
