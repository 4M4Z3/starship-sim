import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const TOWER_HEIGHT = 146
const TOWER_OFFSET_X = 18

export default function LaunchPad() {
  const { scene } = useGLTF('/models/mechazilla.glb', true)
  const towerScene = useMemo(() => scene.clone(true), [scene])
  const groupRef = useRef()

  useEffect(() => {
    const root = groupRef.current
    if (!root) return

    root.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material = child.material.clone()
          child.material.side = THREE.DoubleSide
        }
      }
    })

    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const height = box.max.y - box.min.y
    root.scale.setScalar(TOWER_HEIGHT / height)

    root.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(root)
    root.position.y = -box2.min.y
  }, [towerScene])

  return (
    <group position={[TOWER_OFFSET_X, 0, 0]}>
      <primitive ref={groupRef} object={towerScene} />
    </group>
  )
}

useGLTF.preload('/models/mechazilla.glb', true)
