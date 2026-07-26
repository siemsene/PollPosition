import { useEffect, useMemo, useState } from 'react'
import { collection, deleteField, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Copy, Eye, EyeOff, MonitorPause, MonitorPlay, QrCode, X } from 'lucide-react'
import { db } from '../firebase'
import { CONNECTION_ERROR, useQuestionResponses } from '../lib/useRoomSession'
import { questionTypeLabel } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { copyText } from '../lib/clipboard'
import { studentRoomUrl } from '../lib/urls'
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
  const [showShare, setShowShare] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'sessions', sessionId),
      (snap) => {
        setSession({ id: snap.id, ...snap.data() })
        setConnectionError(null)
      },
      () => setConnectionError(CONNECTION_ERROR),
    )
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    // No orderBy: ordering happens client-side (sortedQuestions), and a
    // server-side orderBy would silently drop docs missing the field.
    const unsub = onSnapshot(
      collection(db, 'sessions', sessionId, 'questions'),
      (snap) => {
        const qs: Question[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setQuestions(qs)
      },
      () => setConnectionError(CONNECTION_ERROR),
    )
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    setEditingQuestion(null)
    setActionError(null)
  }, [sessionId])

  // Presentation order: explicit `order` first, createdAt for legacy
  // questions (reordering rewrites everything to small sequential values).
  const sortedQuestions = useMemo(() => {
    const effective = (q: Question) =>
      typeof q.order === 'number' ? q.order : (q.createdAt?.toMillis?.() ?? 0)
    return [...questions].sort((a, b) => effective(a) - effective(b))
  }, [questions])

  const activeQuestionId = (session?.activeQuestionId as string | null) ?? null
  const activeQuestion = useMemo(
    () => (activeQuestionId ? questions.find((q) => q.id === activeQuestionId) ?? null : null),
    [activeQuestionId, questions],
  )
  const { responses, error: responsesError } = useQuestionResponses(sessionId, activeQuestionId)
  const room = session?.roomCode as string | undefined
  const isOpen = session?.isOpen ?? true
  const scaleMeta = activeQuestion ? {
    min: activeQuestion.scaleMin ?? null,
    max: activeQuestion.scaleMax ?? null,
    minLabel: activeQuestion.scaleMinLabel ?? null,
    maxLabel: activeQuestion.scaleMaxLabel ?? null,
  } : undefined

  const studentUrl = useMemo(() => (room ? studentRoomUrl(room) : null), [room])

  useEffect(() => {
    if (!showExpandedResults) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowExpandedResults(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showExpandedResults])

  async function copyStudentLink() {
    if (!studentUrl) return
    const ok = await copyText(studentUrl)
    setCopied(ok ? 'copied' : 'failed')
    setTimeout(() => setCopied('idle'), 2500)
  }

  async function toggleRoomOpen() {
    setActionError(null)
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        isOpen: !isOpen,
        updatedAt: serverTimestamp(),
      })
    } catch (e: any) {
      setActionError(friendlyError(e, 'Failed to update the room.'))
    }
  }

  async function clearActiveQuestion() {
    setActionError(null)
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        activeQuestionId: null,
        updatedAt: serverTimestamp(),
      })
    } catch (e: any) {
      setActionError(friendlyError(e, 'Failed to clear the active question.'))
    }
  }

  // Reveal copies the private correct answer onto the public question doc so
  // every viewer (students, projector) sees it; hiding removes it again.
  async function toggleReveal() {
    if (!activeQuestion) return
    setActionError(null)
    const qRef = doc(db, 'sessions', sessionId, 'questions', activeQuestion.id)
    try {
      if (activeQuestion.revealAnswer) {
        await updateDoc(qRef, { revealAnswer: false, correctOptions: deleteField() })
      } else {
        const snap = await getDoc(doc(db, 'sessions', sessionId, 'questions', activeQuestion.id, 'meta', 'answer'))
        const correct: string[] = Array.isArray(snap.data()?.correctOptions) ? snap.data()!.correctOptions : []
        if (correct.length === 0) {
          setActionError('No correct answer is set for this question — edit it to mark one.')
          return
        }
        await updateDoc(qRef, { revealAnswer: true, correctOptions: correct })
      }
    } catch (e: any) {
      setActionError(friendlyError(e, 'Failed to toggle the answer reveal.'))
    }
  }

  return (
    <>
      <div className="lg:col-span-2 space-y-6">
        {(connectionError || responsesError) && (
          <div className="card p-3 border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            {connectionError ?? responsesError}
          </div>
        )}
        {actionError && (
          <div className="card p-3 border border-red-500/30 bg-red-500/10 text-sm text-red-200">
            {actionError}
          </div>
        )}

        {room && (
          <div className="card p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Room code</div>
                  <div className="text-2xl font-bold tracking-widest">{room}</div>
                </div>
                <button type="button" className="btn-ghost" onClick={copyStudentLink} title="Copy the link students use to join">
                  <Copy size={16} />{' '}
                  {copied === 'copied' ? 'Copied!' : copied === 'failed' ? 'Copy failed — use the QR links below' : 'Copy student link'}
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowShare((s) => !s)}
                  aria-expanded={showShare}
                >
                  <QrCode size={16} /> {showShare ? 'Hide QR & links' : 'QR & sharing links'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={toggleRoomOpen}
                  title={isOpen ? 'Stop accepting answers' : 'Start accepting answers again'}
                >
                  {isOpen
                    ? (<><MonitorPause size={16} /> Pause answering</>)
                    : (<><MonitorPlay size={16} /> Resume answering</>)}
                </button>
              </div>
            </div>
            {!isOpen && (
              <div className="mt-2 text-xs text-amber-300">
                The room is paused — students can see questions but cannot submit answers.
              </div>
            )}
            {showShare && (
              <div className="mt-4 space-y-4">
                <QRCodeCard roomCode={room} />
                <PublicResultsCard roomCode={room} />
              </div>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">Active question</div>
              {activeQuestion && (
                <div className="flex items-center gap-2">
                  {activeQuestion.isQuiz && (
                    <button type="button" className="btn-ghost" onClick={toggleReveal}>
                      {activeQuestion.revealAnswer
                        ? (<><EyeOff size={16} /> Hide answer</>)
                        : (<><Eye size={16} /> Reveal answer</>)}
                    </button>
                  )}
                  <button type="button" className="btn-ghost" onClick={clearActiveQuestion} title="Show the waiting screen to students">
                    <X size={16} /> Clear
                  </button>
                </div>
              )}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {activeQuestion ? 'This is what students see right now.' : 'Select a question below to make it live.'}
            </div>

            {activeQuestion && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {questionTypeLabel(activeQuestion.type)}
                  {activeQuestion.isQuiz && (activeQuestion.revealAnswer ? ' · answer revealed' : ' · quiz')}
                </div>
                <div className="text-lg font-semibold mt-1">{activeQuestion.prompt}</div>
                {(activeQuestion.type === 'mcq' || activeQuestion.type === 'multi' || activeQuestion.type === 'rank') && (
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {(activeQuestion.options ?? []).map((opt) => {
                      const revealed = !!activeQuestion.revealAnswer && (activeQuestion.correctOptions ?? []).includes(opt)
                      return (
                        <div
                          key={opt}
                          className={`rounded-xl border px-3 py-2 ${
                            revealed ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-slate-800 bg-slate-900/40'
                          }`}
                        >
                          {opt}
                        </div>
                      )
                    })}
                  </div>
                )}
                {activeQuestion.type === 'scale' && (
                  <div className="mt-3 text-sm text-slate-400">
                    Scale {activeQuestion.scaleMin ?? 1}–{activeQuestion.scaleMax ?? 5}
                    {activeQuestion.scaleMinLabel && ` · ${activeQuestion.scaleMin ?? 1} = ${activeQuestion.scaleMinLabel}`}
                    {activeQuestion.scaleMaxLabel && ` · ${activeQuestion.scaleMax ?? 5} = ${activeQuestion.scaleMaxLabel}`}
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
              scaleMeta={scaleMeta}
              correctOptions={activeQuestion.correctOptions ?? null}
              revealAnswer={activeQuestion.revealAnswer ?? false}
              onExpand={() => setShowExpandedResults(true)}
              allowSynthesis
              synthesisFromStore={activeQuestion.synthesis ?? null}
              synthesizedCountFromStore={activeQuestion.synthesizedCount ?? null}
              synthesisTarget={{ sessionId, questionId: activeQuestion.id }}
            />
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <QuestionEditor
            sessionId={sessionId}
            editQuestion={editingQuestion}
            onDone={() => setEditingQuestion(null)}
          />
          <QuestionList
            sessionId={sessionId}
            activeQuestionId={activeQuestionId}
            questions={sortedQuestions}
            onEdit={(q) => setEditingQuestion(q)}
          />
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
              scaleMeta={scaleMeta}
              correctOptions={activeQuestion.correctOptions ?? null}
              revealAnswer={activeQuestion.revealAnswer ?? false}
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
