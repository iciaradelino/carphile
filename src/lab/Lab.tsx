import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { buildCar, disposeCar } from '../cars/build'
import { catalog } from '../cars/catalog'
import type { CarSpec } from '../cars/types'
import { TARGET, createStage, placeStillCamera } from '../render/stage'

// Dev-only workbench (/?lab or /?lab=<car-id>): each model in true elevations beside a
// Wikipedia photo of the real car, for checking proportions by eye.

// Wikimedia Commons searches for photos of the exact generation.
const REFS: Record<string, string> = {
  'bmw-e30': 'BMW E30 coupe',
  'seat-toledo': 'SEAT Toledo 1L',
  'porsche-912': 'Porsche 912 coupe',
  'vw-golf-1': 'Volkswagen Golf I 3-door',
  'mercedes-190e': 'Mercedes-Benz W201 190E',
  'volvo-240': 'Volvo 240 sedan',
  'alfa-spider': 'Alfa Romeo Spider Duetto',
  'lancia-delta': 'Lancia Delta HF Integrale',
  'fiat-panda': 'Fiat Panda 141',
  'peugeot-205': 'Peugeot 205 GTI',
  'mini-cooper': 'Austin Mini Cooper',
  'saab-900': 'Saab 900 hatchback',
  'datsun-240z': 'Datsun 240Z',
}

type View = 'side' | 'front' | 'rear' | 'three' | 'back'

function renderViews(spec: CarSpec, w: number, h: number): Record<View, string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(w, h, false)
  const stage = createStage(renderer)
  const car = buildCar(spec)
  stage.scene.add(car)
  // a 5 m wide frame for every elevation, so cars compare at true scale
  const half = 2.6
  const ortho = new THREE.OrthographicCamera(-half, half, (half * h) / w, (-half * h) / w, 0.1, 50)
  const persp = new THREE.PerspectiveCamera(24, w / h, 0.1, 100)
  placeStillCamera(persp, 9)
  const shot = (cam: THREE.Camera) => {
    renderer.render(stage.scene, cam)
    return renderer.domElement.toDataURL('image/png')
  }
  const at = (x: number, z: number) => {
    ortho.position.set(x, TARGET.y + 0.2, z)
    ortho.lookAt(0, TARGET.y + 0.2, 0)
    return shot(ortho)
  }
  const three = shot(persp)
  // rear three-quarter: the same camera swung round behind the car
  persp.position.set(-persp.position.x, persp.position.y, persp.position.z)
  persp.position.sub(TARGET).multiplyScalar(0.82).add(TARGET)
  persp.lookAt(TARGET)
  const back = shot(persp)
  const out = { side: at(0, 10), front: at(10, 0), rear: at(-10, 0), three, back }
  disposeCar(car)
  stage.dispose()
  renderer.dispose()
  return out
}

function useCommons(query: string) {
  const [srcs, setSrcs] = useState<string[]>([])
  useEffect(() => {
    const q = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: '6',
      gsrlimit: '6',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '500',
      format: 'json',
      origin: '*',
    })
    fetch(`https://commons.wikimedia.org/w/api.php?${q}`)
      .then((r) => r.json())
      .then((j) =>
        setSrcs(
          Object.values<{ index: number; imageinfo: { thumburl: string }[] }>(j.query?.pages ?? {})
            .sort((a, b) => a.index - b.index)
            .map((p) => p.imageinfo[0].thumburl),
        ),
      )
      .catch(() => {})
  }, [query])
  return srcs
}

function Row({ spec }: { spec: CarSpec }) {
  const [views, setViews] = useState<Record<View, string>>()
  const refs = useCommons(REFS[spec.id])
  const rearRefs = useCommons(`${REFS[spec.id]} rear`)
  useEffect(() => setViews(renderViews(spec, 640, 300)), [spec])
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 16, borderTop: '1px solid #ddd' }}>
      <h2 style={{ gridColumn: '1 / -1', margin: 0, font: '500 14px Inter' }}>
        {spec.make} {spec.model} <span style={{ color: '#999' }}>{spec.id}</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        {[...refs.slice(0, 3), ...rearRefs.slice(0, 3)].map((s) => (
          <img key={s} src={s} style={{ width: '100%', height: 96, objectFit: 'cover' }} />
        ))}
      </div>
      {views && <img src={views.three} style={{ width: '100%' }} />}
      {views && <img src={views.back} style={{ width: '100%' }} />}
      {views && <img src={views.side} style={{ width: '100%', background: '#fff' }} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {views && <img src={views.front} style={{ width: '100%', background: '#fff' }} />}
        {views && <img src={views.rear} style={{ width: '100%', background: '#fff' }} />}
      </div>
    </section>
  )
}

