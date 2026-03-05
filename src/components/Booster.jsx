import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import EnginePlumes, { computeEnginePositions, BOOSTER_RINGS } from './ExhaustPlume'
import { EARTH_RADIUS } from '../physics/index.js'
import { initModel } from './modelUtils'

export default function Booster({ simRef, groupRef }) {
  const { scene } = useGLTF('/models/starship-full.glb', true)
  const innerRef = useRef()
  const modelRef = useRef()
  const spriteRef = useRef()
  const gridFinsRef = useRef([])
  const [modelReady, setModelReady] = useState(false)
  const [boosterPhase, setBoosterPhase] = useState('attached')

  const clonedScene = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    const root = innerRef.current
    if (!root) return

    const { gridFins, boosterNode, box2 } = initModel(root)

    // Hide everything, then show only the booster subtree
    root.traverse((child) => {
      if (child.isMesh) child.visible = false
    })

    if (boosterNode) {
      boosterNode.visible = true
      boosterNode.traverse((child) => { child.visible = true })

      let ancestor = boosterNode.parent
      while (ancestor && ancestor !== root) {
        ancestor.visible = true
        ancestor = ancestor.parent
      }

      root.updateMatrixWorld(true)
      const bBox = new THREE.Box3().setFromObject(boosterNode)
      root.position.y = -bBox.min.y
    } else {
      root.position.y = -box2.min.y
    }

    gridFinsRef.current = gridFins
    setModelReady(true)
  }, [clonedScene])

  const _finQuat = useMemo(() => new THREE.Quaternion(), [])
  const _finAxis = useMemo(() => new THREE.Vector3(1, 0, 0), [])

  useFrame(() => {
    if (!groupRef?.current) return
    const sim = simRef.current
    const phase = sim.staged ? sim.boosterPhase : 'attached'

    if (phase === 'attached' || phase === 'splashed') {
      groupRef.current.visible = false
      return
    }

    if (phase !== boosterPhase) {
      setBoosterPhase(phase)
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

    const finDeflection = sim.boosterFinDeflection || 0
    for (let i = 0; i < gridFinsRef.current.length; i++) {
      const fin = gridFinsRef.current[i]
      const orig = fin.userData.origQuat
      if (!orig) continue
      _finQuat.setFromAxisAngle(_finAxis, finDeflection)
      fin.quaternion.copy(orig).multiply(_finQuat)
    }
  })

  const engines = useMemo(() => {
    if (boosterPhase === 'boostback') {
      return computeEnginePositions(BOOSTER_RINGS.boostback, 4.5)
    }
    if (boosterPhase === 'landing' || boosterPhase === 'hover') {
      return computeEnginePositions(BOOSTER_RINGS.landing, 4.5)
    }
    return []
  }, [boosterPhase, modelReady])

  const sim = simRef.current
  const enginesOn = boosterPhase === 'boostback' || boosterPhase === 'landing' || boosterPhase === 'hover'
  const altitude = sim.staged ? (sim.boosterR - EARTH_RADIUS) : sim.altitude

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
