import * as THREE from 'three'
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 2D outline helpers (side-view silhouettes, counter-clockwise) and geometry utilities shared by
// the car builder and its detail parts.

export type P = [number, number]

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

// ---------------------------------------------------------------------------
// 2D path helpers (side-view silhouettes, counter-clockwise)

/** Quadratic segment from a to b; bulge > 0 pushes it outward of a CCW outline. */
export function quad(a: P, b: P, bulge: number, t: number): P {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const cx = (a[0] + b[0]) / 2 + dy * bulge
  const cy = (a[1] + b[1]) / 2 - dx * bulge
  const u = 1 - t
  return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]
}

export function sampleSeg(a: P, b: P, bulge = 0, t0 = 0, t1 = 1): P[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * (t1 - t0)
  const n = Math.max(2, Math.ceil(len / 0.05))
  const out: P[] = []
  for (let i = 0; i <= n; i++) out.push(quad(a, b, bulge, t0 + ((t1 - t0) * i) / n))
  return out
}

export class Path {
  pts: P[]
  constructor(start: P) {
    this.pts = [start]
  }
  get last() {
    return this.pts[this.pts.length - 1]
  }
  to(b: P, bulge = 0) {
    this.pts.push(...sampleSeg(this.last, b, bulge).slice(1))
    return this
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number) {
    const n = 28
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      this.pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    return this
  }
  closed() {
    const [f, l] = [this.pts[0], this.last]
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-4) this.pts.pop()
    return this.pts
  }
}

/** Chaikin corner cutting on a closed outline: softens every crease a little, like a die-cast mould. */
export function soften(pts: P[], iterations = 2): P[] {
  let cur = pts
  for (let k = 0; k < iterations; k++) {
    const next: P[] = []
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]
      const b = cur[(i + 1) % cur.length]
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]])
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    cur = next
  }
  return cur
}

/** Offset a convex CCW outline inward, by clipping it with every edge moved in by d. */
export function inset(pts: P[], d: number): P[] {
  let out = pts
  for (let i = 0; i < pts.length && out.length >= 3; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue
    const n = inwardNormal(a, b)
    out = clip(out, n, n[0] * a[0] + n[1] * a[1] + d)
  }
  return out
}

export function inwardNormal(a: P, b: P): P {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return [-dy / l, dx / l]
}

/** Sutherland–Hodgman clip keeping the side where n·p >= c. */
export function clip(pts: P[], n: P, c: number): P[] {
  const side = (p: P) => n[0] * p[0] + n[1] * p[1] - c
  const out: P[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const [sa, sb] = [side(a), side(b)]
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** Clip against x >= c (keep = 1) or x <= c (keep = -1). */
export const clipX = (pts: P[], c: number, keep: 1 | -1) => clip(pts, [keep, 0], keep * c)

/** A thin strip lying along a curve segment, used for windscreen and rear glass. */
export function strip(a: P, b: P, bulge: number, t0: number, t1: number, out: number, inn: number): P[] {
  const pts = sampleSeg(a, b, bulge, t0, t1)
  const outer: P[] = []
  const inner: P[] = []
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)]
    const o = pts[Math.max(i - 1, 0)]
    const [nx, ny] = inwardNormal(o, q)
    outer.push([p[0] - nx * out, p[1] - ny * out])
    inner.push([p[0] + nx * inn, p[1] + ny * inn])
  })
  return [...outer, ...inner.reverse()]
}

export function roundedRect(cx: number, cy: number, w: number, h: number, r: number): P[] {
  const p = new Path([cx + w / 2, cy - h / 2 + r])
  p.to([cx + w / 2, cy + h / 2 - r]).arc(cx + w / 2 - r, cy + h / 2 - r, r, 0, Math.PI / 2)
  p.to([cx - w / 2 + r, cy + h / 2]).arc(cx - w / 2 + r, cy + h / 2 - r, r, Math.PI / 2, Math.PI)
  p.to([cx - w / 2, cy - h / 2 + r]).arc(cx - w / 2 + r, cy - h / 2 + r, r, Math.PI, Math.PI * 1.5)
  p.to([cx + w / 2 - r, cy - h / 2]).arc(cx + w / 2 - r, cy - h / 2 + r, r, -Math.PI / 2, 0)
  return p.closed()
}

