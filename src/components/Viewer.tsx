import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CarSpec } from '../cars/types'
import { acquireCar, releaseCar } from '../render/carCache'
import { TARGET, createStage, placeStillCamera } from '../render/stage'

interface Props {
  car: CarSpec
  visible: boolean
  spinIn: boolean
  onReady?: () => void
  onClose: () => void
  onStep: (delta: number) => void
}

const mm = (m: number) => `${Math.round(m * 1000).toLocaleString('en-US')} mm`

export function Viewer({ car, visible, spinIn, onReady, onClose, onStep }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const world = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.Camera; car?: THREE.Group } | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // One renderer for the lifetime of the overlay.
  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const stage = createStage(renderer)
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100)
    world.current = { scene: stage.scene, renderer, camera }

    placeStillCamera(camera, 10.5)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(TARGET)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 5
    controls.maxDistance = 16
    controls.minPolarAngle = 0.25
    controls.maxPolarAngle = 1.48
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.addEventListener('start', () => (controls.autoRotate = false))

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      renderer.setSize(w, h)
      camera.aspect = w / h
      // keep the car comfortably framed on tall phone screens
      camera.fov = w < h ? 40 : 26
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    // Arriving from the grid, the car is still spinning: let it wind down. An exponential decay
    // travels v0 / k in total, so v0 is picked to come to rest exactly on a whole turn, facing front.
    const DECAY = 3.2
    let spin = spinIn ? 9 : 0
    let spinning: THREE.Group | undefined
    let last = performance.now()
    renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const car = world.current?.car
      if (car && spin > 0.002) {
        if (spinning !== car) {
          spinning = car
          const turn = Math.PI * 2
          const rest = Math.ceil((car.rotation.y + spin / DECAY) / turn) * turn
          spin = (rest - car.rotation.y) * DECAY
        }
        const step = spin * (1 - Math.exp(-dt * DECAY)) / DECAY
        spin *= Math.exp(-dt * DECAY)
        car.rotation.y += step
        if (spin <= 0.002) car.rotation.y = Math.round(car.rotation.y / (Math.PI * 2)) * Math.PI * 2
      }
      controls.update()
      renderer.render(stage.scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      controls.dispose()
      stage.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      world.current = null
    }
  }, [])

  // Swap the model when stepping through the archive. Shaders compile before the overlay shows,
  // so it never appears half-drawn.
  useEffect(() => {
    const w = world.current
    if (!w) return
    const g = acquireCar(car)
    w.scene.add(g)
    w.car = g
    let alive = true
    w.renderer
      .compileAsync(w.scene, w.camera)
      .catch(() => {})
      .then(() => alive && onReadyRef.current?.())
    return () => {
      alive = false
      w.scene.remove(g)
      releaseCar(car)
      if (w.car === g) w.car = undefined
    }
  }, [car])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onStep(1)
      if (e.key === 'ArrowLeft') onStep(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, onStep])

  const d = car.dims
  return (
    <div className={`viewer${visible ? ' is-visible' : ''}`} role="dialog" aria-label={`${car.make} ${car.model}`}>
      <div ref={host} className="viewer-canvas" />
      <button className="viewer-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <section className="viewer-info">
        <p className="info-make">{car.make}</p>
        <h1 className="info-model">{car.model}</h1>
        <p className="info-meta">
          {car.years} · {car.country}
        </p>
        <p className="info-note">{car.note}</p>
        <dl className="info-specs">
          <div><dt>Design</dt><dd>{car.designer}</dd></div>
          <div><dt>Length</dt><dd>{mm(d.L)}</dd></div>
          <div><dt>Width</dt><dd>{mm(d.W)}</dd></div>
          <div><dt>Height</dt><dd>{mm(d.H)}</dd></div>
          <div><dt>Wheelbase</dt><dd>{mm(d.WB)}</dd></div>
        </dl>
      </section>
      <nav className="viewer-nav">
        <button onClick={() => onStep(-1)} aria-label="Previous car">←</button>
        <span>drag to turn</span>
        <button onClick={() => onStep(1)} aria-label="Next car">→</button>
      </nav>
    </div>
  )
}
