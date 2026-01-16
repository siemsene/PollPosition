import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Maximize2 } from 'lucide-react'
import { excludeOutliers, numericHistogram, safeParseNumber } from '../lib/hist'
import { wordFrequencies } from '../lib/text'
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
}: {
  type: QuestionType
  options: string[]
  responses: Resp[]
  question?: string
  onExpand?: () => void
  variant?: 'normal' | 'expanded'
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

  const words = useMemo(() => {
    return wordFrequencies(shortItems.map((item) => item.text), 90)
  }, [shortItems])

  const chartMarginTop = question ? 48 : 8

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

        {type === 'short' && (
          <ShortTextCanvas
            items={shortItems}
            height={isExpanded ? 520 : 360}
          />
        )}

        {type === 'long' && (
          <div className={isExpanded ? 'h-[520px] w-full rounded-2xl border border-slate-700/60 bg-[#f3ead7] p-2' : 'h-[360px] w-full rounded-2xl border border-slate-700/60 bg-[#f3ead7] p-2'}>
            {words.length === 0 ? (
              <div className="text-slate-600 text-sm p-3">No answers yet.</div>
            ) : (
              <WordCloudCanvas words={words} />
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
