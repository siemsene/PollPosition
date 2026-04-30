import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { KeyRound, MailCheck } from 'lucide-react'
import TopBar from '../components/TopBar'
import { auth } from '../firebase'

export default function ForgotPassword() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Enter the email associated with your account.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await sendPasswordResetEmail(auth, trimmed)
      setSent(true)
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (code === 'auth/invalid-email') {
        setError('That email address looks invalid.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Wait a few minutes before trying again.')
      } else {
        setError('Could not send reset email. Check the address and try again.')
      }
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
              {sent ? <MailCheck size={20} /> : <KeyRound size={20} />}
            </div>
            <div>
              <div className="text-lg font-semibold">
                {sent ? 'Check your inbox' : 'Reset your password'}
              </div>
              <div className="text-sm text-slate-400">
                {sent
                  ? 'We sent a reset link to your email if an account exists.'
                  : 'Enter your account email and we will send you a link to set a new password.'}
              </div>
            </div>
          </div>

          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="text-sm opacity-80 leading-relaxed">
                Open the email from Firebase and follow the link to choose a new password.
                The link expires after a short time. If you do not see the email, check
                your spam folder.
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" className="btn" onClick={() => nav('/admin')}>
                  Back to sign in
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setSent(false)
                    setEmail('')
                  }}
                >
                  Send to a different email
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <div>
                <div className="label mb-1">Email</div>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !busy) submit()
                  }}
                  placeholder="you@example.com"
                  autoFocus
                />
              </div>

              {error && <div className="text-sm text-red-300">{error}</div>}

              <button
                type="button"
                className="btn w-full"
                onClick={submit}
                disabled={busy || email.trim().length === 0}
              >
                {busy ? 'Sending...' : 'Send reset link'}
              </button>

              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <button type="button" className="underline" onClick={() => nav('/admin')}>
                  Back to sign in
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => nav('/instructor/signup')}
                >
                  Apply to be an instructor
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
