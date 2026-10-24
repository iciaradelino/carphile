import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { CarSpec } from '../cars/types'

/** Every car is shown at the same studio: soft room reflections, one key light, a shadow catcher. */
export function createStage(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.VSMShadowMap
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  scene.environmentIntensity = 0.9
  pmrem.dispose()

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d3c8, 0.6))
  const key = new THREE.DirectionalLight(0xffffff, 1.7)
  key.position.set(3, 8, 5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = key.shadow.camera.bottom = -4
  key.shadow.camera.right = key.shadow.camera.top = 4
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.shadow.radius = 10
  key.shadow.blurSamples = 20
  scene.add(key)
  // a soft rim light from behind picks out the tail, the roofline and the shut lines
  const rim = new THREE.DirectionalLight(0xfff6ea, 0.75)
  rim.position.set(-6, 4.5, -3.5)
  scene.add(rim)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.12 }))
  ground.receiveShadow = true
  scene.add(ground)

  return {
    scene,
    dispose() {
      env.dispose()
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
    },
  }
}

/** Gently evens out sizes so a Mini and a Volvo both read well, while keeping their real difference. */
export function displayScale(spec: CarSpec) {
  return Math.pow(4.4 / spec.dims.L, 0.35)
}

export const TARGET = new THREE.Vector3(0, 0.52, 0)

/** The archive's fixed three-quarter front view. */
export function placeStillCamera(camera: THREE.PerspectiveCamera, distance = 8.9) {
  const polar = THREE.MathUtils.degToRad(66)
  const azimuth = THREE.MathUtils.degToRad(42)
  camera.position.set(
    TARGET.x + distance * Math.sin(polar) * Math.sin(azimuth),
    TARGET.y + distance * Math.cos(polar),
    TARGET.z + distance * Math.sin(polar) * Math.cos(azimuth),
  )
  camera.lookAt(TARGET)
}
