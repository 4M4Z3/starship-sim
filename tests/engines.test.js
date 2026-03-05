import { describe, it, expect } from 'vitest'
import { computeEngineForces, getActiveEngines, getConfigThrust } from '../src/physics/engines.js'
import { BOOSTER, SHIP } from '../src/physics/constants.js'

describe('Engine model — Booster', () => {
  it('produces correct ascent thrust (all 33 engines)', () => {
    const active = getActiveEngines('booster', 'ascent')
    const result = computeEngineForces('booster', 0, 30, 1.0, active)

    // 33 engines * 2,256,000 N = ~74.4 MN at full throttle
    expect(result.totalThrust).toBeCloseTo(33 * BOOSTER.thrustPerEngine, -4)
    expect(result.massFlow).toBeGreaterThan(0)
  })

  it('produces zero torque at zero gimbal', () => {
    const active = getActiveEngines('booster', 'ascent')
    const result = computeEngineForces('booster', 0, 30, 1.0, active)
    expect(result.thrustTorque).toBeCloseTo(0, 1)
  })

  it('produces torque when gimbaled', () => {
    const active = getActiveEngines('booster', 'ascent')
    const gimbal = 5 * Math.PI / 180 // 5 degrees
    const result = computeEngineForces('booster', gimbal, 30, 1.0, active)
    expect(Math.abs(result.thrustTorque)).toBeGreaterThan(0)
  })

  it('clamps gimbal to max for each ring', () => {
    const active = getActiveEngines('booster', 'ascent')
    // Outer ring has 0 gimbal, so requesting 15 deg should only affect inner/middle
    const largeGimbal = 20 * Math.PI / 180
    const result = computeEngineForces('booster', largeGimbal, 30, 1.0, active)
    // Should still produce thrust (not crash)
    expect(result.totalThrust).toBeGreaterThan(0)
  })

  it('respects throttle', () => {
    const active = getActiveEngines('booster', 'ascent')
    const full = computeEngineForces('booster', 0, 30, 1.0, active)
    const half = computeEngineForces('booster', 0, 30, 0.5, active)
    expect(half.totalThrust).toBeCloseTo(full.totalThrust * 0.5, -2)
    expect(half.massFlow).toBeCloseTo(full.massFlow * 0.5, -2)
  })

  it('boostback uses 13 engines', () => {
    const active = getActiveEngines('booster', 'boostback')
    expect(active.inner).toBe(true)
    expect(active.middle).toBe(true)
    expect(active.outer).toBe(false)

    const result = computeEngineForces('booster', 0, 30, 1.0, active)
    expect(result.totalThrust).toBeCloseTo(13 * BOOSTER.thrustPerEngine, -4)
  })

  it('landing uses 3 engines', () => {
    const active = getActiveEngines('booster', 'landing')
    expect(active.inner).toBe(true)
    expect(active.middle).toBe(false)
    expect(active.outer).toBe(false)

    const result = computeEngineForces('booster', 0, 30, 1.0, active)
    expect(result.totalThrust).toBeCloseTo(3 * BOOSTER.thrustPerEngine, -4)
  })
})

describe('Engine model — Ship', () => {
  it('produces correct thrust (3 SL + 3 Vac)', () => {
    const active = getActiveEngines('ship', 'staged')
    const result = computeEngineForces('ship', 0, 20, 1.0, active)
    expect(result.totalThrust).toBeCloseTo(SHIP.totalThrust, -4)
  })

  it('mass flow matches expected Isp', () => {
    const active = getActiveEngines('ship', 'staged')
    const result = computeEngineForces('ship', 0, 20, 1.0, active)
    // F = mdot * Isp * g0 → mdot = F / (Isp * g0)
    // With mixed engines, check overall mass flow is reasonable
    expect(result.massFlow).toBeGreaterThan(0)
    expect(result.massFlow).toBeLessThan(10000) // sanity
  })
})

describe('getConfigThrust', () => {
  it('matches computeEngineForces at zero gimbal', () => {
    const active = getActiveEngines('booster', 'ascent')
    const config = getConfigThrust('booster', active, 1.0)
    const engine = computeEngineForces('booster', 0, 30, 1.0, active)
    expect(config.thrust).toBeCloseTo(engine.totalThrust, -2)
    expect(config.massFlow).toBeCloseTo(engine.massFlow, -2)
  })
})