/** One big rear three-quarter render, for checking tails up close (/?lab=<id>&back). */
function renderBack(spec: CarSpec, w: number, h: number, front = false) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  const stage = createStage(renderer)
  const car = buildCar(spec)
  stage.scene.add(car)
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 100)
  placeStillCamera(cam, 7)
  if (front) {
    // straight on, a little above, as the viewer shows it when turned to face the nose
    cam.position.set(7.5, 2.4, 0)
    cam.lookAt(0, TARGET.y, 0)
  } else {
    cam.position.set(-cam.position.x, cam.position.y * 0.85, cam.position.z * 0.75)
    cam.lookAt(TARGET.x - 0.6, TARGET.y, 0)
  }
  renderer.render(stage.scene, cam)
  const url = renderer.domElement.toDataURL('image/png')
  disposeCar(car)
  stage.dispose()
  renderer.dispose()
  return url
}

function Back({ spec, front }: { spec: CarSpec; front: boolean }) {
  const [src, setSrc] = useState<string>()
  const refs = useCommons(`${REFS[spec.id]} rear`)
  useEffect(() => setSrc(renderBack(spec, 1600, 1000, front)), [spec, front])
  return (
    <section style={{ padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {refs.slice(0, 4).map((s, i) => (
          <img key={i} src={s} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
        ))}
      </div>
      {src && <img src={src} style={{ width: '100%', display: 'block' }} />}
    </section>
  )
}

/**
 * A side elevation drawn to line up with a reference photo in lab-refs/ (/?lab=<id>&overlay).
 * The photo's wheel centres and ground line set the scale; heights scale to the car's height.
 */
const PHOTO_REFS: Record<string, { file: string; w: number; h: number; front: number; rear: number; ground: number; roof: number; faces: 'left' | 'right' }> = {
  'porsche-912': { file: 'porsche-912-side.webp', w: 1600, h: 1200, front: 370, rear: 1135, ground: 832, roof: 408, faces: 'left' },
}

function Overlay({ spec }: { spec: CarSpec }) {
  const ref = PHOTO_REFS[spec.id]
  const [src, setSrc] = useState<string>()
  const [mix, setMix] = useState(0.5)
  useEffect(() => {
    if (!ref) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(ref.w, ref.h, false)
    const stage = createStage(renderer)
    const car = buildCar(spec)
    stage.scene.add(car)
    const { L, WB, FO, H } = spec.dims
    const fAx = L / 2 - FO
    const sx = (ref.rear - ref.front) / WB // px per metre along the car
    const sy = (ref.ground - ref.roof) / H // px per metre up
    const dir = ref.faces === 'left' ? -1 : 1 // nose to the left: look at the car's left side
    const cx = fAx - dir * (ref.front - ref.w / 2) / sx
    const cy = (ref.ground - ref.h / 2) / sy
    const cam = new THREE.OrthographicCamera(-ref.w / 2 / sx, ref.w / 2 / sx, ref.h / 2 / sy, -ref.h / 2 / sy, 0.1, 50)
    cam.position.set(cx, cy, 10 * dir)
    cam.lookAt(cx, cy, 0)
    renderer.render(stage.scene, cam)
    setSrc(renderer.domElement.toDataURL('image/png'))
    disposeCar(car)
    stage.dispose()
    renderer.dispose()
  }, [spec, ref])
  if (!ref) return <p style={{ padding: 16 }}>No reference photo for {spec.id}.</p>
  return (
    <section style={{ padding: 12 }}>
      <input type="range" min={0} max={1} step={0.01} value={mix} onChange={(e) => setMix(+e.target.value)} style={{ width: 300 }} />
      <div style={{ position: 'relative', width: '100%', aspectRatio: `${ref.w} / ${ref.h}` }}>
        <img src={`/lab-refs/${ref.file}`} style={{ position: 'absolute', inset: 0, width: '100%' }} />
        {src && <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', opacity: mix }} />}
      </div>
    </section>
  )
}

export function Lab() {
  const params = new URLSearchParams(location.search)
  const only = params.get('lab')
  const cars = only ? catalog.filter((c) => c.id === only) : catalog
  if (params.has('overlay') && cars[0]) return <Overlay spec={cars[0]} />
  if ((params.has('back') || params.has('front')) && cars[0]) return <Back spec={cars[0]} front={params.has('front')} />
  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#f4f3ef' }}>
      {cars.map((c) => (
        <Row key={c.id} spec={c} />
      ))}
    </div>
  )
}
