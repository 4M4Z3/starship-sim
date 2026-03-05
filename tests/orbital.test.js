import { describe, it, expect } from 'vitest'
import { getOrbitalElements, createInitialState, physicsStep } from '../src/physics/physics.js'
import { EARTH_RADIUS, GM } from '../src/physics/constants.js'

describe('Orbital elements', () => {
  it('computes circular orbit correctly', () => {
    const r = EARTH_RADIUS + 200_000
    const vCircular = Math.sqrt(GM / r)
    const orb = getOrbitalElements(r, 0, vCircular)

    expect(orb.eccentricity).toBeCloseTo(0, 3)
    expect(orb.apoapsis).toBeCloseTo(200_000, -3) // within 1 km
    expect(orb.periapsis).toBeCloseTo(200_000, -3)
    expect(orb.inOrbit).toBe(true)
  })

  it('computes elliptical orbit correctly', () => {
    const r = EARTH_RADIUS + 200_000
    const vt = Math.sqrt(GM / r) * 1.1 // 10% above circular
    const orb = getOrbitalElements(r, 0, vt)

    expect(orb.eccentricity).toBeGreaterThan(0)
    expect(orb.eccentricity).toBeLessThan(1)
    expect(orb.apoapsis).toBeGreaterThan(200_000)
    expect(orb.periapsis).toBeLessThanOrEqual(200_000 + 1000)
  })

  it('detects suborbital trajectory', () => {
    const r = EARTH_RADIUS + 100_000
    const orb = getOrbitalElements(r, 500, 1000) // slow, falling

    expect(orb.inOrbit).toBe(false)
    expect(orb.periapsis).toBeLessThan(0) // impacts Earth
  })

  it('detects escape trajectory', () => {
    const r = EARTH_RADIUS + 200_000
    const vEscape = Math.sqrt(2 * GM / r) * 1.01
    const orb = getOrbitalElements(r, 0, vEscape)

    expect(orb.eccentricity).toBeGreaterThanOrEqual(1)
    expect(orb.apoapsis).toBe(Infinity)
  })

  it('handles zero angular momentum gracefully', () => {
    const orb = getOrbitalElements(EARTH_RADIUS + 1000, 100, 0)
    expect(isNaN(orb.eccentricity)).toBe(false)
  })
})

describe('Orbital energy conservation', () => {
  it('preserves energy during coast (no thrust, no drag)', () => {
    // Start in a suborbital arc well above atmosphere (no drag)
    const state = createInitialState()
    state.r = EARTH_RADIUS + 500_000
    state.vr = 0
    state.vt = Math.sqrt(GM / state.r) * 0.99 // slightly below circular
    state.altitude = 500_000
    state.staged = true
    state.shipFuel = 0
    state.totalMass = 100_000

    const E0 = 0.5 * (state.vr ** 2 + state.vt ** 2) - GM / state.r

    let s = state
    const dt = 0.1
    for (let i = 0; i < 1000; i++) {
      s = physicsStep(s, dt, 'orbit')
    }

    const E1 = 0.5 * (s.vr ** 2 + s.vt ** 2) - GM / s.r
    const relError = Math.abs((E1 - E0) / E0)

    // Energy should be conserved to better than 1% over 100s of flight
    expect(relError).toBeLessThan(0.01)
  })
})
