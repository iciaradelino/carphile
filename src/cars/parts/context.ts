import * as THREE from 'three'
import type { P } from '../geom'
import type { CarSpec, TrimStyle } from '../types'

export function materials(spec: CarSpec) {
  const paint = new THREE.MeshPhysicalMaterial({
    color: spec.paint,
    roughness: spec.metallic ? 0.38 : 0.3,
    metalness: spec.metallic ? 0.55 : 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  })
  let roof: THREE.Material = paint
  if (spec.softTop) roof = new THREE.MeshStandardMaterial({ color: spec.roofColor ?? '#2a2a2a', roughness: 0.95 })
  else if (spec.roofColor) {
    const contrast = paint.clone()
    contrast.color.set(spec.roofColor)
    roof = contrast
  }
  const interior = new THREE.Color(spec.interior?.color ?? '#2c2b29')
  // thin surface details sit a hair above the paint; polygon offset keeps them from flickering
  const decal = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }
  return {
    paint,
    roof,
    glass: new THREE.MeshPhysicalMaterial({
      color: '#22303a',
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      specularIntensity: 1,
    }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e4e4e4', metalness: 1, roughness: 0.14 }),
    trim: new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 }),
    seam: new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.paint).multiplyScalar(0.18), roughness: 0.7, ...decal }),
    chromeTrim: new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 1, roughness: 0.12, ...decal }),
    blackTrim: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.5, ...decal }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#f3f1ea', roughness: 0.08, clearcoat: 1, emissive: '#fffbe8', emissiveIntensity: 0.08 }),
    tail: new THREE.MeshPhysicalMaterial({ color: '#a8121b', roughness: 0.15, clearcoat: 1, emissive: '#5a0005', emissiveIntensity: 0.35 }),
    amber: new THREE.MeshPhysicalMaterial({ color: '#e48a1c', roughness: 0.15, clearcoat: 1, emissive: '#7a3a00', emissiveIntensity: 0.3 }),
    clear: new THREE.MeshPhysicalMaterial({ color: '#e7e5df', roughness: 0.1, clearcoat: 1, metalness: 0.1 }),
    lampDark: new THREE.MeshPhysicalMaterial({ color: '#2a1416', roughness: 0.2, clearcoat: 1 }),
    reflector: new THREE.MeshPhysicalMaterial({ color: '#7a0d14', roughness: 0.18, clearcoat: 1, emissive: '#3a0005', emissiveIntensity: 0.3 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 }),
    well: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 1 }),
    rim: new THREE.MeshStandardMaterial({ color: spec.wheels.rim ?? '#cfd1d3', metalness: 0.7, roughness: 0.3 }),
    seat: new THREE.MeshStandardMaterial({ color: interior, roughness: 0.8 }),
    cabinFloor: new THREE.MeshStandardMaterial({ color: interior.clone().multiplyScalar(0.55), roughness: 0.95 }),
    dash: new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.7 }),
  }
}

export type Mats = ReturnType<typeof materials>

export function trimMat(m: Mats, style: TrimStyle) {
  return style === 'chrome' ? m.chrome : style === 'body' ? m.paint : m.trim
}

/** Everything a detail part needs to know about the car being built, and the tools to add to it. */
export interface Ctx {
  spec: CarSpec
  m: Mats
  group: THREE.Group
  L: number
  W: number
  H: number
  hl: number
  hw: number
  R: number
  aR: number
  clearance: number
  cabinW: number
  cowlX: number
  roofF: number
  roofR: number
  rearBase: number
  fAx: number
  rAx: number
  /** the softened lower-body outline, exactly as the body mesh uses it */
  body: P[]
  house: P[]
  windows: P[][]
  /** windscreen and rear glass curves, as [from, to, bulge] */
  windshield: [P, P, number]
  rearGlass: [P, P, number]
  /** bend a point into the car's plan shape (cabin: with tumblehome instead of sill tuck) */
  deform: (v: THREE.Vector3, cabin: boolean) => void
  shaped: (g: THREE.BufferGeometry, cabin?: boolean, pre?: (v: THREE.Vector3) => void, fine?: boolean) => THREE.BufferGeometry
  add: (g: THREE.BufferGeometry, mat: THREE.Material, shadow?: boolean) => THREE.Mesh
  /** seat a part (built facing +x or -x) onto the nose or tail face at height y */
  onFace: (g: THREE.BufferGeometry, front: boolean, y: number, z: number, out: number) => THREE.BufferGeometry
  /** outward normal of the nose or tail face at height y */
  faceNormal: (front: boolean, y: number) => THREE.Vector3
  frontX: (y: number) => number
  rearX: (y: number) => number
  /** x of a cabin fraction: 0 at the windscreen base, 1 at the rear glass base */
  xAt: (f: number) => number
}
