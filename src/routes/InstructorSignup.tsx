import { useEffect, useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { auth, db } from '../firebase'
import { ShieldCheck } from 'lucide-react'

export default function InstructorSignup() {
  const nav = useNavigate()
  const [user, setUser] = useState(() => auth.currentUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agreeLiability, setAgreeLiability] = useState(false)
  const [agreeCosts, setAgreeCosts] = useState(false)
  const [agreeRemoval, setAgreeRemoval] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (u && submitted) {
        nav('/admin/dashboard', { replace: true })
      }
    })
    return () => unsub()
  }, [nav, submitted])

  const canSubmit = agreeLiability && agreeCosts && agreeRemoval && !busy

  async function submitApplication() {
    if (!canSubmit) return
    setError(null)
    setBusy(true)
    try {
      let currentUser = user
      if (currentUser?.isAnonymous) {
        await auth.signOut()
        currentUser = null
      }
      if (!currentUser) {
        if (!email.trim() || password.length < 6) {
          setError('Use a valid email and a password with at least 6 characters.')
          setBusy(false)
          return
        }
        if (password !== confirm) {
          setError('Passwords do not match.')
          setBusy(false)
          return
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        currentUser = cred.user
      }
      if (!currentUser) {
        throw new Error('Sign up failed. Try again.')
      }
      await setDoc(doc(db, 'instructors', currentUser.uid), {
        email: currentUser.email ?? email.trim(),
        status: 'pending',
        requestedAt: serverTimestamp(),
        agreements: {
          liability: true,
          costs: true,
          removal: true,
          acceptedAt: serverTimestamp(),
        },
      })
      setSubmitted(true)
    } catch (e: any) {
      setError(e?.message ?? 'Sign up failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <TopBar mode="student" />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 border border-slate-800 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold">Instructor sign up</div>
              <div className="text-sm text-slate-400">Request access to create sessions and questions.</div>
            </div>
          </div>

          {submitted ? (
            <div className="card p-4 border border-emerald-500/30 bg-emerald-500/10">
              <div className="font-semibold text-emerald-200">Application submitted</div>
              <div className="text-sm text-emerald-100/80 mt-1">
                You will receive an email after approval. You can sign in on the instructor page at any time.
              </div>
              <button className="btn mt-4" onClick={() => nav('/admin')}>
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              {user && !user.isAnonymous ? (
                <div className="text-sm text-slate-300">
                  Signed in as <span className="text-slate-100">{user.email ?? 'instructor'}</span>. Submit your application to request access.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
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
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </div>
                  <div>
                    <div className="label mb-1">Confirm password</div>
                    <input
                      className="input"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agreeLiability}
                    onChange={(e) => setAgreeLiability(e.target.checked)}
                  />
                  I acknowledge the product is provided as-is and the owner accepts no liability for its use.
                </label>
                <label className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agreeCosts}
                    onChange={(e) => setAgreeCosts(e.target.checked)}
                  />
                  I understand that extensive use may incur costs and I may be asked to contribute.
                </label>
                <label className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agreeRemoval}
                    onChange={(e) => setAgreeRemoval(e.target.checked)}
                  />
                  I understand the owner reserves the right to remove instructor access at any time.
                </label>
              </div>

              {error && <div className="text-sm text-red-300">{error}</div>}

              <div className="flex flex-col sm:flex-row gap-3">
                <button className="btn" onClick={submitApplication} disabled={!canSubmit}>
                  {busy ? 'Submitting...' : 'Submit application'}
                </button>
                <button className="btn-ghost" onClick={() => nav('/admin')}>
                  Back to sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
