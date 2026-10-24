import * as THREE from 'three'
import { quad, ribbon, sampleSeg, topAt, topIndex, walk } from '../geom'
import type { LampColor } from '../types'
import type { Ctx } from './context'
import { badgeMaterial, letteringTexture, plateSize, plateTexture } from './decals'

const LINE = 0.007 // width of an engraved shut line

/** Lamps, tail panel, plate, boot lid lines, exhaust, badges and wiper: everything that makes a tail read. */
export function addRear(c: Ctx) {
  const { spec, m, hw, W } = c
  const r = spec.rear
  const sides = [1, -1] as const
  const face = (g: THREE.BufferGeometry, mat: THREE.Material, y: number, z: number, out: number) =>
    c.add(c.shaped(c.onFace(g, false, y, z, out)), mat)
  const lampMat: Record<LampColor, THREE.Material> = { red: m.tail, amber: m.amber, clear: m.clear, dark: m.lampDark }

  // --- tail panel between the lamps ----------------------------------------
  if (r.panel) {
    const mat = r.panel.color === 'black' ? m.trim : r.panel.color === 'chrome' ? m.chrome : m.paint
    face(new THREE.BoxGeometry(0.02, r.panel.h, W * 0.86, 1, 1, 16), mat, r.panel.y, 0, 0.002)
  }

  // --- lamp clusters --------------------------------------------------------
  const tl = r.taillights
  const segments = tl.segments ?? [['red', 1]]
  const split = tl.split ?? (tl.w >= tl.h ? 'cols' : 'rows')

  /** One lamp: a bezel, its lens split into coloured sections, and optional ribs. */
  const lamp = (w: number, h: number, zc: number, s: 1 | -1) => {
    face(new THREE.BoxGeometry(0.03, h + 0.024, w + 0.024, 1, 1, 6), tl.bezel === 'chrome' ? m.chrome : m.trim, tl.y, zc, 0.002)
    const total = segments.reduce((n, [, f]) => n + f, 0)
    let at = 0
    for (const [color, f] of segments) {
      const size = (f / total) * (split === 'cols' ? w : h)
      const mid = at + size / 2
      at += size
      const gap = 0.006
      if (split === 'cols') {
        // outboard → inboard
        const z = zc + s * (w / 2 - mid)
        face(new THREE.BoxGeometry(0.03, h, size - gap, 1, 1, 2), lampMat[color], tl.y, z, 0.009)
      } else {
        const y = tl.y + h / 2 - mid
        face(new THREE.BoxGeometry(0.03, size - gap, w, 1, 1, 4), lampMat[color], y, zc, 0.009)
      }
    }
    for (let k = 1; k <= (tl.ribs ?? 0); k++) {
      const y = tl.y - h / 2 + (k * h) / ((tl.ribs ?? 0) + 1)
      face(new THREE.BoxGeometry(0.03, 0.005, w, 1, 1, 4), m.lampDark, y, zc, 0.013)
    }
  }

  if (tl.type === 'band') {
    face(new THREE.BoxGeometry(0.03, tl.h + 0.03, W * 0.9, 1, 1, 16), m.trim, tl.y, 0, 0.002)
    for (const s of sides) lamp(tl.w, tl.h, s * (hw * 0.9 - tl.w / 2 - 0.02), s)
  } else {
    for (const sp of tl.spread ?? [0.6]) {
      for (const s of sides) {
        const z = s * sp * hw
        if (tl.type === 'round') {
          const rr = tl.w / 2
          face(new THREE.CylinderGeometry(rr, rr, 0.04, 28).rotateZ(Math.PI / 2), m.tail, tl.y, z, 0.01)
          face(new THREE.CylinderGeometry(rr * 0.45, rr * 0.45, 0.04, 20).rotateZ(Math.PI / 2), m.clear, tl.y, z, 0.013)
          face(new THREE.TorusGeometry(rr, rr * 0.12, 8, 28).rotateY(Math.PI / 2), tl.bezel === 'black' ? m.trim : m.chrome, tl.y, z, 0.028)
        } else {
          lamp(tl.w, tl.h, z, s)
        }
      }
    }
  }

  // --- number plate in a dark recess ----------------------------------------
  if (r.plate) {
    const size = plateSize(r.plate.style)
    face(new THREE.BoxGeometry(0.02, size.h + 0.03, size.w + 0.03, 1, 1, 8), m.trim, r.plate.y, 0, 0.0)
    const tex = plateTexture(r.plate.text, r.plate.style)
    tex.userData.owned = true
    const plate = new THREE.PlaneGeometry(size.w, size.h, 8, 1).rotateY(-Math.PI / 2)
    c.add(c.shaped(c.onFace(plate, false, r.plate.y, 0, 0.012)), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }), false)
  }

  // --- badges -----------------------------------------------------------------
  for (const b of r.badges ?? []) {
    const { tex, aspect } = letteringTexture(b.text, b.font)
    const g = new THREE.PlaneGeometry(b.h * aspect, b.h, 10, 1).rotateY(-Math.PI / 2)
    c.add(c.shaped(c.onFace(g, false, b.y, b.z * hw, 0.005)), badgeMaterial(b.style, tex), false)
  }

  // --- exhaust ------------------------------------------------------------------
  if (r.exhaust) {
    const rad = r.exhaust.r ?? 0.03
    const zs = r.exhaust.count === 2 ? [r.exhaust.z - 0.09, r.exhaust.z + 0.09] : [r.exhaust.z]
    for (const zf of zs) {
      const z = zf * hw
      // the tip peeks just past the tail; the rest of the pipe runs back under the car
      const tip = -c.hl - 0.025
      const len = 0.3
      const pipe = new THREE.CylinderGeometry(rad, rad, len, 20, 1, true).rotateZ(Math.PI / 2).translate(tip + len / 2, c.clearance + 0.035, z)
      c.add(c.shaped(pipe), r.exhaust.style === 'dark' ? m.trim : m.chrome)
      const bore = new THREE.CircleGeometry(rad * 0.82, 20).rotateY(-Math.PI / 2).translate(tip + 0.004, c.clearance + 0.035, z)
      c.add(c.shaped(bore), m.well, false)
    }
  }

  // --- boot lid, hatch or engine lid outlines -------------------------------
  if (r.lid) lidLines(c, r.lid)

  // --- rear wiper ---------------------------------------------------------------
  if (r.wiper) {
    const [a, b, bulge] = c.rearGlass
    const [g0, g1] = spec.cabin.rearGlass ?? [0.08, 0.9]
    const t = g1 - (g1 - g0) * 0.12
    const p = quad(a, b, bulge, t)
    const q = quad(a, b, bulge, t - 0.3 * (g1 - g0))
    // tangent runs down the glass; the outward normal of the CCW glasshouse is (t.y, -t.x)
    const tx = p[0] - q[0]
    const ty = p[1] - q[1]
    const out = new THREE.Vector3(ty, -tx, 0).normalize()
    const from = new THREE.Vector3(p[0], p[1], 0)
    const to = new THREE.Vector3(q[0], q[1], c.cabinW * 0.28)
    const pts = [from, from.clone().lerp(to, 0.5), to]
    c.add(c.shaped(ribbon(pts, pts.map(() => out), 0.016, 0.014), true), m.blackTrim, false)
    c.add(c.shaped(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12).rotateZ(Math.PI / 2).translate(p[0] - 0.01, p[1] + 0.01, 0), true), m.trim)
  }
}

