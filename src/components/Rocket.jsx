import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import EnginePlumes, { computeEnginePositions, BOOSTER_RINGS, SHIP_RINGS } from './ExhaustPlume'

export default function Rocket({ simRef, groupRef }) {
  const { scene } = useGLTF('/models/starship-full.glb', true)
  const clonedScene = useMemo(() => scene.clone(true), [scene])
  const innerRef = useRef()
  const partsRef = useRef({ gridFins: [], boosterNode: null })
  const baseRadiusRef = useRef(6)
  const shipBaseYRef = useRef(70)
  const [modelReady, setModelReady] = useState(false)

  // Re-render periodically so props to EnginePlumes stay current
  const [, setTick] = useState(0)
  useFrame(() => {
    setTick(t => t + 1)
  })

  useEffect(() => {
    const root = innerRef.current
    if (!root) return

    const gridFins = []
    let boosterNode = null

    root.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material.side = THREE.DoubleSide
          child.material.envMapIntensity = 0.8
        }
      }
      if (child.name && child.name.includes('Gridfin')) {
        gridFins.push(child)
        child.userData.origQuat = child.quaternion.clone()
      }
      if (child.name && child.name.startsWith('Superheavy')) {
        boosterNode = child
      }
    })

    // Scale to 120m
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const height = box.max.y - box.min.y
    root.scale.setScalar(120 / height)

    root.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(root)
    root.position.y = -box2.min.y
    root.position.x = -(box2.min.x + box2.max.x) / 2
    root.position.z = -(box2.min.z + box2.max.z) / 2
    root.rotation.y = -Math.PI / 2

    // Model is at 1:1 meter scale (120m total). Base radius = 4.5m (9m diameter).
    // Don't use bounding box — grid fins etc. make it too wide.
    baseRadiusRef.current = 4.5

    if (boosterNode) {
      root.updateMatrixWorld(true)
      const bBox = new THREE.Box3().setFromObject(boosterNode)
      shipBaseYRef.current = bBox.max.y
    }

    partsRef.current = { gridFins, boosterNode }
    setModelReady(true)
  }, [])

  // Read sim state every frame for model updates
  const sim = simRef.current
  const separated = sim.staged

  useFrame(() => {
    const s = simRef.current
    const { gridFins, boosterNode } = partsRef.current

    for (let i = 0; i < gridFins.length; i++) {
      const fin = gridFins[i]
      const orig = fin.userData.origQuat
      if (!orig) continue
      fin.quaternion.copy(orig)
    }

    if (boosterNode) {
      boosterNode.visible = !s.staged
    }
  })

  const engines = useMemo(() => {
    const r = baseRadiusRef.current
    if (separated) {
      return computeEnginePositions(SHIP_RINGS, r)
    }
    return computeEnginePositions(BOOSTER_RINGS.all, r)
  }, [separated, modelReady])

  const plumeY = separated ? shipBaseYRef.current - 2 : -2

  return (
    <group ref={groupRef}>
      <group>
        <primitive ref={innerRef} object={clonedScene} />
      </group>
      <EnginePlumes
        engines={engines}
        visible={sim.enginesOn}
        throttle={sim.thrustForce > 0 ? 1 : 0}
        altitude={sim.altitude}
        baseScale={separated ? 0.7 : 1.0}
        yOffset={plumeY}
      />
    </group>
  )
}

useGLTF.preload('/models/starship-full.glb', true)
