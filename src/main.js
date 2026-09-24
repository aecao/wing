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
const state = { leftSlider: 75, rightSlider: 75 }
const rhinoFeetToMeters = 0.3048
const showSecondWing = true

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

function parseShadeCsv(csvText) {
  const [header, ...lines] = csvText.trim().split(/\r?\n/)
  const columns = header.split(',')
  const columnIndex = Object.fromEntries(columns.map((column, index) => [column, index]))
  const states = new Map()

  lines.forEach((line) => {
    const values = line.split(',')
    const leftSlider = Number(values[columnIndex['in:wing1']])
    const rightSlider = Number(values[columnIndex['in:wing2']])
    const points = Array.from({ length: 37 }, (_, index) => {
      const pointNumber = index + 1
      return new THREE.Vector3(
        Number(values[columnIndex[`x${pointNumber}`]]) * rhinoFeetToMeters,
        Number(values[columnIndex[`z${pointNumber}`]]) * rhinoFeetToMeters,
        Number(values[columnIndex[`y${pointNumber}`]]) * rhinoFeetToMeters,
      )
    })

    states.set(`${leftSlider}-${rightSlider}`, points)
  })

  return states
}

function buildShadeEdges(points) {
  const planes = new Map()

  points.forEach((point, index) => {
    const planeKey = point.z.toFixed(4)
    if (!planes.has(planeKey)) planes.set(planeKey, [])
    planes.get(planeKey).push({ point, index })
  })

  return Array.from(planes.values()).flatMap((planePoints) => {
    planePoints.sort((first, second) => first.point.x - second.point.x || first.point.y - second.point.y)
    return planePoints.slice(1).map((point, index) => [planePoints[index].index, point.index])
  })
}

function buildLongitudinalShadeEdges(points) {
  const planes = new Map()

  points.forEach((point, index) => {
    const planeKey = point.x.toFixed(4)
    if (!planes.has(planeKey)) planes.set(planeKey, [])
    planes.get(planeKey).push({ point, index })
  })

  const buildZigzagOrder = (planePoints) => {
    const zLayers = new Map()

    planePoints.forEach((point) => {
      const zKey = point.point.z.toFixed(4)
      if (!zLayers.has(zKey)) zLayers.set(zKey, [])
      zLayers.get(zKey).push(point)
    })

    return Array.from(zLayers.values())
      .sort((first, second) => first[0].point.z - second[0].point.z)
      .flatMap((layer, index) => {
        layer.sort((first, second) => first.point.y - second.point.y)
        return index % 2 === 0 ? layer : layer.reverse()
      })
  }

  return Array.from(planes.values())
    .filter((planePoints) => planePoints.length > 1)
    .map((planePoints) => {
      const zigzagPoints = buildZigzagOrder(planePoints)
      return {
        count: planePoints.length,
        points: zigzagPoints.slice(0, 18),
      }
    })
    .sort((first, second) => second.count - first.count)
    .slice(0, 2)
    .flatMap(({ points: linePoints }) => linePoints.slice(1).map((point, index) => [linePoints[index].index, point.index]))
}

function findShadeAttachmentEdge(edges, points, anchorPoint) {
  return edges.reduce((closest, edge) => {
    const [startIndex, endIndex] = edge
    const distance = Math.min(points[startIndex].distanceTo(anchorPoint), points[endIndex].distanceTo(anchorPoint))
    return distance < closest.distance ? { edge, distance } : closest
  }, { edge: edges[0], distance: Infinity }).edge
}

function createAxisLabel(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = color
  context.font = 'bold 52px Helvetica Neue, Helvetica, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 48, 50)

  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false })
  const label = new THREE.Sprite(material)
  label.scale.set(0.22, 0.22, 1)
  return label
}

