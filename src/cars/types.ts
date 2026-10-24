// All lengths in metres, in a car-local frame: +x is the nose, +y is up, z is width.

export type TrimStyle = 'chrome' | 'black' | 'body' | 'none'

export interface Dimensions {
  L: number // overall length
  W: number // overall width
  H: number // overall height
  WB: number // wheelbase
  FO: number // front overhang (nose to front axle)
  R: number // wheel radius, tyre included
}

/** Side silhouette of the lower body (everything below the glasshouse). */
export interface Profile {
  clearance?: number // underbody height
  noseBottom: number // height of the most forward point
  noseTop: number // height of the hood's leading edge
  noseRake?: number // how far the hood edge sits behind the nose
  noseUnder?: number // how far the chin is tucked back
  hood: number // nose to windscreen base
  belt: number // beltline height at the windscreen
  beltRear: number // beltline height at the rear glass
  tailTop: number
  tailBottom: number
  tailRake?: number
  tailUnder?: number
  bulge?: { nose?: number; hood?: number; deck?: number; tail?: number }
  // plan-view shaping
  noseTaper?: number
  tailTaper?: number
  taperLen?: number
  noseCurve?: number
  tailCurve?: number
  tuck?: number // sides tuck in towards the sills
  hoodDip?: number // how far the bonnet centre sits below raised wings
  archScale?: number
}

export interface Cabin {
  windshieldRun: number // horizontal run of the windscreen
  roof: number // roof length
  rearRun: number // horizontal run of the rear glass / fastback
  bulge?: { windshield?: number; roof?: number; rear?: number }
  tumblehome?: number // roof width relative to the glasshouse base
  width?: number // glasshouse width relative to body width
  pillar?: number
  aPillar?: number // extra A-pillar width along the windscreen
  cPillar?: number // extra C-pillar width along the rear glass
  dividers?: number[] // pillar positions, 0 = windscreen base, 1 = rear glass base
  sideWindow?: [number, number]
  rearGlass?: [number, number]
}

export interface Headlights {
  type: 'round' | 'rect'
  y: number
  size: number // diameter (round) or width (rect)
  h?: number // rect height
  spread: number[] // centre positions as fractions of half width
  back?: number // set back from the nose (for fender-mounted lamps)
  pod?: boolean // body-coloured lamp pods
}

export interface Indicators {
  y: number
  w: number
  h: number
  spread: number[]
}

export interface Grille {
  type: 'band' | 'kidney' | 'chrome' | 'shield' | 'slats' | 'none'
  y: number
  h: number
  w?: number // fraction of body width
}

export interface Bumper {
  style: TrimStyle
  y: number
  h: number
  d?: number
  span?: number // fraction of half width the bumper reaches
  strip?: boolean // black rubber insert along a chrome bumper
  overriders?: number[] // vertical guards, as fractions of half width
}

export type LampColor = 'red' | 'amber' | 'clear' | 'dark'

export interface Taillights {
  type: 'rect' | 'band' | 'round'
  y: number
  w: number
  h: number
  spread?: number[]
  /** lens sections, outboard→inboard ('cols') or top→bottom ('rows'), with relative sizes */
  segments?: [LampColor, number][]
  split?: 'rows' | 'cols'
  ribs?: number // horizontal ribs across the lens, as on the 190E and Volvo
  bezel?: 'chrome' | 'black'
}

/** Raised lettering, as a die-cast model has it. */
export interface Badge {
  text: string
  y: number
  z: number // centre, as a fraction of half width (+ is the car's right)
  h: number // letter height
  style?: 'chrome' | 'black' | 'red'
  font?: 'sans' | 'script' | 'wide'
}

export interface Rear {
  taillights: Taillights
  bumper: Bumper
  /** boot lid or hatch outline; bottom is the height of its lower edge on the tail */
  lid?: { type: 'trunk' | 'hatch' | 'engine'; bottom: number; width?: number }
  /** a panel between the lamps, e.g. the black tail panel of many 80s cars */
  panel?: { y: number; h: number; color: 'black' | 'body' | 'chrome' }
  plate?: { y: number; text: string; style?: 'eu' | 'de' | 'uk' | 'us' | 'it' | 'jp' }
  exhaust?: { z: number; count?: 1 | 2; r?: number; style?: 'chrome' | 'dark' }
  badges?: Badge[]
  wiper?: boolean
}

export interface Interior {
  color?: string // seats and trim
  seats?: 2 | 4
  rhd?: boolean
}

export interface Side {
  seams?: number[] // door shut lines, same scale as cabin dividers
  rubStrip?: { y: number; h: number; color?: string; pinstripe?: string }
  mirrors?: 'chrome' | 'black'
  flares?: { width: number; depth: number; color?: string }
  handles?: 'chrome' | 'black' | 'none'
  windowTrim?: 'chrome' | 'black'
  fuel?: { x: number; y: number } // filler flap on the right rear wing, x from the tail
}

export interface Wheels {
  style: 'cap' | 'spoke' | 'steel' | 'holes' | 'mesh' | 'fuchs'
  rim?: string
  count?: number
  tyreWidth?: number
}

export interface CarSpec {
  id: string
  make: string
  model: string
  years: string
  country: string
  designer: string
  note: string
  paint: string
  metallic?: boolean
  roofColor?: string
  softTop?: boolean
  dims: Dimensions
  profile: Profile
  cabin: Cabin
  front: { headlights: Headlights; grille: Grille; bumper: Bumper; indicators?: Indicators; badge?: Badge }
  rear: Rear
  interior?: Interior
  side?: Side
  wheels: Wheels
}
