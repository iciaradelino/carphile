import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  type P, Path, clamp01, clip, creasedNormals, extrudeZ, inset, inwardNormal, roundedRect, sampleSeg, soften, strip,
  tessellateCaps, xAtY,
} from './geom'
import { type Ctx, materials, trimMat } from './parts/context'
import { addInterior } from './parts/interior'
import { addRear } from './parts/rear'
import { addTrim } from './parts/trim'
import { makeWheel } from './parts/wheels'
import type { CarSpec } from './types'

/**
 * The car's side elevation: lower body, glasshouse and side-window shapes, in metres. Shared by
 * the 3D builder and the loading screen's drawings.
 */
export function outlines(spec: CarSpec) {
  const { L, H, WB, FO, R } = spec.dims
  const pr = spec.profile
  const cb = spec.cabin
  const hl = L / 2
  const clearance = pr.clearance ?? 0.15
  const bulge = pr.bulge ?? {}
  const wb = cb.bulge ?? {}
  const pillar = cb.pillar ?? 0.065
  const sink = 0.04
  const fAx = hl - FO
  const rAx = fAx - WB
  const aR = R * (pr.archScale ?? 1.1)
  const cowlX = hl - pr.hood
  const roofF = cowlX - cb.windshieldRun
  const roofR = roofF - cb.roof
  const rearBase = roofR - cb.rearRun
  const archDx = Math.sqrt(aR * aR - (R - clearance) ** 2)
  const archA = Math.atan2(R - clearance, archDx)
  const F: P = [-hl + (pr.tailUnder ?? 0.12), clearance]

  const body = new Path(F)
    .to([rAx - archDx, clearance])
    .arc(rAx, R, aR, Math.PI + archA, -archA)
    .to([fAx - archDx, clearance])
    .arc(fAx, R, aR, Math.PI + archA, -archA)
    .to([hl - (pr.noseUnder ?? 0.12), clearance])
    .to([hl, pr.noseBottom], 0.12)
    .to([hl - (pr.noseRake ?? 0.05), pr.noseTop], bulge.nose ?? 0.02)
    .to([cowlX, pr.belt], bulge.hood ?? 0.01)
    .to([rearBase, pr.beltRear])
    .to([-hl + (pr.tailRake ?? 0.04), pr.tailTop], bulge.deck ?? 0.01)
    .to([-hl, pr.tailBottom], bulge.tail ?? 0.02)
    .to(F, 0.12)
    .closed()

  const gBase: P = [rearBase, pr.beltRear - sink]
  const gCowl: P = [cowlX, pr.belt - sink]
  // the windscreen header and the roof's trailing end can sit below the roof's peak
  const gTopF: P = [roofF, cb.topF ?? H]
  const gTopR: P = [roofR, cb.topR ?? H]
  const house = new Path(gBase)
    .to(gCowl)
    .to(gTopF, wb.windshield ?? 0.01)
    .to(gTopR, wb.roof ?? 0.02)
    .to(gBase, wb.rear ?? 0.02)
    .closed()

  // The inset glasshouse, with A- and C-pillars that follow the glass, split at each pillar.
  // The C-pillar is offset along the whole rear curve, so the window's back edge follows it.
  let glass = inset(house, pillar)
  const widenAlong = (pts: P[], extra?: number) => {
    if (!extra) return
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue
      const n = inwardNormal(a, b)
      glass = clip(glass, n, n[0] * a[0] + n[1] * a[1] + pillar + extra)
    }
  }
  widenAlong([gCowl, gTopF], cb.aPillar)
  widenAlong(sampleSeg(gTopR, gBase, wb.rear ?? 0.02), cb.cPillar)
  // or an explicit curved back edge for the last side window, from above the roof to the belt
  if (cb.quarterEdge) {
    const [top, bottom, bulge] = cb.quarterEdge
    const edge = sampleSeg([top, H + 0.1], [bottom, pr.beltRear - 0.1], bulge)
    for (let i = 0; i < edge.length - 1; i++) {
      const n = inwardNormal(edge[i], edge[i + 1])
      glass = clip(glass, n, n[0] * edge[i][0] + n[1] * edge[i][1])
    }
  }
  const xAt = (f: number) => cowlX + f * (rearBase - cowlX)
  const [ws, we] = cb.sideWindow ?? [0, 1]
  const stops = [ws, ...(cb.dividers ?? []), we]
  // pillars may lean: x moves by `lean` per metre of height above the beltline
  const leanAt = (k: number) => (k > 0 && k < stops.length - 1 ? cb.dividerLean?.[k - 1] ?? 0 : 0)
  const windows: P[][] = []
  for (let k = 0; k < stops.length - 1; k++) {
    const [lf, lr] = [leanAt(k), leanAt(k + 1)]
    const hi = xAt(stops[k]) - (k > 0 ? 0.04 : 0) - lf * pr.belt
    const lo = xAt(stops[k + 1]) + (k + 1 < stops.length - 1 ? 0.04 : 0) - lr * pr.belt
    // keep x − lean·y ≤ hi (behind the front pillar) and ≥ lo (ahead of the rear one)
    const piece = clip(clip(glass, [-1, lf], -hi), [1, -lr], lo)
    if (piece.length >= 3) windows.push(piece)
  }

  return {
    body, house, windows, axles: [fAx, rAx], R,
    windshield: [gCowl, gTopF, wb.windshield ?? 0.01] as [P, P, number],
    roof: [gTopF, gTopR, wb.roof ?? 0.02] as [P, P, number],
    rearGlass: [gTopR, gBase, wb.rear ?? 0.02] as [P, P, number],
  }
}

