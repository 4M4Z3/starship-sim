import { useRef, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import TiledEarth from './TiledEarth'
import Rocket from './Rocket'
import Booster from './Booster'
import LaunchPad from './LaunchPad'
import OrbitControls from './FPSControls'
import SunLight from './SunLight'
import { physicsStep, EARTH_RADIUS } from '../physics/index.js'

function SkyFade({ worldOffsetRef }) {
  const { scene, camera } = useThree()
  useFrame(() => {
    if (!scene.background) return
    // Use the camera's actual altitude, not the vehicle's
    const earthCenter = new THREE.Vector3(0, -EARTH_RADIUS, 0)
    if (worldOffsetRef?.current) earthCenter.add(worldOffsetRef.current)
    const camAlt = camera.position.distanceTo(earthCenter) - EARTH_RADIUS
    const t = THREE.MathUtils.smoothstep(camAlt, 20000, 100000)
    scene.background.setRGB(
      THREE.MathUtils.lerp(0.627, 0, t),
      THREE.MathUtils.lerp(0.824, 0, t),
      THREE.MathUtils.lerp(0.941, 0, t),
    )
  })
  return null
}

// Compute the east direction at Boca Chica on the rotated Earth.
// The Earth is rotated so Boca Chica is at Y+. We need the local east
// direction in that rotated frame so the orbital plane goes east.
const LAUNCH_LAT = 25.99622065480988 * (Math.PI / 180)
const LAUNCH_LON = -97.15443150451574 * (Math.PI / 180)

// Rotation quaternion: same as TiledEarth — maps Boca Chica radial to (0,1,0)
const _launchDir = new THREE.Vector3(
  -Math.cos(LAUNCH_LAT) * Math.sin(LAUNCH_LON),
  Math.sin(LAUNCH_LAT),
  -Math.cos(LAUNCH_LAT) * Math.cos(LAUNCH_LON)
).normalize()
const _rotQ = new THREE.Quaternion().setFromUnitVectors(_launchDir, new THREE.Vector3(0, 1, 0))

// East unit vector at launch site (∂position/∂lon, normalized) = (-cos(lon), 0, sin(lon))
const EAST = new THREE.Vector3(-Math.cos(LAUNCH_LON), 0, Math.sin(LAUNCH_LON))
  .applyQuaternion(_rotQ).normalize()
// Orbit-plane normal = up × east (used for rotation axis)
const ORBIT_NORMAL = new THREE.Vector3(0, 1, 0).cross(EAST).normalize()

// Convert polar (r, θ) to 3D world position.
// The orbital plane contains "up" (Y) and "east" at the launch site.
// Earth center is at (0, -EARTH_RADIUS, 0).
function polarTo3D(r, theta) {
  const radial = r * Math.cos(theta)
  const tangential = r * Math.sin(theta)
  return {
    x: tangential * EAST.x,
    y: radial - EARTH_RADIUS,
    z: tangential * EAST.z,
  }
}

export default function Scene({ phase, simRef, timeScaleRef, onLanded, onFuelExhausted, onStaged, onOrbit, cameraTarget = 'ship' }) {
  const rocketGroupRef = useRef()
  const boosterGroupRef = useRef()
  const worldGroupRef = useRef()
  // Store the world offset so OrbitControls can compute correct "up"
  const worldOffsetRef = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const timeScale = timeScaleRef?.current ?? 1
    const dt = Math.min(delta, 0.05) * timeScale
    const subSteps = Math.max(4, Math.ceil(timeScale * 2))
    const subDt = dt / subSteps

    let currentPhase = phase

    for (let i = 0; i < subSteps; i++) {
      if (currentPhase === 'idle' || currentPhase === 'landed') break

      const result = physicsStep(simRef.current, subDt, currentPhase)
      simRef.current = result

      if (result.phase === 'staged' && currentPhase === 'launching') {
        currentPhase = 'staged'
        if (onStaged) onStaged()
      }
      if (result.phase === 'orbit' && currentPhase === 'staged') {
        currentPhase = 'orbit'
        if (onOrbit) onOrbit()
      }
      if (result.phase === 'fuel_exhausted' && (currentPhase === 'launching' || currentPhase === 'staged')) {
        currentPhase = 'fuel_exhausted'
        onFuelExhausted()
      }
      if (result.phase === 'landed') {
        onLanded()
        break
      }
    }

    if (phase === 'idle') {
      simRef.current.r = EARTH_RADIUS
      simRef.current.theta = 0
      simRef.current.vr = 0
      simRef.current.vt = 0
      simRef.current.altitude = 0
      simRef.current.heading = 0
    }

    // === Floating origin: tracked object stays at (0,0,0), world moves around it ===
    const sim = simRef.current
    const rocketWorldPos = polarTo3D(sim.r, sim.theta)
    const boosterWorldPos = sim.staged
      ? polarTo3D(sim.boosterR, sim.boosterTheta)
      : rocketWorldPos

    // Decide which object is at the origin
    // Ground mode tracks booster after staging (like real launch cameras)
    const followBooster = (cameraTarget === 'booster' || (cameraTarget === 'ground' && sim.staged)) && sim.staged
    const originPos = followBooster ? boosterWorldPos : rocketWorldPos

    // Move world opposite to tracked object
    if (worldGroupRef.current) {
      worldGroupRef.current.position.set(-originPos.x, -originPos.y, -originPos.z)
    }
    worldOffsetRef.current.set(-originPos.x, -originPos.y, -originPos.z)

    // Ship position (at origin if tracked, offset if not)
    if (rocketGroupRef.current) {
      rocketGroupRef.current.position.set(
        rocketWorldPos.x - originPos.x,
        rocketWorldPos.y - originPos.y,
        rocketWorldPos.z - originPos.z
      )
      // Rotation: body angle around the orbit-plane normal
      rocketGroupRef.current.quaternion.setFromAxisAngle(ORBIT_NORMAL, sim.theta + sim.angle)
    }

    // Booster position and attitude (from physics rotational dynamics)
    if (sim.staged && boosterGroupRef.current) {
      boosterGroupRef.current.position.set(
        boosterWorldPos.x - originPos.x,
        boosterWorldPos.y - originPos.y,
        boosterWorldPos.z - originPos.z
      )
      boosterGroupRef.current.quaternion.setFromAxisAngle(ORBIT_NORMAL, sim.boosterTheta + sim.boosterAngle)
    }
  })

  return (
    <>
      <SkyFade worldOffsetRef={worldOffsetRef} />
      <SunLight worldOffsetRef={worldOffsetRef} />
      <OrbitControls
        rocketRef={rocketGroupRef}
        boosterRef={boosterGroupRef}
        worldOffsetRef={worldOffsetRef}
        cameraMode={cameraTarget}
        simRef={simRef}
      />
      <Environment preset="city" background={false} />

      {/* World group: moves opposite to rocket for floating origin */}
      <group ref={worldGroupRef}>
        <TiledEarth />
        <LaunchPad />
      </group>

      {/* Ship at origin */}
      <Suspense fallback={null}>
        <Rocket
          simRef={simRef}
          groupRef={rocketGroupRef}
        />
      </Suspense>

      {/* Booster: independent floating-origin positioning after separation */}
      <Suspense fallback={null}>
        <Booster
          simRef={simRef}
          groupRef={boosterGroupRef}
        />
      </Suspense>
    </>
  )
}
