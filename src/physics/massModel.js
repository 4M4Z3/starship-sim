// ============================================================
// Mass Model — CoM and Moment of Inertia via Parallel Axis Theorem
// Position measured from engine plane (bottom = 0, top = length)
// ============================================================

import { BOOSTER, SHIP } from './constants.js'

// Discrete structural mass elements for Super Heavy booster
// LOX:CH4 mass ratio ≈ 3.5:1 → LOX is 77.8%, CH4 is 22.2%
const BOOSTER_ELEMENTS = [
  { name: 'engines',       mass: 50000,  pos: 1.5,  len: 3 },   // 33 Raptors (~1.5t each)
  { name: 'thrust_struct', mass: 25000,  pos: 4,    len: 2 },   // thrust puck
  { name: 'tank_lower',    mass: 15000,  pos: 12,   len: 4 },
  { name: 'lox_tank_wall', mass: 20000,  pos: 22,   len: 24 },
  { name: 'intertank',     mass: 12000,  pos: 37,   len: 3 },
  { name: 'ch4_tank_wall', mass: 15000,  pos: 48,   len: 16 },
  { name: 'tank_upper',    mass: 12000,  pos: 58,   len: 4 },
  { name: 'grid_fins',     mass: 16000,  pos: 63,   len: 2 },   // 4 large Ti grid fins
  { name: 'interstage',    mass: 10000,  pos: 67,   len: 4 },
  { name: 'plumbing',      mass: 25000,  pos: 34,   len: 40 },  // valves, feedlines, avionics, wiring
]
// Dry structural total: 200,000 kg (matches BOOSTER.dryMass)

// Fuel tank geometry for booster
const BOOSTER_LOX_TANK = { posStart: 10, posEnd: 34, fraction: 0.778 }  // LOX (bottom)
const BOOSTER_CH4_TANK = { posStart: 40, posEnd: 56, fraction: 0.222 }  // CH4 (top)

// Discrete structural mass elements for Starship (ship)
const SHIP_ELEMENTS = [
  { name: 'engines',       mass: 10000,  pos: 1.5,  len: 3 },
  { name: 'thrust_struct', mass: 12000,  pos: 4,    len: 2 },
  { name: 'lox_tank_wall', mass: 15000,  pos: 14,   len: 16 },
  { name: 'intertank',     mass: 8000,   pos: 24,   len: 2 },
  { name: 'ch4_tank_wall', mass: 12000,  pos: 32,   len: 10 },
  { name: 'upper_dome',    mass: 8000,   pos: 42,   len: 4 },
  { name: 'heat_shield',   mass: 20000,  pos: 45,   len: 3 },
  { name: 'nosecone',      mass: 15000,  pos: 47,   len: 6 },
]
// Dry structural: 100,000 kg (IFT-5 configuration, no payload)

const SHIP_LOX_TANK = { posStart: 6, posEnd: 22, fraction: 0.778 }
const SHIP_CH4_TANK = { posStart: 27, posEnd: 37, fraction: 0.222 }

// Payload as a mass element
const SHIP_PAYLOAD = { name: 'payload', mass: SHIP.payloadMass, pos: 42, len: 6 }

/**
 * Compute center of mass and moment of inertia for a vehicle
 * @param {'booster'|'ship'} vehicle
 * @param {number} fuelMass — current fuel mass (kg)
 * @returns {{ totalMass: number, com: number, I: number }}
 */
export function computeMassProperties(vehicle, fuelMass) {
  const elements = vehicle === 'booster' ? BOOSTER_ELEMENTS : SHIP_ELEMENTS
  const loxTank = vehicle === 'booster' ? BOOSTER_LOX_TANK : SHIP_LOX_TANK
  const ch4Tank = vehicle === 'booster' ? BOOSTER_CH4_TANK : SHIP_CH4_TANK
  const maxFuel = vehicle === 'booster' ? BOOSTER.propellantMass : SHIP.propellantMass

  // Build mass list: structural + fuel
  const masses = []

  // Structural elements
  for (const el of elements) {
    masses.push({ mass: el.mass, pos: el.pos, len: el.len })
  }

  // Payload (ship only)
  if (vehicle === 'ship') {
    masses.push({ mass: SHIP_PAYLOAD.mass, pos: SHIP_PAYLOAD.pos, len: SHIP_PAYLOAD.len })
  }

  // Fuel in tanks — modeled as uniform distribution within each tank
  // As fuel depletes, both tanks drain proportionally
  const fuelFraction = Math.max(0, Math.min(1, fuelMass / maxFuel))

  // LOX tank fuel
  const loxMass = fuelMass * loxTank.fraction
  const loxLen = (loxTank.posEnd - loxTank.posStart) * fuelFraction // fuel level drops
  const loxPos = loxTank.posStart + loxLen / 2 // fuel settles at bottom of tank
  if (loxMass > 0) {
    masses.push({ mass: loxMass, pos: loxPos, len: Math.max(1, loxLen) })
  }

  // CH4 tank fuel
  const ch4Mass = fuelMass * ch4Tank.fraction
  const ch4Len = (ch4Tank.posEnd - ch4Tank.posStart) * fuelFraction
  const ch4Pos = ch4Tank.posStart + ch4Len / 2
  if (ch4Mass > 0) {
    masses.push({ mass: ch4Mass, pos: ch4Pos, len: Math.max(1, ch4Len) })
  }

  // Compute total mass and center of mass
  let totalMass = 0
  let momentSum = 0
  for (const m of masses) {
    totalMass += m.mass
    momentSum += m.mass * m.pos
  }
  const com = totalMass > 0 ? momentSum / totalMass : 0

  // Compute moment of inertia using parallel axis theorem
  // I_total = Σ (I_element + m * d²)
  // I_element for a rod = (1/12) * m * L²
  let I = 0
  for (const m of masses) {
    const d = m.pos - com
    const I_self = (1 / 12) * m.mass * m.len * m.len // thin rod approximation
    I += I_self + m.mass * d * d
  }

  return { totalMass, com, I }
}

// Export geometry constants for use in aero (CoP, length, etc.)
export const BOOSTER_LENGTH = BOOSTER.length // 69m
export const SHIP_LENGTH = SHIP.length // 50m
export const GRID_FIN_POS = 63 // meters from engine plane
