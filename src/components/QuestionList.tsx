import { collection, deleteDoc, deleteField, doc, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { Question, QuestionType } from '../types/poll'
import { Award, BarChart3, ChevronDown, ChevronUp, Cloud, Download, Hash, ListChecks, ListOrdered, MessageCircle, MessageSquareText, Pencil, PieChart, Play, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { friendlyError } from '../lib/errors'

export type { Question }

export default function QuestionList({
  sessionId,
  activeQuestionId,
  questions,
  onEdit,
}: {
  sessionId: string
  activeQuestionId: string | null
  questions: Question[]
  onEdit?: (q: Question) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [downloadId, setDownloadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null)

  async function setActive(id: string) {
    setError(null)
    try {
      const batch = writeBatch(db)
      // A previously revealed quiz answer must not leak (or block answering)
      // the moment the question goes live again.
      batch.update(doc(db, 'sessions', sessionId, 'questions', id), {
        revealAnswer: false,
        correctOptions: deleteField(),
      })
      batch.update(doc(db, 'sessions', sessionId), {
        activeQuestionId: id,
        updatedAt: serverTimestamp(),
        isOpen: true,
      })
      await batch.commit()
    } catch (e: any) {
      setError(friendlyError(e, 'Failed to activate the question.'))
    }
  }

  async function confirmRemoveQuestion() {
    const q = pendingDelete
    if (!q || busyId) return
    setError(null)
    setBusyId(q.id)
    try {
      await deleteDoc(doc(db, 'sessions', sessionId, 'questions', q.id))
      // Quiz correct answers live in a subdocument; don't strand them.
      await deleteDoc(doc(db, 'sessions', sessionId, 'questions', q.id, 'meta', 'answer')).catch(() => {})
      if (q.id === activeQuestionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          activeQuestionId: null,
          updatedAt: serverTimestamp(),
        })
      }
      setPendingDelete(null)
    } catch (e: any) {
      setError(friendlyError(e, 'Failed to delete the question.'))
    } finally {
      setBusyId(null)
    }
  }

  // Swaps two neighbours when explicit distinct order values exist (2 writes);
  // otherwise rewrites the whole list once to normalize legacy
  // createdAt-derived ordering into small sequential values.
  async function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    setError(null)
    try {
      const orders = questions.map((q) => (typeof q.order === 'number' ? q.order : null))
      const allExplicit = orders.every((o) => o !== null) && new Set(orders).size === orders.length
      const batch = writeBatch(db)
      if (allExplicit) {
        batch.update(doc(db, 'sessions', sessionId, 'questions', questions[index].id), { order: orders[target] })
        batch.update(doc(db, 'sessions', sessionId, 'questions', questions[target].id), { order: orders[index] })
      } else {
        const next = questions.slice()
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved)
        next.forEach((q, idx) => {
          batch.update(doc(db, 'sessions', sessionId, 'questions', q.id), { order: idx + 1 })
        })
      }
      await batch.commit()
    } catch (e: any) {
      setError(friendlyError(e, 'Failed to reorder questions.'))
    }
  }

  async function downloadQuestion(q: Question) {
    if (downloadId) return
    setError(null)
    setDownloadId(q.id)
    try {
      const respRef = collection(db, 'sessions', sessionId, 'questions', q.id, 'responses')
      const snap = await getDocs(respRef)
      const rows = [['responseId', 'userId', 'value', 'submittedAt']]
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as any
        const value = stringifyValue(data.value)
        const submittedAt = formatTimestamp(data.submittedAt)
        rows.push([docSnap.id, stringifyValue(data.userId), value, submittedAt])
      }
      const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
      const filename = buildFilename(q)
      triggerDownload(filename, csv)
    } catch (e: any) {
      setError(friendlyError(e, 'Failed to download responses.'))
    } finally {
      setDownloadId(null)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Questions</div>
        <div className="text-xs text-slate-400">{questions.length} total</div>
      </div>
      {error && <div className="text-xs text-red-200 mt-2">{error}</div>}

      <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-1">
        {questions.length === 0 ? (
          <div className="text-sm text-slate-400">No questions yet.</div>
        ) : (
          questions.map((q, idx) => (
            <div
              key={q.id}
              className={`rounded-2xl border transition ${q.id === activeQuestionId ? 'question-active' : ''} ${
                q.id === activeQuestionId
                  ? 'border-white/30 bg-white/10'
                  : 'border-slate-700/80 bg-slate-950/30 hover:bg-slate-900/40'
              }`}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-3"
                onClick={() => setActive(q.id)}
                title="Set as active question"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TypeIcon type={q.type} />
                      <span className="text-sm font-medium truncate">{q.prompt}</span>
                      {q.isQuiz && (
                        <span title="Quiz question (has a correct answer)">
                          <Award size={14} className="shrink-0 text-amber-300" />
                        </span>
                      )}
                    </div>
                    {(q.type === 'mcq' || q.type === 'pie' || q.type === 'multi' || q.type === 'rank') && (
                      <div className="mt-1 text-xs text-slate-400 truncate">
                        {(q.options ?? []).join(' / ')}
                      </div>
                    )}
                    {q.type === 'scale' && (
                      <div className="mt-1 text-xs text-slate-400 truncate">
                        {q.scaleMin ?? 1}–{q.scaleMax ?? 5}
                        {q.scaleMinLabel && ` (${q.scaleMinLabel}`}
                        {q.scaleMinLabel && q.scaleMaxLabel && ` → ${q.scaleMaxLabel}`}
                        {q.scaleMinLabel && ')'}
                      </div>
                    )}
                  </div>
                  <div className={`shrink-0 inline-flex items-center gap-2 text-xs ${q.id === activeQuestionId ? 'text-white question-active-label' : 'text-slate-400'}`}>
                    <Play size={16} /> Active
                  </div>
                </div>
              </button>
              <div className="flex items-center justify-between gap-2 px-3 pb-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                    aria-label="Move question up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === questions.length - 1}
                    title="Move down"
                    aria-label="Move question down"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {onEdit && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => onEdit(q)}
                      title="Edit question"
                    >
                      <Pencil size={16} /> Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => downloadQuestion(q)}
                    disabled={downloadId === q.id}
                    title="Download responses (CSV)"
                  >
                    <Download size={16} /> {downloadId === q.id ? 'Downloading...' : 'Download'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setPendingDelete(q)}
                    disabled={busyId === q.id}
                    title="Delete question"
                  >
                    <Trash2 size={16} /> {busyId === q.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this question?"
        description="Responses are kept in Firestore, but the question will no longer appear in the list."
        confirmLabel="Delete"
        destructive
        busy={busyId !== null}
        onConfirm={confirmRemoveQuestion}
        onCancel={() => { if (!busyId) setPendingDelete(null) }}
      />
    </div>
  )
}

function TypeIcon({ type }: { type: QuestionType }) {
  const cls = "text-slate-300"
  if (type === 'mcq') return <BarChart3 size={16} className={cls} />
  if (type === 'multi') return <ListChecks size={16} className={cls} />
  if (type === 'rank') return <ListOrdered size={16} className={cls} />
  if (type === 'scale') return <SlidersHorizontal size={16} className={cls} />
  if (type === 'pie') return <PieChart size={16} className={cls} />
  if (type === 'number') return <Hash size={16} className={cls} />
  if (type === 'short') return <MessageCircle size={16} className={cls} />
  if (type === 'cloud') return <Cloud size={16} className={cls} />
  return <MessageSquareText size={16} className={cls} />
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((v) => String(v)).join('; ')
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatTimestamp(ts: any) {
  if (!ts) return ''
  if (typeof ts?.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000).toISOString()
  return ''
}

function escapeCsv(value: string) {
  const safe = value.replace(/\"/g, '\"\"')
  return `"${safe}"`
}

function buildFilename(q: Question) {
  const base = slugify(q.prompt || q.id)
  return `question-${base || q.id}.csv`
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function triggerDownload(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
