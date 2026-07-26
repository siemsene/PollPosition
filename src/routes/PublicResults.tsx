import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import ResultsPanel from '../components/ResultsPanel'
import { useRoomSession, useQuestionResponses } from '../lib/useRoomSession'

export default function PublicResults() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomCode = (params.get('room') ?? '').toUpperCase().trim()
  const { session, question, error: roomError } = useRoomSession(roomCode)
  const { responses, error: responsesError } = useQuestionResponses(session?.id, session?.activeQuestionId)
  const error = roomError ?? responsesError

  useEffect(() => {
    if (!roomCode) nav('/', { replace: true })
  }, [roomCode, nav])

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
            scaleMeta={{
              min: question.scaleMin ?? null,
              max: question.scaleMax ?? null,
              minLabel: question.scaleMinLabel ?? null,
              maxLabel: question.scaleMaxLabel ?? null,
            }}
            correctOptions={question.correctOptions ?? null}
            revealAnswer={question.revealAnswer ?? false}
            variant="expanded"
            synthesisFromStore={question.synthesis ?? null}
            synthesizedCountFromStore={question.synthesizedCount ?? null}
          />
        )}
      </div>
    </div>
  )
}
