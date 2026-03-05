import { useEffect, useState, useRef } from 'react'
import { BOOSTER, SHIP, EARTH_RADIUS as EARTH_R } from '../physics/index.js'

const TIME_SCALES = [1, 2, 5, 10, 25, 50, 100]
const CAMERAS = ['Ground', 'Ship', 'Booster']
const CAMERA_KEYS = { Ground: 'ground', Ship: 'ship', Booster: 'booster' }

/* Solid dark panel — inline style so it ALWAYS works regardless of Tailwind */
const panelStyle = {
  background: 'rgba(10, 12, 18, 0.85)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
}

/* ── Callout ── */
function Callout({ show, children }) {
  const [visible, setVisible] = useState(false)
  const [opacity, setOpacity] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (show) {
      setVisible(true)
      requestAnimationFrame(() => setOpacity(1))
      timer.current = setTimeout(() => setOpacity(0), 4000)
    } else { setOpacity(0) }
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [show])

  useEffect(() => {
    if (opacity === 0 && visible && !show) {
      const t = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(t)
    }
  }, [opacity, visible, show])

  if (!visible) return null
  return (
    <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 20, transition: 'opacity 0.5s', opacity, textAlign: 'center' }}>
      <div style={{ ...panelStyle, padding: '28px 48px' }}>{children}</div>
    </div>
  )
}

/* ════════════════════════════════════
   HUD
   ════════════════════════════════════ */
