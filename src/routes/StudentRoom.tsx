import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { auth, db, ensureAnonymousAuth } from '../firebase'
import { collection, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import type { QuestionType } from '../components/QuestionEditor'
import { CheckCircle2 } from 'lucide-react'

type Session = { id: string, roomCode: string, activeQuestionId: string | null, isOpen?: boolean }
type Question = { id: string, type: QuestionType, prompt: string, options?: string[] }

export default function StudentRoom() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomCode = (params.get('room') ?? '').toUpperCase().trim()
  const [session, setSession] = useState<Session | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [answer, setAnswer] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomCode) nav('/', { replace: true })
  }, [roomCode, nav])

  // Resolve roomCode -> session doc by query
  useEffect(() => {
    let unsub: any = null
    ;(async () => {
      await ensureAnonymousAuth()
      const qRef = query(collection(db, 'sessions'), where('roomCode', '==', roomCode), limit(1))
      const snap = await getDocs(qRef)
      if (snap.empty) {
        setError(`Room "${roomCode}" not found.`)
        setSession(null)
        return
      }
      const docSnap = snap.docs[0]
      const sessionId = docSnap.id

      unsub = onSnapshot(doc(db, 'sessions', sessionId), (s) => {
        const data = s.data() as any
        setSession({ id: s.id, roomCode: data.roomCode, activeQuestionId: data.activeQuestionId ?? null, isOpen: data.isOpen ?? true })
      })
    })().catch((e) => {
      setError(e?.message ?? 'Failed to join room.')
    })

    return () => { if (unsub) unsub() }
  }, [roomCode])

  // Subscribe active question
  useEffect(() => {
    if (!session?.id || !session.activeQuestionId) {
      setQuestion(null)
      return
    }
    const unsub = onSnapshot(doc(db, 'sessions', session.id, 'questions', session.activeQuestionId), (d) => {
      if (!d.exists()) { setQuestion(null); return }
      const data = d.data() as any
      setQuestion({ id: d.id, type: data.type, prompt: data.prompt, options: data.options ?? [] })
    })
    return () => unsub()
  }, [session?.id, session?.activeQuestionId])

  // Reset answer when question changes
  useEffect(() => {
    setAnswer('')
    setStatus('idle')
  }, [question?.id])

  const uid = auth.currentUser?.uid
  const canSubmit = !!uid && !!session?.id && !!question?.id && answer.trim().length > 0

  async function submit() {
    if (!canSubmit || !uid || !session?.id || !question?.id) return
    setError(null)
    try {
      const value = question.type === 'number' ? Number(answer) : answer.trim()
      const respRef = doc(db, 'sessions', session.id, 'questions', question.id, 'responses', uid)
      await setDoc(respRef, { value, submittedAt: serverTimestamp(), userId: uid }, { merge: true })
      setStatus('sent')
      setTimeout(() => setStatus('idle'), 1500)
    } catch (e: any) {
      setStatus('error')
      const code = e?.code as string | undefined
      if (code === 'permission-denied') {
        setError('You have to wait for one minute before you can resubmit your answer.')
      } else {
        setError(e?.message ?? 'Failed to submit.')
      }
    }
  }

  const input = useMemo(() => {
    if (!question) return null
    if (question.type === 'mcq') {
      return (
        <div className="grid sm:grid-cols-2 gap-2 mt-4">
          {(question.options ?? []).map((opt) => {
            const selected = answer === opt
            return (
              <button
                key={opt}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selected ? 'border-white/30 bg-white/10' : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                }`}
                onClick={() => setAnswer(opt)}
              >
                <div className="font-medium">{opt}</div>
              </button>
            )
          })}
        </div>
      )
    }

    if (question.type === 'number') {
      return (
        <div className="mt-4">
          <input
            className="input text-lg"
            inputMode="decimal"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type a number..."
          />
        </div>
      )
    }

    if (question.type === 'short') {
      return (
        <div className="mt-4">
          <input
            className="input text-lg"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type a short answer..."
          />
        </div>
      )
    }

    return (
      <div className="mt-4">
        <textarea
          className="input min-h-[140px]"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your response (a few sentences)..."
        />
      </div>
    )
  }, [question, answer])

  return (
    <div>
      <TopBar mode="student" />
      <div className="mx-auto max-w-2xl px-4 py-8">
        {!roomCode && null}

        {error && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{error}</div>
          </div>
        )}

        <div className="card p-6 mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Room</div>
              <div className="font-semibold tracking-widest">{roomCode}</div>
            </div>
            <button className="btn-ghost" onClick={() => nav('/')}>Change room</button>
          </div>

          {!session ? (
            <div className="mt-6 text-slate-400">Joining...</div>
          ) : !session.isOpen ? (
            <div className="mt-6 text-slate-400">Room is closed.</div>
          ) : !question ? (
            <div className="mt-6">
              <div className="text-lg font-semibold">Waiting for the next question...</div>
              <div className="text-slate-400 mt-1">Keep this page open.</div>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wide text-slate-400">{label(question.type)}</div>
                <div className="text-2xl font-semibold mt-1">{question.prompt}</div>
              </div>

              {input}

              <div className="mt-4 flex items-center justify-between">
                <button className="btn" onClick={submit} disabled={!canSubmit}>
                  Submit
                </button>
                {status === 'sent' && (
                  <div className="text-sm text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 size={18} /> Sent!
                  </div>
                )}
                {status === 'error' && <div className="text-sm text-red-300">Error</div>}
              </div>

              <div className="mt-2 text-xs text-slate-500">
                You can resubmit after a short cooldown; your latest answer overwrites the previous one.
              </div>
            </>
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
