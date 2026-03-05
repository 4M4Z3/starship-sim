import { useEffect, useState, useRef } from 'react'
import { BOOSTER, SHIP, EARTH_RADIUS as EARTH_R } from '../physics/index.js'

const TIME_SCALES = [1, 2, 5, 10, 25, 50, 100]

// Fade-in/out callout component
function Callout({ show, children }) {
  const [visible, setVisible] = useState(false)
  const [opacity, setOpacity] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (show) {
      setVisible(true)
      requestAnimationFrame(() => setOpacity(1))
      timerRef.current = setTimeout(() => setOpacity(0), 4000)
    } else {
      setOpacity(0)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [show])

  useEffect(() => {
    if (opacity === 0 && visible && !show) {
      const t = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(t)
    }
  }, [opacity, visible, show])

  if (!visible) return null
  return (
    <div
      className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-500"
      style={{ opacity }}
    >
      {children}
    </div>
  )
}

export default function HUD({ phase, simRef, timeScaleRef, cameraTarget, onLaunch, onStop, onReset, onToggleCamera }) {
  const [tel, setTel] = useState({})
  const [timeScale, setTimeScale] = useState(1)
  const [showStaged, setShowStaged] = useState(false)
  const [showOrbit, setShowOrbit] = useState(false)
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    const interval = setInterval(() => setTel({ ...simRef.current }), 50)
    return () => clearInterval(interval)
  }, [simRef])

  useEffect(() => {
    if (phase === 'staged' && prevPhaseRef.current === 'launching') setShowStaged(true)
    if (phase === 'orbit' && prevPhaseRef.current === 'staged') setShowOrbit(true)
    if (phase === 'idle') { setShowStaged(false); setShowOrbit(false) }
    prevPhaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyE' && phase === 'idle') onLaunch()
      if (e.code === 'KeyQ' && (phase === 'launching' || phase === 'staged')) onStop()
      if (e.code === 'KeyR' && (phase === 'falling' || phase === 'landed' || phase === 'fuel_exhausted' || phase === 'orbit')) onReset()
      if (e.code === 'KeyT') onToggleCamera()
      if (e.code === 'Comma') {
        setTimeScale(prev => {
          const idx = Math.max(0, TIME_SCALES.indexOf(prev) - 1)
          const next = TIME_SCALES[idx]
          timeScaleRef.current = next
          return next
        })
      }
      if (e.code === 'Period') {
        setTimeScale(prev => {
          const idx = Math.min(TIME_SCALES.length - 1, TIME_SCALES.indexOf(prev) + 1)
          const next = TIME_SCALES[idx]
          timeScaleRef.current = next
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onLaunch, onStop, onReset, onToggleCamera, timeScaleRef])

  const fmt = (n, decimals = 1) => {
    if (n == null || isNaN(n)) return '—'
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals) + 'M'
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(decimals) + 'k'
    return n.toFixed(decimals)
  }

  const fmtDist = (m) => {
    if (m == null || isNaN(m)) return '—'
    if (Math.abs(m) >= 1000) return (m / 1000).toFixed(2) + ' km'
    return m.toFixed(1) + ' m'
  }

  const fmtVel = (v) => {
    if (v == null || isNaN(v)) return '—'
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + ' km/s'
    return v.toFixed(1) + ' m/s'
  }

  const fmtTime = (s) => {
    if (s == null || isNaN(s)) return 'T+0:00'
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `T+${mins}:${secs.toString().padStart(2, '0')}`
  }

  const boosterTotalFuel = (tel.boosterFuel ?? 0) + (tel.boosterReturnFuel ?? 0)
  const boosterPct = (boosterTotalFuel / BOOSTER.propellantMass) * 100
  const shipPct = tel.shipFuel != null ? (tel.shipFuel / SHIP.propellantMass) * 100 : 100

  const phaseLabel = {
    idle: 'Standing By',
    launching: 'Powered Ascent',
    staged: 'Ship Burn',
    falling: 'Free Fall',
    fuel_exhausted: 'MECO',
    orbit: 'In Orbit',
    landed: 'Landed',
  }[phase] || phase

  const phaseColor = {
    idle: 'text-white/50',
    launching: 'text-orange-400',
    staged: 'text-cyan-400',
    falling: 'text-red-400',
    fuel_exhausted: 'text-yellow-400',
    orbit: 'text-green-400',
    landed: 'text-green-400',
  }[phase] || 'text-white/50'

  const boosterPhaseLabel = {
    attached: '',
    coast: 'Coast',
    boostback: 'Boostback',
    descent: 'Belly-Flop',
    landing: 'Landing Burn',
    hover: 'Hovering',
    splashed: 'Splashdown',
  }[tel.boosterPhase] || ''

  const boosterPhaseColor = {
    coast: 'text-yellow-400',
    boostback: 'text-orange-400',
    descent: 'text-yellow-400',
    landing: 'text-red-400',
    hover: 'text-orange-300',
    splashed: 'text-blue-400',
  }[tel.boosterPhase] || 'text-white/40'

  // Booster derived values
  const bAlt = (tel.boosterR ?? EARTH_R) - EARTH_R
  const bVr = tel.boosterVr ?? 0
  const bVt = tel.boosterVt ?? 0
  const bSpd = Math.sqrt(bVr * bVr + bVt * bVt)
  const bAngle = tel.boosterAngle ?? 0
  const bOmega = tel.boosterOmega ?? 0

  // Ship derived
  const shipAngle = tel.angle ?? 0
  const shipOmega = tel.omega ?? 0

  // Booster engines active?
  const bEnginesOn = tel.boosterPhase === 'boostback' || tel.boosterPhase === 'landing' || tel.boosterPhase === 'hover'

  return (
    <div className="absolute inset-0 pointer-events-none select-none">

      {/* ===== LEFT: Mission Info ===== */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg p-3 min-w-[200px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-mono uppercase font-semibold ${phaseColor}`}>{phaseLabel}</span>
          <div className="flex items-center gap-2">
            {timeScale !== 1 && <span className="text-[10px] font-mono text-yellow-400">{timeScale}x</span>}
            <span className="text-xs text-white/40 font-mono">{fmtTime(tel.missionTime)}</span>
          </div>
        </div>

        {/* Forces & Environment */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <TelRow label="Thrust" value={`${fmt(tel.thrustForce)} N`} color="text-orange-400" />
          <TelRow label="Drag" value={`${fmt(tel.dragForce)} N`} color="text-red-300" />
          <TelRow label="Mach" value={(tel.mach ?? 0).toFixed(2)} color="text-purple-400" />
          <TelRow label="Max Q" value={`${fmt(tel.dynamicPressure)} Pa`} color="text-yellow-400" />
        </div>

        {/* Fuel */}
        <div className="mt-2 space-y-1">
          <FuelBar label="Booster" pct={boosterPct} color={boosterPct > 20 ? '#22c55e' : boosterPct > 5 ? '#eab308' : '#ef4444'} />
          <FuelBar label="Ship" pct={shipPct} color={shipPct > 20 ? '#3b82f6' : shipPct > 5 ? '#eab308' : '#ef4444'} />
        </div>

        {/* Orbital elements */}
        {(tel.altitude > 50000 || tel.inOrbit) && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <TelRow label="Apo" value={fmtDist(tel.apoapsis)} color="text-cyan-300" />
              <TelRow label="Peri" value={fmtDist(tel.periapsis)} color={(tel.periapsis ?? 0) > 0 ? 'text-green-400' : 'text-red-400'} />
            </div>
          </div>
        )}
      </div>

      {/* ===== RIGHT: Vehicle Cards ===== */}
      <div className="absolute top-4 right-4 flex flex-col gap-3 items-end">

        {/* Controls (compact) */}
        <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
          <div className="flex gap-3 text-[11px] text-white/50 font-mono">
            <span><span className="text-yellow-400/70">&lt; &gt;</span> Speed</span>
            {phase === 'idle' && <span><span className="text-orange-400">E</span> Launch</span>}
            {(phase === 'launching' || phase === 'staged') && <span><span className="text-red-400">Q</span> Cut-Off</span>}
            {(phase === 'falling' || phase === 'landed' || phase === 'fuel_exhausted' || phase === 'orbit') && (
              <span><span className="text-blue-400">R</span> Reset</span>
            )}
            <span><span className="text-cyan-400">T</span> Camera ({cameraTarget === 'ground' ? 'Ground' : cameraTarget === 'ship' ? 'Ship' : 'Booster'})</span>
          </div>
        </div>

        {/* Starship Card */}
        <VehicleCard
          title="Starship"
          titleColor="text-cyan-400"
          borderColor="border-cyan-500/20"
          altitude={tel.altitude}
          vr={tel.vr}
          vt={tel.vt}
          speed={tel.speed}
          angle={shipAngle}
          omega={shipOmega}
          alpha={tel.alpha}
          gimbal={tel.gimbalAngle}
          isTracking={cameraTarget === 'ship' || (cameraTarget === 'ground')}
          fmtDist={fmtDist}
          fmtVel={fmtVel}
          engineIndicator={
            tel.staged
              ? <ShipEngineIndicator active={tel.enginesOn} />
              : <BoosterEngineIndicator active={tel.enginesOn} />
          }
        />

        {/* Super Heavy Card */}
        <VehicleCard
          title="Super Heavy"
          titleColor="text-orange-400"
          borderColor="border-orange-500/20"
          altitude={bAlt}
          vr={bVr}
          vt={bVt}
          speed={bSpd}
          angle={bAngle}
          omega={bOmega}
          alpha={tel.boosterAlpha}
          gimbal={tel.boosterGimbalAngle}
          finDeflection={tel.boosterFinDeflection}
          phaseLabel={boosterPhaseLabel}
          phaseColor={boosterPhaseColor}
          isTracking={tel.staged && cameraTarget === 'booster'}
          dimmed={!tel.staged}
          fmtDist={fmtDist}
          fmtVel={fmtVel}
          engineIndicator={
            <BoosterEngineIndicator
              active={bEnginesOn}
              phase={tel.boosterPhase}
            />
          }
        />
      </div>

      {/* Action prompt */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        {phase === 'idle' && (
          <div className="text-white/60 text-sm font-mono tracking-wide animate-pulse">
            Press E to Launch
          </div>
        )}
      </div>

      {/* Smooth callouts */}
      <Callout show={showStaged}>
        <div className="text-2xl font-light text-cyan-400 tracking-[0.3em] uppercase">Stage Separation</div>
        <div className="text-white/40 text-xs mt-1 font-mono">Ship engines ignited</div>
      </Callout>

      <Callout show={showOrbit}>
        <div className="text-2xl font-light text-green-400 tracking-[0.3em] uppercase">Orbit Achieved</div>
        <div className="text-white/40 text-xs mt-1 font-mono">
          {fmtDist(tel.apoapsis)} x {fmtDist(tel.periapsis)}
        </div>
      </Callout>

      <Callout show={phase === 'landed'}>
        <div className="text-2xl font-light text-yellow-400 tracking-[0.3em] uppercase">Touchdown</div>
      </Callout>

      <Callout show={phase === 'fuel_exhausted'}>
        <div className="text-2xl font-light text-yellow-400 tracking-[0.3em] uppercase">SECO</div>
        <div className="text-white/40 text-xs mt-1 font-mono">Ballistic trajectory</div>
      </Callout>
    </div>
  )
}

// ===== Vehicle Card =====
function VehicleCard({
  title, titleColor, borderColor,
  altitude, vr, vt, speed, angle, omega, alpha, gimbal,
  finDeflection, phaseLabel, phaseColor,
  isTracking, dimmed, fmtDist, fmtVel,
  engineIndicator,
}) {
  const deg = (rad) => ((rad ?? 0) * 180 / Math.PI).toFixed(1)

  return (
    <div className={`bg-black/60 backdrop-blur-sm border ${borderColor} rounded-lg p-3 min-w-[280px] ${dimmed ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono font-semibold uppercase ${titleColor}`}>{title}</span>
          {isTracking && <span className="text-[8px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded uppercase">tracking</span>}
        </div>
        {phaseLabel && <span className={`text-[10px] font-mono uppercase ${phaseColor}`}>{phaseLabel}</span>}
      </div>

      <div className="flex gap-3">
        {/* Left: telemetry grid */}
        <div className="flex-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <TelRow label="Alt" value={fmtDist(altitude)} color="text-cyan-400" />
            <TelRow label="Spd" value={fmtVel(speed)} color="text-green-400" />
            <TelRow label="V↑" value={fmtVel(vr)} color={vr >= 0 ? 'text-green-300' : 'text-red-300'} />
            <TelRow label="V→" value={fmtVel(vt)} color="text-blue-300" />
            <TelRow label="Pitch" value={`${deg(angle)}°`} color="text-teal-400" />
            <TelRow label="AoA" value={`${deg(alpha)}°`} color="text-amber-400" />
            <TelRow label="ω" value={`${deg(omega)}°/s`} color="text-purple-300" />
            <TelRow label="Gimbal" value={`${deg(gimbal)}°`} color="text-orange-300" />
            {finDeflection != null && (
              <TelRow label="Fins" value={`${deg(finDeflection)}°`} color="text-yellow-300" />
            )}
          </div>
        </div>

        {/* Right: rotation indicator + engine diagram */}
        <div className="flex flex-col items-center gap-1">
          <RotationIndicator angle={angle ?? 0} size={44} color={titleColor.includes('cyan') ? '#22d3ee' : '#fb923c'} />
          {engineIndicator}
        </div>
      </div>
    </div>
  )
}

// ===== Rotation Indicator =====
function RotationIndicator({ angle, size, color }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 4
  // Rocket body line
  const tipX = cx + Math.sin(-angle) * (r - 2)
  const tipY = cy - Math.cos(-angle) * (r - 2)
  const baseX = cx - Math.sin(-angle) * (r * 0.5)
  const baseY = cy + Math.cos(-angle) * (r * 0.5)

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {/* Reference circle */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      {/* Horizon line */}
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
      {/* Rocket body */}
      <line x1={baseX} y1={baseY} x2={tipX} y2={tipY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {/* Nose dot */}
      <circle cx={tipX} cy={tipY} r={2} fill={color} />
    </svg>
  )
}

function TelRow({ label, value, color, small }) {
  return (
    <div>
      <div className="text-[8px] text-white/30 uppercase leading-tight">{label}</div>
      <div className={`${small ? 'text-[11px]' : 'text-[13px]'} ${color} font-mono leading-tight`}>{value}</div>
    </div>
  )
}

function FuelBar({ label, pct, color }) {
  return (
    <div>
      <div className="flex justify-between text-[9px]">
        <span className="text-white/30 uppercase">{label}</span>
        <span className="text-white/40 font-mono">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-0.5">
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ===== Engine Indicators =====

// Booster: 3 inner, 10 middle, 20 outer
function BoosterEngineIndicator({ active, phase }) {
  const inner = active
  const middle = active && (phase === 'boostback' || !phase)
  const outer = active && !phase
  const onColor = '#ff8800'
  const offColor = 'rgba(255,255,255,0.08)'

  return (
    <svg width="52" height="52" viewBox="-16 -16 32 32" className="flex-shrink-0">
      {/* Outer ring: 20 engines */}
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2
        return <circle key={`o${i}`} cx={Math.cos(a) * 13.5} cy={Math.sin(a) * 13.5} r={1.3} fill={outer ? onColor : offColor} />
      })}
      {/* Middle ring: 10 engines */}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return <circle key={`m${i}`} cx={Math.cos(a) * 8.5} cy={Math.sin(a) * 8.5} r={1.6} fill={middle ? onColor : offColor} />
      })}
      {/* Inner ring: 3 engines */}
      {Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2
        return <circle key={`i${i}`} cx={Math.cos(a) * 3.5} cy={Math.sin(a) * 3.5} r={2} fill={inner ? onColor : offColor} />
      })}
    </svg>
  )
}

// Ship: 3 SL (inner), 3 Vac (outer)
function ShipEngineIndicator({ active }) {
  const onColor = '#4488ff'
  const offColor = 'rgba(255,255,255,0.08)'

  return (
    <svg width="52" height="52" viewBox="-16 -16 32 32" className="flex-shrink-0">
      {/* Vac ring: 3 engines (larger nozzles) */}
      {Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2
        return <circle key={`v${i}`} cx={Math.cos(a) * 10} cy={Math.sin(a) * 10} r={3.5} fill={active ? onColor : offColor} stroke={active ? '#6699ff' : 'rgba(255,255,255,0.05)'} strokeWidth={0.5} />
      })}
      {/* SL ring: 3 engines */}
      {Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2
        return <circle key={`s${i}`} cx={Math.cos(a) * 4} cy={Math.sin(a) * 4} r={2.5} fill={active ? '#ff8800' : offColor} />
      })}
    </svg>
  )
}