/** Engraved outline of the boot lid (wrapping from the deck down the tail) or the hatch. */
function lidLines(c: Ctx, lid: NonNullable<Ctx['spec']['rear']['lid']>) {
  const { m, hw } = c
  const zl = (lid.width ?? 0.84) * hw
  const line = (pts: THREE.Vector3[], normals: THREE.Vector3[], cabin = false) =>
    c.add(c.shaped(ribbon(pts, normals, LINE), cabin), m.seam, false)
  const across = (x: number, y: number, n: THREE.Vector3, half: number, cabin = false) => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 16; i++) pts.push(new THREE.Vector3(x, y, -half + (2 * half * i) / 16))
    line(pts, pts.map(() => n), cabin)
  }
  const v3 = ([x, y]: [number, number], z = 0) => new THREE.Vector3(x, y, z)
  // the lid's lower edge, straight across the tail face
  const bottomY = lid.bottom
  const tailNormal = c.faceNormal(false, bottomY)
  across(c.rearX(bottomY), bottomY, tailNormal, zl)

  if (lid.type === 'trunk') {
    // across the deck just behind the rear glass, then down both sides and over the tail
    const x0 = c.rearBase - 0.05
    const i0 = topIndex(c.body, x0)
    const run = walk(c.body, i0, 1, (p) => p[1] < bottomY)
    const up = run.normals[0]
    across(x0, topAt(c.body, x0), v3(up), zl)
    for (const s of [1, -1]) line(run.pts.map((p) => v3(p, s * zl)), run.normals.map((n) => v3(n)))
  } else if (lid.type === 'hatch') {
    // across the roof's trailing edge, and down the tail beside the lamps
    const xr = c.roofR + 0.03
    across(xr, topAt(c.house, xr), new THREE.Vector3(0, 1, 0), c.cabinW * 0.42, true)
    const i0 = topIndex(c.body, c.rearBase - 0.01)
    const run = walk(c.body, i0, 1, (p) => p[1] < bottomY)
    for (const s of [1, -1]) line(run.pts.map((p) => v3(p, s * zl)), run.normals.map((n) => v3(n)))
  } else {
    // a rear engine lid: a rounded panel on the sloping tail, with a louvred grille
    const [a, b, bulge] = c.rearGlass
    const [, g1] = c.spec.cabin.rearGlass ?? [0.08, 0.9]
    const pts = sampleSeg(a, b, bulge, g1 + 0.03, 1)
    const run = walk(c.body, topIndex(c.body, c.rearBase - 0.02), 1, (p) => p[1] < bottomY)
    const path = [...pts, ...run.pts.slice(1)]
    const normals = path.map((_, i) => {
      const q = path[Math.min(i + 1, path.length - 1)]
      const o = path[Math.max(i - 1, 0)]
      return new THREE.Vector3(-(q[1] - o[1]), q[0] - o[0], 0).normalize().multiplyScalar(-1)
    })
    const zEng = c.cabinW * 0.3
    for (const s of [1, -1]) line(path.map((p) => v3(p, s * zEng)), normals, true)
    const top = path[0]
    across(top[0], top[1], normals[0], zEng, true)
    // louvres in the upper part of the lid
    for (let k = 0; k < 7; k++) {
      const p = pts[Math.min(pts.length - 1, 1 + k)]
      if (!p) break
      across(p[0], p[1], normals[Math.min(normals.length - 1, 1 + k)], zEng * 0.7, true)
    }
  }
}
