import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { auth, db } from '../firebase'
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { roomCode } from '../lib/ids'
import QRCodeCard from '../components/QRCodeCard'
import QuestionEditor from '../components/QuestionEditor'
import QuestionList, { type Question } from '../components/QuestionList'
import ResultsPanel from '../components/ResultsPanel'
import { Wand2 } from 'lucide-react'

type Resp = { id: string, value: unknown, submittedAt?: any }

export default function InstructorDashboard() {
  const nav = useNavigate()
  const user = auth.currentUser
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [responses, setResponses] = useState<Resp[]>([])
  const [bootstrapOk, setBootstrapOk] = useState<boolean | null>(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) nav('/admin', { replace: true })
    })
    return () => unsub()
  }, [nav])

  // Check bootstrap state (admin doc exists)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const snap = await getDoc(doc(db, 'config', 'admin'))
      if (!alive) return
      setBootstrapOk(snap.exists())
    })()
    return () => { alive = false }
  }, [user?.uid])

  async function bootstrapInstructor() {
    if (!auth.currentUser) return
    await setDoc(doc(db, 'config', 'admin'), {
      uid: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    })
    setBootstrapOk(true)
  }

  async function createSession() {
    if (!auth.currentUser) return
    const ref = collection(db, 'sessions')
    const created = await addDoc(ref, {
      title: `Class session`,
      roomCode: roomCode(),
      activeQuestionId: null,
      isOpen: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ownerUid: auth.currentUser.uid,
    })
    setSessionId(created.id)
  }

  // Auto-pick latest session (optional). We’ll keep it simple: if none selected, create one.
  useEffect(() => {
    if (!sessionId) {
      // create a session for convenience
      createSession().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe session
  useEffect(() => {
    if (!sessionId) return
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      setSession({ id: snap.id, ...snap.data() })
    })
    return () => unsub()
  }, [sessionId])

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

  const room = useMemo(() => session?.roomCode as string | undefined, [session])

  if (!user) return null

  return (
    <div>
      <TopBar mode="instructor" />

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-2xl font-semibold">Instructor dashboard</div>
            <div className="text-slate-400 mt-1">Create questions, set one as active, and show results live.</div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={createSession}>
              New session
            </button>
          </div>
        </div>

        {bootstrapOk === false && (
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
              <button className="btn" onClick={bootstrapInstructor}>
                Bootstrap now
              </button>
            </div>
          </div>
        )}

        {room && <QRCodeCard roomCode={room} />}

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
            />
          )}
        </div>
      </div>
    </div>
  )
}

function label(t: string) {
  if (t === 'mcq') return 'Multiple choice'
  if (t === 'number') return 'Numerical'
  if (t === 'short') return 'Short text'
  return 'Extended text'
}
