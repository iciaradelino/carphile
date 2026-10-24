import type * as THREE from 'three'
import { buildCar, disposeCar } from '../cars/build'
import type { CarSpec } from '../cars/types'
import { displayScale } from './stage'

// Built cars, shared by the hover preview and the viewer. Each user gets a clone, which shares
// geometry and materials with the master, so a car is only ever built once.

const LIMIT = 8
const built = new Map<string, { master: THREE.Group; users: number }>()

function entry(spec: CarSpec) {
  let e = built.get(spec.id)
  if (e) {
    built.delete(spec.id) // re-insert as most recent
  } else {
    const master = buildCar(spec)
    master.scale.setScalar(displayScale(spec))
    e = { master, users: 0 }
  }
  built.set(spec.id, e)
  for (const [id, old] of built) {
    if (built.size <= LIMIT) break
    if (old.users === 0 && id !== spec.id) {
      disposeCar(old.master)
      built.delete(id)
    }
  }
  return e
}

export const isBuilt = (spec: CarSpec) => built.has(spec.id)

/** A ready-to-add copy of the car; hand it back with releaseCar when done. */
export function acquireCar(spec: CarSpec): THREE.Group {
  const e = entry(spec)
  e.users++
  return e.master.clone()
}

export function releaseCar(spec: CarSpec) {
  const e = built.get(spec.id)
  if (e) e.users = Math.max(0, e.users - 1)
}

/** Build ahead of time without holding on to it. */
export function warmCar(spec: CarSpec) {
  entry(spec)
}
