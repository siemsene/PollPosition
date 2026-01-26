import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Moon, Presentation, Sun, UserPlus, Users } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

export default function TopBar({ mode }: { mode: 'student' | 'instructor' | 'admin' }) {
  const loc = useLocation()
  const nav = useNavigate()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = window.localStorage.getItem('pp-theme')
    const next = stored === 'light' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    window.localStorage.setItem('pp-theme', next)
  }
  return (
    <div className="topbar sticky top-0 z-10 bg-slate-950/70 backdrop-blur border-b border-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-cyan-300 text-slate-950 flex items-center justify-center font-black tracking-tight">
            PP
          </div>
          <div className="leading-tight">
            <div className="font-semibold">PollPosition</div>
            <div className="text-xs text-slate-400">
              {mode === 'instructor' ? 'Instructor' : mode === 'admin' ? 'Admin' : 'Student'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} view`}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {theme === 'dark' ? 'Light view' : 'Dark view'}
          </button>
          {mode === 'student' ? (
            <>
              <Link className="btn-ghost" to="/admin" state={{ from: loc.pathname }}>
                <Presentation size={18} /> Instructor Sign-In
              </Link>
              <Link className="btn-ghost" to="/instructor/signup">
                <UserPlus size={18} /> Instructor Sign Up
              </Link>
            </>
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
