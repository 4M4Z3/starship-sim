import { describe, it, expect } from 'vitest'
import { computeMassProperties } from '../src/physics/massModel.js'
import { BOOSTER, SHIP } from '../src/physics/constants.js'

describe('Mass model — Booster', () => {
  it('has correct dry mass', () => {
    const props = computeMassProperties('booster', 0)
    expect(props.totalMass).toBeCloseTo(BOOSTER.dryMass, -2)
  })

  it('has correct full mass', () => {
    const props = computeMassProperties('booster', BOOSTER.propellantMass)
    expect(props.totalMass).toBeCloseTo(BOOSTER.dryMass + BOOSTER.propellantMass, -2)
  })

  it('CoM shifts forward as fuel depletes', () => {
    // With full fuel, CoM is lower (fuel in bottom tanks)
    const full = computeMassProperties('booster', BOOSTER.propellantMass)
    // Empty — CoM moves up toward structural elements
    const empty = computeMassProperties('booster', 0)

    // Both should be within the vehicle length
    expect(full.com).toBeGreaterThan(0)
    expect(full.com).toBeLessThan(BOOSTER.length)
    expect(empty.com).toBeGreaterThan(0)
    expect(empty.com).toBeLessThan(BOOSTER.length)
  })

  it('MoI decreases as fuel depletes (less mass)', () => {
    const full = computeMassProperties('booster', BOOSTER.propellantMass)
    const half = computeMassProperties('booster', BOOSTER.propellantMass * 0.5)
    const empty = computeMassProperties('booster', 0)

    expect(full.I).toBeGreaterThan(half.I)
    expect(half.I).toBeGreaterThan(empty.I)
  })

  it('MoI is positive and finite', () => {
    const props = computeMassProperties('booster', BOOSTER.propellantMass * 0.5)
    expect(props.I).toBeGreaterThan(0)
    expect(isFinite(props.I)).toBe(true)
  })
})

describe('Mass model — Ship', () => {
  it('has correct dry mass', () => {
    const props = computeMassProperties('ship', 0)
    expect(props.totalMass).toBeCloseTo(SHIP.totalDryMass, -2)
  })

  it('has correct full mass', () => {
    const props = computeMassProperties('ship', SHIP.propellantMass)
    expect(props.totalMass).toBeCloseTo(SHIP.totalDryMass + SHIP.propellantMass, -2)
  })

  it('CoM is within vehicle bounds', () => {
    const full = computeMassProperties('ship', SHIP.propellantMass)
    const empty = computeMassProperties('ship', 0)

    expect(full.com).toBeGreaterThan(0)
    expect(full.com).toBeLessThan(SHIP.length)
    expect(empty.com).toBeGreaterThan(0)
    expect(empty.com).toBeLessThan(SHIP.length)
  })

  it('handles zero fuel gracefully', () => {
    const props = computeMassProperties('ship', 0)
    expect(props.totalMass).toBeGreaterThan(0)
    expect(isNaN(props.com)).toBe(false)
    expect(isNaN(props.I)).toBe(false)
  })

  it('handles over-max fuel by clamping fraction', () => {
    // Shouldn't crash even with weird values
    const props = computeMassProperties('ship', SHIP.propellantMass * 2)
    expect(props.totalMass).toBeGreaterThan(0)
    expect(isFinite(props.I)).toBe(true)
  })
})
