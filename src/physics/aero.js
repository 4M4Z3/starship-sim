// ============================================================
// Aerodynamics — AoA-based forces, grid fin control, pitch damping
// ============================================================

import { CROSS_SECTION_AREA, BOOSTER, SHIP, GAMMA, R_AIR, G0 } from './constants.js'
import { BOOSTER_LENGTH, SHIP_LENGTH, GRID_FIN_POS } from './massModel.js'

// === Atmosphere (US Standard 1976) ===

export function getAtmosphere(altitude) {
  const h = Math.max(0, altitude)
  let T, P

  if (h <= 11000) {
    T = 288.15 - 6.5e-3 * h
    P = 101325 * Math.pow(T / 288.15, 5.2561)
  } else if (h <= 20000) {
    T = 216.65
    P = 22632 * Math.exp(-G0 * (h - 11000) / (R_AIR * 216.65))
  } else if (h <= 32000) {
    T = 216.65 + 1.0e-3 * (h - 20000)
    P = 5474.87 * Math.pow(T / 216.65, -34.163)
  } else if (h <= 47000) {
    T = 228.65 + 2.8e-3 * (h - 32000)
    P = 868.014 * Math.pow(T / 228.65, -12.201)
  } else if (h <= 51000) {
    T = 270.65
    P = 110.906 * Math.exp(-G0 * (h - 47000) / (R_AIR * 270.65))
  } else if (h <= 71000) {
    T = 270.65 - 2.8e-3 * (h - 51000)
    P = 66.939 * Math.pow(T / 270.65, 17.0816)
  } else if (h <= 86000) {
    T = 214.65 - 2.0e-3 * (h - 71000)
    P = 3.9564 * Math.pow(T / 214.65, 12.2009)
  } else {
    T = 186.87
    P = 0.3734 * Math.exp(-G0 * (h - 86000) / (R_AIR * 186.87))
  }

  const density = P / (R_AIR * T)
  const speedOfSound = Math.sqrt(GAMMA * R_AIR * T)
  return { temperature: T, pressure: P, density, speedOfSound }
}

// === Drag Coefficient (Mach-dependent, nose-on) ===

export function getCd(mach) {
  if (mach < 0.8) return 0.20
  if (mach < 1.0) return 0.20 + (mach - 0.8) / 0.2 * 0.20   // ramp to 0.40
  if (mach < 1.2) return 0.40                                  // transonic peak
  if (mach < 2.0) return 0.40 - (mach - 1.2) / 0.8 * 0.10    // drop to 0.30
  if (mach < 5.0) return 0.30 - (mach - 2.0) / 3.0 * 0.10    // drop to 0.20
  return 0.20
}

// Aerodynamic coefficients
const CN_ALPHA = 2.0    // normal force coefficient slope (1/rad, slender body)
const CMQ = -0.5        // pitch damping coefficient
const CL_ALPHA_FIN = 3.0 // grid fin lift curve slope (1/rad)
const FIN_AREA = 4.0     // m² per grid fin
const NUM_FINS = 4        // 4 grid fins on booster
const MAX_FIN_DEFLECTION = 30 * Math.PI / 180 // ±30°

/**
 * Compute aerodynamic forces and moments for a vehicle
 *
 * @param {Object} params
 * @param {number} params.altitude — meters above sea level
 * @param {number} params.vr — radial velocity (m/s)
 * @param {number} params.vt — tangential velocity (m/s)
 * @param {number} params.angle — body orientation angle (rad, 0 = radial up)
 * @param {number} params.omega — angular velocity (rad/s)
 * @param {number} params.com — center of mass from engine plane (m)
 * @param {'booster'|'ship'} params.vehicle
 * @param {number} [params.finDeflection] — grid fin deflection (rad, booster only)
 * @param {boolean} [params.isBellyFlop] — force belly-flop drag model
 * @returns {{ dragR, dragT, aeroTorque, finTorque, mach, cd, dynamicPressure, alpha }}
 */
