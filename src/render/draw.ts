import * as THREE from 'three'
import { buildCar, disposeCar } from '../cars/build'
import type { CarSpec } from '../cars/types'
import { createStage, displayScale, placeStillCamera } from './stage'

export const STILL_W = 960
export const STILL_H = 720

interface Hooks {
  start(id: string): void
  done(id: string, blob: Blob): void
  cancelled?(): boolean
  timing?(id: string, ms: { build: number; render: number; encode: number }): void
}

function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/webp', quality: 0.92 })
  return new Promise((res) => canvas.toBlob(res, 'image/webp', 0.92))
}

/**
 * Renders each car into a transparent still with the archive's studio and camera. Runs the same
 * way on the main thread or inside the stills worker (with an OffscreenCanvas).
 */
export async function drawStills(canvas: HTMLCanvasElement | OffscreenCanvas, cars: CarSpec[], hooks: Hooks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(STILL_W, STILL_H, false)
  const stage = createStage(renderer)
  const camera = new THREE.PerspectiveCamera(24, STILL_W / STILL_H, 0.1, 100)
  placeStillCamera(camera)

  try {
    for (const spec of cars) {
      if (hooks.cancelled?.()) break
      hooks.start(spec.id)
      const t0 = performance.now()
      const car = buildCar(spec)
      car.scale.setScalar(displayScale(spec))
      stage.scene.add(car)
      const t1 = performance.now()
      renderer.render(stage.scene, camera)
      const t2 = performance.now()
      const blob = await toBlob(canvas)
      hooks.timing?.(spec.id, { build: t1 - t0, render: t2 - t1, encode: performance.now() - t2 })
      stage.scene.remove(car)
      disposeCar(car)
      if (blob) hooks.done(spec.id, blob)
      // yield without requestAnimationFrame, which stalls in background tabs
      await new Promise((r) => setTimeout(r, 0))
    }
  } finally {
    stage.dispose()
    renderer.dispose()
  }
}
