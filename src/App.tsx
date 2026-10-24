import { useCallback, useEffect, useRef, useState } from 'react'
import { catalog } from './cars/catalog'
import { InfiniteGrid } from './components/InfiniteGrid'
import { Loader } from './components/Loader'
import { Viewer } from './components/Viewer'
import { hoverCar } from './render/hover'
import { renderStills } from './render/stills'

function fromHash() {
  const i = catalog.findIndex((c) => `#${c.id}` === location.hash)
  return i < 0 ? null : i
}

const MIN_SPIN = 600 // ms the car spins in the grid before the viewer takes over

export default function App() {
  const [stills, setStills] = useState<Record<string, string>>({})
  const [started, setStarted] = useState<string[]>([])
  const [loading, setLoading] = useState<'pending' | 'showing' | 'done'>('pending')
  const [open, setOpen] = useState<number | null>(fromHash)
  const [visible, setVisible] = useState(false)
  const [spinIn, setSpinIn] = useState(false)
  const [moved, setMoved] = useState(false)
  const openedAt = useRef(0)
  const done = Object.keys(stills).length

  // Each car has a shareable link: #bmw-e30 and so on.
  useEffect(() => {
    const id = open === null ? '' : `#${catalog[open].id}`
    if (location.hash !== id) history.replaceState(null, '', id || location.pathname)
  }, [open])
  useEffect(() => {
    const onHash = () => setOpen(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const signal = { cancelled: false }
    renderStills(
      catalog,
      {
        onStart: (id) => !signal.cancelled && setStarted((s) => [...s, id]),
        onStill: (id, url) => !signal.cancelled && setStills((s) => ({ ...s, [id]: url })),
      },
      signal,
    )
    return () => {
      signal.cancelled = true
    }
  }, [])

  // Only bring the loader up if the stills are not already cached and back in a blink.
  useEffect(() => {
    const t = setTimeout(() => setLoading((l) => (l === 'pending' ? 'showing' : l)), 250)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (loading === 'pending' && done === catalog.length) setLoading('done')
  }, [loading, done])

  const onOpen = useCallback((i: number, cell: HTMLElement) => {
    // the car wakes up (if it was not already) and spins while the viewer gets ready behind it
    hoverCar.show(cell, catalog[i])
    hoverCar.spin()
    openedAt.current = performance.now()
    setSpinIn(true)
    setVisible(false)
    setOpen(i)
  }, [])
  const onReady = useCallback(() => {
    const wait = Math.max(0, MIN_SPIN - (performance.now() - openedAt.current))
    setTimeout(() => {
      setVisible(true)
      setTimeout(() => hoverCar.stop(), 350)
    }, wait)
  }, [])
  const onFirstMove = useCallback(() => setMoved(true), [])
  const onClose = useCallback(() => {
    setOpen(null)
    setVisible(false)
    setSpinIn(false)
  }, [])
  const onStep = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + catalog.length) % catalog.length)), [])
  const onLoaded = useCallback(() => setLoading('done'), [])

  return (
    <>
      <InfiniteGrid cars={catalog} stills={stills} onOpen={onOpen} onFirstMove={onFirstMove} paused={open !== null || loading === 'showing'} />
      <div className="veil" />
      <header className="masthead">
        <span className="wordmark">carphile</span>
        <span className="tagline">an archive of pretty cars</span>
      </header>
      <span className="count">{String(catalog.length).padStart(3, '0')} miniatures</span>
      <p className={`hint${moved ? ' is-hidden' : ''}`}>drag to explore · scroll to zoom</p>
      {open !== null && (
        <Viewer car={catalog[open]} visible={visible} spinIn={spinIn} onReady={onReady} onClose={onClose} onStep={onStep} />
      )}
      {loading === 'showing' && open === null && <Loader cars={catalog} started={started} done={done} onFinished={onLoaded} />}
    </>
  )
}
