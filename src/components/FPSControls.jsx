import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EARTH_RADIUS } from '../physics/index.js'

const MOUSE_SENSITIVITY = 0.005
const ZOOM_SPEED = 0.1
const MIN_DISTANCE = 50
const BASE_MAX_DISTANCE = 2000

// Ground camera: fixed position near launchpad, telephoto lens tracking the rocket
const GROUND_CAM_OFFSET = new THREE.Vector3(-400, 5, 800)
const ORBIT_FOV = 50

// Known vehicle dimensions (meters)
const FULL_STACK_HEIGHT = 120
const FULL_STACK_CENTER = 20    // near base of rocket
const SHIP_HEIGHT = 50
const SHIP_CENTER = 95          // middle of visible ship portion (~70..120)
const BOOSTER_HEIGHT = 71
const BOOSTER_CENTER = 15       // near base of booster

// How much of the screen height the rocket should fill (0.0–1.0)
const FILL_FRACTION = 2.0

export default function OrbitControls({ rocketRef, boosterRef, worldOffsetRef, cameraMode, simRef }) {
  const { camera, gl, scene } = useThree()
  const theta = useRef(Math.PI * 0.25)
  const phi = useRef(Math.PI * 0.35)
  const distance = useRef(400)
  const isDragging = useRef(false)
  const prevMode = useRef(cameraMode)
  const currentFov = useRef(10) // start tight for ground camera

  // Fog that matches sky color for ground camera atmospheric haze
  const fogRef = useMemo(() => new THREE.FogExp2('#a0d2f0', 0), [])

  // Reset camera framing when mode switches
  useEffect(() => {
    if (prevMode.current !== cameraMode) {
      if (cameraMode !== 'ground') {
        distance.current = 400
        theta.current = Math.PI * 0.25
        phi.current = Math.PI * 0.35
        currentFov.current = ORBIT_FOV
      }
      prevMode.current = cameraMode
    }
  }, [cameraMode])

  useEffect(() => {
    const canvas = gl.domElement

    const onMouseDown = (e) => {
      if (e.button === 0 || e.button === 2) isDragging.current = true
    }
    const onMouseUp = () => {
      isDragging.current = false
    }
    const onMouseMove = (e) => {
      if (!isDragging.current) return
      if (cameraMode === 'ground') return
      theta.current -= e.movementX * MOUSE_SENSITIVITY
      phi.current = Math.max(0.1, phi.current - e.movementY * MOUSE_SENSITIVITY)
    }
    const onWheel = (e) => {
      e.preventDefault()
      if (cameraMode === 'ground') return
      distance.current *= 1 + e.deltaY * ZOOM_SPEED * 0.01
      distance.current = Math.max(MIN_DISTANCE, distance.current)
    }
    const onContextMenu = (e) => e.preventDefault()

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [gl, cameraMode])

  useFrame(() => {
    const separated = simRef?.current?.staged || false
    const followBooster = (cameraMode === 'booster' || (cameraMode === 'ground' && separated)) && separated
    const targetRef = followBooster ? boosterRef : rocketRef

    // FOV: set directly for ground mode (telephoto), interpolate for orbit mode
    if (cameraMode === 'ground') {
      camera.fov = currentFov.current
    } else {
      camera.fov += (ORBIT_FOV - camera.fov) * 0.1
    }
    camera.updateProjectionMatrix()

    // Earth center in shifted coordinates
    const earthCenter = new THREE.Vector3(0, -EARTH_RADIUS, 0)
    if (worldOffsetRef?.current) {
      earthCenter.add(worldOffsetRef.current)
    }

    if (cameraMode === 'ground') {
      // Ground camera: fixed near launchpad, auto-tracks rocket
      const padPos = worldOffsetRef?.current
        ? new THREE.Vector3().copy(worldOffsetRef.current)
        : new THREE.Vector3()

      camera.position.set(
        padPos.x + GROUND_CAM_OFFSET.x,
        padPos.y + GROUND_CAM_OFFSET.y,
        padPos.z + GROUND_CAM_OFFSET.z,
      )

      const rocketPos = new THREE.Vector3()
      if (targetRef?.current) {
        rocketPos.copy(targetRef.current.position)
        const up = new THREE.Vector3(0, 1, 0)
        up.applyQuaternion(targetRef.current.quaternion)
        const centerH = separated ? BOOSTER_CENTER : FULL_STACK_CENTER
        rocketPos.addScaledVector(up, centerH)
      }

      // Auto-zoom FOV: compute the FOV that makes the rocket fill FILL_FRACTION of the screen
      const distToRocket = camera.position.distanceTo(rocketPos)
      const vehicleHeight = separated ? BOOSTER_HEIGHT : FULL_STACK_HEIGHT
      const angularSizeDeg = 2 * Math.atan(vehicleHeight / (2 * distToRocket)) * (180 / Math.PI)
      currentFov.current = Math.max(0.5, Math.min(50, angularSizeDeg / FILL_FRACTION))

      const upDir = new THREE.Vector3().subVectors(camera.position, earthCenter).normalize()
      camera.up.copy(upDir)
      camera.lookAt(rocketPos)

      // Atmospheric haze — match sky color so rocket fades into blue like real footage
      // Sync fog color with current background
      if (scene.background) {
        fogRef.color.copy(scene.background)
      }
      const fogDensity = distToRocket > 8000
        ? Math.min(0.00008, 0.0000005 * (distToRocket - 8000))
        : 0
      scene.fog = fogDensity > 0 ? fogRef : null
      fogRef.density = fogDensity

    } else {
      // Orbit mode — no fog
      scene.fog = null

      const target = new THREE.Vector3()
      if (targetRef?.current) {
        target.copy(targetRef.current.position)
        const up = new THREE.Vector3(0, 1, 0)
        up.applyQuaternion(targetRef.current.quaternion)
        let centerH
        if (cameraMode === 'booster') {
          centerH = BOOSTER_CENTER
        } else if (separated) {
          centerH = SHIP_CENTER
        } else {
          centerH = FULL_STACK_CENTER
        }
        target.addScaledVector(up, centerH)
      }

      const altFromCenter = new THREE.Vector3().subVectors(target, earthCenter).length()
      const alt = altFromCenter - EARTH_RADIUS

      const maxDist = alt > 10000 ? Math.min(alt * 5, 50_000_000) : BASE_MAX_DISTANCE
      distance.current = Math.min(distance.current, maxDist)

      const maxPhi = alt > 10000 ? Math.PI * 0.95 : Math.PI * 0.49
      phi.current = Math.min(phi.current, maxPhi)

      const d = distance.current
      const x = d * Math.sin(phi.current) * Math.sin(theta.current)
      const y = d * Math.cos(phi.current)
      const z = d * Math.sin(phi.current) * Math.cos(theta.current)

      camera.position.set(target.x + x, target.y + y, target.z + z)

      const upDir = new THREE.Vector3().subVectors(camera.position, earthCenter).normalize()
      camera.up.copy(upDir)
      camera.lookAt(target)
    }
  })

  return null
}