export function computeAeroForces({
  altitude, vr, vt, angle, omega, com, vehicle,
  finDeflection = 0, isBellyFlop = false,
}) {
  const atm = getAtmosphere(altitude)
  const speed = Math.sqrt(vr * vr + vt * vt)
  const mach = speed / atm.speedOfSound
  const q = 0.5 * atm.density * speed * speed // dynamic pressure

  if (speed < 0.1 || q < 0.01) {
    return { dragR: 0, dragT: 0, aeroTorque: 0, finTorque: 0, mach, cd: 0, dynamicPressure: q, alpha: 0 }
  }

  const length = vehicle === 'booster' ? BOOSTER_LENGTH : SHIP_LENGTH
  const diameter = vehicle === 'booster' ? BOOSTER.diameter : SHIP.diameter

  // Flight path angle (direction of velocity vector)
  const flightPathAngle = Math.atan2(vt, vr)

  // Angle of attack = body orientation - flight path angle
  let alpha = angle - flightPathAngle
  // Wrap to [-π, π]
  alpha = ((alpha + Math.PI) % (2 * Math.PI)) - Math.PI
  if (alpha < -Math.PI) alpha += 2 * Math.PI

  const sinAlpha = Math.sin(alpha)
  const cosAlpha = Math.cos(alpha)
  const absAlpha = Math.abs(alpha)

  // --- Axial drag (along velocity direction) ---
  // Use effective area based on AoA: interpolate between nose-on and broadside
  let cd, effectiveArea
  if (isBellyFlop) {
    // Forced belly-flop: full broadside drag
    cd = BOOSTER.bellyFlopCd
    effectiveArea = BOOSTER.bellyFlopArea
  } else {
    cd = getCd(mach)
    // Effective area = nose-on * |cos(α)| + side * |sin(α)|
    const sideArea = diameter * length
    effectiveArea = CROSS_SECTION_AREA * Math.abs(cosAlpha) + sideArea * Math.abs(sinAlpha)
  }

  const dragForce = q * cd * effectiveArea
  // Drag opposes velocity
  const dragR = -dragForce * (vr / speed)
  const dragT = -dragForce * (vt / speed)

  // --- Normal force (perpendicular to body axis) ---
  const aRef = diameter * length // reference area for normal force
  let aeroTorque = 0

  if (isBellyFlop) {
    // In belly-flop, body is broadside to airflow. The aerodynamic center
    // is near the geometric center, so the moment arm to CoM is small.
    // The normal force is also much smaller (flow is symmetric around the cylinder).
    // Grid fins and RCS dominate attitude control in this regime.
    const copFromEngine = length * 0.5 // geometric center
    const aeroArm = copFromEngine - com
    // Reduced normal force coefficient for broadside flow
    const normalForce = q * 0.3 * sinAlpha * aRef
    aeroTorque = normalForce * aeroArm
  } else {
    // Normal flight: slender body aerodynamics
    const normalForce = q * CN_ALPHA * sinAlpha * aRef
    // CoP ≈ 55% from nose = 45% from engine plane
    const copFromEngine = length * 0.45
    const aeroArm = copFromEngine - com
    aeroTorque = normalForce * aeroArm
  }

  // --- Pitch damping ---
  // τ_damp = q * Cmq * (L/2v) * L * A_ref * ω
  // Simplified: τ_damp = -½ρ * v * |Cmq| * (L/2)² * A_ref * ω
  const dampingTorque = -0.5 * atm.density * speed * Math.abs(CMQ) * (length / 2) * (length / 2) * aRef * omega

  // --- Grid fin torque (booster only) ---
  let finTorque = 0
  if (vehicle === 'booster' && Math.abs(finDeflection) > 0.001) {
    const clampedFin = Math.max(-MAX_FIN_DEFLECTION, Math.min(MAX_FIN_DEFLECTION, finDeflection))
    // Lift from all fins: F = q * CL_α * δ * A_fin * numFins
    const finLift = q * CL_ALPHA_FIN * clampedFin * FIN_AREA * NUM_FINS
    // Torque about CoM: fins are near top of booster
    const finArm = GRID_FIN_POS - com
    finTorque = finLift * finArm
  }

  return {
    dragR, dragT,
    aeroTorque: aeroTorque + dampingTorque,
    finTorque,
    mach, cd,
    dynamicPressure: q,
    alpha,
  }
}

// Re-export for backward compatibility
export function getDragForce(speed, altitude) {
  const atm = getAtmosphere(altitude)
  const mach = speed / atm.speedOfSound
  const cd = getCd(mach)
  const F = 0.5 * atm.density * speed * speed * cd * CROSS_SECTION_AREA
  return { force: F, mach, cd, density: atm.density, dynamicPressure: 0.5 * atm.density * speed * speed }
}

export function getGravity(altitude) {
  const r = 6_371_000 + altitude
  return G0 * (6_371_000 / r) * (6_371_000 / r)
}
