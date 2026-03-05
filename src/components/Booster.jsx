import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import EnginePlumes, { computeEnginePositions, BOOSTER_RINGS } from './ExhaustPlume'
import { EARTH_RADIUS } from '../physics/index.js'

export default function Booster({ simRef, groupRef }) {
  const { scene } = useGLTF('/models/starship-full.glb', true)
  const innerRef = useRef()
  const modelRef = useRef()
  const spriteRef = useRef()
  const gridFinsRef = useRef([])
  const [modelReady, setModelReady] = useState(false)

  // Re-render every frame so props to EnginePlumes stay current
  const [, setTick] = useState(0)
  useFrame(() => {
    setTick(t => t + 1)
  })

  // Clone the FULL scene (same as Rocket) — preserves all transforms.
  // We'll hide non-booster parts instead of extracting just the booster node.
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    const root = innerRef.current
    if (!root) return

    let boosterNode = null
    const gridFins = []

    root.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material = child.material.clone()
          child.material.side = THREE.DoubleSide
          child.material.envMapIntensity = 0.8
        }
      }
      if (child.name && child.name.startsWith('Superheavy')) {
        boosterNode = child
      }
      if (child.name && child.name.includes('Gridfin')) {
        gridFins.push(child)
        child.userData.origQuat = child.quaternion.clone()
      }
    })

    // Scale to 120m — exact same as Rocket component
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const height = box.max.y - box.min.y
    root.scale.setScalar(120 / height)

    root.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(root)
    root.position.x = -(box2.min.x + box2.max.x) / 2
    root.position.z = -(box2.min.z + box2.max.z) / 2

    // Hide everything except the booster
    root.traverse((child) => {
      if (child === root) return
      // Hide top-level children that aren't the booster
      if (child.parent === root || child.parent?.parent === root) {
        if (child.name && child.name.startsWith('Superheavy')) {
          child.visible = true
        }
      }
    })

    // Position so booster base is at y=0
    if (boosterNode) {
      root.updateMatrixWorld(true)
      const bBox = new THREE.Box3().setFromObject(boosterNode)
      root.position.y = -bBox.min.y

      // Hide non-booster top-level siblings
      for (const child of root.children) {
        if (child === boosterNode) {
          child.visible = true
        } else if (!child.name?.startsWith('Superheavy')) {
          // Check if this subtree contains the booster
          let containsBooster = false
          child.traverse((c) => {
            if (c.name?.startsWith('Superheavy')) containsBooster = true
          })
          if (!containsBooster) {
            child.visible = false
          }
        }
      }
    } else {
      root.position.y = -box2.min.y
    }

    // Apply same Y rotation as Rocket
    root.rotation.y = -Math.PI / 2

    gridFinsRef.current = gridFins
    setModelReady(true)
  }, [clonedScene])

  const tempQuat = useMemo(() => new THREE.Quaternion(), [])

  // Read sim state every frame
  const sim = simRef.current
  const boosterPhase = sim.staged ? sim.boosterPhase : 'attached'
  const finDeflection = sim.boosterFinDeflection || 0
  const altitude = sim.staged ? (sim.boosterR - EARTH_RADIUS) : sim.altitude

  const engines = useMemo(() => {
    if (boosterPhase === 'boostback') {
      return computeEnginePositions(BOOSTER_RINGS.boostback, 4.5)
    }
    if (boosterPhase === 'landing' || boosterPhase === 'hover') {
      return computeEnginePositions(BOOSTER_RINGS.landing, 4.5)
    }
    return []
  }, [boosterPhase, modelReady])

  const enginesOn = boosterPhase === 'boostback' || boosterPhase === 'landing' || boosterPhase === 'hover'

  useFrame(() => {
    if (!groupRef?.current) return

    if (boosterPhase === 'attached' || boosterPhase === 'splashed') {
      groupRef.current.visible = false
      return
    }

    const dist = groupRef.current.position.length()

    if (modelRef.current && spriteRef.current) {
      if (dist > 500_000) {
        groupRef.current.visible = false
      } else if (dist > 10_000) {
        groupRef.current.visible = true
        modelRef.current.visible = false
        spriteRef.current.visible = true
        spriteRef.current.scale.setScalar(Math.max(50, dist * 0.003))
      } else {
        groupRef.current.visible = true
        modelRef.current.visible = true
        spriteRef.current.visible = false
      }
    }

    for (let i = 0; i < gridFinsRef.current.length; i++) {
      const fin = gridFinsRef.current[i]
      const orig = fin.userData.origQuat
      if (!orig) continue
      tempQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), finDeflection)
      fin.quaternion.copy(orig).multiply(tempQuat)
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={modelRef}>
        <group ref={innerRef}>
          <primitive object={clonedScene} />
        </group>
        <EnginePlumes
          engines={engines}
          visible={enginesOn}
          throttle={1}
          altitude={altitude}
          baseScale={boosterPhase === 'landing' || boosterPhase === 'hover' ? 0.6 : 0.85}
        />
      </group>

      <sprite ref={spriteRef} visible={false}>
        <spriteMaterial color="#ff6600" transparent opacity={0.8} />
      </sprite>
    </group>
  )
}

useGLTF.preload('/models/starship-full.glb', true)
