import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import TopBar from '../components/TopBar'
import { friendlyError } from '../lib/errors'
import { Shield } from 'lucide-react'

export default function AdminLogin() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u && !u.isAnonymous) {
        getDoc(doc(db, 'config', 'admin'))
          .then((snap) => {
            const isAdmin = snap.exists() && snap.data()?.uid === u.uid
            nav(isAdmin ? '/admin/overview' : '/admin/dashboard', { replace: true })
          })
          .catch(() => {
            nav('/admin/dashboard', { replace: true })
          })
      } else if (u?.isAnonymous) {
        auth.signOut().catch(() => {})
      }
    })
    return () => unsub()
  }, [nav])

  async function login() {
    setError(null)
    setBusy(true)
    try {
      if (auth.currentUser?.isAnonymous) {
        await auth.signOut()
      }
      await signInWithEmailAndPassword(auth, email, password)
      const snap = await getDoc(doc(db, 'config', 'admin'))
      const isAdmin = snap.exists() && snap.data()?.uid === auth.currentUser?.uid
      nav(isAdmin ? '/admin/overview' : '/admin/dashboard', { replace: true })
    } catch (e: any) {
      setError(friendlyError(e, 'Login failed. Please try again.'))
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
              <Shield size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold">Login</div>
              <div className="text-sm text-slate-400">Sign in with the email and password you used to register.</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div>
              <div className="label mb-1">Email</div>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="label mb-1">Password</div>
              <input
                className="input"
                type="password"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="text-sm text-red-300">{error}</div>}

            <button type="button" className="btn w-full" onClick={login} disabled={busy || password.length === 0 || email.trim().length === 0}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm text-cyan-300 hover:text-cyan-200 hover:underline"
                onClick={() => nav('/forgot-password')}
              >
                Forgot your password?
              </button>
            </div>

            <div className="border-t border-slate-700/60 pt-3 mt-2 text-sm text-slate-400">
              Need access?{' '}
              <button
                type="button"
                className="text-slate-200 hover:underline"
                onClick={() => nav('/instructor/signup')}
              >
                Apply to be an instructor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
