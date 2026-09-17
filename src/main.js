import './style.css'

const mechanismConfig = [
  {
    id: 'hinge-a',
    name: 'Hinge A',
    color: '#7dd3fc',
    anchorX: 170,
    anchorY: 220,
    points: 6,
    length: 160,
    amplitude: 48,
    sway: 28,
    phase: 0.4,
    verticalLift: 26,
    drift: 1.1,
  },
  {
    id: 'hinge-b',
    name: 'Hinge B',
    color: '#a78bfa',
    anchorX: 470,
    anchorY: 345,
    points: 7,
    length: 180,
    amplitude: 42,
    sway: 38,
    phase: 1.2,
    verticalLift: 30,
    drift: 1.35,
  },
  {
    id: 'hinge-c',
    name: 'Hinge C',
    color: '#f9a8d4',
    anchorX: 760,
    anchorY: 220,
    points: 5,
    length: 150,
    amplitude: 52,
    sway: 24,
    phase: 2.1,
    verticalLift: 24,
    drift: 1.8,
  },
]

const state = Object.fromEntries(mechanismConfig.map((mechanism) => [mechanism.id, 0]))

function buildPointArray(mechanism, sliderValue) {
  const t = sliderValue / 75
  const points = []

  for (let index = 0; index < mechanism.points; index += 1) {
    const normalized = mechanism.points === 1 ? 0 : index / (mechanism.points - 1)
    const spread = normalized * mechanism.length
    const bend = Math.sin(normalized * Math.PI * 1.7 + mechanism.phase + t * mechanism.drift) * mechanism.amplitude
    const twist = Math.cos(normalized * Math.PI * 2.15 - mechanism.phase + t * (mechanism.drift * 1.25)) * mechanism.sway
    const x = mechanism.anchorX + spread + twist
    const y = mechanism.anchorY + bend + (normalized - 0.5) * mechanism.verticalLift * 2

    points.push([Number(x.toFixed(2)), Number(y.toFixed(2))])
  }

  return points
}

function renderViewport() {
  const viewport = document.querySelector('#mechanism-viewport')
  if (!viewport) return

  const groups = mechanismConfig
    .map((mechanism) => {
      const points = buildPointArray(mechanism, state[mechanism.id])
      const segments = points
        .slice(1)
        .map((point, index) => {
          const start = points[index]
          return `<line x1="${start[0]}" y1="${start[1]}" x2="${point[0]}" y2="${point[1]}" stroke="${mechanism.color}" stroke-width="8" stroke-linecap="round" opacity="${0.95 - index * 0.1}" />`
        })
        .join('')

      const nodes = points
        .map((point, index) => {
          const radius = index === 0 ? 9 : 6
          const fill = index === 0 ? '#f8fafc' : '#fef3c7'
          return `<circle cx="${point[0]}" cy="${point[1]}" r="${radius}" fill="${fill}" stroke="${mechanism.color}" stroke-width="2" />`
        })
        .join('')

      const label = `<text x="${points[0][0] + 18}" y="${points[0][1] - 16}" fill="${mechanism.color}" font-size="16" font-weight="700">${mechanism.name}</text>`

      return `<g>${segments}${nodes}${label}</g>`
    })
    .join('')

  viewport.innerHTML = `
    <defs>
      <linearGradient id="stageGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#111827" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="960" height="620" fill="url(#stageGlow)" rx="30" stroke="rgba(148,163,184,0.3)" />
    <g opacity="0.18">
      <path d="M120 100 L840 100 M120 220 L840 220 M120 340 L840 340 M120 460 L840 460" stroke="#94a3b8" stroke-width="1" fill="none"/>
      <path d="M200 60 L200 540 M400 60 L400 540 M600 60 L600 540 M800 60 L800 540" stroke="#94a3b8" stroke-width="1" fill="none"/>
    </g>
    ${groups}
  `
}

function renderDataOutput() {
  const output = document.querySelector('#data-output')
  if (!output) return

  output.innerHTML = mechanismConfig
    .map((mechanism) => {
      const points = buildPointArray(mechanism, state[mechanism.id])
      return `
        <div class="data-card">
          <div class="data-header">
            <span>${mechanism.name}</span>
            <span>Slider ${state[mechanism.id]}</span>
          </div>
          <pre>${JSON.stringify(points, null, 2)}</pre>
        </div>
      `
    })
    .join('')
}

function renderControls() {
  const controls = document.querySelector('#controls')
  if (!controls) return

  controls.innerHTML = mechanismConfig
    .map(
      (mechanism) => `
        <label class="slider-card" for="slider-${mechanism.id}">
          <div class="slider-header">
            <span>${mechanism.name}</span>
            <strong id="value-${mechanism.id}">${state[mechanism.id]}</strong>
          </div>
          <input id="slider-${mechanism.id}" type="range" min="0" max="75" step="1" value="${state[mechanism.id]}" />
        </label>
      `
    )
    .join('')

  mechanismConfig.forEach((mechanism) => {
    const input = document.querySelector(`#slider-${mechanism.id}`)
    input.addEventListener('input', (event) => {
      state[mechanism.id] = Number(event.target.value)
      document.querySelector(`#value-${mechanism.id}`).textContent = String(state[mechanism.id])
      renderViewport()
      renderDataOutput()
    })
  })
}

function updateAll() {
  renderControls()
  renderViewport()
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
        <svg id="mechanism-viewport" viewBox="0 0 960 620" aria-label="Multi-link hinge mechanism simulation"></svg>
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

updateAll()
