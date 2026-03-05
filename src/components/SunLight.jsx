import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EARTH_RADIUS } from '../physics/index.js'

// Launch site: SpaceX Starbase, Boca Chica TX
const LAUNCH_LAT = 25.996 * (Math.PI / 180)
const LAUNCH_LON = -97.154 * (Math.PI / 180)

// Compute rotation quaternion to place Boca Chica at Y+
// (same as TiledEarth uses)
function getLaunchRotation() {
  const x = -Math.cos(LAUNCH_LAT) * Math.sin(LAUNCH_LON)
  const y = Math.sin(LAUNCH_LAT)
  const z = -Math.cos(LAUNCH_LAT) * Math.cos(LAUNCH_LON)
  const launchDir = new THREE.Vector3(x, y, z).normalize()
  return new THREE.Quaternion().setFromUnitVectors(launchDir, new THREE.Vector3(0, 1, 0))
}

/**
 * Compute sun direction in geocentric coordinates for a given UTC hour on equinox.
 * Then rotate into the scene frame (where Boca Chica is at Y+).
 *
 * On equinox, solar declination ≈ 0°, so the sub-solar point is on the equator.
 * Sub-solar longitude = (12 - utcHour) * 15°
 * Sun direction from Earth center: lat=declination, lon=sub-solar longitude
 */
function computeSunDirection(utcHour, declination = 0) {
  const subSolarLon = (12 - utcHour) * 15 * (Math.PI / 180)
  const decRad = declination * (Math.PI / 180)

  // Sun direction in standard geocentric (Y=north pole, -Z=prime meridian)
  const sunGeo = new THREE.Vector3(
    -Math.cos(decRad) * Math.sin(subSolarLon),
    Math.sin(decRad),
    -Math.cos(decRad) * Math.cos(subSolarLon)
  ).normalize()

  // Rotate into scene frame
  const rotQuat = getLaunchRotation()
  sunGeo.applyQuaternion(rotQuat)

  return sunGeo
}

/**
 * SunLight — geographically accurate directional sunlight.
 *
 * Props:
 *   utcHour: hour of day in UTC (default 16 = 10 AM CST at Boca Chica)
 *   altitude: current altitude for ambient scaling
 *   worldOffsetRef: floating origin offset from Scene
 */
export default function SunLight({ utcHour = 16, worldOffsetRef }) {
  const sunRef = useRef()
  const targetRef = useRef()
  const ambientRef = useRef()
  const hemiRef = useRef()
  const { camera } = useThree()

  // Sun direction — fixed for the session (no Earth rotation during flight)
  const sunDir = useMemo(() => computeSunDirection(utcHour), [utcHour])

  const SUN_DIST = 1e7

  useFrame(() => {
    if (!sunRef.current || !targetRef.current) return

    sunRef.current.position.set(
      sunDir.x * SUN_DIST,
      sunDir.y * SUN_DIST,
      sunDir.z * SUN_DIST,
    )
    targetRef.current.position.set(0, 0, 0)
    sunRef.current.shadow.camera.updateProjectionMatrix()

    // Compute camera altitude for lighting
    const earthCenter = new THREE.Vector3(0, -EARTH_RADIUS, 0)
    if (worldOffsetRef?.current) earthCenter.add(worldOffsetRef.current)
    const camAlt = camera.position.distanceTo(earthCenter) - EARTH_RADIUS

    // Ambient: full at ground (sky scatter), drops off in space
    const ambientI = camAlt < 10000
      ? 0.4
      : 0.4 * (1 - THREE.MathUtils.smoothstep(camAlt, 10000, 100000)) + 0.05
    if (ambientRef.current) ambientRef.current.intensity = ambientI

    // Hemisphere: sky scatter, fades in space
    const hemiI = camAlt < 10000
      ? 0.5
      : 0.5 * (1 - THREE.MathUtils.smoothstep(camAlt, 10000, 100000))
    if (hemiRef.current) hemiRef.current.intensity = hemiI
  })

  return (
    <>
      {/* Ambient fill — reduced in space */}
      <ambientLight ref={ambientRef} intensity={0.4} />

      {/* Main sun — warm directional light */}
      <directionalLight
        ref={sunRef}
        intensity={3}
        color="#fff5e6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={2000}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={300}
        shadow-camera-bottom={-100}
      >
        {/* Target object for the directional light */}
        <object3D ref={targetRef} />
      </directionalLight>

      {/* Hemisphere light — sky scatter, fades in space */}
      <hemisphereLight
        ref={hemiRef}
        args={['#87CEEB', '#3a5f2f', 0.5]}
      />
    </>
  )
}