/** A closed band of thickness `inn` running inside an open polyline, e.g. the roof shell. */
function band(pts: P[], inn: number): P[] {
  const inner: P[] = pts.map((p, i) => {
    const [nx, ny] = inwardNormal(pts[Math.max(i - 1, 0)], pts[Math.min(i + 1, pts.length - 1)])
    return [p[0] + nx * inn, p[1] + ny * inn]
  })
  return [...pts, ...inner.reverse()]
}

export function buildCar(spec: CarSpec): THREE.Group {
  const { L, W, H, WB, FO, R } = spec.dims
  const pr = spec.profile
  const cb = spec.cabin
  const hl = L / 2
  const hw = W / 2
  const m = materials(spec)
  const group = new THREE.Group()
  group.name = spec.id

  const clearance = pr.clearance ?? 0.15
  const noseRake = pr.noseRake ?? 0.05
  const tailRake = pr.tailRake ?? 0.04
  const bulge = pr.bulge ?? {}
  const taperLen = pr.taperLen ?? 0.75
  const noseTaper = pr.noseTaper ?? 0.07
  const tailTaper = pr.tailTaper ?? 0.06
  const noseCurve = pr.noseCurve ?? 0.06
  const tailCurve = pr.tailCurve ?? 0.05
  const tuck = pr.tuck ?? 0.035
  const hoodDip = pr.hoodDip ?? 0
  const dipRamp = pr.hoodDipRamp ?? 0.35
  const haunch = pr.haunch ?? {}
  const haunchMax = Math.max(haunch.front ?? 0, haunch.rear ?? 0)
  const cabinW = W * (cb.width ?? 0.94)
  const tumble = cb.tumblehome ?? 0.84

  const fAx = hl - FO
  const rAx = fAx - WB
  const aR = R * (pr.archScale ?? 1.1)
  const cowlX = hl - pr.hood
  const roofF = cowlX - cb.windshieldRun
  const roofR = roofF - cb.roof
  const rearBase = roofR - cb.rearRun
  const tuckTop = (clearance + pr.belt) / 2

  /** Bends flat-sided geometry into the car's plan shape: tapered, rounded nose and tail, tucked sills. */
  const deform = (v: THREE.Vector3, cabin: boolean) => {
    const u = v.z / hw
    const tf = clamp01((v.x - (hl - taperLen)) / taperLen)
    const tr = clamp01((-hl + taperLen - v.x) / taperLen)
    let zs = 1 - noseTaper * tf * tf - tailTaper * tr * tr
    if (cabin) zs *= 1 - (1 - tumble) * clamp01((v.y - pr.belt) / (H - pr.belt))
    else {
      zs *= 1 - tuck * clamp01((tuckTop - v.y) / (tuckTop - clearance)) ** 2
      // haunches: the body swells over each axle (scaled so the widest point is the car's width)
      if (haunchMax) {
        const bell = (ax: number) => Math.exp(-(((v.x - ax) / 0.62) ** 2))
        zs *= (1 + (haunch.front ?? 0) * bell(fAx) + (haunch.rear ?? 0) * bell(rAx)) / (1 + haunchMax)
      }
    }
    v.x += -noseCurve * u * u * tf * tf + tailCurve * u * u * tr * tr
    // fender crowns: the middle of the bonnet sits lower than the wings
    if (hoodDip && !cabin && v.x > cowlX) {
      const across = 1 - THREE.MathUtils.smoothstep(Math.abs(u), 0.28, 0.62)
      const along = clamp01((v.x - cowlX) / dipRamp)
      const top = clamp01((v.y - (pr.noseTop - 0.14)) / 0.14)
      v.y -= hoodDip * across * along * top
    }
    v.z *= zs
  }

  const v = new THREE.Vector3()
  const shaped = (g: THREE.BufferGeometry, cabin = false, pre?: (v: THREE.Vector3) => void, fine = false) => {
    const panel = g instanceof THREE.ExtrudeGeometry
    // big panels are subdivided first, so the bending is smooth across their long flat faces
    if (fine) {
      const t = tessellateCaps(g)
      g.dispose()
      g = t
    }
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      pre?.(v)
      deform(v, cabin)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    // Small primitives keep their own normals; extruded panels get smooth, creased shading.
    if (!panel) return g
    const out = creasedNormals(g, Math.PI / 4)
    g.dispose()
    return out
  }
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(g, mat)
    mesh.castShadow = shadow
    group.add(mesh)
    return mesh
  }
  const sides = [1, -1] as const

  // --- lower body ---------------------------------------------------------
  const archDx = Math.sqrt(aR * aR - (R - clearance) ** 2)
  const archA = Math.atan2(R - clearance, archDx)
  const B: P = [hl, pr.noseBottom]
  const C: P = [hl - noseRake, pr.noseTop]
  const D: P = [-hl + tailRake, pr.tailTop]
  const E: P = [-hl, pr.tailBottom]

  const outline = outlines(spec)
  const body = soften(outline.body)
  add(shaped(extrudeZ(body, -hw, hw, 0.085), false, undefined, true), m.paint)

  const frontFace = sampleSeg(B, C, bulge.nose ?? 0.02)
  const rearFace = sampleSeg(D, E, bulge.tail ?? 0.02)
  const frontX = (y: number) => xAtY(frontFace, y)
  const rearX = (y: number) => xAtY(rearFace, y)
  const faceTilt = (front: boolean, y: number) => {
    const pts = front ? frontFace : rearFace
    const dxdy = (xAtY(pts, y + 0.03) - xAtY(pts, y - 0.03)) / 0.06
    return -Math.atan(Math.max(-2, Math.min(2, dxdy)))
  }
  const onFace = (g: THREE.BufferGeometry, front: boolean, y: number, z: number, out: number) => {
    const tilt = faceTilt(front, y)
    const dir = front ? 1 : -1
    g.rotateZ(tilt)
    return g.translate((front ? frontX(y) : rearX(y)) + dir * Math.cos(tilt) * out, y + dir * Math.sin(tilt) * out, z)
  }
  const faceNormal = (front: boolean, y: number) => {
    const tilt = faceTilt(front, y)
    const dir = front ? 1 : -1
    return new THREE.Vector3(dir * Math.cos(tilt), dir * Math.sin(tilt), 0)
  }

  // --- glasshouse ---------------------------------------------------------
  // A hollow shell, so the interior shows through the glass: roof, side panels with real window
  // openings, and thin panes.
  const [r0, r1] = cb.rearGlass ?? [0.08, 0.9]
  const [wsA, wsB, wsBulge] = outline.windshield
  const [rfA, rfB, rfBulge] = outline.roof
  const [rgA, rgB, rgBulge] = outline.rearGlass
  const shell = (pts: P[], thick: number) =>
    add(shaped(extrudeZ(band(pts, thick), -cabinW / 2, cabinW / 2, 0.05), true, undefined, true), m.roof)
  shell([...sampleSeg(wsA, wsB, wsBulge, 0.9, 1), ...sampleSeg(rfA, rfB, rfBulge).slice(1), ...sampleSeg(rgA, rgB, rgBulge, 0, r0).slice(1)], 0.05)
  if (r1 < 0.995) shell(sampleSeg(rgA, rgB, rgBulge, r1, 1), 0.05) // engine lid or hatch below the rear glass

  const panelT = 0.04
  const sidePanel = (z0: number, z1: number) => {
    const shape = new THREE.Shape(outline.house.map(([x, y]) => new THREE.Vector2(x, y)))
    shape.holes = outline.windows.map((w) => new THREE.Path(w.map(([x, y]) => new THREE.Vector2(x, y))))
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: z1 - z0 - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelOffset: -0.008, bevelSegments: 3, curveSegments: 1,
    })
    g.translate(0, 0, z0 + 0.01)
    add(shaped(g, true, undefined, true), m.roof)
  }
  sidePanel(cabinW / 2 - panelT, cabinW / 2)
  sidePanel(-cabinW / 2, -cabinW / 2 + panelT)
  for (const w of outline.windows) {
    add(shaped(extrudeZ(w, cabinW / 2 - 0.024, cabinW / 2 - 0.016), true), m.glass, false)
    add(shaped(extrudeZ(w, -cabinW / 2 + 0.016, -cabinW / 2 + 0.024), true), m.glass, false)
  }
  const glassZ = cabinW / 2 - 0.02
  add(shaped(extrudeZ(strip(wsA, wsB, wsBulge, 0, 0.93, 0.0, 0.008), -glassZ, glassZ), true), m.glass, false)
  add(shaped(extrudeZ(strip(rgA, rgB, rgBulge, r0, r1, 0.0, 0.008), -glassZ, glassZ), true), m.glass, false)

  // --- wheels -------------------------------------------------------------
  const flare = spec.side?.flares
  const tw = spec.wheels.tyreWidth ?? 0.2
  const sideAt = (x: number, y: number) => {
    v.set(x, y, hw)
    deform(v, false)
    return v.z
  }
  for (const ax of [fAx, rAx]) {
    const wz = sideAt(ax, R) - tw / 2 - 0.012 + (flare ? flare.depth * 0.6 : 0)
    const well = new Path([ax - archDx, clearance]).arc(ax, R, aR - 0.005, Math.PI + archA, -archA).closed()
    add(extrudeZ(well, -wz + tw / 2, wz - tw / 2), m.well)
    for (const s of sides) {
      const wheel = makeWheel(spec, R, tw, m)
      wheel.position.set(ax, R, s * wz)
      if (s < 0) wheel.rotation.y = Math.PI
      group.add(wheel)
    }
    if (flare) {
      const ring = new Path([ax - archDx, clearance])
        .arc(ax, R, aR, Math.PI + archA, -archA)
        .to([ax + Math.sqrt((aR + flare.width) ** 2 - (R - clearance) ** 2), clearance])
      const oA = Math.atan2(R - clearance, Math.sqrt((aR + flare.width) ** 2 - (R - clearance) ** 2))
      ring.arc(ax, R, aR + flare.width, -oA, Math.PI + oA)
      const fm = flare.color ? new THREE.MeshStandardMaterial({ color: flare.color, roughness: 0.6 }) : m.paint
      const ringPts = ring.closed()
      const z0 = hw - 0.03
      add(shaped(extrudeZ(ringPts, z0, z0 + flare.depth, 0.015)), fm)
      add(shaped(extrudeZ(ringPts, -z0 - flare.depth, -z0, 0.015)), fm)
    }
  }

  // --- front --------------------------------------------------------------
  const hlSpec = spec.front.headlights
  for (const sp of hlSpec.spread) {
    for (const s of sides) {
      const z = s * sp * hw
      const y = hlSpec.y
      const r = hlSpec.size / 2
      // Fender-mounted lamps face straight ahead, seated where the body's front surface is at
      // the height of the lamp's lower half, so a rounded nose never hides them. The pod behind
      // carries the wing up and around the top of the lamp. The rest sit on the nose face.
      const lampX = frontmost(body, y - r * 0.4) - 0.01
      const place = (g: THREE.BufferGeometry, out: number) =>
        hlSpec.back !== undefined ? g.translate(lampX + out, y, z) : onFace(g, true, y, z, out)
      if (hlSpec.type === 'round') {
        if (hlSpec.pod) {
          const len = 0.34
          const pod = new THREE.CylinderGeometry(r * 1.14, r * 1.24, len, 32, 4).rotateZ(Math.PI / 2)
          add(shaped(place(pod, -len / 2 + 0.012)), m.paint)
        }
        add(shaped(place(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.04, 32).rotateZ(Math.PI / 2), 0.01)), m.lens)
        add(shaped(place(new THREE.TorusGeometry(r * 0.92, r * 0.1, 10, 32).rotateY(Math.PI / 2), 0.028)), m.chrome)
      } else {
        const h = hlSpec.h ?? 0.13
        const w = hlSpec.size
        add(shaped(place(new THREE.BoxGeometry(0.04, h + 0.03, w + 0.03, 1, 1, 4), 0.004)), m.trim)
        add(shaped(place(new THREE.BoxGeometry(0.04, h, w, 1, 1, 4), 0.012)), m.lens)
      }
    }
  }

  const ind = spec.front.indicators
  if (ind) {
    for (const sp of ind.spread) {
      for (const s of sides) {
        const g = new THREE.BoxGeometry(0.03, ind.h, ind.w, 1, 1, 3)
        add(shaped(onFace(g, true, ind.y, s * sp * hw, 0.012)), m.amber)
      }
    }
  }

  const gr = spec.front.grille
  const gw = (gr.w ?? 0.9) * W
  const grille = (g: THREE.BufferGeometry, mat: THREE.Material, out: number, dy = 0, z = 0) =>
    add(shaped(onFace(g, true, gr.y + dy, z, out)), mat)
  if (gr.type === 'band' || gr.type === 'kidney' || gr.type === 'slats') {
    grille(new THREE.BoxGeometry(0.03, gr.h, gw, 1, 1, 16), m.trim, 0.003)
  }
  if (gr.type === 'slats') {
    for (const dy of [-0.3, 0, 0.3]) grille(new THREE.BoxGeometry(0.03, 0.012, gw * 0.96, 1, 1, 16), m.chrome, 0.012, dy * gr.h)
  }
  if (gr.type === 'kidney') {
    for (const s of sides) {
      const kw = 0.11
      const kh = gr.h * 1.05
      grille(new THREE.BoxGeometry(0.05, kh, kw), m.chrome, 0.02, 0, s * 0.07)
      grille(new THREE.BoxGeometry(0.05, kh - 0.03, kw - 0.03), m.trim, 0.024, 0, s * 0.07)
    }
  }
  if (gr.type === 'chrome') {
    grille(new THREE.BoxGeometry(0.05, gr.h, gw, 1, 1, 8), m.chrome, 0.01)
    grille(new THREE.BoxGeometry(0.05, gr.h - 0.035, gw - 0.035, 1, 1, 8), m.trim, 0.014)
  }
  if (gr.type === 'horns') {
    // the small horn grilles low on each side of the nose; w places them across the car
    for (const s of sides) {
      const z = s * (gr.w ?? 0.55) * hw
      grille(new RoundedBoxGeometry(0.03, gr.h + 0.022, 0.155, 2, 0.02), m.chrome, 0.004, 0, z)
      grille(new RoundedBoxGeometry(0.03, gr.h, 0.13, 2, 0.015), m.trim, 0.008, 0, z)
      for (const dy of [-0.25, 0.25]) grille(new THREE.BoxGeometry(0.03, 0.006, 0.12), m.chrome, 0.011, dy * gr.h, z)
    }
  }
  if (gr.type === 'shield') {
    grille(new THREE.CylinderGeometry(gr.h * 0.6, gr.h * 0.6, 0.05, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), m.chrome, 0.01)
    for (const s of sides) grille(new THREE.BoxGeometry(0.03, 0.025, 0.3, 1, 1, 6), m.chrome, 0.01, -0.02, s * 0.26)
  }

  // --- bumpers ------------------------------------------------------------
  const bumper = (b: CarSpec['front']['bumper'], front: boolean) => {
    if (b.style === 'none') return
    const d = b.d ?? (b.style === 'chrome' ? 0.07 : 0.12)
    const x = front ? frontX(b.y) + d / 2 - 0.035 : rearX(b.y) - d / 2 + 0.035
    const span = hw * (b.span ?? 1.02)
    const wrap = (p: THREE.Vector3) => {
      p.x -= (front ? 1 : -1) * 0.24 * Math.abs(p.z / span) ** 6
    }
    // one piece, or two with a gap in the middle (the 240Z's plate sits between its bumpers)
    const g = (b.gap ?? 0) / 2
    const pieces: [number, number][] = g > 0 ? [[-span, -g], [g, span]] : [[-span, span]]
    for (const [z0, z1] of pieces) {
      add(shaped(extrudeZ(roundedRect(x, b.y, d, b.h, Math.min(d, b.h) * 0.45), z0, z1, 0.02, 40), false, wrap), trimMat(m, b.style))
      // a rubber insert along the bumper's face
      if (b.strip) {
        const sh = b.h * 0.38
        const sx = x + (front ? 1 : -1) * 0.004
        add(shaped(extrudeZ(roundedRect(sx, b.y, d, sh, sh * 0.45), z0 * 0.97, z1 * 0.97, 0.01, 40), false, wrap), m.rubber)
      }
    }
    // guards: chrome on a chrome bumper, rubber on the rest
    for (const o of b.overriders ?? []) {
      for (const s of sides) {
        const guard = new RoundedBoxGeometry(0.055, b.h * 2.2, 0.06, 2, 0.02)
        add(shaped(onFace(guard, front, b.y + b.h * 0.3, s * o * hw, d - 0.02)), b.style === 'chrome' ? m.chrome : m.rubber)
      }
    }
  }
  bumper(spec.front.bumper, true)
  bumper(spec.rear.bumper, false)

  const xAt = (f: number) => cowlX + f * (rearBase - cowlX)
  const ctx: Ctx = {
    spec, m, group, L, W, H, hl, hw, R, aR, clearance, cabinW, cowlX, roofF, roofR, rearBase, fAx, rAx,
    body, house: outline.house, windows: outline.windows, windshield: outline.windshield, rearGlass: outline.rearGlass,
    deform, shaped, add, onFace, faceNormal, frontX, rearX, xAt,
  }
  addRear(ctx)
  addTrim(ctx)
  addInterior(ctx)

  // --- side strips and mirrors --------------------------------------------
  const sd = spec.side ?? {}
  if (sd.rubStrip) {
    const rs = sd.rubStrip
    const x0 = rAx + aR + 0.03
    const x1 = fAx - aR - 0.03
    // 'chrome' gives a polished strip, like the 911's rocker trim; any other colour is plastic
    const stripMat = rs.color === 'chrome' ? m.chrome : rs.color ? new THREE.MeshStandardMaterial({ color: rs.color, roughness: 0.55 }) : m.trim
    for (const s of sides) {
      add(shaped(new THREE.BoxGeometry(x1 - x0, rs.h, 0.03, 24, 1, 1).translate((x0 + x1) / 2, rs.y, s * (hw + 0.004))), stripMat)
      if (rs.pinstripe) {
        const pin = new THREE.MeshStandardMaterial({ color: rs.pinstripe, roughness: 0.4 })
        add(shaped(new THREE.BoxGeometry(x1 - x0, 0.012, 0.034, 24, 1, 1).translate((x0 + x1) / 2, rs.y, s * (hw + 0.004))), pin)
      }
    }
  }
  const mirrorMat = sd.mirrors === 'chrome' ? m.chrome : m.trim
  for (const s of sides) {
    const mx = cowlX - 0.2
    const my = pr.belt + 0.05
    add(shaped(new THREE.BoxGeometry(0.05, 0.05, 0.06).translate(mx, my - 0.03, s * (hw - 0.02))), mirrorMat)
    const head = new THREE.CapsuleGeometry(0.032, 0.06, 6, 12).rotateX(Math.PI / 2).scale(1.1, 1, 1)
    add(shaped(head.translate(mx, my, s * (hw + 0.035))), mirrorMat)
  }

  // --- contact shadows: one soft pool under the car, darker spots under each tyre ----
  const shadow = (w: number, d: number, x: number, z: number, opacity: number) => {
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity }),
    )
    blob.position.set(x, 0.003, z)
    blob.renderOrder = -1
    group.add(blob)
  }
  shadow(L * 1.12, W * 1.45, 0, 0, 0.75)
  for (const ax of [fAx, rAx]) for (const s of sides) shadow(R * 1.6, tw * 2.2, ax, s * (hw - tw / 2), 0.9)

  return group
}

/** The frontmost point of an outline at height y. */
function frontmost(pts: P[], y: number): number {
  let x = -Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) x = Math.max(x, a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
  }
  return x
}

let blobTex: THREE.Texture | null = null
function blobTexture() {
  if (blobTex) return blobTex
  // OffscreenCanvas when building inside the stills worker
  const c = typeof document === 'undefined' ? new OffscreenCanvas(256, 256) : document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 256, 256)
  blobTex = new THREE.CanvasTexture(c)
  blobTex.colorSpace = THREE.SRGBColorSpace
  return blobTex
}

export function disposeCar(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((mt: THREE.Material & { map?: THREE.Texture | null }) => {
        // plates are drawn per car; shared lettering and shadow textures stay cached
        if (mt.map?.userData.owned) mt.map.dispose()
        mt.dispose()
      })
    }
  })
}
