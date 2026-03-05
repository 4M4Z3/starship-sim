// ============================================================
// Mission Scenarios — Predefined flight profiles
// ============================================================

import { BOOSTER, SHIP, TARGET_ORBIT } from './constants.js'

/**
 * Each scenario overrides parts of the default vehicle configuration
 * and initial state. The physics engine uses these to customize behavior.
 *
 * Fields:
 *   name        — display name
 *   description — short description for the UI
 *   category    — grouping label
 *   overrides   — partial state overrides applied to createInitialState()
 *   config      — runtime config read by physics/control (e.g. target orbit)
 */
const SCENARIOS = {
  ift5: {
    name: 'IFT-5 (Default)',
    description: 'Full stack orbital test flight — no payload, booster return to launch site',
    category: 'Orbital',
    overrides: {},
    config: {
      targetOrbit: TARGET_ORBIT,
      payload: 0,
    },
  },

  maxPayload: {
    name: 'Max Payload',
    description: '150 ton payload to LEO — reduced margins, no booster return fuel',
    category: 'Orbital',
    overrides: {
      boosterFuel: BOOSTER.propellantMass, // use all fuel for ascent (no return reserve)
    },
    config: {
      targetOrbit: TARGET_ORBIT,
      payload: 150_000, // 150t to LEO
      boosterReturnFuelOverride: 0, // no return fuel
    },
  },

  highOrbit: {
    name: 'High Orbit',
    description: 'Target 400 km orbit — ISS altitude, lighter payload',
    category: 'Orbital',
    overrides: {},
    config: {
      targetOrbit: 400_000,
      payload: 50_000,
    },
  },

  suborbital: {
    name: 'Suborbital Hop',
    description: 'Booster-only suborbital arc — ship separates early, booster returns',
    category: 'Test',
    overrides: {
      boosterFuel: BOOSTER.ascentPropellant * 0.4, // 40% fuel load
    },
    config: {
      targetOrbit: 0, // no orbit target — engine cut at staging
      payload: 0,
      earlyStaging: true, // stage at 40% fuel instead of depletion
      earlyStagingFuelThreshold: 0.01, // stage when booster fuel near zero
    },
  },

  boosterOnly: {
    name: 'Booster Return',
    description: 'Focus on booster — fast-forward to separation, watch the full return sequence',
    category: 'Test',
    overrides: {
      // Start already separated with realistic post-sep conditions
      preStaged: true,
      preStagedState: {
        altitude: 65_000,
        vr: 800,
        vt: 1200,
        boosterAngle: 0.3,
      },
    },
    config: {
      targetOrbit: 0,
      payload: 0,
    },
  },

  heavyPayload: {
    name: 'Tanker Mission',
    description: 'Propellant tanker variant — 200t fuel delivery to orbit for refueling',
    category: 'Operational',
    overrides: {},
    config: {
      targetOrbit: TARGET_ORBIT,
      payload: 200_000, // tanker carries ~200t of prop as "payload"
    },
  },
}

export default SCENARIOS

/**
 * Apply scenario overrides to an initial state object.
 * Returns a new state with overrides merged in.
 */
export function applyScenario(baseState, scenarioId) {
  const scenario = SCENARIOS[scenarioId]
  if (!scenario) return baseState

  const s = { ...baseState }
  const { overrides, config } = scenario

  // Apply direct state overrides
  if (overrides.boosterFuel != null) {
    s.boosterFuel = overrides.boosterFuel
  }

  // Handle payload mass affecting ship total mass
  if (config.payload > 0) {
    // Additional payload mass is tracked via config, read by physics engine
    s.scenarioPayload = config.payload
  }

  // Pre-staged scenario: start after separation
  if (overrides.preStaged) {
    const ps = overrides.preStagedState
    s.staged = true
    s.phase = 'staged'
    s.stageTime = 0
    s.missionTime = 160 // approximate T+ for staging
    s.altitude = ps.altitude
    s.r = ps.altitude + 6_371_000
    s.vr = ps.vr
    s.vt = ps.vt
    s.angle = ps.boosterAngle || 0

    // Booster inherits state at separation
    s.boosterR = s.r
    s.boosterTheta = 0
    s.boosterVr = ps.vr
    s.boosterVt = ps.vt
    s.boosterAngle = ps.boosterAngle || 0
    s.boosterOmega = 0
    s.boosterPhase = 'coast'
    s.boosterReturnFuel = BOOSTER.returnPropellant
    s.boosterBoostbackFuel = BOOSTER.boostbackFuel
    s.boosterLandingFuel = BOOSTER.landingFuel
    s.boosterSepTheta = 0
    s.enginesOn = true
  }

  // Store config on state for physics engine to read
  s.scenarioConfig = config

  return s
}