function createAxisGizmo() {
  const gizmo = new THREE.Group()
  const axes = [
    { label: 'X', direction: new THREE.Vector3(1, 0, 0), color: '#ef4444' },
    { label: 'Y', direction: new THREE.Vector3(0, 1, 0), color: '#22c55e' },
    { label: 'Z', direction: new THREE.Vector3(0, 0, 1), color: '#3b82f6' },
  ]

  axes.forEach(({ label, direction, color }) => {
    gizmo.add(new THREE.ArrowHelper(direction, new THREE.Vector3(), 0.45, color, 0.1, 0.06))
    const axisLabel = createAxisLabel(label, color)
    axisLabel.position.copy(direction).multiplyScalar(0.56)
    gizmo.add(axisLabel)
  })

  return gizmo
}

async function initializeModelViewport() {
  const viewport = document.querySelector('#model-viewport')
  const status = document.querySelector('#model-status')
  if (!viewport || !status) return

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#d1d1d1')

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
  const shadeDataResponse = await fetch(`${import.meta.env.BASE_URL}data/range%20of%20fold%20points.csv`)
  if (!shadeDataResponse.ok) {
    status.textContent = 'Could not load fold point data'
    return
  }

  const shadeStates = parseShadeCsv(await shadeDataResponse.text())
  const referencePoints = pointRows.get(75)
  if (!referencePoints || pointNames.some((pointName) => !referencePoints[pointName])) {
    status.textContent = 'POINTS.csv needs all nine points at slider 75'
    return
  }

  const loader = new GLTFLoader()
  const wings = new Map()
  const axisGizmo = createAxisGizmo()
  axisGizmo.position.set(-1.4, -1.4, 0)
  modelGroup.add(axisGizmo)
  const referenceShadePoints = shadeStates.get('75-75')
  const transverseShadeEdges = buildShadeEdges(referenceShadePoints)
  const longitudinalShadeEdges = buildLongitudinalShadeEdges(referenceShadePoints)
  const shadeEdges = [...transverseShadeEdges, ...longitudinalShadeEdges]
  const shadeAttachmentEdge = findShadeAttachmentEdge(transverseShadeEdges, referenceShadePoints, referencePoints.H35)
  const shadeGeometry = new THREE.BufferGeometry()
  const shadeMaterial = new THREE.LineBasicMaterial({ color: '#e53935' })
  const shade = new THREE.LineSegments(shadeGeometry, shadeMaterial)
  modelGroup.add(shade)
  let loadedAssets = 0
  const wingDefinitions = [
    { id: 'left', label: 'Wing', sliderKey: 'leftSlider', positionZ: 0 },
    ...(showSecondWing ? [{ id: 'right', label: 'Right wing', sliderKey: 'rightSlider', positionZ: 7 * rhinoFeetToMeters }] : []),
  ]
  const assetsPerWing = Object.keys(componentAssets).length + pointNames.length
  const totalAssets = assetsPerWing * wingDefinitions.length

  const updateWing = (wing) => {
    const activePoints = pointRows.get(state[wing.sliderKey])
    if (!activePoints) return

    wing.pointMarkers.forEach((marker, pointName) => {
      marker.position.copy(activePoints[pointName]).sub(referencePoints[pointName])
    })

    wing.components.forEach((component, componentName) => {
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

  const updateShade = () => {
    const points = shadeStates.get(`${state.leftSlider}-${state.rightSlider}`)
    const wingPoints = pointRows.get(state.leftSlider)
    if (!points || !wingPoints) return

    const vertices = new Float32Array(shadeEdges.length * 6)
    shadeEdges.forEach(([startIndex, endIndex], edgeIndex) => {
      const start = points[startIndex]
      const end = points[endIndex]
      const offset = edgeIndex * 6
      vertices.set([start.x, start.y, start.z, end.x, end.y, end.z], offset)
    })
    shadeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    shadeGeometry.computeBoundingSphere()

    const [startIndex, endIndex] = shadeAttachmentEdge
    const sourceStart = points[startIndex]
    const sourceEnd = points[endIndex]
    const sourceDirection = sourceEnd.clone().sub(sourceStart).normalize()
    const targetDirection = wingPoints.H45.clone().sub(wingPoints.H35).normalize()
    const rotation = new THREE.Quaternion().setFromUnitVectors(sourceDirection, targetDirection)

    shade.quaternion.copy(rotation)
    shade.position.copy(wingPoints.H35).sub(sourceStart.clone().applyQuaternion(rotation))
  }

  const loadWingAsset = (wing, assetUrl, assetName, isPointMarker = false) => {
    loader.load(
      assetUrl,
      (gltf) => {
        gltf.scene.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })
        wing.root.add(gltf.scene)
        if (isPointMarker) wing.pointMarkers.set(assetName, gltf.scene)
        else {
          wing.components.set(assetName, {
            scene: gltf.scene,
            basePosition: gltf.scene.position.clone(),
            baseQuaternion: gltf.scene.quaternion.clone(),
          })
        }
        loadedAssets += 1
        status.textContent = `Loaded ${loadedAssets} of ${totalAssets} GLB assets`
        if (loadedAssets === totalAssets) {
          wings.forEach(updateWing)
          updateShade()
          frameModel()
          status.textContent = showSecondWing ? 'Two wing mechanisms loaded and ready' : 'Wing mechanism loaded and ready'
        }
      },
      undefined,
      () => {
        status.textContent = 'A component could not be loaded'
      },
    )
  }

  wingDefinitions.forEach((definition) => {
    const root = new THREE.Group()
    root.position.z = definition.positionZ
    modelGroup.add(root)

    const wing = { ...definition, root, pointMarkers: new Map(), components: new Map() }
    wings.set(definition.id, wing)

    Object.entries(componentAssets).forEach(([componentName, component]) => {
      loadWingAsset(wing, component.assetUrl, componentName)
    })
    pointNames.forEach((pointName) => loadWingAsset(wing, pointAssets[pointName], pointName, true))
  })

  window.addEventListener('wing-slider-change', (event) => {
    const wing = wings.get(event.detail)
    if (!wing) return

    updateWing(wing)
    updateShade()
    status.textContent = `${wing.label} at slider ${state[wing.sliderKey]}`
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
        <span>Slider ${state.leftSlider}</span>
      </div>
      <pre>POINTS.csv drives P0, P1, S01, H02, H13, H23, H24, H35, and H45.</pre>
    </div>
  `
}

function renderControls() {
  const controls = document.querySelector('#controls')
  if (!controls) return

  controls.innerHTML = `
    <label class="slider-card" for="left-wing-slider">
      <div class="slider-header">
        <span>Wing extension</span>
        <strong id="left-wing-slider-value">${state.leftSlider}</strong>
      </div>
      <input id="left-wing-slider" type="range" min="0" max="75" step="1" value="${state.leftSlider}" />
    </label>
    ${showSecondWing ? `
      <label class="slider-card" for="right-wing-slider">
        <div class="slider-header">
          <span>Right wing extension</span>
          <strong id="right-wing-slider-value">${state.rightSlider}</strong>
        </div>
        <input id="right-wing-slider" type="range" min="0" max="75" step="1" value="${state.rightSlider}" />
      </label>
    ` : ''}
  `

  const visibleWings = showSecondWing ? [['left', 'leftSlider'], ['right', 'rightSlider']] : [['left', 'leftSlider']]

  visibleWings.forEach(([wingId, sliderKey]) => {
    document.querySelector(`#${wingId}-wing-slider`).addEventListener('input', (event) => {
      state[sliderKey] = Number(event.target.value)
      document.querySelector(`#${wingId}-wing-slider-value`).textContent = String(state[sliderKey])
      renderDataOutput()
      window.dispatchEvent(new CustomEvent('wing-slider-change', { detail: wingId }))
    })
  })
}

function updateAll() {
  renderControls()
  renderDataOutput()
}

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <main class="viewport-panel">
      <div class="viewport-frame">
        <div id="model-viewport" aria-label="3D preview of exported Rhino mechanism components"></div>
        <p id="model-status" class="model-status">Loading Rhino components...</p>
      </div>
    </main>

    <aside class="panel controls-panel" aria-label="Mechanism controls">
      <div class="panel-header">
        <h2>Wing Controls</h2>
        <div class="badge">0-75</div>
      </div>
      <div id="controls"></div>
    </aside>

  </div>
`

initializeModelViewport()
updateAll()
