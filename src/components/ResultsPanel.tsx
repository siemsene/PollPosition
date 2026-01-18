import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Maximize2 } from 'lucide-react'
import { excludeOutliers, numericHistogram, safeParseNumber } from '../lib/hist'
import { wordFrequencies } from '../lib/text'
import { synthesizeShortResponses, type SynthesisResult } from '../lib/synthesis'
import { db } from '../firebase'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import type { QuestionType } from './QuestionEditor'
import WordCloudCanvas from './WordCloudCanvas'

type Resp = { id: string, value: unknown, submittedAt?: any }

export default function ResultsPanel({
  type,
  options,
  responses,
  question,
  onExpand,
  variant = 'normal',
  allowSynthesis = false,
  synthesisFromStore = null,
  synthesizedCountFromStore = null,
  synthesisTarget,
}: {
  type: QuestionType
  options: string[]
  responses: Resp[]
  question?: string
  onExpand?: () => void
  variant?: 'normal' | 'expanded'
  allowSynthesis?: boolean
  synthesisFromStore?: SynthesisResult | null
  synthesizedCountFromStore?: number | null
  synthesisTarget?: { sessionId: string, questionId: string }
}) {
  const isExpanded = variant === 'expanded'

  const mcqData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const opt of options) counts.set(opt, 0)
    for (const r of responses) {
      const v = typeof r.value === 'string' ? r.value : String(r.value ?? '')
      if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  }, [responses, options])

  const numData = useMemo(() => {
    const vals = responses
      .map(r => safeParseNumber(r.value))
      .filter((v): v is number => v !== null)

    const filtered = excludeOutliers(vals)
    const stats = filtered.length > 0 ? filtered : vals

    const hist = numericHistogram(vals)
    const mean = stats.length ? stats.reduce((a, b) => a + b, 0) / stats.length : null
    const sorted = stats.slice().sort((a, b) => a - b)
    const median = stats.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null

    return { hist, mean, median, n: stats.length }
  }, [responses])

  const shortItems = useMemo(() => {
    return responses
      .map((r) => ({
        id: r.id,
        text: (typeof r.value === 'string' ? r.value : String(r.value ?? '')).trim(),
      }))
      .filter((r) => r.text.length > 0)
  }, [responses])

  const pieData = useMemo(() => {
    const totals = new Map<string, number>()
    for (const opt of options) totals.set(opt, 0)
    for (const r of responses) {
      if (!r.value || typeof r.value !== 'object') continue
      const obj = r.value as Record<string, unknown>
      for (const opt of options) {
        const raw = obj[opt]
        const num = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(num)) continue
        totals.set(opt, (totals.get(opt) ?? 0) + num)
      }
    }
    return Array.from(totals.entries()).map(([name, value]) => ({ name, value }))
  }, [responses, options])

  const longItems = useMemo(() => {
    return responses
      .map((r) => (typeof r.value === 'string' ? r.value : String(r.value ?? '')).trim())
      .filter((v) => v.length > 0)
  }, [responses])

  const words = useMemo(() => {
    return wordFrequencies(shortItems.map((item) => item.text), 90)
  }, [shortItems])

  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null)
  const [synthesisError, setSynthesisError] = useState<string | null>(null)
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthesizedForCount, setSynthesizedForCount] = useState<number | null>(null)

  useEffect(() => {
    setSynthesis(null)
    setSynthesisError(null)
    setSynthesizedForCount(null)
  }, [question, type])

  useEffect(() => {
    if (!synthesisFromStore) return
    setSynthesis(synthesisFromStore)
    if (typeof synthesizedCountFromStore === 'number') {
      setSynthesizedForCount(synthesizedCountFromStore)
    }
  }, [synthesisFromStore, synthesizedCountFromStore])

  const chartMarginTop = question ? 48 : 8
  const canSynthesize = allowSynthesis && (type === 'short' || type === 'long')
  const synthesisItemCount = type === 'long' ? longItems.length : shortItems.length
  const isSynthesisStale = synthesis && synthesizedForCount !== null && synthesizedForCount !== synthesisItemCount

  async function handleSynthesize() {
    if (synthesizing || synthesisItemCount === 0) return
    setSynthesisError(null)
    setSynthesizing(true)
    try {
      const baseItems = type === 'long' ? longItems : shortItems.map((item) => item.text)
      const result = await synthesizeShortResponses({
        question,
        items: baseItems,
        mode: type === 'long' ? 'summary' : 'grouped',
      })
      setSynthesis(result)
      setSynthesizedForCount(baseItems.length)
      if (synthesisTarget) {
        try {
          await updateDoc(doc(db, 'sessions', synthesisTarget.sessionId, 'questions', synthesisTarget.questionId), {
            synthesis: result,
            synthesizedAt: serverTimestamp(),
            synthesizedCount: baseItems.length,
          })
        } catch (err: any) {
          setSynthesisError(err?.message ?? 'Synthesis saved locally, but failed to publish.')
        }
      }
    } catch (err: any) {
      setSynthesisError(err?.message ?? 'Failed to synthesize responses.')
    } finally {
      setSynthesizing(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold">Live results</div>
          <div className="text-sm text-slate-400">{responses.length} response(s)</div>
        </div>
        <div className="flex items-center gap-3">
          {type === 'number' && (
            <div className="text-xs text-slate-400 text-right">
              <div>n = {numData.n}</div>
              <div>mean = {numData.mean === null ? 'n/a' : round2(numData.mean)}</div>
              <div>median = {numData.median === null ? 'n/a' : round2(numData.median)}</div>
            </div>
          )}
          {canSynthesize && (
            <button
              className="btn-ghost"
              onClick={handleSynthesize}
              disabled={synthesizing || synthesisItemCount === 0}
              title="Synthesize responses"
            >
              {synthesizing ? 'Synthesizing...' : 'Synthesize'}
            </button>
          )}
          {onExpand && (
            <button className="btn-ghost" onClick={onExpand} title="Expand results">
              <Maximize2 size={16} /> Expand
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        {(type === 'mcq' || type === 'number') && (
          <div className={isExpanded ? 'h-[520px] w-full rounded-2xl border border-slate-700/60 bg-white p-3 relative' : 'h-[320px] w-full rounded-2xl border border-slate-700/60 bg-white p-3 relative'}>
            {question && (
              <>
                <div className="absolute left-3 right-3 top-2 text-lg font-semibold text-slate-700 pointer-events-none text-center">
                  {question}
                </div>
                <div className="absolute left-3 right-3 top-8 text-xs text-slate-500 pointer-events-none text-center">
                  {responses.length} response(s)
                </div>
              </>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={type === 'mcq' ? mcqData : numData.hist.bins}
                margin={{ left: 8, right: 8, top: chartMarginTop, bottom: 8 }}
                  barCategoryGap={6}
                  barGap={2}
                >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} interval={0} axisLine={{ stroke: '#1f2937', strokeWidth: 2 }} tickLine={{ stroke: '#1f2937', strokeWidth: 2 }} padding={{ left: 8 }} />
                <YAxis tick={{ fill: '#334155', fontSize: 12 }} allowDecimals={false} axisLine={{ stroke: '#1f2937', strokeWidth: 2 }} tickLine={{ stroke: '#1f2937', strokeWidth: 2 }} padding={{ top: 0, bottom: 8 }} />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  fill="#0f2a66"
                  stroke="#d1d5db"
                  strokeWidth={1}
                  isAnimationActive
                  animationDuration={450}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {type === 'pie' && (
          <div className={isExpanded ? 'h-[520px] w-full rounded-2xl border border-slate-700/60 bg-white p-3 relative' : 'h-[320px] w-full rounded-2xl border border-slate-700/60 bg-white p-3 relative'}>
            {question && (
              <>
                <div className="absolute left-3 right-3 top-2 text-lg font-semibold text-slate-700 pointer-events-none text-center">
                  {question}
                </div>
                <div className="absolute left-3 right-3 top-8 text-xs text-slate-500 pointer-events-none text-center">
                  {responses.length} response(s)
                </div>
              </>
            )}
            {pieData.every((d) => d.value === 0) ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                No allocations yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={isExpanded ? 90 : 70}
                    outerRadius={isExpanded ? 170 : 120}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={`${entry.name}-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="#ffffff" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [value, 'Points']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {type === 'short' && (
          <div className="space-y-4">
            <ShortTextCanvas
              items={shortItems}
              height={isExpanded ? 520 : 360}
            />
            {(canSynthesize || synthesis) && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-700">Synthesis</div>
                  {isSynthesisStale && (
                    <div className="text-xs text-amber-700">New responses since last synthesis.</div>
                  )}
                </div>
                {synthesisError && (
                  <div className="mt-2 text-sm text-red-600">{synthesisError}</div>
                )}
                {!synthesis && canSynthesize && !synthesizing && !synthesisError && (
                  <div className="mt-2 text-sm text-slate-600">
                    Click "Synthesize" to group and summarize the responses.
                  </div>
                )}
                {synthesizing && (
                  <div className="mt-2 text-sm text-slate-500">Generating synthesis...</div>
                )}
                {synthesis && (
                  <div className="mt-3 space-y-4">
                    {synthesis.overallSummary && (
                      <div className="text-sm text-slate-700">{synthesis.overallSummary}</div>
                    )}
                    {synthesis.groups.map((group, idx) => (
                      <div key={`${group.theme}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-sm font-semibold text-slate-700">{group.theme}</div>
                        <div className="mt-1 text-sm text-slate-600">{group.summary}</div>
                        {group.contributions.length > 0 && (
                          <div className="mt-2 text-xs text-slate-500">
                            {group.contributions.join(' | ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {type === 'long' && (
          <div className="space-y-4">
            <div className={isExpanded ? 'h-[520px] w-full rounded-2xl border border-slate-700/60 bg-[#f3ead7] p-2' : 'h-[360px] w-full rounded-2xl border border-slate-700/60 bg-[#f3ead7] p-2'}>
              {words.length === 0 ? (
                <div className="text-slate-600 text-sm p-3">No answers yet.</div>
              ) : (
                <WordCloudCanvas words={words} />
              )}
            </div>
            {(canSynthesize || synthesis) && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-700">Synthesis</div>
                  {isSynthesisStale && (
                    <div className="text-xs text-amber-700">New responses since last synthesis.</div>
                  )}
                </div>
                {synthesisError && (
                  <div className="mt-2 text-sm text-red-600">{synthesisError}</div>
                )}
                {!synthesis && canSynthesize && !synthesizing && !synthesisError && (
                  <div className="mt-2 text-sm text-slate-600">
                    Click "Synthesize" to summarize the responses.
                  </div>
                )}
                {synthesizing && (
                  <div className="mt-2 text-sm text-slate-500">Generating synthesis...</div>
                )}
                {synthesis && (
                  <div className="mt-3 text-sm text-slate-700">
                    {synthesis.overallSummary ?? synthesis.groups.map((group) => group.summary).join(' ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function round2(x: number) {
  const r = Math.round(x * 100) / 100
  return (Math.abs(r - Math.round(r)) < 1e-9) ? `${Math.round(r)}` : `${r}`
}

const PIE_COLORS = ['#1d4ed8', '#0f766e', '#c2410c', '#7c3aed', '#0f172a', '#14b8a6', '#f97316', '#6366f1']

type ShortItem = { id: string, text: string }
type Box = { id: string, text: string, x: number, y: number, width: number, height: number }

function ShortTextCanvas({ items, height }: { items: ShortItem[], height: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height })
  const [positions, setPositions] = useState<Record<string, Box>>({})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    updateSize()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!size.width || !size.height) return
    setPositions((prev) => {
      const next: Record<string, Box> = {}
      const placed: Box[] = []

      const sorted = items.slice()

      for (const item of sorted) {
        const existing = prev[item.id]
        const base = existing && isBoxInBounds(existing, size) ? existing : null
        const box = base ? { ...base, text: item.text } : placeBox(item, size, placed)
        next[item.id] = box
        placed.push(box)
      }

      return next
    })
  }, [items, size.width, size.height])

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl border border-slate-700/60 bg-white"
      style={{ height }}
    >
      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          No answers yet.
        </div>
      )}
      {items.map((item) => {
        const box = positions[item.id]
        if (!box) return null
        return (
          <div
            key={item.id}
            className="absolute rounded-lg border border-dashed border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm short-pop"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
          >
            {item.text}
          </div>
        )
      })}
    </div>
  )
}

function placeBox(item: ShortItem, size: { width: number, height: number }, placed: Box[]) {
  const est = estimateBox(item.text)
  const maxX = Math.max(0, size.width - est.width)
  const maxY = Math.max(0, size.height - est.height)
  const padding = 8

  for (let i = 0; i < 60; i++) {
    const x = randomInt(0, Math.max(0, maxX))
    const y = randomInt(0, Math.max(0, maxY))
    const candidate = { id: item.id, text: item.text, x, y, width: est.width, height: est.height }
    if (!overlaps(candidate, placed, padding)) return candidate
  }

  return {
    id: item.id,
    text: item.text,
    x: randomInt(0, Math.max(0, maxX)),
    y: randomInt(0, Math.max(0, maxY)),
    width: est.width,
    height: est.height,
  }
}

function estimateBox(text: string) {
  const width = Math.min(320, Math.max(120, text.length * 7 + 24))
  const height = Math.max(36, Math.ceil(text.length / 32) * 20 + 16)
  return { width, height }
}

function overlaps(candidate: Box, placed: Box[], padding: number) {
  for (const box of placed) {
    const left = candidate.x - padding
    const right = candidate.x + candidate.width + padding
    const top = candidate.y - padding
    const bottom = candidate.y + candidate.height + padding

    const otherLeft = box.x
    const otherRight = box.x + box.width
    const otherTop = box.y
    const otherBottom = box.y + box.height

    if (left < otherRight && right > otherLeft && top < otherBottom && bottom > otherTop) {
      return true
    }
  }
  return false
}

function isBoxInBounds(box: Box, size: { width: number, height: number }) {
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height
}

function randomInt(min: number, max: number) {
  if (max <= min) return min
  return Math.floor(Math.random() * (max - min + 1)) + min
}
