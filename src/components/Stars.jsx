import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EARTH_RADIUS } from '../physics/index.js'

const STAR_COUNT = 4000
const STAR_RADIUS = 8_000_000 // far enough to always surround camera

export default function Stars({ worldOffsetRef }) {
  const pointsRef = useRef()
  const { camera } = useThree()
  const _earthCenter = useMemo(() => new THREE.Vector3(), [])

  const { positions, sizes } = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3)
    const sz = new Float32Array(STAR_COUNT)

    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform distribution on sphere
      const theta = Math.random() * 2 * Math.PI
      const phi = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = STAR_RADIUS * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = STAR_RADIUS * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = STAR_RADIUS * Math.cos(phi)

      // Vary sizes: most small, a few bright
      sz[i] = 0.5 + Math.pow(Math.random(), 3) * 2.5
    }
    return { positions: pos, sizes: sz }
  }, [])

  useFrame(() => {
    if (!pointsRef.current) return

    // Keep star sphere centered on camera so they never clip
    pointsRef.current.position.copy(camera.position)

    // Fade in based on camera altitude
    _earthCenter.set(0, -EARTH_RADIUS, 0)
    if (worldOffsetRef?.current) _earthCenter.add(worldOffsetRef.current)
    const camAlt = camera.position.distanceTo(_earthCenter) - EARTH_RADIUS
    const opacity = THREE.MathUtils.smoothstep(camAlt, 15000, 80000)
    pointsRef.current.material.opacity = opacity
    pointsRef.current.visible = opacity > 0.01
  })

  return (
    <points ref={pointsRef} frustumCulled={false} renderOrder={-10}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={STAR_COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-size" array={sizes} count={STAR_COUNT} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uPixelRatio: { value: 1 },
        }}
        vertexShader={`
          attribute float size;
          varying float vBrightness;
          uniform float uPixelRatio;
          void main() {
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPos;
            // Constant screen-space size
            gl_PointSize = size * uPixelRatio * 2.0;
            // Slight brightness variation from size
            vBrightness = 0.4 + 0.6 * (size / 3.0);
          }
        `}
        fragmentShader={`
          uniform float opacity;
          varying float vBrightness;
          void main() {
            // Soft circular point
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float falloff = 1.0 - smoothstep(0.0, 1.0, d);
            // Slight warm/cool color variation
            vec3 color = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.95, 0.85), vBrightness);
            gl_FragColor = vec4(color * vBrightness, falloff * opacity);
          }
        `}
      />
    </points>
  )
}
