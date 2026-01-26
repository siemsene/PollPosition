import { collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { QuestionType } from './QuestionEditor'
import type { SynthesisResult } from '../lib/synthesis'
import { BarChart3, Download, Hash, MessageCircle, MessageSquareText, PieChart, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'

export type Question = {
  id: string
  type: QuestionType
  prompt: string
  options?: string[]
  synthesis?: SynthesisResult | null
  synthesizedCount?: number | null
}

export default function QuestionList({
  sessionId,
  activeQuestionId,
  questions,
}: {
  sessionId: string
  activeQuestionId: string | null
  questions: Question[]
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [downloadId, setDownloadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setActive(id: string) {
    setError(null)
    await updateDoc(doc(db, 'sessions', sessionId), {
      activeQuestionId: id,
      updatedAt: serverTimestamp(),
      isOpen: true,
    })
  }

  async function removeQuestion(q: Question) {
    if (busyId) return
    const confirmed = window.confirm('Delete this question? Responses are kept in Firestore, but it will no longer appear in the list.')
    if (!confirmed) return
    setError(null)
    setBusyId(q.id)
    try {
      await deleteDoc(doc(db, 'sessions', sessionId, 'questions', q.id))
      if (q.id === activeQuestionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          activeQuestionId: null,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete question.')
    } finally {
      setBusyId(null)
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
      setError(e?.message ?? 'Failed to download responses.')
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
          questions.map((q) => (
            <div
              key={q.id}
              className={`rounded-2xl border transition ${q.id === activeQuestionId ? 'question-active' : ''} ${
                q.id === activeQuestionId
                  ? 'border-white/30 bg-white/10'
                  : 'border-slate-700/80 bg-slate-950/30 hover:bg-slate-900/40'
              }`}
            >
              <button
                className="w-full text-left px-3 py-3"
                onClick={() => setActive(q.id)}
                title="Set as active question"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TypeIcon type={q.type} />
                      <span className="text-sm font-medium truncate">{q.prompt}</span>
                    </div>
                    {(q.type === 'mcq' || q.type === 'pie') && (
                      <div className="mt-1 text-xs text-slate-400 truncate">
                        {(q.options ?? []).join(' / ')}
                      </div>
                    )}
                  </div>
                  <div className={`shrink-0 inline-flex items-center gap-2 text-xs ${q.id === activeQuestionId ? 'text-white question-active-label' : 'text-slate-400'}`}>
                    <Play size={16} /> Active
                  </div>
                </div>
              </button>
              <div className="flex items-center justify-end gap-2 px-3 pb-3">
                <button
                  className="btn-ghost"
                  onClick={() => downloadQuestion(q)}
                  disabled={downloadId === q.id}
                  title="Download responses (CSV)"
                >
                  <Download size={16} /> {downloadId === q.id ? 'Downloading...' : 'Download'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => removeQuestion(q)}
                  disabled={busyId === q.id}
                  title="Delete question"
                >
                  <Trash2 size={16} /> {busyId === q.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TypeIcon({ type }: { type: QuestionType }) {
  const cls = "text-slate-300"
  if (type === 'mcq') return <BarChart3 size={16} className={cls} />
  if (type === 'pie') return <PieChart size={16} className={cls} />
  if (type === 'number') return <Hash size={16} className={cls} />
  if (type === 'short') return <MessageCircle size={16} className={cls} />
  return <MessageSquareText size={16} className={cls} />
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
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
