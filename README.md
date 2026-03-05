# Starship Flight Simulator

A real-time SpaceX Starship launch simulator running in the browser. Features full orbital mechanics, realistic aerodynamics, booster return-to-launch-site sequence, and 3D visualization with telemetry HUD.

![Stack](https://img.shields.io/badge/React-19-blue) ![Stack](https://img.shields.io/badge/Three.js-r183-green) ![Stack](https://img.shields.io/badge/Vite-7-purple) ![Tests](https://img.shields.io/badge/tests-78%20passing-brightgreen)

## Features

- **Full orbital mechanics** — 2D polar coordinates (r, θ) with proper gravitational parameter, vis-viva orbital elements, Keplerian trajectories
- **US Standard Atmosphere 1976** — 8-layer model from sea level through the thermosphere
- **Mach-dependent drag** — transonic drag rise, angle-of-attack cross-section interpolation, pitch damping
- **Discrete mass model** — 10+ structural elements per vehicle with LOX/CH4 tank depletion, CoM shift, and moment of inertia via parallel axis theorem
- **Per-engine gimbal model** — inner/middle/outer rings with individual gimbal limits, torque about CoM
- **PD attitude control** — engine gimbal in atmosphere, grid fins for aerodynamic control, RCS thrusters in vacuum
- **Full booster return** — coast → flip → boostback burn → belly-flop descent → suicide burn → hover → splashdown
- **ZEM/ZEV landing guidance** — time-to-go acceleration commands for the landing burn
- **3D visualization** — GLTF models, floating origin, logarithmic depth buffer, tile-based Earth with LOD texture streaming
- **Atmospheric rendering** — sky color fade, ground camera fog, Fresnel atmosphere glow shader, exhaust plume vacuum expansion
- **Ground camera** — automatic telephoto FOV tracking like real launch footage
- **Mission scenarios** — IFT-5, max payload, high orbit, suborbital hop, booster return focus, tanker mission
- **Telemetry HUD** — altitude, speed, thrust, drag, Mach, dynamic pressure, orbital elements, fuel gauges, attitude indicators

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Controls

| Key | Action |
|-----|--------|
| **E** | Launch |
| **Q** | Engine cut-off |
| **R** | Reset |
| **T** | Cycle camera |
| **1 / 2 / 3** | Ground / Ship / Booster camera |
| **< / >** | Decrease / increase time warp |
| **Mouse drag** | Orbit camera (ship/booster modes) |
| **Scroll** | Zoom |

## Mission Scenarios

Select a mission from the **Mission** panel (left sidebar, idle state):

| Scenario | Description |
|----------|-------------|
| IFT-5 (Default) | Full stack orbital test flight, booster return |
| Max Payload | 150t to LEO, no booster return fuel |
| High Orbit | 400 km target (ISS altitude), 50t payload |
| Suborbital Hop | Partial fuel load, booster-only suborbital arc |
| Booster Return | Skip to separation, watch full return sequence |
| Tanker Mission | 200t propellant delivery for orbital refueling |

## Architecture

```
src/
├── physics/              Pure math, no React dependencies
│   ├── constants.js      Vehicle specs, physical constants (SI units)
│   ├── massModel.js      CoM + MoI via parallel axis theorem
│   ├── engines.js        Per-ring engine model with gimbal torque
│   ├── aero.js           US Standard Atmosphere, Cd(M), AoA forces
│   ├── rotational.js     Angular integration (symplectic Euler)
│   ├── control.js        PD attitude controllers (gimbal, fins, RCS)
│   ├── scenarios.js      Mission profiles and state overrides
│   ├── physics.js        Main integrator, state machine, orbital elements
│   └── index.js          Barrel export (public API)
├── components/           Three.js rendering + React UI
│   ├── Scene.jsx         Floating origin, polar→3D mapping
│   ├── Rocket.jsx        Ship GLTF model + engine plumes
│   ├── Booster.jsx       Booster GLTF model + LOD sprite fallback
│   ├── ExhaustPlume.jsx  InstancedMesh multi-layer engine plumes
│   ├── HUD.jsx           Telemetry dashboard + scenario selector
│   ├── FPSControls.jsx   Camera system (ground/orbit modes)
│   ├── SunLight.jsx      Geographically-accurate directional sun
│   ├── TiledEarth.jsx    8-tile Earth with LOD texture streaming
│   └── modelUtils.js     Shared GLTF initialization utilities
├── App.jsx               Root component, phase state machine
├── main.jsx              Entry point
└── index.css             Global styles
tests/
├── atmosphere.test.js    Atmosphere model verification
├── orbital.test.js       Orbital mechanics + energy conservation
├── massModel.test.js     Mass properties + parallel axis theorem
├── engines.test.js       Engine thrust, gimbal, mass flow
├── rotational.test.js    Angular dynamics + angle wrapping
├── control.test.js       Attitude control + actuator limits
├── scenarios.test.js     Scenario loading + state overrides
└── integration.test.js   Full ascent profile validation
```

### Physics Engine

The simulation runs in **2D polar coordinates** centered on Earth. This naturally handles orbital mechanics (Keplerian motion, gravity gradient, centripetal acceleration) while keeping the math tractable.

**Coordinate system:**
- `r` — distance from Earth center (meters)
- `θ` — angle in the orbital plane (radians)
- `vr` — radial velocity (m/s, positive = away from Earth)
- `vt` — tangential velocity (m/s, positive = prograde)
- `angle` — body orientation (radians, 0 = radial up)

**Integration:** Symplectic Euler with configurable sub-stepping (4+ steps per frame). Energy conservation verified by tests to <1% error over 100s of coasting flight.

**State machine phases:**
```
idle → launching → staged → orbit
                        ↘ fuel_exhausted
       launching → falling → landed
```

Booster return phases (independent):
```
coast → boostback → descent → landing → hover → splashed
```

### Rendering

The 3D scene uses a **floating origin** pattern: the tracked vehicle stays at world (0,0,0) and the Earth/launchpad move around it. This prevents float32 precision loss at orbital altitudes. A **logarithmic depth buffer** handles the near/far range from 0.5m to 20,000 km.

Earth is rendered as 8 tile segments with view-frustum culling based on camera direction. Textures are loaded/unloaded dynamically. An optional high-resolution overlay covers the Boca Chica launch area.

## Testing

```bash
npm test          # run all tests
npm run test:watch  # watch mode
```

78 tests across 8 test files covering atmosphere, orbital mechanics, mass model, engines, rotational dynamics, attitude control, scenarios, and full integration.

## Tech Stack

- **React 19** + **Vite 7** — build and dev server
- **Three.js r183** via **@react-three/fiber** + **@react-three/drei** — 3D rendering
- **Tailwind CSS 4** — utility styles
- **Vitest** — unit and integration testing

## Data Sources

Vehicle parameters sourced from public SpaceX data and community analysis:
- Booster: 200t dry, 3,400t propellant, 33 Raptor 2 (230 tf each), Isp 347s
- Ship: 100t dry, 1,200t propellant, 3 SL + 3 Vac Raptor, Isp 347/380s
- Launch site: Starbase, Boca Chica TX (25.996°N, 97.154°W)