/** Lookup x on a sampled, y-monotonic polyline. */
export function xAtY(pts: P[], y: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]]
    if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) return a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
  }
  const near = pts.reduce((m, p) => (Math.abs(p[1] - y) < Math.abs(m[1] - y) ? p : m))
  return near[0]
}

export function extrudeZ(pts: P[], z0: number, z1: number, bevel = 0, steps = 1): THREE.ExtrudeGeometry {
  const bt = bevel
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth: z1 - z0 - 2 * bt,
    steps,
    bevelEnabled: bevel > 0,
    bevelThickness: bt,
    bevelSize: bevel * 0.8,
    bevelOffset: -bevel * 0.8,
    bevelSegments: 5,
    curveSegments: 1,
  })
  g.translate(0, 0, z0 + bt)
  return g
}

/**
 * ExtrudeGeometry's flat caps (group 0) are long slivers fanned across the outline; give them
 * interior vertices so later bending stays smooth. The walls already run along the outline.
 */
export function tessellateCaps(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  const [caps, walls] = [0, 1].map((mi) => {
    const part = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv']) {
      const attr = flat.getAttribute(name) as THREE.BufferAttribute
      const groups = flat.groups.filter((gr) => gr.materialIndex === mi)
      const out = new Float32Array(groups.reduce((n, gr) => n + gr.count, 0) * attr.itemSize)
      let at = 0
      for (const gr of groups) {
        const chunk = attr.array.subarray(gr.start * attr.itemSize, (gr.start + gr.count) * attr.itemSize)
        out.set(chunk, at)
        at += chunk.length
      }
      part.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize))
    }
    return part
  })
  const fine = new TessellateModifier(0.18, 6).modify(caps)
  const merged = mergeGeometries([fine, walls])
  ;[caps, walls, fine].forEach((x) => x.dispose())
  if (flat !== g) flat.dispose()
  return merged
}

/** Outward normal of a CCW outline at point i, from its neighbours. */
export function outlineNormal(pts: P[], i: number): P {
  const a = pts[(i - 1 + pts.length) % pts.length]
  const b = pts[(i + 1) % pts.length]
  const [nx, ny] = inwardNormal(a, b)
  return [-nx, -ny]
}

/** Height of the top surface of an outline at x (the highest crossing). */
export function topAt(pts: P[], x: number): number {
  let best = -Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) best = Math.max(best, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]))
  }
  return best
}

/** Index of the outline point on the top surface nearest to x. */
export function topIndex(pts: P[], x: number): number {
  const y = topAt(pts, x)
  let best = 0
  let d = Infinity
  pts.forEach((p, i) => {
    const e = Math.hypot(p[0] - x, p[1] - y)
    if (e < d) [d, best] = [e, i]
  })
  return best
}

/** Walk an outline from index i in direction dir, collecting points until stop() says so. */
export function walk(pts: P[], i: number, dir: 1 | -1, stop: (p: P) => boolean): { pts: P[]; normals: P[] } {
  const out: P[] = []
  const normals: P[] = []
  for (let k = 0; k < pts.length; k++) {
    const j = (i + dir * k + pts.length * 2) % pts.length
    out.push(pts[j])
    normals.push(outlineNormal(pts, j))
    if (k > 0 && stop(pts[j])) break
  }
  return { pts: out, normals }
}

/**
 * A thin flat band following a 3D polyline that lies on a surface with the given normals. Used for
 * engraved shut lines, window surrounds and other trim. Width is measured across the line.
 */
export function ribbon(pts: THREE.Vector3[], normals: THREE.Vector3[], width: number, lift = 0.0015): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const t = new THREE.Vector3()
  const s = new THREE.Vector3()
  for (let i = 0; i < pts.length; i++) {
    t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize()
    const n = normals[i]
    s.crossVectors(t, n).normalize().multiplyScalar(width / 2)
    const p = pts[i]
    pos.push(p.x + n.x * lift + s.x, p.y + n.y * lift + s.y, p.z + n.z * lift + s.z)
    pos.push(p.x + n.x * lift - s.x, p.y + n.y * lift - s.y, p.z + n.z * lift - s.z)
    nor.push(n.x, n.y, n.z, n.x, n.y, n.z)
    if (i < pts.length - 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}
