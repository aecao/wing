import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import c0Url from './assets/C0.glb?url'
import r1Url from './assets/R1.glb?url'
import r2Url from './assets/R2.glb?url'
import r3Url from './assets/R3.glb?url'
import r4Url from './assets/R4.glb?url'
import r5Url from './assets/R5.glb?url'
import p0Url from './assets/P0.glb?url'
import p1Url from './assets/P1.glb?url'
import s01Url from './assets/S01.glb?url'
import h02Url from './assets/H02.glb?url'
import h13Url from './assets/H13.glb?url'
import h23Url from './assets/H23.glb?url'
import h24Url from './assets/H24.glb?url'
import h35Url from './assets/H35.glb?url'
import h45Url from './assets/H45.glb?url'

const componentAssets = {
  C0: { assetUrl: c0Url, points: ['P0', 'H02'] },
  R1: { assetUrl: r1Url, points: ['P1', 'H13'] },
  R2: { assetUrl: r2Url, points: ['H02', 'H24'] },
  R3: { assetUrl: r3Url, points: ['H13', 'H35'] },
  R4: { assetUrl: r4Url, points: ['H24', 'H45'] },
  R5: { assetUrl: r5Url, points: ['H35', 'H45'] },
}
const pointAssets = {
  P0: p0Url,
  P1: p1Url,
  S01: s01Url,
  H02: h02Url,
  H13: h13Url,
  H23: h23Url,
  H24: h24Url,
  H35: h35Url,
  H45: h45Url,
}
const pointNames = Object.keys(pointAssets)
const state = { slider: 75 }
const rhinoFeetToMeters = 0.3048

function parsePointCsv(csvText) {
  const rows = new Map()

  csvText.trim().split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(\d+)\s*,\s*"?([A-Za-z0-9]+)\{\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^}]+)\}"?\s*$/)
    if (!match) return

    const [, slider, point, x, y, z] = match
    if (!rows.has(Number(slider))) rows.set(Number(slider), {})
    rows.get(Number(slider))[point] = new THREE.Vector3(
      Number(x) * rhinoFeetToMeters,
      Number(z) * rhinoFeetToMeters,
      Number(y) * rhinoFeetToMeters,
    )
  })

  return rows
}

