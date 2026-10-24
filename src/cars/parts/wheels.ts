import * as THREE from 'three'
import type { CarSpec } from '../types'
import type { Mats } from './context'

/** Tyre profile: bead → bulging sidewall → rounded shoulder → flat tread, mirrored. */
function tyreProfile(R: number, ri: number, tw: number): THREE.Vector2[] {
  const half: [number, number][] = []
  const rc = (R - ri) * 0.24 // shoulder radius
  // sidewall: from the bead, bulging out a little, to where the shoulder starts
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    half.push([ri + (R - rc - ri) * t, -(tw / 2) * (0.86 + 0.14 * Math.sin(Math.PI * t * 0.9))])
  }
  // shoulder: a quarter round from the sidewall onto the tread
  const [cr, cz] = [R - rc, half[half.length - 1][1] + rc]
  for (let i = 1; i <= 6; i++) {
    const phi = (i / 6) * (Math.PI / 2)
    half.push([cr + rc * Math.sin(phi), cz - rc * Math.cos(phi)])
  }
  const pts = half.map(([r, y]) => new THREE.Vector2(r, y))
  const mirrored = [...pts].reverse().map((p) => new THREE.Vector2(p.x, -p.y))
  return [...pts, ...mirrored]
}

export function makeWheel(spec: CarSpec, R: number, tw: number, m: Mats): THREE.Group {
  const g = new THREE.Group()
  const ri = R * 0.64
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(tyreProfile(R, ri, tw), 64).rotateX(Math.PI / 2), m.tyre)
  tyre.castShadow = true
  g.add(tyre)

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, z = 0) => {
    const me = new THREE.Mesh(geo, mat)
    me.castShadow = true
    me.position.z = z
    g.add(me)
    return me
  }
  const disc = (r: number, depth: number, mat: THREE.Material, z: number, seg = 48) =>
    mesh(new THREE.CylinderGeometry(r, r, depth, seg).rotateX(Math.PI / 2), mat, z)

  const face = tw / 2
  const dish = face - 0.035 // the wheel face sits a little inside the tyre
  mesh(new THREE.CylinderGeometry(ri, ri, tw * 0.86, 48, 1, true).rotateX(Math.PI / 2), m.rim)
  mesh(new THREE.TorusGeometry(ri * 0.97, 0.013, 8, 56), m.chrome, face - 0.018)

  const lugs = (n: number, r: number, z: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2
      const nut = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6).rotateX(Math.PI / 2), m.chrome, z)
      nut.position.x = Math.cos(a) * r
      nut.position.y = Math.sin(a) * r
    }
  }

  const style = spec.wheels.style
  if (style === 'cap') {
    // painted steel wheel behind a polished hubcap
    disc(ri * 0.95, 0.02, m.rim, dish - 0.01)
    const cap = mesh(new THREE.SphereGeometry(ri * 0.8, 40, 16), m.chrome, dish)
    cap.scale.set(1, 1, 0.24)
    disc(ri * 0.12, 0.015, m.trim, dish + ri * 0.19)
  } else if (style === 'steel') {
    disc(ri * 0.95, 0.02, m.rim, dish - 0.01)
    for (let i = 0; i < 4; i++) {
      // ventilation slots
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const slot = disc(ri * 0.1, 0.022, m.well, dish - 0.008, 16)
      slot.position.x = Math.cos(a) * ri * 0.66
      slot.position.y = Math.sin(a) * ri * 0.66
    }
    const cap = mesh(new THREE.SphereGeometry(ri * 0.36, 32, 12), m.chrome, dish)
    cap.scale.set(1, 1, 0.38)
    lugs(4, ri * 0.48, dish + 0.004)
  } else if (style === 'holes') {
    disc(ri * 0.93, 0.03, m.rim, dish - 0.01)
    const n = spec.wheels.count ?? 8
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const hole = disc(ri * (n > 10 ? 0.11 : 0.14), 0.032, m.well, dish - 0.008, 20)
      hole.position.x = Math.cos(a) * ri * 0.64
      hole.position.y = Math.sin(a) * ri * 0.64
    }
    disc(ri * 0.22, 0.03, m.chrome, dish + 0.006, 24)
    lugs(n > 10 ? 5 : 4, ri * 0.32, dish + 0.006)
  } else if (style === 'mesh') {
    // cross-spoke: two interleaved sets of thin bars over a dark back, like a BBS
    disc(ri * 0.93, 0.02, m.well, dish - 0.045)
    const n = spec.wheels.count ?? 10
    for (const lean of [0.42, -0.42]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const bar = mesh(new THREE.BoxGeometry(ri * 0.66, 0.012, 0.016), m.rim, dish - 0.02 + (lean > 0 ? 0.004 : 0))
        bar.position.x = Math.cos(a) * ri * 0.58
        bar.position.y = Math.sin(a) * ri * 0.58
        bar.rotation.z = a + lean
      }
    }
    mesh(new THREE.TorusGeometry(ri * 0.88, 0.01, 6, 48), m.rim, dish - 0.02)
    disc(ri * 0.3, 0.035, m.rim, dish - 0.005, 32)
    lugs(5, ri * 0.2, dish + 0.014)
  } else if (style === 'fuchs') {
    // five forged petals, polished faces over black
    disc(ri * 0.93, 0.02, m.trim, dish - 0.03)
    const petal = new THREE.Shape()
    petal.moveTo(-0.022, 0)
    petal.lineTo(0.022, 0)
    petal.lineTo(0.05, ri * 0.86)
    petal.lineTo(-0.05, ri * 0.86)
    petal.closePath()
    const petalGeo = new THREE.ExtrudeGeometry(petal, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 })
    for (let i = 0; i < 5; i++) {
      const p = mesh(petalGeo, m.rim, dish - 0.035)
      p.rotation.z = (i / 5) * Math.PI * 2
    }
    disc(ri * 0.3, 0.04, m.rim, dish - 0.005, 32)
    lugs(5, ri * 0.2, dish + 0.017)
  } else {
    // simple spokes
    disc(ri * 0.93, 0.02, m.well, dish - 0.045)
    const n = spec.wheels.count ?? 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const spoke = mesh(new THREE.BoxGeometry(ri * 0.78, ri * (n > 8 ? 0.09 : 0.18), 0.05), m.rim, dish - 0.02)
      spoke.position.x = Math.cos(a) * ri * 0.5
      spoke.position.y = Math.sin(a) * ri * 0.5
      spoke.rotation.z = a
    }
    disc(ri * 0.26, 0.05, m.rim, dish - 0.005, 24)
    lugs(n === 3 ? 4 : n, ri * 0.16, dish + 0.022)
  }
  return g
}
