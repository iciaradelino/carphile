import { useEffect, useMemo, useRef, useState } from 'react'
import { outlines } from '../cars/build'
import type { CarSpec } from '../cars/types'

interface Props {
  cars: CarSpec[]
  started: string[] // ids in the order their stills began rendering
  done: number
  onFinished: () => void
}

const MIN_SHOW = 950 // ms each drawing stays up, so a fast machine still gets to see it drawn
const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ')
const mm = (m: number) => Math.round(m * 1000).toLocaleString('en-US').replace(',', ' ')

/** A car's side elevation as a technical drawing that draws itself, line by line. */
function Blueprint({ spec }: { spec: CarSpec }) {
  const o = useMemo(() => outlines(spec), [spec])
  const { L, H } = spec.dims
  const hl = L / 2
  const dimY = 0.32 // below the ground line
  const dimX = hl + 0.28
  return (
    <svg className="bp" viewBox="-2.75 -1.75 5.5 2.3" aria-hidden="true">
      <line className="bp-ground bp-draw" x1={-2.7} y1={0} x2={2.7} y2={0} pathLength={1} />
      <polygon className="bp-body bp-draw" points={pts(o.body)} pathLength={1} />
      <polygon className="bp-house bp-draw" points={pts(o.house)} pathLength={1} />
      {o.windows.map((w, i) => (
        <polygon key={i} className="bp-glass bp-draw" points={pts(w)} pathLength={1} style={{ animationDelay: `${0.45 + i * 0.08}s` }} />
      ))}
      {o.axles.map((x) => (
        <g key={x}>
          <circle className="bp-wheel bp-draw" cx={x} cy={-o.R} r={o.R} pathLength={1} />
          <circle className="bp-wheel bp-draw bp-late" cx={x} cy={-o.R} r={o.R * 0.62} pathLength={1} />
          <line className="bp-axis" x1={x} y1={-o.R - 0.08} x2={x} y2={-o.R + 0.08} />
          <line className="bp-axis" x1={x - 0.08} y1={-o.R} x2={x + 0.08} y2={-o.R} />
        </g>
      ))}
      {/* overall length */}
      <g className="bp-dim">
        <line x1={-hl} y1={0.08} x2={-hl} y2={dimY + 0.06} />
        <line x1={hl} y1={0.08} x2={hl} y2={dimY + 0.06} />
        <line className="bp-draw" x1={-hl} y1={dimY} x2={hl} y2={dimY} pathLength={1} />
        <text x={0} y={dimY - 0.06} textAnchor="middle">{mm(L)}</text>
      </g>
      {/* overall height */}
      <g className="bp-dim">
        <line x1={dimX - 0.06} y1={-H} x2={dimX + 0.06} y2={-H} />
        <line className="bp-draw" x1={dimX} y1={0} x2={dimX} y2={-H} pathLength={1} />
        <text x={dimX + 0.08} y={-H / 2} dominantBaseline="middle">{mm(H)}</text>
      </g>
    </svg>
  )
}

export function Loader({ cars, started, done, onFinished }: Props) {
  const [shown, setShown] = useState(0) // index into `started` of the drawing on screen
  const [leaving, setLeaving] = useState(false)
  const total = cars.length
  const allDone = done >= total

  // Step to the next drawing once the current one has had its moment; once every still is in,
  // let the current drawing finish and leave.
  const startedRef = useRef(started)
  startedRef.current = started
  const allDoneRef = useRef(allDone)
  allDoneRef.current = allDone
  useEffect(() => {
    let t = 0
    const next = () => {
      if (allDoneRef.current) setLeaving(true)
      else if (shown < startedRef.current.length - 1) setShown(shown + 1)
      else t = window.setTimeout(next, 120) // wait for the worker to start the next car
    }
    t = window.setTimeout(next, MIN_SHOW)
    return () => clearTimeout(t)
  }, [shown])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(onFinished, 700)
    return () => clearTimeout(t)
  }, [leaving, onFinished])

  const spec = cars.find((c) => c.id === started[shown]) ?? cars[0]
  return (
    <div className={`loader${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="loader-sheet">
        <Blueprint key={spec.id} spec={spec} />
        <div className="loader-caption" key={`c-${spec.id}`}>
          <span className="loader-label">drafting</span>
          <span className="loader-make">{spec.make}</span>
          <span className="loader-model">{spec.model}</span>
        </div>
      </div>
      <div className="loader-foot">
        <span>{String(Math.min(done, total)).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        <div className="loader-bar">
          <div style={{ transform: `scaleX(${Math.min(done, total) / total})` }} />
        </div>
        <span>building the archive</span>
      </div>
    </div>
  )
}
