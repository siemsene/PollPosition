import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ResultsPanel from '../components/ResultsPanel'
import { useRoomSession, useQuestionResponses } from '../lib/useRoomSession'

export default function PublicResultsGraph() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomCode = (params.get('room') ?? '').toUpperCase().trim()
  const isEmbed = ['1', 'true', 'yes'].includes((params.get('embed') ?? '').toLowerCase())
  const { session, question, error: roomError } = useRoomSession(roomCode)
  const { responses, error: responsesError } = useQuestionResponses(session?.id, session?.activeQuestionId)
  const error = roomError ?? responsesError

  useEffect(() => {
    if (!roomCode) nav('/', { replace: true })
  }, [roomCode, nav])

  useEffect(() => {
    if (!isEmbed) return
    const root = document.documentElement
    root.setAttribute('data-embed', 'true')
    return () => root.removeAttribute('data-embed')
  }, [isEmbed])

  const subtitle = useMemo(() => {
    if (!session) return 'Joining...'
    if (!session.isOpen) return 'Room is closed.'
    if (!question) return 'Waiting for the next question...'
    return 'Showing live responses.'
  }, [session, question])

  return (
    <div className={isEmbed ? 'h-screen w-screen h-dvh w-dvw' : 'min-h-screen min-h-dvh'}>
      <div className={isEmbed ? 'h-full w-full p-0' : 'mx-auto max-w-5xl px-4 py-8'}>
        {error && (
          <div className="card p-4 border border-red-500/30 bg-red-500/10">
            <div className="font-semibold text-red-200">Something went wrong</div>
            <div className="text-sm text-red-100/80 mt-1">{error}</div>
          </div>
        )}

        {!question && !error && (
          <div className="text-sm text-slate-400">{subtitle}</div>
        )}

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
            showHeader={false}
            frameless
            fitHeight={isEmbed}
            showSynthesis={!isEmbed}
            synthesisFromStore={question.synthesis ?? null}
            synthesizedCountFromStore={question.synthesizedCount ?? null}
          />
        )}
      </div>
    </div>
  )
}
