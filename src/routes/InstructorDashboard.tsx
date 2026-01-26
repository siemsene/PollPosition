import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { auth, db } from '../firebase'
import { sendPasswordResetEmail } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { roomCode } from '../lib/ids'
import QRCodeCard from '../components/QRCodeCard'
import QuestionEditor from '../components/QuestionEditor'
import QuestionList, { type Question } from '../components/QuestionList'
import ResultsPanel from '../components/ResultsPanel'
import PublicResultsCard from '../components/PublicResultsCard'
import { Wand2, X } from 'lucide-react'

type Resp = { id: string, value: unknown, submittedAt?: any }

export default function InstructorDashboard() {
  const nav = useNavigate()
  const [user, setUser] = useState(() => auth.currentUser)
  const [adminDoc, setAdminDoc] = useState<any | null>(null)
  const [adminLoaded, setAdminLoaded] = useState(false)
  const [instructorDoc, setInstructorDoc] = useState<any | null>(null)
  const [instructorLoaded, setInstructorLoaded] = useState(false)
  const [adminAgreeLiability, setAdminAgreeLiability] = useState(false)
  const [adminAgreeCosts, setAdminAgreeCosts] = useState(false)
  const [adminAgreeRemoval, setAdminAgreeRemoval] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [responses, setResponses] = useState<Resp[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showExpandedResults, setShowExpandedResults] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [sessionCosts, setSessionCosts] = useState<Record<string, number>>({})
  const [passwordResetSent, setPasswordResetSent] = useState(false)

  const isAdmin = !!adminDoc && user?.uid === adminDoc.uid
  const isApprovedInstructor = instructorDoc?.status === 'approved'
  const canAccessDashboard = isApprovedInstructor

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (!u || u.isAnonymous) {
        if (u?.isAnonymous) auth.signOut().catch(() => {})
        nav('/admin', { replace: true })
      }
    })
    return () => unsub()
  }, [nav])

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setAdminDoc(null)
      setAdminLoaded(true)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'config', 'admin'),
      (snap) => {
        setAdminDoc(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null)
        setAdminLoaded(true)
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load admin configuration.')
        setAdminLoaded(true)
      },
    )
    return () => unsub()
  }, [user?.uid])

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setInstructorDoc(null)
      setInstructorLoaded(false)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'instructors', user.uid),
      (snap) => {
        setInstructorDoc(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null)
        setInstructorLoaded(true)
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load instructor status.')
        setInstructorLoaded(true)
      },
    )
    return () => unsub()
  }, [user?.uid])


  async function claimAdminAccess() {
    if (!auth.currentUser) return
    if (!adminAgreeLiability || !adminAgreeCosts || !adminAgreeRemoval) {
      setActionError('Please acknowledge the instructor terms before continuing.')
      return
    }
    setActionError(null)
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email ?? null,
        createdAt: serverTimestamp(),
      })
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to claim admin access.')
    }
  }

  async function createSession() {
    if (!auth.currentUser || creating || !canAccessDashboard) return
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

  // Auto-pick latest session (optional). We'll keep it simple: if none selected, create one.
  useEffect(() => {
    if (!canAccessDashboard || sessionId || !sessionsLoaded) return
    if (sessions.length > 0) {
      setSessionId(sessions[0].id)
      return
    }
    createSession().catch(() => {})
  }, [sessionId, canAccessDashboard, sessionsLoaded, sessions])

  // Subscribe session
  useEffect(() => {
    if (!sessionId) return
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      setSession({ id: snap.id, ...snap.data() })
    })
    return () => unsub()
  }, [sessionId])

  // Subscribe sessions list
  useEffect(() => {
    if (!user || !canAccessDashboard) return
    const qRef = query(
      collection(db, 'sessions'),
      where('ownerUid', '==', user.uid)
    )
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        list.sort((a, b) => {
          const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0
          const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0
          return bTime - aTime
        })
        setSessions(list)
        setSessionsLoaded(true)
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load sessions.')
        setSessionsLoaded(true)
      },
    )
    return () => unsub()
  }, [user?.uid, canAccessDashboard])

  useEffect(() => {
    if (!user || !canAccessDashboard) {
      setSessionCosts({})
      return
    }
    const qRef = query(
      collection(db, 'session_costs'),
      where('ownerUid', '==', user.uid),
    )
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const next: Record<string, number> = {}
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any
          const totalUsd = typeof data.totalUsd === 'number' ? data.totalUsd : 0
          next[docSnap.id] = totalUsd
        })
        setSessionCosts(next)
      },
      (err) => {
        setActionError(err?.message ?? 'Failed to load cost estimates.')
      },
    )
    return () => unsub()
  }, [user?.uid, canAccessDashboard])

  // Subscribe questions
  useEffect(() => {
    if (!sessionId) return
    const qRef = query(collection(db, 'sessions', sessionId, 'questions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(qRef, (snap) => {
      const qs: Question[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setQuestions(qs)
    })
    return () => unsub()
  }, [sessionId])

  // Active question object
  useEffect(() => {
    if (!session?.activeQuestionId) {
      setActiveQuestion(null)
      return
    }
    const q = questions.find(q => q.id === session.activeQuestionId) ?? null
    setActiveQuestion(q)
  }, [session?.activeQuestionId, questions])

  // Subscribe responses for active question
  useEffect(() => {
    if (!sessionId || !session?.activeQuestionId) {
      setResponses([])
      return
    }
    const respRef = query(
      collection(db, 'sessions', sessionId, 'questions', session.activeQuestionId, 'responses')
    )
    const unsub = onSnapshot(respRef, (snap) => {
      const rs: Resp[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setResponses(rs)
    })
    return () => unsub()
  }, [sessionId, session?.activeQuestionId])

  useEffect(() => {
    if (!showExpandedResults) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowExpandedResults(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showExpandedResults])

  const room = useMemo(() => session?.roomCode as string | undefined, [session])
  async function selectSession(id: string) {
    setSessionId(id)
    setShowExpandedResults(false)
  }

  async function deleteSession(id: string) {
    if (sessionBusyId) return
    const confirmed = window.confirm('Delete this session? This removes the session document; question data may remain in subcollections.')
    if (!confirmed) return
    setActionError(null)
    setSessionBusyId(id)
    try {
      await deleteDoc(doc(db, 'sessions', id))
      if (sessionId === id) {
        setSessionId(null)
        setSession(null)
        setQuestions([])
        setActiveQuestion(null)
        setResponses([])
      }
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to delete session.')
    } finally {
      setSessionBusyId(null)
    }
  }

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


  if (!user || !adminLoaded || !instructorLoaded) return null
  if (!adminDoc) {
    const canClaimAdmin = adminAgreeLiability && adminAgreeCosts && adminAgreeRemoval
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
              <button className="btn" onClick={claimAdminAccess} disabled={!canClaimAdmin}>
                Claim admin
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={adminAgreeLiability}
                  onChange={(e) => setAdminAgreeLiability(e.target.checked)}
                />
                I acknowledge the product is provided as-is and the owner accepts no liability for its use.
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={adminAgreeCosts}
                  onChange={(e) => setAdminAgreeCosts(e.target.checked)}
                />
                I understand that extensive use may incur costs and I may be asked to contribute.
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={adminAgreeRemoval}
                  onChange={(e) => setAdminAgreeRemoval(e.target.checked)}
                />
                I understand the owner reserves the right to remove instructor access at any time.
              </label>
            </div>
          </div>
          {actionError && (
            <div className="card p-4 border border-red-500/30 bg-red-500/10">
              <div className="font-semibold text-red-200">Something went wrong</div>
              <div className="text-sm text-red-100/80 mt-1">{actionError}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!canAccessDashboard) {
    return (
      <div>
        <TopBar mode="instructor" />
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
          {isAdmin && (
            <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
              <div className="font-semibold text-amber-200">Admin account</div>
              <div className="text-sm text-amber-100/80 mt-1">
                This account is configured as an admin. Use the admin dashboard to manage instructors.
              </div>
              <button className="btn mt-3" onClick={() => nav('/admin/overview')}>
                Go to admin dashboard
              </button>
            </div>
          )}
          {instructorDoc?.status === 'pending' && (
            <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
              <div className="font-semibold text-amber-200">Approval pending</div>
              <div className="text-sm text-amber-100/80 mt-1">
                Your instructor request is pending. You will receive an email when it is approved.
              </div>
            </div>
          )}
          {instructorDoc?.status === 'removed' && (
            <div className="card p-4 border border-red-500/30 bg-red-500/10">
              <div className="font-semibold text-red-200">Access removed</div>
              <div className="text-sm text-red-100/80 mt-1">
                Instructor access was removed. Contact the administrator if you believe this is a mistake.
              </div>
            </div>
          )}
          {!instructorDoc && (
            <div className="card p-4 border border-slate-700/80 bg-slate-950/30">
              <div className="font-semibold text-slate-100">Instructor access required</div>
              <div className="text-sm text-slate-300 mt-1">
                Submit an instructor application to request access.
              </div>
              <button className="btn mt-3" onClick={() => nav('/instructor/signup')}>
                Apply to be an instructor
              </button>
            </div>
          )}
        </div>
      </div>
    )
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
            <button className="btn-ghost" onClick={requestPasswordReset}>
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
              <button className="btn" onClick={createSession} disabled={creating || !canAccessDashboard}>
                {creating ? 'Creating...' : 'New session'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="card p-4 lg:col-span-1">
            <div className="font-semibold">Sessions</div>
            <div className="text-sm text-slate-400 mt-1">Rejoin or delete old sessions.</div>
            <div className="mt-3 space-y-2 max-h-[380px] overflow-auto pr-1">
              {sessions.length === 0 ? (
                <div className="text-sm text-slate-400">No sessions yet.</div>
              ) : (
                sessions.map((s) => {
                  const isActive = s.id === sessionId
                  const label = s.title || 'Class session'
                  const code = s.roomCode || '------'
                  const cost = sessionCosts[s.id] ?? 0
                  return (
                    <div
                      key={s.id}
                      className={`rounded-2xl border px-3 py-3 session-card ${isActive ? 'border-white/30 bg-white/10' : 'border-slate-700/80 bg-slate-950/30'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{label}</div>
                          <div className="text-xs text-slate-400 mt-1">Room: {code}</div>
                          <div className="text-xs text-slate-400 mt-1">Est. cost: {formatUsd(cost)}</div>
                        </div>
                        {isActive && <span className="text-xs text-slate-300">Current</span>}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button className="btn-ghost" onClick={() => selectSession(s.id)}>
                          Rejoin
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => deleteSession(s.id)}
                          disabled={sessionBusyId === s.id}
                        >
                          {sessionBusyId === s.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            {room && (
              <>
                <QRCodeCard roomCode={room} />
                <PublicResultsCard roomCode={room} />
              </>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {sessionId && <QuestionEditor sessionId={sessionId} />}
              {sessionId && (
                <QuestionList
                  sessionId={sessionId}
                  activeQuestionId={(session?.activeQuestionId as string | null) ?? null}
                  questions={questions}
                />
              )}
            </div>

            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <div className="card p-4">
                <div className="font-semibold">Active question</div>
                <div className="text-sm text-slate-400 mt-1">
                  {activeQuestion ? 'This is what students see right now.' : 'No active question selected yet.'}
                </div>

                {activeQuestion && (
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-400">{label(activeQuestion.type)}</div>
                    <div className="text-lg font-semibold mt-1">{activeQuestion.prompt}</div>
                    {activeQuestion.type === 'mcq' && (
                      <div className="mt-3 grid sm:grid-cols-2 gap-2">
                        {(activeQuestion.options ?? []).map((opt) => (
                          <div key={opt} className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {activeQuestion && (
                <ResultsPanel
                  type={activeQuestion.type}
                  options={activeQuestion.options ?? []}
                  responses={responses}
                  question={activeQuestion.prompt}
                  onExpand={() => setShowExpandedResults(true)}
                  allowSynthesis
                  synthesisFromStore={activeQuestion.synthesis ?? null}
                  synthesizedCountFromStore={activeQuestion.synthesizedCount ?? null}
                  synthesisTarget={sessionId ? { sessionId, questionId: activeQuestion.id } : undefined}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {showExpandedResults && activeQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <div className="flex justify-end mb-2">
              <button className="btn-ghost" onClick={() => setShowExpandedResults(false)}>
                <X size={18} /> Close
              </button>
            </div>
            <ResultsPanel
              type={activeQuestion.type}
              options={activeQuestion.options ?? []}
              responses={responses}
              question={activeQuestion.prompt}
              variant="expanded"
              allowSynthesis
              synthesisFromStore={activeQuestion.synthesis ?? null}
              synthesizedCountFromStore={activeQuestion.synthesizedCount ?? null}
              synthesisTarget={sessionId ? { sessionId, questionId: activeQuestion.id } : undefined}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function label(t: string) {
  if (t === 'mcq') return 'Multiple choice'
  if (t === 'pie') return '100 point allocation'
  if (t === 'number') return 'Numerical'
  if (t === 'short') return 'Short text'
  return 'Extended text'
}

function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}
