import { useEffect, useRef, useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import TopBar from '../components/TopBar'
import ClaimAdminCard from '../components/ClaimAdminCard'
import InstructorAccessBlocked from '../components/InstructorAccessBlocked'
import SessionsListPanel from '../components/SessionsListPanel'
import ActiveSessionPanel from '../components/ActiveSessionPanel'
import { auth, db } from '../firebase'
import { roomCode } from '../lib/ids'
import { useInstructorRole } from '../lib/useInstructorRole'
import { useOwnedSessions } from '../lib/useOwnedSessions'

export default function InstructorDashboard() {
  const role = useInstructorRole()
  const isApproved = role.instructorStatus === 'approved'
  const { sessions, costs, loaded: sessionsLoaded } = useOwnedSessions(isApproved ? role.user?.uid : null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [passwordResetSent, setPasswordResetSent] = useState(false)

  async function createSession() {
    if (!auth.currentUser || creating || !isApproved) return
    setActionError(null)
    setCreating(true)
    try {
      const ref = collection(db, 'sessions')
      const created = await addDoc(ref, {
        title: newSessionTitle.trim() || 'Class session',
        roomCode: roomCode(),
        activeQuestionId: null,
        isOpen: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ownerUid: auth.currentUser.uid,
      })
      setSessionId(created.id)
      setNewSessionTitle('')
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to create session.')
    } finally {
      setCreating(false)
    }
  }

  // Auto-pick or auto-create a session on first load.
  const autoCreatedRef = useRef(false)
  useEffect(() => {
    if (!isApproved || sessionId || !sessionsLoaded) return
    if (sessions.length > 0) {
      setSessionId(sessions[0].id)
      return
    }
    if (autoCreatedRef.current) return
    autoCreatedRef.current = true
    createSession().catch(() => {
      autoCreatedRef.current = false
    })
  }, [sessionId, isApproved, sessionsLoaded, sessions])

  async function requestPasswordReset() {
    if (!auth.currentUser?.email) {
      setActionError('No email address found for this account.')
      return
    }
    setActionError(null)
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email)
      setPasswordResetSent(true)
      setTimeout(() => setPasswordResetSent(false), 5000)
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to send password reset email.')
    }
  }

  if (!role.user || !role.loaded) return null
  if (!role.adminClaimed) return <ClaimAdminCard />
  if (!isApproved) {
    return <InstructorAccessBlocked isAdmin={role.isAdmin} instructorStatus={role.instructorStatus} />
  }

  return (
    <div>
      <TopBar mode="instructor" />

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-2xl font-semibold">Instructor dashboard</div>
            <div className="text-slate-400 mt-1">Create questions, set one as active, and show results live.</div>
            <div className="text-xs text-slate-500 mt-2">Cost estimates are approximate and may not match billed totals.</div>
            <div className="text-xs text-amber-300/80 light-warning mt-1">Sessions are automatically removed 30 days after creation.</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={requestPasswordReset}>
              Change password
            </button>
          </div>
        </div>

        {actionError && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{actionError}</div>
          </div>
        )}

        {passwordResetSent && (
          <div className="card p-4 border border-emerald-500/30 bg-emerald-500/10">
            <div className="font-semibold text-emerald-200">Password reset sent</div>
            <div className="text-sm text-emerald-100/80 mt-1">Check your email for a reset link.</div>
          </div>
        )}

        <div className="card p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Create a new session</div>
              <div className="text-sm text-slate-400 mt-1">
                Start a new room for students. Questions are associated with sessions.
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                className="input"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="Session name"
              />
              <button type="button" className="btn" onClick={createSession} disabled={creating}>
                {creating ? 'Creating...' : 'New session'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <SessionsListPanel
            sessions={sessions}
            costs={costs}
            selectedId={sessionId}
            onSelect={(id) => setSessionId(id)}
            onDeleted={(id) => { if (sessionId === id) setSessionId(null) }}
          />
          {sessionId && <ActiveSessionPanel sessionId={sessionId} />}
        </div>
      </div>
    </div>
  )
}
