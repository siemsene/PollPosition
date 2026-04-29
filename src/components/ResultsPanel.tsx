import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
  showHeader = true,
  frameless = false,
  fitHeight = false,
  showSynthesis = true,
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
  showHeader?: boolean
  frameless?: boolean
  fitHeight?: boolean
  showSynthesis?: boolean
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

  const chartMarginTop = question ? (isExpanded ? 88 : 48) : 8
  const axisFontSize = isExpanded ? 18 : 12
  const valueLabelFontSize = isExpanded ? 22 : 12
  const pieLabelFontSize = isExpanded ? 20 : 12
  const legendFontSize = isExpanded ? 18 : 12
  const tooltipFontSize = isExpanded ? 14 : 12
  const titleClass = isExpanded
    ? 'absolute left-3 right-3 top-3 text-3xl font-bold tracking-tight text-slate-700 pointer-events-none text-center'
    : 'absolute left-3 right-3 top-2 text-lg font-semibold text-slate-700 pointer-events-none text-center'
  const subtitleClass = isExpanded
    ? 'absolute left-3 right-3 top-14 text-base text-slate-500 pointer-events-none text-center'
    : 'absolute left-3 right-3 top-8 text-xs text-slate-500 pointer-events-none text-center'
  const mcqTruncateLimit = isExpanded ? 22 : 14
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
        sessionId: synthesisTarget?.sessionId,
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

  const wrapperClass = [
    frameless ? '' : 'card p-4',
    fitHeight ? 'h-full' : '',
  ].filter(Boolean).join(' ')
  const contentClass = fitHeight ? 'h-full' : 'mt-4'
  const chartBoxClass = fitHeight
    ? 'h-full w-full bg-white p-3 relative'
    : (isExpanded
      ? 'h-[520px] w-full rounded-2xl border border-slate-700/60 bg-white p-3 relative'
      : 'h-[320px] w-full rounded-2xl border border-slate-700/60 bg-white p-3 relative')
  const wordCloudClass = fitHeight
    ? 'h-full w-full bg-[#f3ead7] p-2'
    : (isExpanded
      ? 'h-[520px] w-full rounded-2xl border border-slate-700/60 bg-[#f3ead7] p-2'
      : 'h-[360px] w-full rounded-2xl border border-slate-700/60 bg-[#f3ead7] p-2')

  return (
    <div className={wrapperClass}>
      {showHeader && (
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
                type="button"
                className="btn-ghost"
                onClick={handleSynthesize}
                disabled={synthesizing || synthesisItemCount === 0}
                title="Synthesize responses"
              >
                {synthesizing ? 'Synthesizing...' : 'Synthesize'}
              </button>
            )}
            {onExpand && (
              <button type="button" className="btn-ghost" onClick={onExpand} title="Expand results">
                <Maximize2 size={16} /> Expand
              </button>
            )}
          </div>
        </div>
      )}
      <div className={contentClass}>
        {(type === 'mcq' || type === 'number') && (
          <div className={chartBoxClass}>
            {question && (
              <>
                <div className={titleClass}>
                  {question}
                </div>
                <div className={subtitleClass}>
                  {responses.length} response(s)
                </div>
              </>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={type === 'mcq' ? mcqData : numData.hist.bins}
                margin={{ left: 8, right: 8, top: chartMarginTop, bottom: type === 'mcq' ? (isExpanded ? 32 : 24) : 8 }}
                barCategoryGap="20%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: CHART_AXIS, fontSize: axisFontSize, fontWeight: isExpanded ? 600 : 400 }}
                  interval={0}
                  axisLine={{ stroke: CHART_AXIS, strokeWidth: 1 }}
                  tickLine={{ stroke: CHART_AXIS, strokeWidth: 1 }}
                  padding={{ left: 8, right: 8 }}
                  height={type === 'mcq' ? (isExpanded ? 64 : 48) : (isExpanded ? 44 : 32)}
                  tickFormatter={type === 'mcq' ? (v: string) => truncateLabel(v, mcqTruncateLimit) : undefined}
                />
                <YAxis
                  tick={{ fill: CHART_AXIS, fontSize: axisFontSize, fontWeight: isExpanded ? 600 : 400 }}
                  allowDecimals={false}
                  axisLine={{ stroke: CHART_AXIS, strokeWidth: 1 }}
                  tickLine={{ stroke: CHART_AXIS, strokeWidth: 1 }}
                  padding={{ top: 0, bottom: 8 }}
                  width={isExpanded ? 56 : 40}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: tooltipFontSize }}
                />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  fill={CHART_PRIMARY}
                  isAnimationActive
                  animationDuration={450}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    fill={CHART_LABEL}
                    fontSize={valueLabelFontSize}
                    fontWeight={isExpanded ? 700 : 600}
                    formatter={(value: number) => (value > 0 ? value : '')}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {type === 'pie' && (
          <div className={chartBoxClass}>
            {question && (
              <>
                <div className={titleClass}>
                  {question}
                </div>
                <div className={subtitleClass}>
                  {responses.length} response(s)
                </div>
              </>
            )}
            {pieData.every((d) => d.value === 0) ? (
              <div className={`h-full flex items-center justify-center text-slate-500 ${isExpanded ? 'text-xl' : 'text-sm'}`}>
                No allocations yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: chartMarginTop, right: 8, left: 8, bottom: 8 }}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={isExpanded ? 80 : 60}
                    outerRadius={isExpanded ? 150 : 105}
                    paddingAngle={2}
                    isAnimationActive
                    animationDuration={450}
                    label={(props: any) => renderPieLabel(props, pieLabelFontSize)}
                    labelLine={false}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell
                        key={`${entry.name}-${idx}`}
                        fill={PIE_COLORS[idx % PIE_COLORS.length]}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      const total = pieData.reduce((sum, d) => sum + d.value, 0)
                      const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0
                      return [`${value} pts (${pct}%)`, name]
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: tooltipFontSize }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={isExpanded ? 40 : 28}
                    iconType="circle"
                    wrapperStyle={{ fontSize: legendFontSize, color: CHART_AXIS, paddingTop: 4, fontWeight: isExpanded ? 600 : 400 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {type === 'short' && (
          <div className="space-y-4">
            <ShortTextCanvas
              items={shortItems}
              height={fitHeight ? undefined : (isExpanded ? 520 : 360)}
              frameless={fitHeight}
              large={isExpanded}
            />
            {showSynthesis && (canSynthesize || synthesis) && (
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
            <div className={wordCloudClass}>
              {words.length === 0 ? (
                <div className={`text-slate-600 p-3 ${isExpanded ? 'text-xl' : 'text-sm'}`}>No answers yet.</div>
              ) : (
                <WordCloudCanvas words={words} large={isExpanded} />
              )}
            </div>
            {showSynthesis && (canSynthesize || synthesis) && (
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

function truncateLabel(value: string, limit = 14) {
  if (typeof value !== 'string') return value
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function renderPieLabel(props: any, fontSize = 12) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props
  if (!percent || percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fontSize}
      fontWeight={700}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  )
}

const CHART_PRIMARY = '#2563eb'
const CHART_GRID = '#cbd5e1'
const CHART_AXIS = '#475569'
const CHART_LABEL = '#0f172a'
const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#65a30d', '#ec4899']

type ShortItem = { id: string, text: string }
type Box = { id: string, text: string, x: number, y: number, width: number, height: number }

function ShortTextCanvas({ items, height, frameless, large }: { items: ShortItem[], height?: number, frameless?: boolean, large?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
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
        const box = base ? { ...base, text: item.text } : placeBox(item, size, placed, !!large)
        next[item.id] = box
        placed.push(box)
      }

      return next
    })
  }, [items, size.width, size.height, large])

  const cardClass = large
    ? 'absolute rounded-xl border border-dashed border-slate-400 bg-slate-50 px-4 py-3 text-xl font-medium text-slate-800 shadow-sm short-pop'
    : 'absolute rounded-lg border border-dashed border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm short-pop'

  return (
    <div
      ref={containerRef}
      className={frameless ? 'relative w-full bg-white' : 'relative w-full rounded-2xl border border-slate-700/60 bg-white'}
      style={{ height: height ?? '100%' }}
    >
      {items.length === 0 && (
        <div className={`absolute inset-0 flex items-center justify-center text-slate-500 ${large ? 'text-xl' : 'text-sm'}`}>
          No answers yet.
        </div>
      )}
      {items.map((item) => {
        const box = positions[item.id]
        if (!box) return null
        return (
          <div
            key={item.id}
            className={cardClass}
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

function placeBox(item: ShortItem, size: { width: number, height: number }, placed: Box[], large: boolean) {
  const est = estimateBox(item.text, large)
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

function estimateBox(text: string, large: boolean) {
  if (large) {
    const width = Math.min(520, Math.max(180, text.length * 12 + 40))
    const height = Math.max(60, Math.ceil(text.length / 28) * 32 + 28)
    return { width, height }
  }
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
