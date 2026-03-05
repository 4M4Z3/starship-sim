// ============================================================
// Engine Model — Individual engines with gimbal control
// ============================================================

import { BOOSTER, SHIP, G0 } from './constants.js'

// Engine ring layouts (position = distance from center axis, axial pos from engine plane)
// Booster: 33 Raptor 2 SL
//   Inner (3):  gimbal ±15°, radius 0.9m
//   Middle (10): gimbal ±8°, radius 2.5m
//   Outer (20): fixed, radius 4.0m
// Ship: 6 engines
//   SL (3): gimbal ±15°, radius 1.2m
//   Vac (3): fixed, radius 2.8m

const DEG = Math.PI / 180

export const BOOSTER_ENGINES = {
  inner: {
    count: 3,
    thrust: BOOSTER.thrustPerEngine,
    isp: BOOSTER.isp,
    maxGimbal: 15 * DEG,
    axialPos: 0, // at engine plane
  },
  middle: {
    count: 10,
    thrust: BOOSTER.thrustPerEngine,
    isp: BOOSTER.isp,
    maxGimbal: 8 * DEG,
    axialPos: 0,
  },
  outer: {
    count: 20,
    thrust: BOOSTER.thrustPerEngine,
    isp: BOOSTER.isp,
    maxGimbal: 0, // fixed
    axialPos: 0,
  },
}

export const SHIP_ENGINES = {
  sl: {
    count: 3,
    thrust: SHIP.thrustPerSL,
    isp: SHIP.ispSL,
    maxGimbal: 15 * DEG,
    axialPos: 0,
  },
  vac: {
    count: 3,
    thrust: SHIP.thrustPerVac,
    isp: SHIP.ispVac,
    maxGimbal: 0, // fixed
    axialPos: 0,
  },
}

/**
 * Compute total thrust and torque from engine gimbal
 * In 2D, gimbal deflects thrust laterally, producing a torque about CoM.
 *
 * @param {'booster'|'ship'} vehicle
 * @param {number} gimbalAngle — commanded gimbal angle (rad, positive = pitch up)
 * @param {number} com — center of mass position from engine plane (m)
 * @param {number} throttle — 0 to 1
 * @param {Object} activeEngines — which engine groups are active
 *   For booster: { inner: bool, middle: bool, outer: bool }
 *   For ship: { sl: bool, vac: bool }
 * @returns {{ totalThrust: number, thrustTorque: number, massFlow: number }}
 */
export function computeEngineForces(vehicle, gimbalAngle, com, throttle, activeEngines) {
  const layout = vehicle === 'booster' ? BOOSTER_ENGINES : SHIP_ENGINES
  let totalThrust = 0
  let totalTorque = 0
  let totalMassFlow = 0

  for (const [ring, spec] of Object.entries(layout)) {
    if (!activeEngines[ring]) continue

    const count = spec.count
    const thrustPerEngine = spec.thrust * throttle

    // Clamp gimbal to this ring's max
    const clampedGimbal = Math.max(-spec.maxGimbal, Math.min(spec.maxGimbal, gimbalAngle))

    // Axial thrust (along body axis)
    const axialThrust = thrustPerEngine * Math.cos(clampedGimbal) * count
    // Lateral thrust (perpendicular to body)
    const lateralThrust = thrustPerEngine * Math.sin(clampedGimbal) * count

    totalThrust += axialThrust

    // Torque = lateral force × lever arm (distance from engines to CoM)
    // Engines are at axialPos (≈0), CoM is above → lever = com - axialPos
    const lever = com - spec.axialPos
    totalTorque += lateralThrust * lever

    // Mass flow
    totalMassFlow += count * thrustPerEngine / (spec.isp * G0)
  }

  return { totalThrust, thrustTorque: totalTorque, massFlow: totalMassFlow }
}

/**
 * Get default active engine configuration for a phase
 */
export function getActiveEngines(vehicle, phase) {
  if (vehicle === 'booster') {
    if (phase === 'ascent') return { inner: true, middle: true, outer: true }
    if (phase === 'boostback') return { inner: true, middle: true, outer: false }
    if (phase === 'landing' || phase === 'hover') return { inner: true, middle: false, outer: false }
    return { inner: false, middle: false, outer: false }
  }
  // Ship — all engines during powered flight
  if (phase === 'ascent' || phase === 'staged') return { sl: true, vac: true }
  return { sl: false, vac: false }
}

/**
 * Get total thrust and mass flow for a specific engine configuration
 */
export function getConfigThrust(vehicle, activeEngines, throttle) {
  const layout = vehicle === 'booster' ? BOOSTER_ENGINES : SHIP_ENGINES
  let thrust = 0
  let massFlow = 0

  for (const [ring, spec] of Object.entries(layout)) {
    if (!activeEngines[ring]) continue
    thrust += spec.count * spec.thrust * throttle
    massFlow += spec.count * spec.thrust * throttle / (spec.isp * G0)
  }

  return { thrust, massFlow }
}
