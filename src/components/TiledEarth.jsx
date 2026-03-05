import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EARTH_RADIUS, LAUNCH_LAT, LAUNCH_LON } from '../physics/index.js'

// Shader patch: detect ocean pixels (blue-dominant) and make them reflective
function patchOceanReflection(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
    // Ocean detection: blue channel dominates, low red+green = water
    vec3 albedo = diffuseColor.rgb;
    float blueRatio = albedo.b / (max(albedo.r + albedo.g + albedo.b, 0.001));
    float darkness = 1.0 - (albedo.r + albedo.g + albedo.b) / 3.0;
    float oceanMask = smoothstep(0.38, 0.50, blueRatio) * smoothstep(0.3, 0.6, darkness);
    roughnessFactor = mix(roughnessFactor, 0.15, oceanMask);
    `
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <metalnessmap_fragment>',
    `#include <metalnessmap_fragment>
    metalnessFactor = mix(metalnessFactor, 0.3, oceanMask);
    `
  )
}

// Tile definitions: 4×2 grid covering the globe
// A1 contains the launch site (Boca Chica) — uses higher tessellation so the
// mesh surface stays close to the true sphere and the launchpad doesn't float.
const TILES = [
  { id: 'A1', lonMin: -180, lonMax: -90, latMin: 0, latMax: 90, segs: 512 },
  { id: 'B1', lonMin: -90,  lonMax: 0,   latMin: 0, latMax: 90 },
  { id: 'C1', lonMin: 0,    lonMax: 90,  latMin: 0, latMax: 90 },
  { id: 'D1', lonMin: 90,   lonMax: 180, latMin: 0, latMax: 90 },
  { id: 'A2', lonMin: -180, lonMax: -90, latMin: -90, latMax: 0 },
  { id: 'B2', lonMin: -90,  lonMax: 0,   latMin: -90, latMax: 0 },
  { id: 'C2', lonMin: 0,    lonMax: 90,  latMin: -90, latMax: 0 },
  { id: 'D2', lonMin: 90,   lonMax: 180, latMin: -90, latMax: 0 },
]

const DEG2RAD = Math.PI / 180
const SEGS = 64
const OVERLAP = 0.05 * DEG2RAD

// High-res overlay around Starbase (covers ~6km × 6km)
// User can drop a satellite screenshot at /textures/tiles/boca_chica.jpg
const OVERLAY = {
  latCenter: 25.9968,
  lonCenter: -97.1544,
  halfSpanDeg: 0.03, // ~3.3km in each direction
  segs: 128, // high detail mesh
}

function createSegmentGeometry(lonMinDeg, lonMaxDeg, latMinDeg, latMaxDeg, segs = SEGS) {
  const lonMin = lonMinDeg * DEG2RAD - OVERLAP
  const lonMax = lonMaxDeg * DEG2RAD + OVERLAP
  const latMin = latMinDeg * DEG2RAD - OVERLAP
  const latMax = latMaxDeg * DEG2RAD + OVERLAP

  const positions = []
  const normals = []
  const uvs = []
  const indices = []

  for (let j = 0; j <= segs; j++) {
    const v = j / segs
    const lat = latMax - v * (latMax - latMin)
    for (let i = 0; i <= segs; i++) {
      const u = i / segs
      const lon = lonMin + u * (lonMax - lonMin)

      const x = -EARTH_RADIUS * Math.cos(lat) * Math.sin(lon)
      const y = EARTH_RADIUS * Math.sin(lat)
      const z = -EARTH_RADIUS * Math.cos(lat) * Math.cos(lon)

      positions.push(x, y, z)
      const len = Math.sqrt(x * x + y * y + z * z)
      normals.push(x / len, y / len, z / len)
      uvs.push(u, 1 - v)
    }
  }

  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i
      const b = a + 1
      const c = a + (segs + 1)
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setIndex(indices)
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return geo
}

function tileCenterNormal(tile) {
  const lat = ((tile.latMin + tile.latMax) / 2) * DEG2RAD
  const lon = ((tile.lonMin + tile.lonMax) / 2) * DEG2RAD
  return new THREE.Vector3(
    -Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.cos(lon)
  ).normalize()
}

const loader = new THREE.TextureLoader()

export default function TiledEarth() {
  const atmosRef = useRef()
  const materialsRef = useRef({})
  const texturesRef = useRef({})
  const loadingRef = useRef({})
  const groupRef = useRef()

  // Rotation: place Boca Chica at Y+ (top of sphere)
  const rotationQuat = useMemo(() => {
    const x = -Math.cos(LAUNCH_LAT) * Math.sin(LAUNCH_LON)
    const y = Math.sin(LAUNCH_LAT)
    const z = -Math.cos(LAUNCH_LAT) * Math.cos(LAUNCH_LON)
    const launchDir = new THREE.Vector3(x, y, z).normalize()
    return new THREE.Quaternion().setFromUnitVectors(launchDir, new THREE.Vector3(0, 1, 0))
  }, [])

  const rotation = useMemo(() => new THREE.Euler().setFromQuaternion(rotationQuat), [rotationQuat])

  // Pre-compute geometries and center normals
  const { geometries, centerNormals } = useMemo(() => {
    const geos = {}
    const normals = {}
    for (const tile of TILES) {
      geos[tile.id] = createSegmentGeometry(tile.lonMin, tile.lonMax, tile.latMin, tile.latMax, tile.segs)
      normals[tile.id] = tileCenterNormal(tile).applyQuaternion(rotationQuat)
    }
    return { geometries: geos, centerNormals: normals }
  }, [rotationQuat])

  // High-res overlay geometry for Boca Chica area
  const overlayGeo = useMemo(() => {
    const { latCenter, lonCenter, halfSpanDeg, segs } = OVERLAY
    return createSegmentGeometry(
      lonCenter - halfSpanDeg, lonCenter + halfSpanDeg,
      latCenter - halfSpanDeg, latCenter + halfSpanDeg,
      segs,
    )
  }, [])
  const overlayMatRef = useRef()
  const overlayLoadedRef = useRef(false)

  const loadTile = useCallback((id) => {
    if (texturesRef.current[id] || loadingRef.current[id]) return
    loadingRef.current[id] = true
    loader.loadAsync(`/textures/tiles/blue_marble_${id}.jpg`).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 16
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      texturesRef.current[id] = tex
      loadingRef.current[id] = false
      const mat = materialsRef.current[id]
      if (mat) {
        mat.map = tex
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }
    }).catch((err) => {
      console.error(`[TiledEarth] Failed to load tile ${id}:`, err)
      loadingRef.current[id] = false
    })
  }, [])

  const unloadTile = useCallback((id) => {
    if (texturesRef.current[id]) {
      texturesRef.current[id].dispose()
      texturesRef.current[id] = null
      const mat = materialsRef.current[id]
      if (mat) {
        mat.map = null
        mat.color.set('#0a1a3a')
        mat.needsUpdate = true
      }
    }
  }, [])

  // Eager-load launch site tiles + overlay
  useEffect(() => {
    loadTile('A1')
    loadTile('B1')
    // Try loading high-res Boca Chica overlay (optional — won't error if missing)
    if (!overlayLoadedRef.current) {
      loader.loadAsync('/textures/tiles/boca_chica.jpg').then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 16
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        overlayLoadedRef.current = true
        if (overlayMatRef.current) {
          overlayMatRef.current.map = tex
          overlayMatRef.current.color.set('#ffffff')
          overlayMatRef.current.needsUpdate = true
        }
      }).catch(() => {
        // No overlay image — that's fine, it's optional
      })
    }
    return () => {
      for (const id of Object.keys(texturesRef.current)) {
        if (texturesRef.current[id]) texturesRef.current[id].dispose()
      }
    }
  }, [loadTile])

  const { camera } = useThree()
  const tempVec = useMemo(() => new THREE.Vector3(), [])
  const _earthCenter = useMemo(() => new THREE.Vector3(), [])
  const _tileCenter = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    // Compute camera altitude for atmosphere/overlay fading
    _earthCenter.set(0, -EARTH_RADIUS, 0)
    if (groupRef.current?.parent) {
      const parentPos = groupRef.current.parent.position
      _earthCenter.set(parentPos.x, parentPos.y - EARTH_RADIUS, parentPos.z)
    }
    const camAlt = camera.position.distanceTo(_earthCenter) - EARTH_RADIUS

    // Atmosphere — visible from ground (subtle) and increasingly bright from space
    if (atmosRef.current) {
      atmosRef.current.visible = true
      const opacity = camAlt < 500
        ? 0.2
        : camAlt < 10000
          ? THREE.MathUtils.lerp(0.2, 0.5, (camAlt - 500) / 9500)
          : Math.min(1.0, 0.5 + THREE.MathUtils.smoothstep(camAlt, 10000, 80000) * 0.5)
      atmosRef.current.material.uniforms.uOpacity.value = opacity
    }

    // Camera direction for tile visibility
    _tileCenter.set(0, -EARTH_RADIUS, 0)
    if (groupRef.current?.parent) {
      tempVec.copy(camera.position)
      groupRef.current.parent.worldToLocal(tempVec)
      tempVec.sub(_tileCenter).normalize()
    }

    for (const tile of TILES) {
      const dot = tempVec.dot(centerNormals[tile.id])
      if (dot > -0.1) {
        loadTile(tile.id)
      } else if (dot < -0.3) {
        unloadTile(tile.id)
      }
    }

    // Fade in overlay when close to ground (< 50km), fully visible below 10km
    if (overlayMatRef.current && overlayLoadedRef.current) {
      const overlayOpacity = camAlt < 10000
        ? 1.0
        : camAlt < 50000
          ? 1.0 - (camAlt - 10000) / 40000
          : 0.0
      overlayMatRef.current.opacity = overlayOpacity
      overlayMatRef.current.visible = overlayOpacity > 0.01
    }
  })

  return (
    <group>
      {/* Earth tile segments */}
      <group ref={groupRef} position={[0, -EARTH_RADIUS, 0]} rotation={rotation}>
        {TILES.map(tile => (
          <mesh key={tile.id} geometry={geometries[tile.id]} renderOrder={0}>
            <meshStandardMaterial
              ref={r => { if (r) materialsRef.current[tile.id] = r }}
              color="#0a1a3a"
              roughness={0.85}
              metalness={0}
              depthWrite
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
              onBeforeCompile={patchOceanReflection}
            />
          </mesh>
        ))}

        {/* High-res Boca Chica overlay — renders on top of base tiles */}
        <mesh geometry={overlayGeo} renderOrder={1}>
          <meshStandardMaterial
            ref={overlayMatRef}
            color="#0a1a3a"
            roughness={1}
            metalness={0}
            transparent
            depthWrite
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            visible={false}
          />
        </mesh>
      </group>

      {/* Atmosphere glow — thin bright rim visible from space */}
      <mesh
        ref={atmosRef}
        position={[0, -EARTH_RADIUS, 0]}
        rotation={rotation}
        renderOrder={-1}
        visible={false}
      >
        <sphereGeometry args={[EARTH_RADIUS + 80000, 128, 64]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          uniforms={{ uOpacity: { value: 0 } }}
          vertexShader={`
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldPos = worldPos.xyz;
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uOpacity;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              float fresnel = 1.0 - abs(dot(vWorldNormal, viewDir));

              // Multi-layer blend for smooth, natural atmosphere
              float outer = smoothstep(0.0, 1.0, fresnel);         // broad soft glow
              float mid   = smoothstep(0.3, 1.0, fresnel);         // visible rim
              float inner = smoothstep(0.65, 1.0, fresnel);        // bright limb

              // Color gradient: deep blue at edge, lighter blue inward, hint of white at limb
              vec3 deepBlue  = vec3(0.15, 0.35, 0.8);
              vec3 skyBlue   = vec3(0.4, 0.7, 1.0);
              vec3 whiteGlow = vec3(0.7, 0.88, 1.0);

              vec3 color = deepBlue * outer + skyBlue * mid * 0.6 + whiteGlow * inner * 0.4;
              float alpha = (outer * 0.25 + mid * 0.4 + inner * 0.5) * uOpacity;

              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </mesh>
    </group>
  )
}
