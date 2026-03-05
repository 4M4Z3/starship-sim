// ============================================================
// Attitude Control — PD controller for gimbal, grid fins, RCS
// ============================================================

import { TARGET_ORBIT } from './constants.js'
import { wrapAngle } from './rotational.js'
import { getAtmosphere } from './aero.js'

const DEG = Math.PI / 180

// PD gains
const SHIP_KP = 2.0
const SHIP_KD = 1.5
const BOOSTER_KP = 2.5
const BOOSTER_KD = 2.0
const FIN_KP = 1.0
const FIN_KD = 0.8

// Hover PD gains (used by physics.js for altitude/velocity hold)
export const HOVER_ALT_KP = 1.5
export const HOVER_VR_KP = 2.0
export const HOVER_VT_KD = 2.0

// Actuator limits
const MAX_GIMBAL = 15 * DEG
const MAX_FIN = 30 * DEG
const RCS_MAX_TORQUE = 10_000_000 // N·m (hot gas RCS thrusters, multiple pairs along 69m body)

// Vacuum threshold — above this altitude, use RCS instead of aero surfaces
const VACUUM_ALT = 80_000

/**
 * Compute target body angle for the ship based on flight phase
 * Returns angle in radians (0 = radial up, positive = tilted prograde)
 */
function getShipTargetAngle(missionTime, vr, vt, staged, altitude) {
  // Vertical ascent to clear the tower
  if (missionTime < 5) return 0

  if (!staged) {
    // Programmed pitch ramp during booster phase
    const t = missionTime - 5
    const rampAngle = Math.min(t * (60 / 150) * DEG, 60 * DEG)
    return rampAngle
  }

  // After staging: altitude-based guidance toward orbit
  const altFrac = Math.min(1, Math.max(0, altitude / TARGET_ORBIT))
  const vrCorrection = Math.max(0, -vr * 0.003)
  const baseDeg = 62 + (90 - 62) * altFrac
  const headingDeg = Math.min(92, baseDeg - vrCorrection)
  return Math.max(55, headingDeg) * DEG
}

/**
 * Compute target body angle for the booster based on flight phase
 */
function getBoosterTargetAngle(boosterPhase, boosterVr, boosterVt, boosterTheta, altitude) {
  const speed = Math.sqrt(boosterVr * boosterVr + boosterVt * boosterVt)
  const flightPath = speed > 1 ? Math.atan2(boosterVt, boosterVr) : 0

  switch (boosterPhase) {
    case 'coast':
      // Begin flip to retrograde during coast (RCS-driven)
      return flightPath + Math.PI

    case 'boostback':
      // Point retrograde (180° from velocity)
      return flightPath + Math.PI

    case 'descent': {
      // High altitude: fall engines-down (stable orientation in thin air)
      // Below 50km: transition to belly-flop for maximum drag
      const atm = getAtmosphere(altitude)
      const q = 0.5 * atm.density * speed * speed
      const bellyFlopBlend = Math.min(1, Math.max(0, (q - 100) / 5000)) // ramp from q=100 to q=5100 Pa
      // Engines-down = retrograde ≈ PI (falling), belly-flop = PI/2
      return Math.PI * (1 - 0.5 * bellyFlopBlend)
    }

    case 'landing':
      // Point engines down (retrograde for landing)
      // Thrust direction is computed from guidance, target = thrust vector angle
      // For now, aim roughly retrograde
      return flightPath + Math.PI

    case 'hover':
      // Vertical — engines straight down, holding position
      return 0

    case 'splashed':
      // Tip over sideways
      return Math.PI / 2

    default:
      return 0
  }
}

/**
 * Compute control outputs for the ship
 * @returns {{ gimbalAngle, targetAngle, rcsTorque }}
 */
export function computeShipControl({ missionTime, vr, vt, staged, altitude, angle, omega }) {
  const targetAngle = getShipTargetAngle(missionTime, vr, vt, staged, altitude)
  const error = wrapAngle(targetAngle - angle)

  let gimbalAngle = 0
  let rcsTorque = 0

  if (altitude > VACUUM_ALT) {
    // In vacuum: use RCS
    const cmd = SHIP_KP * error - SHIP_KD * omega
    rcsTorque = Math.max(-RCS_MAX_TORQUE, Math.min(RCS_MAX_TORQUE, cmd * 5_000_000))
  } else {
    // In atmosphere: use engine gimbal
    gimbalAngle = SHIP_KP * error - SHIP_KD * omega
    gimbalAngle = Math.max(-MAX_GIMBAL, Math.min(MAX_GIMBAL, gimbalAngle))
  }

  return { gimbalAngle, targetAngle, rcsTorque }
}

/**
 * Compute control outputs for the booster
 * @returns {{ gimbalAngle, finDeflection, targetAngle, rcsTorque }}
 */
export function computeBoosterControl({
  boosterPhase, boosterVr, boosterVt, boosterTheta, boosterAngle, boosterOmega, altitude,
}) {
  const targetAngle = getBoosterTargetAngle(boosterPhase, boosterVr, boosterVt, boosterTheta, altitude)
  const error = wrapAngle(targetAngle - boosterAngle)

  let gimbalAngle = 0
  let finDeflection = 0
  let rcsTorque = 0

  const isPowered = boosterPhase === 'boostback' || boosterPhase === 'landing' || boosterPhase === 'hover'
  const inAtmo = altitude < VACUUM_ALT

  if (isPowered) {
    // Engine gimbal for attitude control during powered phases
    gimbalAngle = BOOSTER_KP * error - BOOSTER_KD * boosterOmega
    gimbalAngle = Math.max(-MAX_GIMBAL, Math.min(MAX_GIMBAL, gimbalAngle))
  }

  if (inAtmo) {
    // Grid fins for aerodynamic control
    finDeflection = FIN_KP * error - FIN_KD * boosterOmega
    finDeflection = Math.max(-MAX_FIN, Math.min(MAX_FIN, finDeflection))
  }

  if (!isPowered) {
    // RCS for attitude control when engines are off (coast, descent in thin air)
    // Scale by moment of inertia so angular response is independent of vehicle size
    const cmd = BOOSTER_KP * error - BOOSTER_KD * boosterOmega
    rcsTorque = Math.max(-RCS_MAX_TORQUE, Math.min(RCS_MAX_TORQUE, cmd * 5_000_000))
  }

  return { gimbalAngle, finDeflection, targetAngle, rcsTorque }
}
