import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth'
import { auth } from '../firebase'

const ACK_KEY = 'pollposition.participantAcknowledged'

export function useParticipantGate(): ReactNode {
  const initialUser = auth.currentUser
  const [user, setUser] = useState<User | null>(initialUser)
  const [authReady, setAuthReady] = useState(initialUser !== null)
  const [acknowledged, setAcknowledged] = useState(() => sessionStorage.getItem(ACK_KEY) === 'true')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
      if (!u || u.isAnonymous) {
        sessionStorage.removeItem(ACK_KEY)
        setAcknowledged(false)
      }
    })
    return () => unsub()
  }, [])

  if (!authReady) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card p-6 text-sm text-slate-400">Checking sign-in state...</div>
      </div>
    )
  }

  if (!user || user.isAnonymous || acknowledged) return null

  async function continueAsCurrentUser() {
    sessionStorage.setItem(ACK_KEY, 'true')
    setAcknowledged(true)
  }

  async function joinAsNewParticipant() {
    setBusy(true)
    try {
      await signOut(auth)
      await signInAnonymously(auth)
      sessionStorage.removeItem(ACK_KEY)
    } finally {
      setBusy(false)
    }
  }

  const label = user.email ?? 'this account'

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="card p-6">
        <div className="text-lg font-semibold">You're already signed in</div>
        <div className="text-sm text-slate-300 mt-2">
          You're signed in as <span className="text-slate-100 font-medium">{label}</span>.
          Each Firebase account counts as one participant — if you join with the same account on
          multiple devices, your responses will share an identity and overwrite each other.
        </div>
        <div className="mt-5 grid gap-2">
          <button type="button" className="btn" onClick={continueAsCurrentUser} disabled={busy}>
            Continue as {label}
          </button>
          <button type="button" className="btn-ghost" onClick={joinAsNewParticipant} disabled={busy}>
            {busy ? 'Switching...' : 'Sign out and join as a new participant'}
          </button>
        </div>
        <div className="mt-4 text-xs text-slate-500">
          Tip: to test the participant flow without signing out, open this link in a private/incognito window.
        </div>
      </div>
    </div>
  )
}
