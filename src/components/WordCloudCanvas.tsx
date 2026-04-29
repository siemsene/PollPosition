import { useEffect, useMemo, useRef } from 'react'
import WordCloud from 'wordcloud'

type Word = { text: string, value: number }

type WordCloudOptions = {
  list: Array<[string, number]>
  weightFactor: (size: number) => number
  gridSize: number
  fontFamily: string
  color: () => string
  backgroundColor: string
  rotateRatio: number
  rotationSteps: number
  shuffle: boolean
  drawOutOfBound: boolean
}

export default function WordCloudCanvas({ words, large = false }: { words: Word[], large?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const list = useMemo(() => {
    return words.map((w) => [w.text, w.value] as [string, number])
  }, [words])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const render = () => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(320, Math.floor(rect.width))
      const height = Math.max(240, Math.floor(rect.height))

      if (width === 0 || height === 0) return

      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height

      const minFont = large ? 20 : 12
      const maxFont = large ? 110 : 64
      const scale = large ? 1.6 : 1

      const options: WordCloudOptions = {
        list,
        weightFactor: (size) => Math.max(minFont, Math.min(maxFont, size * scale)),
        gridSize: Math.max(8, Math.floor(width / (large ? 36 : 50))),
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        color: () => '#2563eb',
        backgroundColor: 'transparent',
        rotateRatio: 0.3,
        rotationSteps: 2,
        shuffle: true,
        drawOutOfBound: false,
      }

      WordCloud(canvas, options)
    }

    const observer = new ResizeObserver(() => render())
    observer.observe(container)
    render()

    return () => observer.disconnect()
  }, [list, large])

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}
