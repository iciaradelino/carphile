import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { topAt } from '../geom'
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

  // the tub floor hides the painted top of the lower body
  const x0 = c.cowlX - 0.02
  // stop under the roof: on a fastback the glasshouse base runs almost to the tail
  const x1 = Math.max(c.rearBase + 0.08, c.roofR - 0.35)
  put(new THREE.BoxGeometry(x0 - x1, 0.03, cabinW - 0.1), m.cabinFloor, (x0 + x1) / 2, Math.max(topAt(c.body, (x0 + x1) / 2), belt) - 0.005, 0)

  // dashboard tucked under the windscreen, with the steering wheel on the driver's side
  // set back far enough that the windscreen clears its top edge
  const dashH = room * 0.24
  const dashFront = c.cowlX - (c.cowlX - c.roofF) * (dashH / room) * 1.25 - 0.03
  const dashD = 0.26
  put(box(dashD, dashH, cabinW - 0.16, 0.03), m.dash, dashFront - dashD / 2, belt + dashH / 2, 0)
  // the dash top runs forward to meet the base of the windscreen
  put(new THREE.BoxGeometry(c.cowlX + 0.02 - dashFront, 0.03, cabinW - 0.12), m.dash, (c.cowlX + 0.02 + dashFront) / 2, belt + 0.012, 0)
  const driverZ = (it.rhd ? 1 : -1) * cabinW * 0.22
  const wheelX = dashFront - dashD - 0.06
  const wheel = new THREE.TorusGeometry(0.15, 0.013, 8, 32).rotateY(Math.PI / 2).rotateZ(0.45)
  put(wheel, m.dash, wheelX, belt + room * 0.38, driverZ)
  const column = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8).rotateZ(Math.PI / 2 + 0.45)
  put(column, m.dash, wheelX + 0.09, belt + room * 0.32, driverZ)

  // seats: the front pair just ahead of the B-pillar, and a bench at the back if there is room
  const bX = spec.cabin.dividers?.length ? c.xAt(spec.cabin.dividers[0]) : (c.roofF + c.roofR) / 2
  const seatH = room * 0.62
  const seat = (x: number, z: number, w: number) => {
    put(box(0.42, 0.09, w), m.seat, x + 0.22, belt + 0.05, z)
    put(box(0.1, seatH, w * 0.96, 0.04), m.seat, x - 0.02, belt + 0.05 + seatH / 2, z, 0.2)
  }
  for (const s of [1, -1]) {
    const z = s * cabinW * 0.22
    seat(bX + 0.06, z, 0.4)
    // head restraint
    put(box(0.07, room * 0.16, 0.24, 0.03), m.seat, bX - 0.04, belt + 0.05 + seatH + room * 0.05, z, 0.2)
  }
  if ((it.seats ?? 4) === 4 && c.roofR < bX - 0.6) {
    seat(Math.max(c.roofR + 0.02, c.rearBase + 0.25), 0, cabinW * 0.72)
  }
}
