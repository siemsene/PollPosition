import { useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Wand2 } from 'lucide-react'
import TopBar from './TopBar'
import { auth, db } from '../firebase'

export default function ClaimAdminCard() {
  const [agreeLiability, setAgreeLiability] = useState(false)
  const [agreeCosts, setAgreeCosts] = useState(false)
  const [agreeRemoval, setAgreeRemoval] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canClaim = agreeLiability && agreeCosts && agreeRemoval && !busy

  async function claimAdminAccess() {
    if (!auth.currentUser || !canClaim) return
    setError(null)
    setBusy(true)
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email ?? null,
        createdAt: serverTimestamp(),
      })
    } catch (e: any) {
      setError(e?.message ?? 'Failed to claim admin access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <TopBar mode="instructor" />
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-amber-200 flex items-center gap-2">
                <Wand2 size={18} /> Claim admin access
              </div>
              <div className="text-sm text-amber-100/80 mt-1">
                The first instructor to sign in can claim admin access. This enables you to approve other instructors.
              </div>
            </div>
            <button type="button" className="btn" onClick={claimAdminAccess} disabled={!canClaim}>
              {busy ? 'Claiming...' : 'Claim admin'}
            </button>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreeLiability}
                onChange={(e) => setAgreeLiability(e.target.checked)}
              />
              I acknowledge the product is provided as-is and the owner accepts no liability for its use.
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreeCosts}
                onChange={(e) => setAgreeCosts(e.target.checked)}
              />
              I understand that extensive use may incur costs and I may be asked to contribute.
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={agreeRemoval}
                onChange={(e) => setAgreeRemoval(e.target.checked)}
              />
              I understand the owner reserves the right to remove instructor access at any time.
            </label>
          </div>
        </div>
        {error && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{error}</div>
          </div>
        )}
      </div>
    </div>
  )
}
