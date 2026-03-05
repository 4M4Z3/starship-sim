import * as THREE from 'three'

/**
 * Shared model initialization: scale to target height, center horizontally,
 * configure materials and shadows on all meshes.
 *
 * @param {THREE.Object3D} root - The root object (scene clone)
 * @param {Object} options
 * @param {number}  options.targetHeight   - Desired height in scene units (default 120)
 * @param {boolean} options.doubleSide     - Use DoubleSide materials (default true)
 * @param {number}  options.envMapIntensity - Environment map intensity (default 0.8)
 * @returns {{ gridFins: THREE.Object3D[], boosterNode: THREE.Object3D|null }}
 */
export function initModel(root, {
  targetHeight = 120,
  doubleSide = true,
  envMapIntensity = 0.8,
} = {}) {
  const gridFins = []
  let boosterNode = null

  root.traverse((child) => {
    if (child.isMesh) {
      child.frustumCulled = false
      child.castShadow = true
      child.receiveShadow = true
      if (child.material) {
        child.material = child.material.clone()
        if (doubleSide) child.material.side = THREE.DoubleSide
        child.material.envMapIntensity = envMapIntensity
      }
    }
    if (child.name?.includes('Gridfin')) {
      gridFins.push(child)
      child.userData.origQuat = child.quaternion.clone()
    }
    if (child.name?.startsWith('Superheavy')) {
      boosterNode = child
    }
  })

  // Scale to target height
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const height = box.max.y - box.min.y
  root.scale.setScalar(targetHeight / height)

  // Center horizontally
  root.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(root)
  root.position.x = -(box2.min.x + box2.max.x) / 2
  root.position.z = -(box2.min.z + box2.max.z) / 2

  // Orient to match physics coordinate system
  root.rotation.y = -Math.PI / 2

  return { gridFins, boosterNode, box2 }
}