async function initializeModelViewport() {
  const viewport = document.querySelector('#model-viewport')
  const status = document.querySelector('#model-status')
  if (!viewport || !status) return

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#07111f')

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100000)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  viewport.append(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  scene.add(new THREE.HemisphereLight('#dbeafe', '#0b1220', 2.4))
  const keyLight = new THREE.DirectionalLight('#ffffff', 3)
  keyLight.position.set(4, 8, 6)
  scene.add(keyLight)

  const modelGroup = new THREE.Group()
  scene.add(modelGroup)

  const resize = () => {
    const { width, height } = viewport.getBoundingClientRect()
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }

  const frameModel = () => {
    const bounds = new THREE.Box3().setFromObject(modelGroup)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const largestDimension = Math.max(size.x, size.y, size.z)
    const distance = largestDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))

    modelGroup.position.sub(center)
    camera.position.set(0, 0, distance * 1.35)
    camera.near = Math.max(largestDimension / 1000, 0.01)
    camera.far = Math.max(largestDimension * 100, 1000)
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
  }

  const pointDataResponse = await fetch(`${import.meta.env.BASE_URL}data/POINTS.csv`)
  if (!pointDataResponse.ok) {
    status.textContent = 'Could not load public/data/POINTS.csv'
    return
  }

  const pointRows = parsePointCsv(await pointDataResponse.text())
  const referencePoints = pointRows.get(75)
  if (!referencePoints || pointNames.some((pointName) => !referencePoints[pointName])) {
    status.textContent = 'POINTS.csv needs all nine points at slider 75'
    return
  }

  const loader = new GLTFLoader()
  const pointMarkers = new Map()
  const components = new Map()
  let loadedAssets = 0
  const totalAssets = Object.keys(componentAssets).length + pointNames.length

  const updatePointMarkers = () => {
    const activePoints = pointRows.get(state.slider)
    if (!activePoints) return

    pointMarkers.forEach((marker, pointName) => {
      marker.position.copy(activePoints[pointName]).sub(referencePoints[pointName])
    })

    components.forEach((component, componentName) => {
      const [startPointName, endPointName] = componentAssets[componentName].points
      const referenceStart = referencePoints[startPointName]
      const referenceEnd = referencePoints[endPointName]
      const activeStart = activePoints[startPointName]
      const activeEnd = activePoints[endPointName]
      const referenceDirection = referenceEnd.clone().sub(referenceStart).normalize()
      const activeDirection = activeEnd.clone().sub(activeStart).normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(referenceDirection, activeDirection)

      component.scene.quaternion.copy(rotation).multiply(component.baseQuaternion)
      component.scene.position.copy(component.basePosition).sub(referenceStart).applyQuaternion(rotation).add(activeStart)
    })
  }

  const loadAsset = (assetUrl, assetName, isPointMarker = false) => {
    loader.load(
      assetUrl,
      (gltf) => {
        gltf.scene.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })
        modelGroup.add(gltf.scene)
        if (isPointMarker) pointMarkers.set(assetName, gltf.scene)
        else {
          components.set(assetName, {
            scene: gltf.scene,
            basePosition: gltf.scene.position.clone(),
            baseQuaternion: gltf.scene.quaternion.clone(),
          })
        }
        loadedAssets += 1
        status.textContent = `Loaded ${loadedAssets} of ${totalAssets} GLB assets`
        if (loadedAssets === totalAssets) {
          updatePointMarkers()
          frameModel()
          status.textContent = `Slider ${state.slider}: six components and nine point markers loaded`
        }
      },
      undefined,
      () => {
        status.textContent = 'A component could not be loaded'
      },
    )
  }

  Object.entries(componentAssets).forEach(([componentName, component]) => {
    loadAsset(component.assetUrl, componentName)
  })
  pointNames.forEach((pointName) => loadAsset(pointAssets[pointName], pointName, true))

  window.addEventListener('wing-slider-change', () => {
    updatePointMarkers()
    status.textContent = `Slider ${state.slider}: points and six components positioned from POINTS.csv`
  })

  new ResizeObserver(resize).observe(viewport)
  resize()

  const render = () => {
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(render)
  }
  render()
}

function renderDataOutput() {
  const output = document.querySelector('#data-output')
  if (!output) return

  output.innerHTML = `
    <div class="data-card">
      <div class="data-header">
        <span>Wing points</span>
        <span>Slider ${state.slider}</span>
      </div>
      <pre>POINTS.csv drives P0, P1, S01, H02, H13, H23, H24, H35, and H45.</pre>
    </div>
  `
}

function renderControls() {
  const controls = document.querySelector('#controls')
  if (!controls) return

  controls.innerHTML = `
    <label class="slider-card" for="wing-slider">
      <div class="slider-header">
        <span>Wing extension</span>
        <strong id="wing-slider-value">${state.slider}</strong>
      </div>
      <input id="wing-slider" type="range" min="0" max="75" step="1" value="${state.slider}" />
    </label>
  `

  document.querySelector('#wing-slider').addEventListener('input', (event) => {
    state.slider = Number(event.target.value)
    document.querySelector('#wing-slider-value').textContent = String(state.slider)
    renderDataOutput()
    window.dispatchEvent(new Event('wing-slider-change'))
  })
}

function updateAll() {
  renderControls()
  renderDataOutput()
}

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <aside class="panel controls-panel">
      <div class="panel-header">
        <p class="eyebrow">Simulation</p>
        <h2>Mechanism Controls</h2>
      </div>
      <div id="controls"></div>
    </aside>

    <main class="panel viewport-panel">
      <div class="viewport-toolbar">
        <div>
          <p class="eyebrow">VR prototype</p>
          <h1>Hinge Motion Lab</h1>
        </div>
        <div class="badge">0–75</div>
      </div>
      <div class="viewport-frame">
        <div id="model-viewport" aria-label="3D preview of exported Rhino mechanism components"></div>
        <p id="model-status" class="model-status">Loading Rhino components...</p>
      </div>
    </main>

    <aside class="panel data-panel">
      <div class="panel-header">
        <p class="eyebrow">Input arrays</p>
        <h2>Point Positions</h2>
      </div>
      <div id="data-output"></div>
    </aside>
  </div>
`

initializeModelViewport()
updateAll()
