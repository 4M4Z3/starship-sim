import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import EnginePlumes, { computeEnginePositions, BOOSTER_RINGS, SHIP_RINGS } from './ExhaustPlume'
import { initModel } from './modelUtils'

export default function Rocket({ simRef, groupRef }) {
  const { scene } = useGLTF('/models/starship-full.glb', true)
  const clonedScene = useMemo(() => scene.clone(true), [scene])
  const innerRef = useRef()
  const partsRef = useRef({ gridFins: [], boosterNode: null })
  const baseRadiusRef = useRef(6)
  const shipBaseYRef = useRef(70)
  const [modelReady, setModelReady] = useState(false)
  const [separated, setSeparated] = useState(false)

  useEffect(() => {
    const root = innerRef.current
    if (!root) return

    const { gridFins, boosterNode, box2 } = initModel(root)

    // Anchor at ground level
    root.position.y = -box2.min.y
    baseRadiusRef.current = 4.5

    if (boosterNode) {
      root.updateMatrixWorld(true)
      const bBox = new THREE.Box3().setFromObject(boosterNode)
      shipBaseYRef.current = bBox.max.y
    }

    partsRef.current = { gridFins, boosterNode }
    setModelReady(true)
  }, [])

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

    if (s.staged !== separated) {
      setSeparated(s.staged)
    }
  })

  const engines = useMemo(() => {
    const r = baseRadiusRef.current
    if (separated) {
      return computeEnginePositions(SHIP_RINGS, r)
    }
    return computeEnginePositions(BOOSTER_RINGS.all, r)
  }, [separated, modelReady])

  const sim = simRef.current
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
