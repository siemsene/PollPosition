import { useEffect, useMemo, useState } from 'react'
import { collection, deleteField, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { Check, Plus, X } from 'lucide-react'
import type { Question, QuestionType } from '../types/poll'
import { friendlyError } from '../lib/errors'

export type { QuestionType }

// Firestore rules cap response lists and maps at 20 entries, so questions may
// not offer more than 20 options — otherwise rank/pie answers become
// unsubmittable.
const MAX_OPTIONS = 20

export default function QuestionEditor({
  sessionId,
  editQuestion = null,
  onDone,
}: {
  sessionId: string
  editQuestion?: Question | null
  onDone?: () => void
}) {
  const isEditing = editQuestion !== null
  const [type, setType] = useState<QuestionType>('mcq')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [scaleMin, setScaleMin] = useState('1')
  const [scaleMax, setScaleMax] = useState('5')
  const [scaleMinLabel, setScaleMinLabel] = useState('')
  const [scaleMaxLabel, setScaleMaxLabel] = useState('')
  const [correctIdx, setCorrectIdx] = useState<number[]>([])
  // Guards against saving an edit before the stored correct answer has been
  // read — doing so would silently wipe the question's quiz state.
  const [answerLoad, setAnswerLoad] = useState<'idle' | 'pending' | 'ok' | 'failed'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill when switching into edit mode (correct answers live in the
  // instructor-only meta/answer doc, not on the public question).
  useEffect(() => {
    setError(null)
    setCorrectIdx([])
    setAnswerLoad('idle')
    if (!editQuestion) {
      setType('mcq')
      setPrompt('')
      setOptions(['', ''])
      setScaleMin('1')
      setScaleMax('5')
      setScaleMinLabel('')
      setScaleMaxLabel('')
      return
    }
    setType(editQuestion.type)
    setPrompt(editQuestion.prompt ?? '')
    const opts = editQuestion.options ?? []
    setOptions(opts.length >= 2 ? [...opts] : [...opts, '', ''].slice(0, 2))
    setScaleMin(String(editQuestion.scaleMin ?? 1))
    setScaleMax(String(editQuestion.scaleMax ?? 5))
    setScaleMinLabel(editQuestion.scaleMinLabel ?? '')
    setScaleMaxLabel(editQuestion.scaleMaxLabel ?? '')
    if (editQuestion.type !== 'mcq' && editQuestion.type !== 'multi') return
    setAnswerLoad('pending')
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'sessions', sessionId, 'questions', editQuestion.id, 'meta', 'answer'))
        if (cancelled) return
        const stored: string[] = snap.exists() && Array.isArray(snap.data()?.correctOptions) ? snap.data()!.correctOptions : []
        setCorrectIdx(opts.map((o, i) => (stored.includes(o) ? i : -1)).filter((i) => i >= 0))
        setAnswerLoad('ok')
      } catch {
        if (!cancelled) setAnswerLoad('failed')
      }
    })()
    return () => { cancelled = true }
  }, [editQuestion?.id])

  const usesOptions = type === 'mcq' || type === 'pie' || type === 'rank' || type === 'multi'
  const supportsQuiz = type === 'mcq' || type === 'multi'

  const scaleValid = useMemo(() => {
    const min = Number(scaleMin)
    const max = Number(scaleMax)
    return Number.isInteger(min) && Number.isInteger(max) && min < max && max - min <= 10
  }, [scaleMin, scaleMax])

  const optionCount = options.filter(o => o.trim()).length
  const canSave = prompt.trim().length > 0
    && (!usesOptions || (optionCount >= 2 && optionCount <= MAX_OPTIONS))
    && (type !== 'scale' || scaleValid)
    && !(isEditing && supportsQuiz && answerLoad === 'pending')
    && !busy

  const optionsClean = useMemo(
    () => options.map(o => o.trim()).filter(Boolean),
    [options]
  )

  const correctOptions = useMemo(() => {
    if (!supportsQuiz) return []
    const chosen = correctIdx
      .map((i) => (options[i] ?? '').trim())
      .filter(Boolean)
    return Array.from(new Set(chosen))
  }, [supportsQuiz, correctIdx, options])

  function toggleCorrect(idx: number) {
    setCorrectIdx((prev) => {
      if (type === 'mcq') return prev.includes(idx) ? [] : [idx]
      return prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    })
  }

  async function save() {
    if (!canSave) return
    setError(null)
    setBusy(true)
    try {
      const isQuiz = supportsQuiz && correctOptions.length > 0
      // If the stored correct answer could not be read, leave the quiz state
      // untouched rather than silently wiping it.
      const quizWritable = !isEditing || !supportsQuiz || answerLoad === 'ok'
      const basePayload = {
        prompt: prompt.trim(),
        options: usesOptions ? optionsClean : [],
        ...(type === 'scale' ? {
          scaleMin: Number(scaleMin),
          scaleMax: Number(scaleMax),
          scaleMinLabel: scaleMinLabel.trim() || null,
          scaleMaxLabel: scaleMaxLabel.trim() || null,
        } : {}),
      }
      const batch = writeBatch(db)
      if (isEditing && editQuestion) {
        const qRef = doc(db, 'sessions', sessionId, 'questions', editQuestion.id)
        const answerRef = doc(db, 'sessions', sessionId, 'questions', editQuestion.id, 'meta', 'answer')
        batch.update(qRef, {
          ...basePayload,
          // Editing resets any reveal so a changed answer is never half-shown.
          revealAnswer: false,
          correctOptions: deleteField(),
          ...(quizWritable ? { isQuiz } : {}),
        })
        if (quizWritable) {
          if (isQuiz) {
            batch.set(answerRef, { correctOptions })
          } else {
            batch.delete(answerRef)
          }
        }
        await batch.commit()
        onDone?.()
      } else {
        const qRef = doc(collection(db, 'sessions', sessionId, 'questions'))
        batch.set(qRef, {
          type,
          ...basePayload,
          isQuiz,
          order: Date.now(),
          createdAt: serverTimestamp(),
        })
        if (isQuiz) {
          batch.set(doc(db, 'sessions', sessionId, 'questions', qRef.id, 'meta', 'answer'), { correctOptions })
        }
        await batch.commit()
        setPrompt('')
        setCorrectIdx([])
        if (usesOptions) setOptions(['', ''])
      }
    } catch (e: any) {
      setError(friendlyError(e, isEditing ? 'Failed to save the question.' : 'Failed to create the question.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{isEditing ? 'Edit question' : 'Create a question'}</div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
              <X size={16} /> Cancel
            </button>
          )}
          <button type="button" className="btn" disabled={!canSave} onClick={save}>
            {isEditing ? (busy ? 'Saving...' : 'Save') : (<><Plus size={18} /> Add</>)}
          </button>
        </div>
      </div>

      {error && <div className="mt-2 text-sm text-red-300">{error}</div>}

      <div className="mt-4 grid gap-3">
        <div>
          <div className="label mb-1">Answer type</div>
          <select
            className="select"
            aria-label="Answer type"
            value={type}
            disabled={isEditing}
            onChange={(e) => setType(e.target.value as QuestionType)}
          >
            <option value="mcq">Multiple choice</option>
            <option value="multi">Multiple select (all that apply)</option>
            <option value="rank">Ranking</option>
            <option value="scale">Rating scale</option>
            <option value="pie">100 point allocation</option>
            <option value="number">Numerical</option>
            <option value="short">Short text</option>
            <option value="cloud">Word cloud</option>
            <option value="long">Extended text</option>
          </select>
          {isEditing && (
            <div className="mt-1 text-xs text-slate-500">The answer type cannot be changed after creation.</div>
          )}
        </div>

        <div>
          <div className="label mb-1">Prompt</div>
          <textarea
            className="input min-h-[80px]"
            aria-label="Question prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type the question you want to ask..."
          />
        </div>

        {type === 'scale' && (
          <div>
            <div className="label mb-1">Scale</div>
            <div className="flex items-center gap-2">
              <input
                className="input w-20 text-center"
                type="number"
                step={1}
                aria-label="Scale minimum"
                value={scaleMin}
                onChange={(e) => setScaleMin(e.target.value)}
              />
              <span className="text-slate-400">to</span>
              <input
                className="input w-20 text-center"
                type="number"
                step={1}
                aria-label="Scale maximum"
                value={scaleMax}
                onChange={(e) => setScaleMax(e.target.value)}
              />
            </div>
            {!scaleValid && (
              <div className="mt-1 text-xs text-amber-300">
                Use whole numbers with min below max, spanning at most 10 points (e.g. 1–5 or 0–10).
              </div>
            )}
            <div className="mt-2 grid md:grid-cols-2 gap-2">
              <input
                className="input"
                aria-label="Label for lowest value"
                value={scaleMinLabel}
                onChange={(e) => setScaleMinLabel(e.target.value)}
                placeholder="Low label (optional, e.g. Strongly disagree)"
              />
              <input
                className="input"
                aria-label="Label for highest value"
                value={scaleMaxLabel}
                onChange={(e) => setScaleMaxLabel(e.target.value)}
                placeholder="High label (optional, e.g. Strongly agree)"
              />
            </div>
          </div>
        )}

        {type === 'cloud' && (
          <div className="text-xs text-slate-400">
            Students answer with a word or short phrase; answers build a live word cloud.
          </div>
        )}

        {usesOptions && (
          <div>
            <div className="label mb-1">{type === 'pie' ? 'Categories' : 'Options'}</div>
            <div className="grid md:grid-cols-2 gap-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <input
                    className="input flex-1"
                    aria-label={`${type === 'pie' ? 'Category' : 'Option'} ${idx + 1}`}
                    maxLength={200}
                    value={opt}
                    onChange={(e) => {
                      const next = options.slice()
                      next[idx] = e.target.value
                      setOptions(next)
                    }}
                    placeholder={type === 'pie' ? `Category ${idx + 1}` : undefined}
                  />
                  {supportsQuiz && (
                    <button
                      type="button"
                      className={`shrink-0 rounded-xl border p-2 transition ${
                        correctIdx.includes(idx)
                          ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
                          : 'border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                      aria-pressed={correctIdx.includes(idx)}
                      aria-label={`Mark option ${idx + 1} as correct`}
                      title="Mark as correct answer"
                      onClick={() => toggleCorrect(idx)}
                    >
                      <Check size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost mt-2"
              disabled={options.length >= MAX_OPTIONS}
              onClick={() => setOptions([...options, type === 'pie' ? `Category ${options.length + 1}` : `Option ${options.length + 1}`])}
            >
              <Plus size={16} /> {type === 'pie' ? 'Add category' : 'Add option'}
            </button>
            {options.length >= MAX_OPTIONS && (
              <div className="mt-1 text-xs text-amber-300">
                Maximum of {MAX_OPTIONS} {type === 'pie' ? 'categories' : 'options'}.
              </div>
            )}
            {type === 'rank' && (
              <div className="mt-1 text-xs text-slate-400">
                Students will order these — up to 10 options recommended.
              </div>
            )}
            {supportsQuiz && answerLoad === 'failed' && (
              <div className="mt-1 text-xs text-amber-300">
                Could not load the saved correct answer — quiz settings will be left unchanged when you save.
              </div>
            )}
            {supportsQuiz && answerLoad !== 'failed' && (
              <div className="mt-1 text-xs text-slate-400">
                Optional: mark the correct answer{type === 'multi' ? 's' : ''} with the check button to turn this into a quiz question.
                Correct answers stay hidden until you reveal them.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
