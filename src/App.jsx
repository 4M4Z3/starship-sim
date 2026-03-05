import { useState, useRef, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import Scene from './components/Scene'
import HUD from './components/HUD'
import { createInitialState } from './physics/index.js'

function LoadingOverlay() {
  const { progress, active } = useProgress()
  const [visible, setVisible] = useState(true)
  const [opacity, setOpacity] = useState(1)
  const maxProgress = useRef(0)
  const doneOnce = useRef(false)

  // Only ever move the bar forward — never backwards
  if (progress > maxProgress.current) {
    maxProgress.current = progress
  }
  // Once we hit 100 and loading stops, lock it
  if (progress >= 100 && !active) {
    maxProgress.current = 100
    doneOnce.current = true
  }

  const displayProgress = maxProgress.current

  useEffect(() => {
    if (!doneOnce.current) return
    const timer = setTimeout(() => {
      setOpacity(0)
      const hideTimer = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(hideTimer)
    }, 400)
    return () => clearTimeout(timer)
  }, [displayProgress >= 100 && !active])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        opacity,
        transition: 'opacity 0.6s ease-out',
        pointerEvents: opacity === 0 ? 'none' : 'auto',
      }}
    >
      <h1
        style={{
          color: '#fff',
          fontSize: '2.5rem',
          fontWeight: 300,
          letterSpacing: '0.5em',
          marginBottom: '2rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        STARSHIP
      </h1>
      <div
        style={{
          width: '280px',
          height: '2px',
          background: '#222',
          borderRadius: '1px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${displayProgress}%`,
            height: '100%',
            background: '#fff',
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>
      <p
        style={{
          color: '#666',
          fontSize: '0.8rem',
          marginTop: '0.75rem',
          fontFamily: 'monospace',
        }}
      >
        {Math.round(displayProgress)}%
      </p>
    </div>
  )
}

export default function App() {
  const [phase, setPhase] = useState('idle')
  const [cameraTarget, setCameraTarget] = useState('ground')
  const simRef = useRef(createInitialState())
  const timeScaleRef = useRef(1)

  const handleLaunch = useCallback(() => {
    setPhase('launching')
  }, [])

  const handleStop = useCallback(() => {
    setPhase('falling')
  }, [])

  const handleReset = useCallback(() => {
    setPhase('idle')
    setCameraTarget('ground')
    simRef.current = createInitialState()
  }, [])

  const handleToggleCamera = useCallback(() => {
    setCameraTarget(prev => {
      if (prev === 'ground') return 'ship'
      if (prev === 'ship') return 'booster'
      return 'ground'
    })
  }, [])

  const handleLanded = useCallback(() => {
    setPhase('landed')
  }, [])

  const handleFuelExhausted = useCallback(() => {
    setPhase('fuel_exhausted')
  }, [])

  const handleOrbit = useCallback(() => {
    setPhase('orbit')
  }, [])

  const handleStaged = useCallback(() => {
    setPhase('staged')
  }, [])

  return (
    <div className="w-full h-screen bg-black relative">
      <Canvas
        camera={{ position: [300, 120, 300], fov: 50, near: 0.5, far: 20000000 }}
        gl={{ antialias: true, toneMapping: 3, logarithmicDepthBuffer: true }}
        shadows
      >
        <color attach="background" args={['#a0d2f0']} />
        {/* Lighting managed by SunLight in Scene */}
        <Scene
          phase={phase}
          simRef={simRef}
          timeScaleRef={timeScaleRef}
          cameraTarget={cameraTarget}
          onLanded={handleLanded}
          onFuelExhausted={handleFuelExhausted}
          onStaged={handleStaged}
          onOrbit={handleOrbit}
        />
      </Canvas>
      <LoadingOverlay />
      <HUD
        phase={phase}
        simRef={simRef}
        timeScaleRef={timeScaleRef}
        cameraTarget={cameraTarget}
        onLaunch={handleLaunch}
        onStop={handleStop}
        onReset={handleReset}
        onToggleCamera={handleToggleCamera}
        onSetCamera={setCameraTarget}
      />
    </div>
  )
}
