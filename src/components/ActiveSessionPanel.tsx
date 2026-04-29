import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { X } from 'lucide-react'
import { db } from '../firebase'
import { useQuestionResponses } from '../lib/useRoomSession'
import { questionTypeLabel } from '../lib/format'
import type { Question } from '../types/poll'
import QRCodeCard from './QRCodeCard'
import PublicResultsCard from './PublicResultsCard'
import QuestionEditor from './QuestionEditor'
import QuestionList from './QuestionList'
import ResultsPanel from './ResultsPanel'

type Props = {
  sessionId: string
}

export default function ActiveSessionPanel({ sessionId }: Props) {
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [showExpandedResults, setShowExpandedResults] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      setSession({ id: snap.id, ...snap.data() })
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    const qRef = query(collection(db, 'sessions', sessionId, 'questions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(qRef, (snap) => {
      const qs: Question[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setQuestions(qs)
    })
    return () => unsub()
  }, [sessionId])

  const activeQuestionId = (session?.activeQuestionId as string | null) ?? null
  const activeQuestion = useMemo(
    () => (activeQuestionId ? questions.find((q) => q.id === activeQuestionId) ?? null : null),
    [activeQuestionId, questions],
  )
  const responses = useQuestionResponses(sessionId, activeQuestionId)
  const room = session?.roomCode as string | undefined

  useEffect(() => {
    if (!showExpandedResults) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowExpandedResults(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showExpandedResults])

  return (
    <>
      <div className="lg:col-span-2 space-y-6">
        {room && (
          <>
            <QRCodeCard roomCode={room} />
            <PublicResultsCard roomCode={room} />
          </>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <QuestionEditor sessionId={sessionId} />
          <QuestionList
            sessionId={sessionId}
            activeQuestionId={activeQuestionId}
            questions={questions}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="card p-4">
            <div className="font-semibold">Active question</div>
            <div className="text-sm text-slate-400 mt-1">
              {activeQuestion ? 'This is what students see right now.' : 'No active question selected yet.'}
            </div>

            {activeQuestion && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">{questionTypeLabel(activeQuestion.type)}</div>
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
              synthesisTarget={{ sessionId, questionId: activeQuestion.id }}
            />
          )}
        </div>
      </div>

      {showExpandedResults && activeQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <div className="flex justify-end mb-2">
              <button type="button" className="btn-ghost" onClick={() => setShowExpandedResults(false)}>
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
              synthesisTarget={{ sessionId, questionId: activeQuestion.id }}
            />
          </div>
        </div>
      )}
    </>
  )
}