export default function HUD({
  phase, simRef, timeScaleRef, cameraTarget,
  onLaunch, onStop, onReset, onToggleCamera, onSetCamera,
}) {
  const [tel, setTel] = useState({})
  const [ts, setTs] = useState(1)
  const [showStaged, setShowStaged] = useState(false)
  const [showOrbit, setShowOrbit] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const prev = useRef(phase)

  useEffect(() => {
    const id = setInterval(() => setTel({ ...simRef.current }), 50)
    return () => clearInterval(id)
  }, [simRef])

  useEffect(() => {
    if (phase === 'staged' && prev.current === 'launching') setShowStaged(true)
    if (phase === 'orbit' && prev.current === 'staged') setShowOrbit(true)
    if (phase === 'idle') { setShowStaged(false); setShowOrbit(false) }
    prev.current = phase
  }, [phase])

  const slower = () => setTs(p => {
    const i = Math.max(0, TIME_SCALES.indexOf(p) - 1)
    const n = TIME_SCALES[i]; timeScaleRef.current = n; return n
  })
  const faster = () => setTs(p => {
    const i = Math.min(TIME_SCALES.length - 1, TIME_SCALES.indexOf(p) + 1)
    const n = TIME_SCALES[i]; timeScaleRef.current = n; return n
  })

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyE' && phase === 'idle') onLaunch()
      if (e.code === 'KeyQ' && (phase === 'launching' || phase === 'staged')) onStop()
      if (e.code === 'KeyR' && (phase === 'falling' || phase === 'landed' || phase === 'fuel_exhausted' || phase === 'orbit')) onReset()
      if (e.code === 'KeyT') onToggleCamera()
      if (e.code === 'Digit1') onSetCamera('ground')
      if (e.code === 'Digit2') onSetCamera('ship')
      if (e.code === 'Digit3') onSetCamera('booster')
      if (e.code === 'Comma') slower()
      if (e.code === 'Period') faster()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onLaunch, onStop, onReset, onToggleCamera, onSetCamera, timeScaleRef])

  const fmt = (n, d = 1) => {
    if (n == null || isNaN(n)) return '—'
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M'
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d) + 'k'
    return n.toFixed(d)
  }
  const dist = (m) => {
    if (m == null || isNaN(m)) return '—'
    return Math.abs(m) >= 1000 ? (m / 1000).toFixed(2) + ' km' : m.toFixed(1) + ' m'
  }
  const vel = (v) => {
    if (v == null || isNaN(v)) return '—'
    return Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' km/s' : v.toFixed(1) + ' m/s'
  }
  const tmr = (s) => {
    if (s == null || isNaN(s)) return 'T+0:00'
    return `T+${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }
  const deg = (r) => ((r ?? 0) * 180 / Math.PI).toFixed(1)

  const bFuel = ((tel.boosterFuel ?? 0) + (tel.boosterReturnFuel ?? 0)) / BOOSTER.propellantMass * 100
  const sFuel = tel.shipFuel != null ? (tel.shipFuel / SHIP.propellantMass) * 100 : 100

  const phLabel = { idle: 'Standing By', launching: 'Powered Ascent', staged: 'Ship Burn', falling: 'Free Fall', fuel_exhausted: 'MECO', orbit: 'In Orbit', landed: 'Landed' }[phase] || phase
  const phDot = { idle: '#888', launching: '#fb923c', staged: '#22d3ee', falling: '#f87171', fuel_exhausted: '#facc15', orbit: '#4ade80', landed: '#4ade80' }[phase] || '#888'

  const bLabel = { coast: 'Coast', boostback: 'Boostback', descent: 'Belly-Flop', landing: 'Landing Burn', hover: 'Hovering', splashed: 'Splashdown' }[tel.boosterPhase] || ''
  const bDotC = { coast: '#facc15', boostback: '#fb923c', descent: '#facc15', landing: '#f87171', hover: '#fdba74', splashed: '#60a5fa' }[tel.boosterPhase] || '#666'

  const bAlt = (tel.boosterR ?? EARTH_R) - EARTH_R
  const bVr = tel.boosterVr ?? 0
  const bVt = tel.boosterVt ?? 0
  const bSpd = Math.sqrt(bVr * bVr + bVt * bVt)
  const bOmega = tel.boosterOmega ?? 0
  const bEng = tel.boosterPhase === 'boostback' || tel.boosterPhase === 'landing' || tel.boosterPhase === 'hover'

  const doAction = () => {
    if (phase === 'idle') onLaunch()
    else if (phase === 'launching' || phase === 'staged') onStop()
    else onReset()
  }
  const actionLabel = { idle: 'Launch', launching: 'Cut-off', staged: 'Cut-off', falling: 'Reset', landed: 'Reset', fuel_exhausted: 'Reset', orbit: 'Reset' }[phase]

  const font = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
  const mono = "'SF Mono', 'Cascadia Code', 'Consolas', monospace"

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', userSelect: 'none', fontFamily: font, color: 'white' }}>

      {/* ═══ TOP: status ═══ */}
      <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 20, padding: '14px 32px' }}>
          <svg width="12" height="12"><circle cx="6" cy="6" r="6" fill={phDot} /></svg>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.9 }}>{phLabel}</span>
          <span style={{ opacity: 0.15, fontSize: 18 }}>|</span>
          <span style={{ fontSize: 15, opacity: 0.45, fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>{tmr(tel.missionTime)}</span>
        </div>
      </div>

      {/* ═══ BOTTOM: controls ═══ */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 6, padding: 8 }}>
          <Btn onClick={slower}>−</Btn>
          <span style={{ fontSize: 15, fontWeight: 600, fontFamily: mono, fontVariantNumeric: 'tabular-nums', width: 48, textAlign: 'center', color: ts > 1 ? '#facc15' : 'rgba(255,255,255,0.4)' }}>{ts}x</span>
          <Btn onClick={faster}>+</Btn>
          <Sep />
          {CAMERAS.map(c => (
            <Btn key={c} onClick={() => onSetCamera(CAMERA_KEYS[c])} active={cameraTarget === CAMERA_KEYS[c]}>{c}</Btn>
          ))}
          <Sep />
          {actionLabel && <Btn onClick={doAction} accent={phase === 'idle'}>{actionLabel}</Btn>}
        </div>
      </div>

      {/* ═══ LEFT: flight data ═══ */}
      <div style={{ position: 'absolute', top: 20, left: 20, ...panelStyle, padding: '20px 24px', width: 230, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row l="Thrust" v={`${fmt(tel.thrustForce)} N`} />
          <Row l="Drag" v={`${fmt(tel.dragForce)} N`} />
          <Row l="Mach" v={(tel.mach ?? 0).toFixed(2)} />
          <Row l="Max Q" v={`${fmt(tel.dynamicPressure)} Pa`} />
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Fuel label="Booster" pct={bFuel} />
          <Fuel label="Ship" pct={sFuel} />
        </div>
        {(tel.altitude > 50000 || tel.inOrbit) && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row l="Apoapsis" v={dist(tel.apoapsis)} />
            <Row l="Periapsis" v={dist(tel.periapsis)} warn={(tel.periapsis ?? 0) < 0} />
            <Row l="Eccentricity" v={(tel.eccentricity ?? 0).toFixed(4)} />
          </div>
        )}

        {/* Advanced toggle */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setShowAdvanced(p => !p)}
            style={{
              ...btnBase,
              width: '100%',
              padding: '8px 0',
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              textAlign: 'center',
              opacity: 0.35,
            }}
          >
            {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <Row l="Total Mass" v={`${fmt(tel.totalMass)} kg`} />
              <Row l="Thrust Accel" v={`${(tel.thrustAccel ?? 0).toFixed(2)} m/s²`} />
              <Row l="Drag Accel" v={`${(tel.dragAccel ?? 0).toFixed(2)} m/s²`} />
              <Row l="Net Accel" v={`${(tel.netAccel ?? 0).toFixed(2)} m/s²`} />
              <Row l="Gravity" v={`${(tel.gravity ?? 0).toFixed(2)} m/s²`} />
              <Row l="TWR" v={tel.gravity > 0 ? ((tel.thrustAccel ?? 0) / tel.gravity).toFixed(2) : '—'} />
              <Row l="Drag Coeff" v={(tel.cd ?? 0).toFixed(3)} />
              <Row l="Peak Q" v={`${fmt(tel.maxQ)} Pa`} />
              <Row l="Mass Flow" v={`${(tel.massFlow ?? 0).toFixed(1)} kg/s`} />
              <Row l="Fuel Rem" v={`${(tel.fuelPercent ?? 0).toFixed(1)}%`} />
              {tel.stageTime > 0 && <Row l="Stage Time" v={`T+${Math.floor(tel.stageTime)}s`} />}
              <Row l="Heading" v={`${deg(tel.heading)}°`} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT: vehicles ═══ */}
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 12, width: 270 }}>
        <Vehicle
          name="Starship" active={!tel.staged || cameraTarget === 'ship'}
          alt={tel.altitude} spd={tel.speed} vr={tel.vr} vt={tel.vt}
          pitch={tel.angle} aoa={tel.alpha} omega={tel.omega} gimbal={tel.gimbalAngle}
          dist={dist} vel={vel} deg={deg} angle={tel.angle ?? 0}
          engine={tel.staged ? <ShipEngine on={tel.enginesOn} /> : <BoosterEngine on={tel.enginesOn} />}
        />
        <Vehicle
          name="Super Heavy" active={tel.staged && cameraTarget === 'booster'} dimmed={!tel.staged}
          badge={bLabel} badgeDot={bDotC}
          alt={bAlt} spd={bSpd} vr={bVr} vt={bVt}
          pitch={tel.boosterAngle} aoa={tel.boosterAlpha} omega={bOmega} gimbal={tel.boosterGimbalAngle}
          fins={tel.boosterFinDeflection} dist={dist} vel={vel} deg={deg} angle={tel.boosterAngle ?? 0}
          engine={<BoosterEngine on={bEng} phase={tel.boosterPhase} />}
        />
      </div>

      {/* ═══ CALLOUTS ═══ */}
      <Callout show={showStaged}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', color: '#22d3ee' }}>Stage Separation</div>
        <div style={{ fontSize: 14, opacity: 0.4, marginTop: 6 }}>Ship engines ignited</div>
      </Callout>
      <Callout show={showOrbit}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', color: '#4ade80' }}>Orbit Achieved</div>
        <div style={{ fontSize: 14, opacity: 0.4, marginTop: 6 }}>{dist(tel.apoapsis)} × {dist(tel.periapsis)}</div>
      </Callout>
      <Callout show={phase === 'landed'}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.9 }}>Touchdown</div>
      </Callout>
      <Callout show={phase === 'fuel_exhausted'}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.9 }}>SECO</div>
        <div style={{ fontSize: 14, opacity: 0.4, marginTop: 6 }}>Ballistic trajectory</div>
      </Callout>
    </div>
  )
}

/* ── Button ── */
const btnBase = {
  pointerEvents: 'auto',
  cursor: 'pointer',
  border: 'none',
  borderRadius: 12,
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 500,
  fontFamily: 'inherit',
  color: 'rgba(255,255,255,0.45)',
  background: 'transparent',
  transition: 'all 0.1s',
  whiteSpace: 'nowrap',
}

function Btn({ children, onClick, active, accent }) {
  const style = {
    ...btnBase,
    ...(active ? { background: 'rgba(255,255,255,0.12)', color: '#fff' } : {}),
    ...(accent ? { background: 'rgba(34,211,238,0.15)', color: '#22d3ee' } : {}),
  }
  return <button style={style} onClick={onClick} onMouseEnter={e => { if (!active) e.target.style.background = 'rgba(255,255,255,0.08)' }} onMouseLeave={e => { if (!active && !accent) e.target.style.background = 'transparent'; if (accent) e.target.style.background = 'rgba(34,211,238,0.15)' }}>{children}</button>
}

function Sep() {
  return <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', margin: '0 8px' }} />
}

/* ── Row ── */
function Row({ l, v, warn }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.3, marginBottom: 2 }}>{l}</div>
      <div style={{ fontSize: 15, fontFamily: "'SF Mono','Cascadia Code','Consolas',monospace", fontVariantNumeric: 'tabular-nums', opacity: warn ? 1 : 0.8, color: warn ? '#f87171' : 'inherit' }}>{v}</div>
    </div>
  )
}

/* ── Fuel ── */
function Fuel({ label, pct }) {
  const c = pct > 20 ? '#4ade80' : pct > 5 ? '#facc15' : '#f87171'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="8" height="8"><circle cx="4" cy="4" r="4" fill={c} /></svg>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.3 }}>{label}</span>
        </div>
        <span style={{ fontSize: 12, fontFamily: "'SF Mono','Consolas',monospace", fontVariantNumeric: 'tabular-nums', opacity: 0.4 }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.25)', width: `${pct}%`, transition: 'width 0.15s' }} />
      </div>
    </div>
  )
}

/* ── Vehicle ── */
function Vehicle({ name, active, dimmed, badge, badgeDot, alt, spd, vr, vt, pitch, aoa, omega, gimbal, fins, dist, vel, deg, angle, engine }) {
  return (
    <div style={{
      ...panelStyle,
      padding: '20px 22px',
      opacity: dimmed ? 0.25 : 1,
      transition: 'opacity 0.3s',
      borderLeft: active ? '3px solid rgba(34,211,238,0.4)' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.8 }}>{name}</span>
        {badge && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="7" height="7"><circle cx="3.5" cy="3.5" r="3.5" fill={badgeDot} /></svg>
            <span style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.4 }}>{badge}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '16px 0' }}>
        <Attitude angle={angle} />
        {engine}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <Mini l="Alt" v={dist(alt)} />
        <Mini l="Speed" v={vel(spd)} />
        <Mini l="Vert" v={vel(vr)} warn={vr < 0} />
        <Mini l="Horiz" v={vel(vt)} />
        <Mini l="Pitch" v={`${deg(pitch)}°`} />
        <Mini l="AoA" v={`${deg(aoa)}°`} />
        <Mini l="ω" v={`${deg(omega)}°/s`} />
        <Mini l="Gimbal" v={`${deg(gimbal)}°`} />
        {fins != null && <Mini l="Fins" v={`${deg(fins)}°`} />}
      </div>
    </div>
  )
}

function Mini({ l, v, warn }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.25, marginBottom: 1 }}>{l}</div>
      <div style={{ fontSize: 13, fontFamily: "'SF Mono','Consolas',monospace", fontVariantNumeric: 'tabular-nums', opacity: warn ? 1 : 0.7, color: warn ? '#f87171' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
    </div>
  )
}

/* ── Attitude (64px) ── */
function Attitude({ angle }) {
  const s = 64, cx = 32, cy = 32, r = 27
  const tx = cx + Math.sin(-angle) * (r - 2), ty = cy - Math.cos(-angle) * (r - 2)
  const bx = cx - Math.sin(-angle) * (r * 0.5), by = cy + Math.cos(-angle) * (r * 0.5)
  const tick = (d) => {
    const a = d * Math.PI / 180
    return { x1: cx + Math.sin(a) * (r - 1), y1: cy - Math.cos(a) * (r - 1), x2: cx + Math.sin(a) * (r + 3), y2: cy - Math.cos(a) * (r + 3) }
  }
  return (
    <svg width={s} height={s} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
      {[0, 90, 180, 270].map(d => { const t = tick(d); return <line key={d} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} /> })}
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="#22d3ee" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={tx} cy={ty} r={2} fill="#22d3ee" />
    </svg>
  )
}

/* ── Engines (72px) ── */
function BoosterEngine({ on, phase }) {
  const inner = on, mid = on && (phase === 'boostback' || !phase), outer = on && !phase
  const hot = '#ff8800', off = 'rgba(255,255,255,0.06)'
  return (
    <svg width="72" height="72" viewBox="-16 -16 32 32" style={{ flexShrink: 0 }}>
      {on && <circle cx={0} cy={0} r={15} fill="none" stroke="rgba(255,136,0,0.12)" strokeWidth={1.5} />}
      {ring(20, 13.5, 1.4, outer ? hot : off)}
      {ring(10, 8.5, 1.7, mid ? hot : off)}
      {ring(3, 3.5, 2.1, inner ? hot : off, -Math.PI / 2)}
    </svg>
  )
}

function ShipEngine({ on }) {
  const hot = '#4488ff', off = 'rgba(255,255,255,0.06)'
  return (
    <svg width="72" height="72" viewBox="-16 -16 32 32" style={{ flexShrink: 0 }}>
      {on && <circle cx={0} cy={0} r={14} fill="none" stroke="rgba(68,136,255,0.12)" strokeWidth={1.5} />}
      {ring(3, 10, 3.5, on ? hot : off, -Math.PI / 2)}
      {ring(3, 4, 2.5, on ? '#ff8800' : off)}
    </svg>
  )
}

function ring(n, radius, dotR, fill, offset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + offset
    return <circle key={i} cx={Math.cos(a) * radius} cy={Math.sin(a) * radius} r={dotR} fill={fill} />
  })
}
