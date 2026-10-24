import type { CarSpec } from '../cars/types'
import { drawStills } from './draw'

// Bump when the builder or studio changes in a way that should re-render every still.
const RENDER_VERSION = 5
const CACHE_NAME = 'carphile-stills'

/** FNV-1a, enough to notice a spec edit. */
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

const cacheKey = (spec: CarSpec) => `/__stills/${spec.id}-${hash(RENDER_VERSION + JSON.stringify(spec))}.webp`

async function openCache() {
  if (import.meta.env.DEV) return null // always re-render while working on the cars
  try {
    return await caches.open(CACHE_NAME)
  } catch {
    return null // no Cache Storage (insecure origin, private mode): just render every time
  }
}

function workerWebGL() {
  try {
    return typeof Worker !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2')
  } catch {
    return false
  }
}

export interface StillEvents {
  /** a car's still has started rendering */
  onStart?: (id: string) => void
  onStill: (id: string, url: string) => void
}

/**
 * Produces one transparent image per car for the grid. Cached renders come back first; the rest
 * are drawn in a worker when the browser can run WebGL there, otherwise on the main thread.
 */
export async function renderStills(cars: CarSpec[], events: StillEvents, signal: { cancelled: boolean }) {
  const cache = await openCache()
  const todo: CarSpec[] = []
  for (const spec of cars) {
    const hit = await cache?.match(cacheKey(spec)).catch(() => undefined)
    if (hit) events.onStill(spec.id, URL.createObjectURL(await hit.blob()))
    else todo.push(spec)
  }
  if (!todo.length || signal.cancelled) return

  const finished = (id: string, blob: Blob) => {
    if (signal.cancelled) return
    events.onStill(id, URL.createObjectURL(blob))
    const spec = cars.find((c) => c.id === id)!
    cache?.put(cacheKey(spec), new Response(blob, { headers: { 'Content-Type': 'image/webp' } })).catch(() => {})
  }

  const left = new Set(todo.map((c) => c.id))
  if (workerWebGL()) {
    const ok = await new Promise<boolean>((resolve) => {
      const worker = new Worker(new URL('./stills.worker.ts', import.meta.url), { type: 'module' })
      const stop = (result: boolean) => {
        worker.terminate()
        resolve(result)
      }
      const poll = setInterval(() => signal.cancelled && (clearInterval(poll), stop(true)), 200)
      worker.onmessage = (e) => {
        const msg = e.data
        if (msg.type === 'start') events.onStart?.(msg.id)
        if (msg.type === 'still') {
          left.delete(msg.id)
          finished(msg.id, msg.blob)
        }
        if (msg.type === 'end' || msg.type === 'error') {
          clearInterval(poll)
          stop(msg.type === 'end')
        }
      }
      worker.onerror = () => {
        clearInterval(poll)
        stop(false)
      }
      worker.postMessage({ cars: todo })
    })
    if (ok || signal.cancelled) return
  }

  // fallback: whatever the worker did not get to, rendered here
  await drawStills(
    document.createElement('canvas'),
    todo.filter((c) => left.has(c.id)),
    { start: (id) => events.onStart?.(id), done: finished, cancelled: () => signal.cancelled },
  )
}
