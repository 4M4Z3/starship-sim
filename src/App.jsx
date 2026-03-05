import { useState, useRef, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import Scene from './components/Scene'
import HUD from './components/HUD'
import { createInitialState, SCENARIOS, applyScenario } from './physics/index.js'

function LoadingOverlay() {
  const { progress, active } = useProgress()
  const [visible, setVisible] = useState(true)
  const [opacity, setOpacity] = useState(1)
  const maxProgress = useRef(0)
  const doneOnce = useRef(false)

  // Only ever move the bar forward
  if (progress > maxProgress.current) {
    maxProgress.current = progress
  }
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
  }, [progress, active])

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
  const [scenario, setScenario] = useState('ift5')
  const simRef = useRef(applyScenario(createInitialState(), 'ift5'))
  const timeScaleRef = useRef(1)

  const handleLaunch = useCallback(() => {
    const s = simRef.current
    // For pre-staged scenarios, jump straight to staged phase
    if (s.staged && s.phase === 'staged') {
      setPhase('staged')
      setCameraTarget('booster')
    } else {
      setPhase('launching')
    }
  }, [])

  const handleStop = useCallback(() => {
    setPhase('falling')
  }, [])

  const handleReset = useCallback(() => {
    setPhase('idle')
    setCameraTarget('ground')
    timeScaleRef.current = 1
    simRef.current = applyScenario(createInitialState(), scenario)
  }, [scenario])

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

  const handleScenarioChange = useCallback((id) => {
    setScenario(id)
    setPhase('idle')
    setCameraTarget('ground')
    timeScaleRef.current = 1
    simRef.current = applyScenario(createInitialState(), id)
  }, [])

  return (
    <div className="w-full h-screen bg-black relative">
      <Canvas
        camera={{ position: [500, 200, 500], fov: 50, near: 0.5, far: 20000000 }}
        gl={{ antialias: true, toneMapping: 3, logarithmicDepthBuffer: true }}
        shadows
      >
        <color attach="background" args={['#a0d2f0']} />
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
        scenario={scenario}
        onLaunch={handleLaunch}
        onStop={handleStop}
        onReset={handleReset}
        onToggleCamera={handleToggleCamera}
        onSetCamera={setCameraTarget}
        onScenarioChange={handleScenarioChange}
      />
    </div>
  )
}
