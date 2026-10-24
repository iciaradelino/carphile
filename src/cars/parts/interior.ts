import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { type P, extrudeZ, topAt } from '../geom'
import type { Ctx } from './context'

/**
 * A simple cabin seen through the glass: floor, dashboard, steering wheel and seats. The lower
 * body is solid, so everything sits on the beltline, the way a die-cast interior tub does.
 */
export function addInterior(c: Ctx) {
  const { spec, m, cabinW } = c
  const belt = spec.profile.belt
  const room = c.H - belt // headroom above the beltline
  const it = spec.interior ?? {}
  const box = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2))
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, tilt = 0) => {
    g.rotateZ(tilt).translate(x, y, z)
    return c.add(g, mat)
  }

  // The tub floor hides the painted top of the lower body under all the glass. It runs back
  // until the glasshouse gets too shallow to hold it (on a fastback, well before the tail).
  const x0 = c.cowlX - 0.02
  let x1 = c.rearBase + 0.04
  while (x1 < x0 && topAt(c.house, x1) - topAt(c.body, x1) < 0.09) x1 += 0.02
  const floor: P[] = []
  for (let i = 0; i <= 24; i++) {
    const x = x0 + ((x1 - x0) * i) / 24
    floor.push([x, topAt(c.body, x) + 0.018])
  }
  for (let i = 24; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / 24
    floor.push([x, topAt(c.body, x) - 0.01])
  }
  c.add(extrudeZ(floor, -cabinW / 2 + 0.05, cabinW / 2 - 0.05), m.cabinFloor)

  // dashboard tucked under the windscreen, with the steering wheel on the driver's side
  // set back far enough that the windscreen clears its top edge
  const dashH = room * 0.24
  const dashFront = c.cowlX - (c.cowlX - c.roofF) * (dashH / room) * 1.25 - 0.03
  const dashD = 0.26
  put(box(dashD, dashH, cabinW - 0.16, 0.03), m.dash, dashFront - dashD / 2, belt + dashH / 2, 0)
  // the dash top runs forward under the windscreen, stopping where the glass gets too low
  const trayFront = c.cowlX - 0.09
  if (trayFront > dashFront) {
    put(new THREE.BoxGeometry(trayFront - dashFront, 0.02, cabinW - 0.14), m.dash, (trayFront + dashFront) / 2, belt + 0.008, 0)
  }
  const driverZ = (it.rhd ? 1 : -1) * cabinW * 0.22
  const wheelX = dashFront - dashD - 0.06
  const wheel = new THREE.TorusGeometry(0.15, 0.013, 8, 32).rotateY(Math.PI / 2).rotateZ(0.45)
  put(wheel, m.dash, wheelX, belt + room * 0.38, driverZ)
  const column = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8).rotateZ(Math.PI / 2 + 0.45)
  put(column, m.dash, wheelX + 0.09, belt + room * 0.32, driverZ)

  // seats: the front pair just ahead of the B-pillar, and a bench at the back if there is room
  // the B-pillar: the front door's rear shut line (a quarter-vent divider may come before it)
  const bF = spec.side?.seams?.[1] ?? spec.cabin.dividers?.[spec.cabin.dividers.length > 1 && spec.cabin.dividers[0] < 0.15 ? 1 : 0]
  const bX = bF !== undefined ? c.xAt(bF) : (c.roofF + c.roofR) / 2
  const seatH = room * 0.62
  const seat = (x: number, z: number, w: number, h = seatH) => {
    put(box(0.42, 0.09, w), m.seat, x + 0.22, belt + 0.05, z)
    put(box(0.1, h, w * 0.96, 0.04), m.seat, x - 0.02, belt + 0.05 + h / 2, z, 0.2)
  }
  for (const s of [1, -1]) {
    const z = s * cabinW * 0.22
    seat(bX + 0.06, z, 0.4)
    // head restraint
    put(box(0.07, room * 0.16, 0.24, 0.03), m.seat, bX - 0.04, belt + 0.05 + seatH + room * 0.05, z, 0.2)
  }
  // a low rear bench, kept under the roof so it sits below the rear window line
  if ((it.seats ?? 4) === 4 && c.roofR < bX - 0.6) {
    seat(Math.max(c.roofR + 0.12, c.rearBase + 0.3), 0, cabinW * 0.72, room * 0.4)
  }
}
