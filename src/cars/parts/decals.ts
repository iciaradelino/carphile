import * as THREE from 'three'
import type { Badge, Rear } from '../types'

// Lettering and plates are drawn onto small canvases (OffscreenCanvas inside the stills worker)
// and laid on the body as thin textured planes.

function canvas(w: number, h: number) {
  const c = typeof document === 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  return { c, ctx }
}

const FONTS: Record<NonNullable<Badge['font']>, string> = {
  sans: '600 92px "Helvetica Neue", Arial, sans-serif',
  wide: '700 84px "Arial Black", "Helvetica Neue", Arial, sans-serif',
  script: 'italic 600 100px "Brush Script MT", "Segoe Script", cursive',
}

const cache = new Map<string, { tex: THREE.Texture; aspect: number }>()

/** White-on-transparent lettering; the material tints it chrome, black or red. */
export function letteringTexture(text: string, font: Badge['font'] = 'sans') {
  const key = `${font}|${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const probe = canvas(8, 8).ctx
  probe.font = FONTS[font]
  const width = Math.ceil(probe.measureText(text).width) + 24
  const { c, ctx } = canvas(width, 128)
  ctx.font = FONTS[font]
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(text, 12, 68)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const out = { tex, aspect: width / 128 }
  cache.set(key, out)
  return out
}

const BADGE_COLOR = { chrome: '#f4f4f4', black: '#151515', red: '#b8141c' }

export function badgeMaterial(style: Badge['style'] = 'chrome', tex: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: BADGE_COLOR[style],
    metalness: style === 'chrome' ? 0.75 : 0.1,
    roughness: style === 'chrome' ? 0.12 : 0.4,
    transparent: true,
    alphaTest: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
}

const PLATE: Record<NonNullable<NonNullable<Rear['plate']>['style']>, { w: number; h: number; bg: string; ink: string; band?: string }> = {
  eu: { w: 0.52, h: 0.11, bg: '#f3f2ec', ink: '#151515', band: '#1f3f9a' },
  de: { w: 0.52, h: 0.11, bg: '#f3f2ec', ink: '#151515' },
  it: { w: 0.34, h: 0.11, bg: '#f3f2ec', ink: '#151515' },
  uk: { w: 0.52, h: 0.11, bg: '#e9c635', ink: '#151515' },
  us: { w: 0.305, h: 0.152, bg: '#f1efe6', ink: '#1b2b5e' },
  jp: { w: 0.33, h: 0.165, bg: '#f1f1ea', ink: '#1b5e2e' },
}

export function plateSize(style: NonNullable<Rear['plate']>['style'] = 'eu') {
  return PLATE[style]
}

export function plateTexture(text: string, style: NonNullable<Rear['plate']>['style'] = 'eu') {
  const p = PLATE[style]
  const H = 160
  const W = Math.round((H * p.w) / p.h)
  const { c, ctx } = canvas(W, H)
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = p.ink
  ctx.lineWidth = 6
  ctx.strokeRect(6, 6, W - 12, H - 12)
  let left = 0
  if (p.band) {
    left = H * 0.42
    ctx.fillStyle = p.band
    ctx.fillRect(6, 6, left, H - 12)
  }
  ctx.fillStyle = p.ink
  ctx.font = `700 ${Math.round(H * 0.62)}px "DIN Alternate", "Arial Narrow", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + (W - left) / 2, H * 0.54, W - left - 30)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
