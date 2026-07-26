import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { useParticipantGate } from '../components/useParticipantGate'
import { auth, db } from '../firebase'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useRoomSession } from '../lib/useRoomSession'
import { questionTypeLabel } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { scaleBounds } from '../lib/scale'
import { Check, CheckCircle2 } from 'lucide-react'

const COOLDOWN_SECONDS = 60

export default function StudentRoom() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomCode = (params.get('room') ?? '').toUpperCase().trim()
  const { session, question, error: roomError } = useRoomSession(roomCode)
  const [answer, setAnswer] = useState<string>('')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [selections, setSelections] = useState<string[]>([])
  const [ranking, setRanking] = useState<string[]>([])
  // The value actually stored in Firestore — reveal feedback must judge this,
  // not whatever the student has tapped since their last submit.
  const [submittedValue, setSubmittedValue] = useState<unknown>(null)
  const [lastSubmitAt, setLastSubmitAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const gate = useParticipantGate()

  useEffect(() => {
    if (!roomCode) nav('/', { replace: true })
  }, [roomCode, nav])

  useEffect(() => {
    if (roomError) setError(roomError)
  }, [roomError])

  // Reset answer state when the question changes, then prefill from any
  // previous submission so students see their answer and the real cooldown.
  useEffect(() => {
    setAnswer('')
    setSelections([])
    setRanking([])
    setSubmittedValue(null)
    setLastSubmitAt(null)
    setError(null)
    if (question?.type === 'pie') {
      const next: Record<string, string> = {}
      for (const opt of question.options ?? []) next[opt] = ''
      setAllocations(next)
    } else {
      setAllocations({})
    }

    const uid = auth.currentUser?.uid
    if (!uid || !session?.id || !question?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'sessions', session.id, 'questions', question.id, 'responses', uid))
        if (cancelled || !snap.exists()) return
        const data = snap.data() as any
        const value = data?.value
        const opts = question.options ?? []
        if (question.type === 'pie' && value && typeof value === 'object' && !Array.isArray(value)) {
          const next: Record<string, string> = {}
          for (const opt of opts) {
            const num = (value as Record<string, unknown>)[opt]
            next[opt] = typeof num === 'number' && num > 0 ? String(num) : ''
          }
          setAllocations(next)
        } else if (question.type === 'multi' && Array.isArray(value)) {
          setSelections(value.filter((v): v is string => typeof v === 'string' && opts.includes(v)))
        } else if (question.type === 'rank' && Array.isArray(value)) {
          setRanking(value.filter((v): v is string => typeof v === 'string' && opts.includes(v)))
        } else if (question.type === 'number' || question.type === 'scale') {
          if (typeof value === 'number' && Number.isFinite(value)) setAnswer(String(value))
        } else if (typeof value === 'string') {
          setAnswer(value)
        }
        setSubmittedValue(value)
        const submittedMs = typeof data?.submittedAt?.toMillis === 'function' ? data.submittedAt.toMillis() : null
        // submittedAt is server time but the countdown runs on the client
        // clock; clamping to "now" bounds the wait at the full cooldown even
        // when the device clock is behind the server.
        if (submittedMs) setLastSubmitAt(Math.min(submittedMs, Date.now()))
      } catch {
        // Prefill is best-effort; submitting still works without it.
      }
    })()
    return () => { cancelled = true }
  }, [question?.id, session?.id])

  // If the instructor edits the options mid-poll, drop any picks that no
  // longer exist so a stale selection or ranking can't be submitted.
  const optionsKey = JSON.stringify(question?.options ?? [])
  useEffect(() => {
    const opts = question?.options ?? []
    setSelections((prev) => prev.filter((o) => opts.includes(o)))
    setRanking((prev) => prev.filter((o) => opts.includes(o)))
    if (question?.type === 'mcq') {
      setAnswer((prev) => (prev && !opts.includes(prev) ? '' : prev))
    }
  }, [optionsKey])

  const hasSubmitted = lastSubmitAt !== null
  const cooldownRemaining = hasSubmitted
    ? Math.max(0, COOLDOWN_SECONDS - Math.floor((now - lastSubmitAt) / 1000))
    : 0

  useEffect(() => {
    if (!hasSubmitted || cooldownRemaining === 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [hasSubmitted, cooldownRemaining > 0])

  const uid = auth.currentUser?.uid
  const allocationTotal = useMemo(() => {
    if (!question || question.type !== 'pie') return 0
    return (question.options ?? []).reduce((sum, opt) => {
      const raw = allocations[opt]
      const num = raw === '' ? 0 : Number(raw)
      return sum + (Number.isFinite(num) && num > 0 ? num : 0)
    }, 0)
  }, [question, allocations])

  const numberInvalid = question?.type === 'number'
    && answer.trim().length > 0
    && !Number.isFinite(Number(answer.trim()))

  const answerReady = !question ? false
    : question.type === 'pie' ? Math.abs(allocationTotal - 100) < 0.001
    : question.type === 'number' ? answer.trim().length > 0 && Number.isFinite(Number(answer.trim()))
    : question.type === 'scale' ? answer !== ''
    : question.type === 'multi' ? selections.length > 0
    : question.type === 'rank' ? ranking.length === (question.options ?? []).length && ranking.length > 0
    : answer.trim().length > 0

  const revealActive = !!question?.revealAnswer && (question?.correctOptions?.length ?? 0) > 0
  const canSubmit = !!uid && !!session?.id && !!question?.id && cooldownRemaining === 0 && answerReady && !revealActive

  const answeredCorrectly = useMemo(() => {
    if (!revealActive || !hasSubmitted || !question) return null
    const correct = question.correctOptions ?? []
    if (question.type === 'mcq') {
      return typeof submittedValue === 'string' ? correct.includes(submittedValue) : null
    }
    if (question.type === 'multi') {
      if (!Array.isArray(submittedValue)) return null
      return correct.length === submittedValue.length && correct.every((c) => submittedValue.includes(c))
    }
    return null
  }, [revealActive, hasSubmitted, question, submittedValue])

  async function submit() {
    if (!canSubmit || !uid || !session?.id || !question?.id) return
    setError(null)
    try {
      const value = question.type === 'pie'
        ? (question.options ?? []).reduce((acc, opt) => {
            const raw = allocations[opt]
            const num = raw === '' ? 0 : Number(raw)
            acc[opt] = Number.isFinite(num) && num > 0 ? num : 0
            return acc
          }, {} as Record<string, number>)
        : question.type === 'number' || question.type === 'scale'
          ? Number(answer.trim())
          : question.type === 'multi'
            ? selections.filter((s) => (question.options ?? []).includes(s))
            : question.type === 'rank'
              ? ranking
              : answer.trim()
      const respRef = doc(db, 'sessions', session.id, 'questions', question.id, 'responses', uid)
      await setDoc(respRef, { value, submittedAt: serverTimestamp(), userId: uid }, { merge: true })
      setSubmittedValue(value)
      setLastSubmitAt(Date.now())
      setNow(Date.now())
    } catch (e: any) {
      if (e?.code === 'permission-denied' && hasSubmitted) {
        setError('Please wait a little longer before resubmitting your answer.')
      } else if (e?.code === 'permission-denied') {
        setError('Your answer could not be submitted — the question may have just closed. Please try again.')
      } else {
        setError(friendlyError(e, 'Failed to submit your answer. Please try again.'))
      }
    }
  }

  const input = useMemo(() => {
    if (!question) return null
    const reveal = !!question.revealAnswer && (question.correctOptions?.length ?? 0) > 0
    const correctSet = new Set(question.correctOptions ?? [])

    if (question.type === 'mcq') {
      return (
        <div className="grid sm:grid-cols-2 gap-2 mt-4" role="radiogroup" aria-label={question.prompt}>
          {(question.options ?? []).map((opt) => {
            const selected = answer === opt
            const isCorrect = reveal && correctSet.has(opt)
            return (
              <button
                type="button"
                key={opt}
                role="radio"
                aria-checked={selected}
                disabled={reveal}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isCorrect
                    ? 'border-emerald-400/70 bg-emerald-400/10'
                    : selected ? 'border-white/30 bg-white/10' : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                }`}
                onClick={() => setAnswer(opt)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{opt}</div>
                  {isCorrect && <Check size={18} className="shrink-0 text-emerald-300" />}
                </div>
              </button>
            )
          })}
        </div>
      )
    }

    if (question.type === 'multi') {
      return (
        <div className="mt-4">
          <div className="text-sm text-slate-400">Select all that apply.</div>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {(question.options ?? []).map((opt) => {
              const selected = selections.includes(opt)
              const isCorrect = reveal && correctSet.has(opt)
              return (
                <button
                  type="button"
                  key={opt}
                  aria-pressed={selected}
                  disabled={reveal}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    isCorrect
                      ? 'border-emerald-400/70 bg-emerald-400/10'
                      : selected ? 'border-white/30 bg-white/10' : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                  }`}
                  onClick={() => setSelections((prev) =>
                    prev.includes(opt) ? prev.filter((s) => s !== opt) : [...prev, opt]
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{opt}</div>
                    {(selected || isCorrect) && <Check size={18} className="shrink-0 text-emerald-300" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (question.type === 'cloud') {
      return (
        <div className="mt-4">
          <input
            className="input text-lg"
            aria-label="Your answer"
            maxLength={80}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="A word or short phrase..."
          />
          <div className="mt-1 text-xs text-slate-500">Your words join the class word cloud.</div>
        </div>
      )
    }

    if (question.type === 'rank') {
      const opts = question.options ?? []
      return (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              Tap options in order of preference — {ranking.length} of {opts.length} ranked.
            </div>
            {ranking.length > 0 && (
              <button type="button" className="btn-ghost" onClick={() => setRanking([])}>
                Reset order
              </button>
            )}
          </div>
          <div className="grid gap-2 mt-2">
            {opts.map((opt) => {
              const pos = ranking.indexOf(opt)
              const rankedAs = pos >= 0 ? pos + 1 : null
              return (
                <button
                  type="button"
                  key={opt}
                  aria-pressed={rankedAs !== null}
                  aria-label={rankedAs !== null ? `${opt}, ranked ${rankedAs}. Tap to remove from ranking.` : `${opt}, not ranked. Tap to rank next.`}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    rankedAs !== null ? 'border-white/30 bg-white/10' : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                  }`}
                  onClick={() => setRanking((prev) =>
                    prev.includes(opt) ? prev.filter((r) => r !== opt) : [...prev, opt]
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      rankedAs !== null ? 'border-emerald-300/60 bg-emerald-400/10 text-emerald-200' : 'border-slate-700 text-slate-500'
                    }`}>
                      {rankedAs ?? '·'}
                    </div>
                    <div className="font-medium">{opt}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (question.type === 'scale') {
      const { min, max } = scaleBounds(question.scaleMin, question.scaleMax)
      const steps: number[] = []
      for (let v = min; v <= max; v++) steps.push(v)
      return (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={question.prompt}>
            {steps.map((v) => {
              const selected = answer === String(v)
              return (
                <button
                  type="button"
                  key={v}
                  role="radio"
                  aria-checked={selected}
                  className={`h-12 min-w-[3rem] flex-1 rounded-2xl border text-lg font-semibold transition ${
                    selected ? 'border-white/30 bg-white/10' : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                  }`}
                  onClick={() => setAnswer(String(v))}
                >
                  {v}
                </button>
              )
            })}
          </div>
          {(question.scaleMinLabel || question.scaleMaxLabel) && (
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <div>{question.scaleMinLabel ?? ''}</div>
              <div>{question.scaleMaxLabel ?? ''}</div>
            </div>
          )}
        </div>
      )
    }

    if (question.type === 'number') {
      return (
        <div className="mt-4">
          <input
            className="input text-lg"
            inputMode="decimal"
            aria-label="Your numeric answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type a number..."
          />
          {numberInvalid && (
            <div className="mt-1 text-sm text-amber-300">Please enter a valid number.</div>
          )}
        </div>
      )
    }

    if (question.type === 'short') {
      return (
        <div className="mt-4">
          <input
            className="input text-lg"
            aria-label="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type a short answer..."
          />
        </div>
      )
    }

    if (question.type === 'pie') {
      const remaining = Math.round((100 - allocationTotal) * 100) / 100
      return (
        <div className="mt-4 space-y-3">
          {(question.options ?? []).map((opt) => (
            <div key={opt} className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-200">{opt}</div>
              <input
                className="input w-24 text-right"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                aria-label={`Points for ${opt}`}
                value={allocations[opt] ?? ''}
                onChange={(e) => {
                  const next = { ...allocations, [opt]: e.target.value }
                  setAllocations(next)
                }}
              />
            </div>
          ))}
          <div className="flex items-center justify-between text-sm text-slate-400">
            <div>Total allocated</div>
            <div className={remaining === 0 ? 'text-emerald-300' : remaining < 0 ? 'text-red-300' : 'text-amber-300'}>
              {allocationTotal} / 100
              {remaining > 0 && ` — ${remaining} point${remaining === 1 ? '' : 's'} remaining`}
              {remaining < 0 && ` — ${Math.abs(remaining)} over`}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="mt-4">
        <textarea
          className="input min-h-[140px]"
          aria-label="Your answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your response (a few sentences)..."
        />
      </div>
    )
  }, [question, answer, allocations, allocationTotal, selections, ranking, numberInvalid])

  if (gate) {
    return (
      <div>
        <TopBar mode="student" />
        {gate}
      </div>
    )
  }

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
            <button type="button" className="btn-ghost" onClick={() => nav('/')}>Change room</button>
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
                <div className="text-xs uppercase tracking-wide text-slate-400">{questionTypeLabel(question.type)}</div>
                <div className="text-2xl font-semibold mt-1">{question.prompt}</div>
              </div>

              {input}

              {revealActive && (
                <div className={`mt-4 rounded-2xl border p-3 text-sm ${
                  answeredCorrectly === true
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : answeredCorrectly === false
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-slate-700 bg-slate-900/40 text-slate-300'
                }`}>
                  {answeredCorrectly === true && 'Correct — nice work!'}
                  {answeredCorrectly === false && `Not quite. The correct answer: ${(question.correctOptions ?? []).join(', ')}`}
                  {answeredCorrectly === null && `The correct answer: ${(question.correctOptions ?? []).join(', ')}`}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button type="button" className="btn" onClick={submit} disabled={!canSubmit}>
                  {revealActive
                    ? 'Answering closed'
                    : cooldownRemaining > 0
                      ? `Resubmit in ${cooldownRemaining}s`
                      : hasSubmitted ? 'Resubmit' : 'Submit'}
                </button>
                {hasSubmitted && (
                  <div className="text-sm text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 size={18} /> Answer submitted
                  </div>
                )}
              </div>

              {!revealActive && (
                <div className="mt-2 text-xs text-slate-500">
                  You can change your answer once per minute; your latest answer replaces the previous one.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
