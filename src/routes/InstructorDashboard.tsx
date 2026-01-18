import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { auth, db } from '../firebase'
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
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
  const instructorEmail = useMemo(() => (import.meta.env.VITE_INSTRUCTOR_EMAIL as string) || '', [])
  const [user, setUser] = useState(() => auth.currentUser)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [responses, setResponses] = useState<Resp[]>([])
  const [bootstrapState, setBootstrapState] = useState<'unknown' | 'missing' | 'mismatch' | 'reclaimable' | 'ok'>('unknown')
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [showExpandedResults, setShowExpandedResults] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (!u) nav('/admin', { replace: true })
    })
    return () => unsub()
  }, [nav])

  // Check bootstrap state (admin doc exists)
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!user) {
        setBootstrapState('unknown')
        return
      }
      try {
        const snap = await getDoc(doc(db, 'config', 'admin'))
        if (!alive) return
        if (!snap.exists()) {
          setBootstrapState('missing')
          return
        }
        const data = snap.data() as any
        if (data?.uid === user.uid) {
          setBootstrapState('ok')
          return
        }
        if (user.email && data?.email && data.email === user.email) {
          setBootstrapState('reclaimable')
          return
        }
        if (user.email && instructorEmail && user.email === instructorEmail) {
          setBootstrapState('reclaimable')
          return
        }
        setBootstrapState('mismatch')
      } catch (_err: any) {
        if (!alive) return
        setBootstrapState('mismatch')
      }
    })()
    return () => { alive = false }
  }, [user?.uid, instructorEmail])

  async function bootstrapInstructor() {
    if (!auth.currentUser || bootstrapping) return
    setActionError(null)
    setBootstrapping(true)
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email ?? null,
        createdAt: serverTimestamp(),
      })
      setBootstrapState('ok')
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to bootstrap instructor access.')
    } finally {
      setBootstrapping(false)
    }
  }

  async function reclaimInstructor() {
    if (!auth.currentUser || bootstrapping) return
    setActionError(null)
    setBootstrapping(true)
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email ?? null,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setBootstrapState('ok')
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to reclaim instructor access.')
    } finally {
      setBootstrapping(false)
    }
  }

  async function createSession() {
    if (!auth.currentUser || creating) return
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
    if (bootstrapState !== 'ok' || sessionId || !sessionsLoaded) return
    if (sessions.length > 0) {
      setSessionId(sessions[0].id)
      return
    }
    createSession().catch(() => {})
  }, [sessionId, bootstrapState, sessionsLoaded, sessions])

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
    const qRef = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(qRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setSessions(list)
      setSessionsLoaded(true)
    })
    return () => unsub()
  }, [])

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

  if (!user) return null
  if (bootstrapState === 'mismatch') {
    return (
      <div>
        <TopBar mode="instructor" />
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Instructor access required</div>
            <div className="text-sm text-red-100/80 mt-1">
              This account is not the configured instructor for this project. Sign out and log in with the instructor email.
            </div>
          </div>
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
          </div>
          <div className="flex gap-2 items-center">
            <input
              className="input"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              placeholder="Session name"
            />
            <button className="btn" onClick={createSession} disabled={creating || bootstrapState !== 'ok'}>
              {creating ? 'Creating...' : 'New session'}
            </button>
          </div>
        </div>

        {actionError && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{actionError}</div>
          </div>
        )}

        {bootstrapState === 'missing' && (
          <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-amber-200 flex items-center gap-2">
                  <Wand2 size={18} /> Bootstrap instructor access (one-time)
                </div>
                <div className="text-sm text-amber-100/80 mt-1">
                  Firestore rules are set to allow the <em>first authenticated user</em> to write the instructor UID to <code>/config/admin</code>.
                  Do this once, then only your account can create/update sessions and questions.
                </div>
              </div>
              <button className="btn" onClick={bootstrapInstructor} disabled={bootstrapping}>
                {bootstrapping ? 'Bootstrapping...' : 'Bootstrap now'}
              </button>
            </div>
          </div>
        )}

        {bootstrapState === 'reclaimable' && (
          <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-amber-200">Reclaim instructor access</div>
                <div className="text-sm text-amber-100/80 mt-1">
                  This account matches the instructor email, but the stored UID is different. Reclaim access to continue.
                </div>
              </div>
              <button className="btn" onClick={reclaimInstructor} disabled={bootstrapping}>
                {bootstrapping ? 'Updating...' : 'Reclaim access'}
              </button>
            </div>
          </div>
        )}

        {bootstrapState === 'mismatch' && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Instructor access required</div>
            <div className="text-sm text-red-100/80 mt-1">
              This account is not the configured instructor for this project. Sign out and log in with the instructor email.
            </div>
          </div>
        )}

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
                  return (
                    <div
                      key={s.id}
                      className={`rounded-2xl border px-3 py-3 ${isActive ? 'border-white/30 bg-white/10' : 'border-slate-700/80 bg-slate-950/30'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{label}</div>
                          <div className="text-xs text-slate-400 mt-1">Room: {code}</div>
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
  if (t === 'pie') return 'Pie (100-point allocation)'
  if (t === 'number') return 'Numerical'
  if (t === 'short') return 'Short text'
  return 'Extended text'
}
