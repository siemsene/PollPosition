import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { collection, doc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import ResultsPanel from '../components/ResultsPanel'
import type { QuestionType } from '../components/QuestionEditor'

type Session = { id: string, roomCode: string, activeQuestionId: string | null, isOpen?: boolean }
type Question = { id: string, type: QuestionType, prompt: string, options?: string[] }
type Resp = { id: string, value: unknown, submittedAt?: any }

export default function PublicResults() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomCode = (params.get('room') ?? '').toUpperCase().trim()
  const [session, setSession] = useState<Session | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [responses, setResponses] = useState<Resp[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomCode) nav('/', { replace: true })
  }, [roomCode, nav])

  useEffect(() => {
    let unsub: any = null
    ;(async () => {
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
      setError(e?.message ?? 'Failed to load results.')
    })

    return () => { if (unsub) unsub() }
  }, [roomCode])

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

  useEffect(() => {
    if (!session?.id || !session.activeQuestionId) {
      setResponses([])
      return
    }
    const respRef = collection(db, 'sessions', session.id, 'questions', session.activeQuestionId, 'responses')
    const unsub = onSnapshot(respRef, (snap) => {
      const rs: Resp[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setResponses(rs)
    })
    return () => unsub()
  }, [session?.id, session?.activeQuestionId])

  const subtitle = useMemo(() => {
    if (!session) return 'Joining...'
    if (!session.isOpen) return 'Room is closed.'
    if (!question) return 'Waiting for the next question...'
    return 'Showing live responses.'
  }, [session, question])

  return (
    <div>
      <TopBar mode="student" />
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {error && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{error}</div>
          </div>
        )}

        <div className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Room</div>
              <div className="font-semibold tracking-widest">{roomCode}</div>
            </div>
            <div className="text-sm text-slate-400">{subtitle}</div>
          </div>
        </div>

        {question && (
          <ResultsPanel
            type={question.type}
            options={question.options ?? []}
            responses={responses}
            question={question.prompt}
            variant="expanded"
          />
        )}
      </div>
    </div>
  )
}
