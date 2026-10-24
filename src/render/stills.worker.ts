/// <reference lib="webworker" />
import type { CarSpec } from '../cars/types'
import { STILL_H, STILL_W, drawStills } from './draw'

// Renders the grid stills off the main thread, so the loader and the grid stay smooth.
self.onmessage = async (e: MessageEvent<{ cars: CarSpec[] }>) => {
  try {
    await drawStills(new OffscreenCanvas(STILL_W, STILL_H), e.data.cars, {
      start: (id) => postMessage({ type: 'start', id }),
      done: (id, blob) => postMessage({ type: 'still', id, blob }),
      timing: (id, ms) => postMessage({ type: 'timing', id, ms }),
    })
    postMessage({ type: 'end' })
  } catch (err) {
    postMessage({ type: 'error', message: String(err) })
  }
}
