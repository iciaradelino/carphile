import * as THREE from 'three'
import { type P, quad, ribbon, topAt, topIndex, walk } from '../geom'
import type { Ctx } from './context'
import { badgeMaterial, letteringTexture } from './decals'

const LINE = 0.007

/** Shut lines, handles, window surrounds, wipers, fuel flap and the front badge. */
export function addTrim(c: Ctx) {
  const { spec, m, hw, cabinW } = c
  const pr = spec.profile
  const sd = spec.side ?? {}
  const sides = [1, -1] as const
  const line = (pts: THREE.Vector3[], normals: THREE.Vector3[], mat: THREE.Material = m.seam, width = LINE, cabin = false) =>
    c.add(c.shaped(ribbon(pts, normals, width), cabin), mat, false)
  const sideN = (s: number) => new THREE.Vector3(0, 0, s)

  // --- door shut lines: down from the beltline, along the sill, and the door's front edge ------
  const sillY = c.clearance + 0.1
  const seams = sd.seams ?? [0.02, 0.6]
  const beltAt = (x: number) => topAt(c.body, x) - 0.035
  for (const s of sides) {
    for (const f of seams) {
      const x = c.xAt(f)
      const pts = [new THREE.Vector3(x, beltAt(x), s * hw), new THREE.Vector3(x, (beltAt(x) + sillY) / 2, s * hw), new THREE.Vector3(x, sillY, s * hw)]
      line(pts, pts.map(() => sideN(s)))
    }
    // the bottom edge of the doors, just above the sill
    const xs = [c.xAt(seams[0]), c.xAt(seams[seams.length - 1])]
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(xs[0] + ((xs[1] - xs[0]) * i) / 12, sillY, s * hw))
    line(pts, pts.map(() => sideN(s)))
  }

  // --- door handles, just ahead of each door's rear edge --------------------------------
  if (sd.handles !== 'none') {
    const mat = sd.handles === 'black' ? m.trim : m.chrome
    for (const f of seams.slice(1)) {
      const x = c.xAt(f) + 0.13
      for (const s of sides) {
        const g = new THREE.CapsuleGeometry(0.011, 0.1, 4, 8).rotateZ(Math.PI / 2).translate(x, beltAt(x) - 0.055, s * (hw + 0.008))
        c.add(c.shaped(g), mat)
      }
    }
  }

  // --- bonnet: across at the scuttle, and along both wings to the nose --------------------
  const zh = 0.86 * hw
  const hx = c.cowlX + 0.05
  const hood = walk(c.body, topIndex(c.body, hx), -1, (p) => p[0] > c.hl - (pr.noseRake ?? 0.05) - 0.06 || p[1] < pr.noseTop - 0.06)
  const toV = ([x, y]: P, z: number) => new THREE.Vector3(x, y, z)
  for (const s of sides) line(hood.pts.map((p) => toV(p, s * zh)), hood.normals.map(([x, y]) => new THREE.Vector3(x, y, 0)))
  {
    const pts: THREE.Vector3[] = []
    const y = topAt(c.body, hx)
    for (let i = 0; i <= 16; i++) pts.push(new THREE.Vector3(hx, y, -zh + (2 * zh * i) / 16))
    const [nx, ny] = hood.normals[0]
    line(pts, pts.map(() => new THREE.Vector3(nx, ny, 0)))
  }

  // --- fuel filler flap on the right rear wing --------------------------------------------
  if (sd.fuel) {
    const x = -c.hl + sd.fuel.x
    const y = sd.fuel.y
    const r = 0.055
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      pts.push(new THREE.Vector3(x + Math.cos(a) * r, y + Math.sin(a) * r, hw))
    }
    line(pts, pts.map(() => sideN(1)))
  }

  // --- window surrounds -----------------------------------------------------------------
  const surround = sd.windowTrim === 'chrome' ? m.chromeTrim : m.blackTrim
  const tw = sd.windowTrim === 'chrome' ? 0.016 : 0.011
  for (const w of c.windows) {
    for (const s of sides) {
      const pts = [...w, w[0]].map(([x, y]) => new THREE.Vector3(x, y, s * (cabinW / 2 + 0.001)))
      line(pts, pts.map(() => sideN(s)), surround, tw, true)
    }
  }
  // rubber seals around the windscreen and rear glass, and the windscreen's bottom edge
  const glassZ = cabinW / 2 - 0.035
  const seal = (curve: [P, P, number], t0: number, t1: number) => {
    const [a, b, bulge] = curve
    const pts: THREE.Vector3[][] = [[], []]
    const normals: THREE.Vector3[] = []
    for (let i = 0; i <= 14; i++) {
      const t = t0 + ((t1 - t0) * i) / 14
      const p = quad(a, b, bulge, t)
      const q = quad(a, b, bulge, Math.min(1, t + 0.01))
      const o = quad(a, b, bulge, Math.max(0, t - 0.01))
      normals.push(new THREE.Vector3(q[1] - o[1], -(q[0] - o[0]), 0).normalize())
      pts[0].push(new THREE.Vector3(p[0], p[1], glassZ))
      pts[1].push(new THREE.Vector3(p[0], p[1], -glassZ))
    }
    for (const run of pts) line(run, normals, surround, tw, true)
    for (const t of [t0, t1]) {
      const p = quad(a, b, bulge, t)
      const n = normals[t === t0 ? 0 : normals.length - 1]
      const across: THREE.Vector3[] = []
      for (let i = 0; i <= 12; i++) across.push(new THREE.Vector3(p[0], p[1], -glassZ + (2 * glassZ * i) / 12))
      line(across, across.map(() => n), surround, tw, true)
    }
  }
  seal(c.windshield, 0.02, 0.92)
  const [r0, r1] = spec.cabin.rearGlass ?? [0.08, 0.9]
  seal(c.rearGlass, r0, r1)

  // --- wipers, parked along the bottom of the windscreen ---------------------------------
  {
    const [a, b, bulge] = c.windshield
    const p = quad(a, b, bulge, 0.08)
    const q = quad(a, b, bulge, 0.18)
    const n = new THREE.Vector3(q[1] - p[1], -(q[0] - p[0]), 0).normalize()
    for (const z0 of [-0.42, 0.04]) {
      const from = new THREE.Vector3(p[0], p[1], z0 * cabinW)
      const to = new THREE.Vector3(q[0], q[1], (z0 + 0.32) * cabinW)
      const pts = [from, from.clone().lerp(to, 0.5), to]
      c.add(c.shaped(ribbon(pts, pts.map(() => n), 0.014, 0.012), true), m.blackTrim, false)
    }
  }

  // --- front badge --------------------------------------------------------------------------
  const b = spec.front.badge
  if (b) {
    const { tex, aspect } = letteringTexture(b.text, b.font)
    const g = new THREE.PlaneGeometry(b.h * aspect, b.h, 8, 1).rotateY(Math.PI / 2)
    c.add(c.shaped(c.onFace(g, true, b.y, b.z * hw, 0.03)), badgeMaterial(b.style, tex), false)
  }
}
