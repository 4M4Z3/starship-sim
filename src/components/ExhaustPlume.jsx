import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Compute engine nozzle positions for a vehicle.
 * Returns [{x, z, scale}, ...] in model-space coordinates.
 *
 * rings: [{ count, radius }] where radius is in meters from center
 * modelBaseRadius: half-width of model bounding box at base (model units)
 * physicsBaseRadius: real-world half-diameter (4.5m for both vehicles)
 */
export function computeEnginePositions(rings, modelBaseRadius, physicsBaseRadius = 4.5) {
  const positions = []
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2
      const r = (ring.radius / physicsBaseRadius) * modelBaseRadius
      positions.push({
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r,
        scale: ring.scale || 1.0,
      })
    }
  }
  return positions
}

// Booster engine layout (Super Heavy — 33 Raptor engines)
// Radii in meters from center for a 9m diameter (4.5m radius) vehicle
export const BOOSTER_RINGS = {
  all: [
    { count: 3, radius: 0.12, scale: 1.0 },
    { count: 10, radius: 0.4, scale: 0.8 },
    { count: 20, radius: 0.75, scale: 0.6 },
  ],
  boostback: [
    { count: 3, radius: 0.12, scale: 1.0 },
    { count: 10, radius: 0.4, scale: 0.8 },
  ],
  landing: [
    { count: 3, radius: 0.12, scale: 1.0 },
  ],
}

export const SHIP_RINGS = [
  { count: 3, radius: 0.18, scale: 1.0 },
  { count: 3, radius: 0.42, scale: 0.85 },
]

// Plume visual layers
const LAYER_DEFS = [
  { rScale: 2.0,  hScale: 45.0, color: '#cceeff', opacity: 0.95, additive: true },   // hot core
  { rScale: 3.2,  hScale: 65.0, color: '#ffcc44', opacity: 0.6,  additive: true },   // main flame
  { rScale: 4.5,  hScale: 85.0, color: '#ff6600', opacity: 0.25, additive: false },  // outer glow
]

const _matrix = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()

const coneGeo = new THREE.ConeGeometry(1, 1, 10)

/**
 * EnginePlumes — renders per-engine exhaust plumes using InstancedMesh.
 *
 * Props:
 *   engines    — array of {x, z, scale} in model coordinates
 *   simRef     — ref to sim state (reads enginesOn, thrustForce, altitude each frame)
 *   isVisible  — function(sim) => boolean, checked each frame
 *   getThrottle — function(sim) => 0..1, checked each frame
 *   getAltitude — function(sim) => meters, checked each frame
 *   baseScale  — overall size multiplier (default 1)
 */
export default function EnginePlumes({ engines, simRef, isVisible, getThrottle, getAltitude, baseScale = 1, yOffset = -2 }) {
  const layerRefs = useRef([])
  const lightRef = useRef()

  const count = engines.length

  // Create materials once
  const materials = useMemo(() =>
    LAYER_DEFS.map(l => new THREE.MeshBasicMaterial({
      color: l.color,
      transparent: true,
      opacity: l.opacity,
      blending: l.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }))
  , [])

  useFrame(() => {
    if (count === 0) return

    const sim = simRef?.current
    const visible = sim ? isVisible(sim) : false
    const throttle = sim ? getThrottle(sim) : 0
    const altitude = sim ? getAltitude(sim) : 0

    // Hide plumes by zeroing scale when not visible
    if (!visible || throttle === 0) {
      for (let li = 0; li < LAYER_DEFS.length; li++) {
        const mesh = layerRefs.current[li]
        if (!mesh) continue
        for (let ei = 0; ei < count; ei++) {
          _scale.set(0, 0, 0)
          _matrix.compose(_pos, _quat, _scale)
          mesh.setMatrixAt(ei, _matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
        mesh.material.opacity = 0
      }
      if (lightRef.current) lightRef.current.intensity = 0
      return
    }

    const t = performance.now() * 0.001
    const vacFactor = Math.min(1, Math.max(0, (altitude - 20000) / 60000))
    const radialExpand = 1.0 + vacFactor * 2.5
    const lengthExpand = 1.0 + vacFactor * 1.5

    for (let li = 0; li < LAYER_DEFS.length; li++) {
      const mesh = layerRefs.current[li]
      if (!mesh) continue
      const layer = LAYER_DEFS[li]

      for (let ei = 0; ei < count; ei++) {
        const eng = engines[ei]
        // Per-engine phase offset so plumes flicker independently
        const phase = ei * 1.37
        const flicker = 1.0
          + 0.05 * Math.sin(t * 47 + phase)
          + 0.03 * Math.sin(t * 73 + phase * 0.7)
          + 0.02 * Math.sin(t * 113 + phase * 1.3)

        const sf = throttle * flicker * eng.scale * baseScale
        const rx = layer.rScale * sf * radialExpand
        const hy = layer.hScale * sf * lengthExpand

        _pos.set(eng.x, -hy * 0.5 - 1, eng.z)
        _scale.set(rx, hy, rx)
        _matrix.compose(_pos, _quat, _scale)
        mesh.setMatrixAt(ei, _matrix)
      }
      mesh.instanceMatrix.needsUpdate = true

      // Flicker opacity at layer level for performance
      const opFlicker = 0.85 + 0.15 * Math.sin(t * 31 + li * 2.1)
      mesh.material.opacity = layer.opacity * opFlicker * throttle
    }

    if (lightRef.current) {
      const baseIntensity = count > 10 ? 8 : 3
      const flicker = 1.0 + 0.04 * Math.sin(t * 47) + 0.03 * Math.sin(t * 73)
      lightRef.current.intensity = baseIntensity * throttle * flicker
      lightRef.current.distance = count > 10 ? 500 : 200
    }
  })

  if (count === 0) return null

  return (
    <group position={[0, yOffset, 0]}>
      {LAYER_DEFS.map((layer, li) => (
        <instancedMesh
          key={li}
          ref={el => { layerRefs.current[li] = el }}
          args={[coneGeo, materials[li], count]}
          frustumCulled={false}
          renderOrder={layer.additive ? 10 : 5}
        />
      ))}
      <pointLight
        ref={lightRef}
        position={[0, -5, 0]}
        color="#ffaa44"
        intensity={8}
        distance={500}
        decay={2}
      />
    </group>
  )
}
