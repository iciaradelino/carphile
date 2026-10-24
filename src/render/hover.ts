import * as THREE from 'three'
import type { CarSpec } from '../cars/types'
import { acquireCar, releaseCar } from './carCache'
import { createStage, placeStillCamera } from './stage'

/**
 * One live WebGL canvas that slides over whichever grid cell is hovered. It uses the exact studio
 * and camera of the stills, so swapping the image for the live car is seamless; then the car
 * turns a little towards the pointer, and spins up when it is opened.
 */
class HoverCar {
  private renderer?: THREE.WebGLRenderer
  private stage?: ReturnType<typeof createStage>
  private camera = new THREE.PerspectiveCamera(24, 4 / 3, 0.1, 100)
  private canvas?: HTMLCanvasElement
  private cell?: HTMLElement
  private spec?: CarSpec
  private car?: THREE.Group
  private pivot = new THREE.Group()
  private mode: 'off' | 'hover' | 'leaving' | 'spin' = 'off'
  private yaw = 0
  private spinVel = 0
  private aim = 0
  private t0 = 0
  private last = 0
  private raf = 0
  private size = [0, 0]

  private setup() {
    if (this.renderer) return
    const canvas = document.createElement('canvas')
    canvas.className = 'hover-car'
    document.body.appendChild(canvas)
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.stage = createStage(this.renderer)
    this.stage.scene.add(this.pivot)
    placeStillCamera(this.camera)
  }

  /** Bring a cell's car to life. Building it the first time takes a moment, so callers delay this a little. */
  show(cell: HTMLElement, spec: CarSpec) {
    if (this.mode === 'spin') return
    if (this.cell === cell && this.mode === 'hover') return
    this.setup()
    if (this.spec?.id !== spec.id) this.swap(spec)
    this.cell?.classList.remove('is-live')
    this.cell = cell
    this.mode = 'hover'
    this.t0 = performance.now()
    this.place()
    this.render()
    cell.classList.add('is-live')
    this.canvas!.classList.add('is-on')
    this.loop()
  }

  /** Pointer position across the car, -1 (left) to 1 (right). */
  look(x: number) {
    this.aim = THREE.MathUtils.clamp(x, -1, 1)
  }

  hide() {
    if (this.mode === 'hover') this.mode = 'leaving'
  }

  /** Spin the car up; keeps going until stop(). */
  spin() {
    if (!this.car) return
    this.mode = 'spin'
    this.loop()
  }

  /** Drop everything at once (the viewer has taken over, or the grid moved). */
  stop() {
    this.mode = 'off'
    this.yaw = this.spinVel = 0
    this.pivot.rotation.set(0, 0, 0)
    this.canvas?.classList.remove('is-on')
    this.cell?.classList.remove('is-live')
    this.cell = undefined
  }

  get active() {
    return this.mode === 'hover' || this.mode === 'spin'
  }

  private swap(spec: CarSpec) {
    if (this.car && this.spec) {
      this.pivot.remove(this.car)
      releaseCar(this.spec)
    }
    this.spec = spec
    this.car = acquireCar(spec)
    this.pivot.add(this.car)
  }

  /** Cover the still exactly: the image is a 4:3 picture fitted inside the cell's image box. */
  private place() {
    const box = this.cell?.querySelector('.cell-img')?.getBoundingClientRect()
    if (!box || !this.canvas || !this.renderer) return
    const w = Math.min(box.width, (box.height * 4) / 3)
    const h = (w * 3) / 4
    const s = this.canvas.style
    s.left = `${box.left + (box.width - w) / 2}px`
    s.top = `${box.top + (box.height - h) / 2}px`
    if (Math.abs(this.size[0] - w) > 0.5 || Math.abs(this.size[1] - h) > 0.5) {
      this.size = [w, h]
      this.renderer.setSize(w, h)
    }
  }

  private render() {
    this.renderer?.render(this.stage!.scene, this.camera)
  }

  private loop() {
    if (this.raf) return
    this.last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      const t = (now - this.t0) / 1000
      if (this.mode === 'hover' || this.mode === 'leaving') {
        // turn towards the pointer and breathe a little; ease home when leaving
        const target = this.mode === 'hover' ? this.aim * 0.42 + Math.sin(t * 1.6) * 0.05 : 0
        this.yaw += (target - this.yaw) * Math.min(1, dt * 6)
        this.pivot.rotation.y = this.yaw
        this.pivot.rotation.z = this.mode === 'hover' ? Math.sin(t * 2.2) * 0.012 : this.pivot.rotation.z * 0.8
        if (this.mode === 'leaving' && Math.abs(this.yaw) < 0.004) this.stop()
      } else if (this.mode === 'spin') {
        this.spinVel = Math.min(11, this.spinVel + dt * 22)
        this.yaw += this.spinVel * dt
        this.pivot.rotation.y = this.yaw
      }
      if (this.mode === 'off') {
        this.raf = 0
        return
      }
      this.place()
      this.render()
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }
}

export const hoverCar = new HoverCar()
