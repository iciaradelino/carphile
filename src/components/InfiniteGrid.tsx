import { useEffect, useRef, useState } from 'react'
import type { CarSpec } from '../cars/types'
import { isBuilt, warmCar } from '../render/carCache'
import { hoverCar } from '../render/hover'

interface Props {
  cars: CarSpec[]
  stills: Record<string, string>
  onOpen: (index: number, cell: HTMLElement) => void
  onFirstMove: () => void
  paused: boolean
}

interface Range {
  c0: number
  c1: number
  r0: number
  r1: number
}

const MIN_ZOOM = 0.45
const MAX_ZOOM = 1.7
const mod = (n: number, m: number) => ((n % m) + m) % m
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

function cellSize() {
  const w = window.innerWidth
  if (w < 640) return { cw: 230, ch: 230 }
  if (w < 1100) return { cw: 320, ch: 300 }
  return { cw: 380, ch: 340 }
}

/** Which car sits in a cell. Stepping 5 per row keeps every neighbour, diagonals included, different. */
const carAt = (c: number, r: number, n: number) => mod(c + r * 5, n)

/** Mouse wheels scroll in coarse whole steps; trackpads send small, smooth deltas. */
const isWheelMouse = (e: WheelEvent) => e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY))

export function InfiniteGrid({ cars, stills, onOpen, onFirstMove, paused }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const plane = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(cellSize)
  const [range, setRange] = useState<Range>({ c0: 0, c1: 0, r0: 0, r1: 0 })
  const [zoomLabel, setZoomLabel] = useState(100)
  const state = useRef({
    x: 0, y: 0, vx: 0, vy: 0, zoom: 1, targetZoom: 1, ax: 0, ay: 0,
    dragging: false, moved: 0, lastX: 0, lastY: 0, started: false, lastInput: 0,
  })
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const carsRef = useRef(cars)
  carsRef.current = cars

  useEffect(() => {
    const s = state.current
    s.x = window.innerWidth / 2 - size.cw / 2
    s.y = window.innerHeight / 2 - size.ch / 2
    const onResize = () => setSize(cellSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Animation loop: inertia, eased zoom around its anchor, transform, and which cells are on screen.
  useEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      const s = state.current
      if (!s.dragging) {
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.94
        s.vy *= 0.94
        if (Math.abs(s.vx) < 0.01) s.vx = 0
        if (Math.abs(s.vy) < 0.01) s.vy = 0
      }
      if (Math.abs(s.targetZoom - s.zoom) > 0.0005) {
        const next = s.zoom + (s.targetZoom - s.zoom) * 0.2
        // keep the point under the cursor (or pinch centre) still
        s.x = s.ax - ((s.ax - s.x) / s.zoom) * next
        s.y = s.ay - ((s.ay - s.y) / s.zoom) * next
        s.zoom = next
        setZoomLabel(Math.round(s.targetZoom * 100))
      }
      if (plane.current) plane.current.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.zoom})`
      const vw = window.innerWidth
      const vh = window.innerHeight
      const r: Range = {
        c0: Math.floor(-s.x / s.zoom / size.cw) - 1,
        c1: Math.ceil((vw - s.x) / s.zoom / size.cw),
        r0: Math.floor(-s.y / s.zoom / size.ch) - 1,
        r1: Math.ceil((vh - s.y) / s.zoom / size.ch),
      }
      const key = `${r.c0},${r.c1},${r.r0},${r.r1}`
      if (key !== last) {
        last = key
        setRange(r)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [size])

  useEffect(() => {
    const el = viewport.current!
    const s = state.current
    const touches = new Map<number, { x: number; y: number }>()
    let pinch: { dist: number; zoom: number; mx: number; my: number } | null = null
    let downTarget: EventTarget | null = null
    let hoverCell: HTMLElement | null = null
    let hoverTimer = 0

    const nudge = () => {
      s.lastInput = performance.now()
      if (!s.started) {
        s.started = true
        onFirstMove()
      }
    }
    const zoomTo = (z: number, ax: number, ay: number) => {
      s.targetZoom = clampZoom(z)
      s.ax = ax
      s.ay = ay
    }
    const cellOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.<HTMLElement>('[data-car]') ?? null
    const unhover = () => {
      clearTimeout(hoverTimer)
      hoverCell = null
      hoverCar.hide()
    }

    const down = (e: PointerEvent) => {
      if (pausedRef.current) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // pointer already gone
      }
      if (touches.size === 2) {
        const [a, b] = [...touches.values()]
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: s.targetZoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
        s.moved = 99 // a pinch is never a click
        return
      }
      s.dragging = true
      s.moved = 0
      s.vx = s.vy = 0
      s.lastX = e.clientX
      s.lastY = e.clientY
      downTarget = e.target
      el.classList.add('is-dragging')
    }
    const move = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        s.x += mx - pinch.mx
        s.y += my - pinch.my
        pinch.mx = mx
        pinch.my = my
        zoomTo((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist, mx, my)
        nudge()
        return
      }
      if (s.dragging) {
        const dx = e.clientX - s.lastX
        const dy = e.clientY - s.lastY
        s.lastX = e.clientX
        s.lastY = e.clientY
        s.x += dx
        s.y += dy
        s.vx = s.vx * 0.5 + dx * 0.5
        s.vy = s.vy * 0.5 + dy * 0.5
        s.moved += Math.abs(dx) + Math.abs(dy)
        if (s.moved > 6) {
          nudge()
          unhover()
        }
        return
      }
      // hovering: wake the car up after a short pause, then let it follow the pointer
      if (e.pointerType !== 'mouse' || pausedRef.current) return
      const cell = cellOf(e.target)
      if (cell !== hoverCell) {
        unhover()
        hoverCell = cell
        if (cell) {
          const spec = carsRef.current[Number(cell.dataset.car)]
          hoverTimer = window.setTimeout(() => hoverCar.show(cell, spec), isBuilt(spec) ? 60 : 160)
        }
      }
      if (cell) {
        const r = cell.getBoundingClientRect()
        hoverCar.look((e.clientX - (r.left + r.width / 2)) / (r.width / 2))
      }
    }
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId)
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (touches.size < 2) pinch = null
      if (!s.dragging) return
      if (touches.size > 0) return
      s.dragging = false
      el.classList.remove('is-dragging')
      if (s.moved < 6) {
        s.vx = s.vy = 0
        const cell = cellOf(downTarget)
        if (cell) {
          clearTimeout(hoverTimer)
          onOpen(Number(cell.dataset.car), cell)
        }
      }
    }
    const wheel = (e: WheelEvent) => {
      if (pausedRef.current) return
      e.preventDefault()
      nudge()
      if (e.ctrlKey || isWheelMouse(e)) {
        // pinch on a trackpad arrives as ctrl+wheel with fine deltas
        const k = e.ctrlKey ? 0.012 : 0.0016
        zoomTo(s.targetZoom * Math.exp(-e.deltaY * k), e.clientX, e.clientY)
      } else {
        s.vx = s.vy = 0
        s.x -= e.deltaX
        s.y -= e.deltaY
      }
      unhover()
    }
    const key = (e: KeyboardEvent) => {
      if (pausedRef.current) return
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      if (e.key === '+' || e.key === '=') zoomTo(s.targetZoom * 1.2, cx, cy)
      if (e.key === '-' || e.key === '_') zoomTo(s.targetZoom / 1.2, cx, cy)
      if (e.key === '0') zoomTo(1, cx, cy)
    }

    // Build cars ahead of time while nobody is touching the grid, so hovers wake up instantly.
    const warm = window.setInterval(() => {
      if (pausedRef.current || s.dragging || performance.now() - s.lastInput < 1500) return
      const visible = [...el.querySelectorAll<HTMLElement>('[data-car]')]
      const spec = visible.map((c) => carsRef.current[Number(c.dataset.car)]).find((c) => !isBuilt(c))
      if (spec) warmCar(spec)
    }, 700)

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', unhover)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key)
    return () => {
      clearInterval(warm)
      clearTimeout(hoverTimer)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', unhover)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  }, [onOpen, onFirstMove])

  const zoomBy = (f: number) => {
    const s = state.current
    s.targetZoom = clampZoom(s.targetZoom * f)
    s.ax = window.innerWidth / 2
    s.ay = window.innerHeight / 2
  }

  const cells = []
  for (let c = range.c0; c <= range.c1; c++) {
    for (let r = range.r0; r <= range.r1; r++) {
      const idx = carAt(c, r, cars.length)
      const car = cars[idx]
      const src = stills[car.id]
      const top = r * size.ch + (mod(c, 2) ? size.ch / 2 : 0)
      cells.push(
        <figure key={`${c}:${r}`} className="cell" data-car={idx} style={{ left: c * size.cw, top, width: size.cw, height: size.ch }}>
          <div className="cell-img">{src ? <img src={src} alt={`${car.make} ${car.model}`} draggable={false} /> : <span className="cell-wait" />}</div>
          <figcaption>
            <span className="cap-make">{car.make}</span>
            <span className="cap-model">{car.model}</span>
            <span className="cap-years">{car.years}</span>
          </figcaption>
        </figure>,
      )
    }
  }

  return (
    <>
      <div ref={viewport} className="viewport">
        <div ref={plane} className="plane">
          {cells}
        </div>
      </div>
      <div className="zoom" aria-label="Zoom">
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <span>{zoomLabel}%</span>
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
      </div>
    </>
  )
}
