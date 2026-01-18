import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import TopBar from '../components/TopBar'
import { Shield } from 'lucide-react'

export default function AdminLogin() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) nav('/admin/dashboard', { replace: true })
    })
    return () => unsub()
  }, [nav])

  async function login() {
    setError(null)
    setBusy(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      nav('/admin/dashboard', { replace: true })
    } catch (e: any) {
      setError(e?.message ?? 'Login failed')
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
              <div className="text-lg font-semibold">Instructor login</div>
              <div className="text-sm text-slate-400">Enter your password (email is fixed in <code className="text-slate-200">.env</code>).</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div>
              <div className="label mb-1">Instructor email</div>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="text-sm text-red-300">{error}</div>}

            <button className="btn w-full" onClick={login} disabled={busy || password.length === 0 || email.trim().length === 0}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="text-xs text-slate-400">
              Tip: create an Email/Password user in Firebase Auth with this email and password.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
