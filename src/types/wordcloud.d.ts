declare module 'wordcloud' {
  export type WordCloudListItem = [string, number]

  export type WordCloudOptions = {
    list: WordCloudListItem[]
    weightFactor?: number | ((size: number) => number)
    gridSize?: number
    fontFamily?: string
    color?: string | ((word: string, weight: number, fontSize: number, distance: number, theta: number) => string)
    backgroundColor?: string
    rotateRatio?: number
    rotationSteps?: number
    shuffle?: boolean
    drawOutOfBound?: boolean
  }

  export default function WordCloud(
    element: HTMLCanvasElement | HTMLDivElement,
    options: WordCloudOptions
  ): void
}