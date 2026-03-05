import { describe, it, expect } from 'vitest'
import { createInitialState, physicsStep } from '../src/physics/physics.js'
import { EARTH_RADIUS, BOOSTER, SHIP } from '../src/physics/constants.js'

/**
 * Run the simulation for a given number of seconds.
 * Returns the final state.
 */
function runSim(seconds, phase = 'launching', dt = 0.05) {
  let state = createInitialState()
  const steps = Math.ceil(seconds / dt)

  for (let i = 0; i < steps; i++) {
    const result = physicsStep(state, dt, phase)

    // Phase transitions
    if (result.phase === 'staged' && phase === 'launching') {
      phase = 'staged'
    }
    if (result.phase === 'orbit') {
      phase = 'orbit'
    }
    if (result.phase === 'fuel_exhausted') {
      phase = 'fuel_exhausted'
    }

    state = result
  }

  return { state, phase }
}

describe('Full ascent integration', () => {
  it('lifts off the pad (altitude > 0 after 5s)', () => {
    const { state } = runSim(5)
    expect(state.altitude).toBeGreaterThan(0)
    expect(state.vr).toBeGreaterThan(0)
  })

  it('reaches significant altitude by T+60s', () => {
    const { state } = runSim(60)
    expect(state.altitude).toBeGreaterThan(5_000) // >5 km (throttled ascent with gravity turn)
    expect(state.speed).toBeGreaterThan(300) // >300 m/s
  })

  it('stages within reasonable time', () => {
    const { state, phase } = runSim(300)
    // Should have staged by T+5min
    expect(state.staged).toBe(true)
    expect(state.stageTime).toBeGreaterThan(100)
    expect(state.stageTime).toBeLessThan(300)
  })

  it('booster enters return sequence after staging', () => {
    const { state } = runSim(300)
    expect(state.staged).toBe(true)
    // Booster should be in some return phase
    expect(['coast', 'boostback', 'descent', 'landing', 'hover', 'splashed']).toContain(state.boosterPhase)
  })

  it('ship fuel depletes correctly', () => {
    const { state } = runSim(60)
    // Some booster fuel should be consumed
    expect(state.boosterFuel).toBeLessThan(BOOSTER.ascentPropellant)
    expect(state.boosterFuel).toBeGreaterThan(0) // not all gone in 60s
  })

  it('mission time accumulates', () => {
    const { state } = runSim(100)
    expect(state.missionTime).toBeCloseTo(100, 0)
  })

  it('does not produce NaN values', () => {
    const { state } = runSim(200)
    const critical = ['r', 'theta', 'vr', 'vt', 'altitude', 'speed', 'angle', 'omega', 'totalMass']
    for (const key of critical) {
      expect(isNaN(state[key])).toBe(false)
      expect(isFinite(state[key])).toBe(true)
    }
  })

  it('total mass decreases during powered flight', () => {
    let state = createInitialState()

    // Run a few steps to build up thrust and burn fuel
    for (let i = 0; i < 10; i++) {
      state = physicsStep(state, 0.1, 'launching')
    }
    const mass1 = state.totalMass

    for (let i = 0; i < 100; i++) {
      state = physicsStep(state, 0.1, 'launching')
    }
    // After 10 more seconds of burn, mass should decrease
    expect(state.totalMass).toBeLessThan(mass1)
  })
})

describe('Gravity turn profile', () => {
  it('pitch angle increases during ascent', () => {
    const { state: s30 } = runSim(30)
    const { state: s90 } = runSim(90)

    // After 30s should still be mostly vertical
    expect(s30.angle).toBeLessThan(30 * Math.PI / 180)
    // After 90s should have pitched over significantly
    expect(s90.angle).toBeGreaterThan(10 * Math.PI / 180)
  })
})

describe('Idle phase', () => {
  it('does not move when idle', () => {
    const state = createInitialState()
    const result = physicsStep(state, 1.0, 'idle')
    expect(result.altitude).toBe(0)
    expect(result.vr).toBe(0)
    expect(result.vt).toBe(0)
  })
})

describe('Aero forces', () => {
  it('experiences drag during ascent', () => {
    const { state } = runSim(30)
    expect(state.dragForce).toBeGreaterThan(0)
    expect(state.mach).toBeGreaterThan(0)
  })

  it('max Q occurs in expected range', () => {
    const { state } = runSim(120)
    // Max Q should be between 10 kPa and 50 kPa for Starship
    expect(state.maxQ).toBeGreaterThan(5_000)
    expect(state.maxQ).toBeLessThan(100_000)
  })
})
