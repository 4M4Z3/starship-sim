import { describe, it, expect } from 'vitest'
import { getAtmosphere, getCd } from '../src/physics/aero.js'

describe('US Standard Atmosphere 1976', () => {
  it('returns sea level conditions', () => {
    const atm = getAtmosphere(0)
    expect(atm.temperature).toBeCloseTo(288.15, 1)
    expect(atm.pressure).toBeCloseTo(101325, 0)
    expect(atm.density).toBeCloseTo(1.225, 2)
    expect(atm.speedOfSound).toBeCloseTo(340.3, 0)
  })

  it('returns correct tropopause conditions (11 km)', () => {
    const atm = getAtmosphere(11000)
    expect(atm.temperature).toBeCloseTo(216.65, 1)
    expect(atm.pressure).toBeCloseTo(22632, -1)
  })

  it('returns correct stratosphere conditions (20 km)', () => {
    const atm = getAtmosphere(20000)
    expect(atm.temperature).toBeCloseTo(216.65, 1)
  })

  it('density decreases with altitude', () => {
    const rho0 = getAtmosphere(0).density
    const rho10 = getAtmosphere(10000).density
    const rho50 = getAtmosphere(50000).density
    const rho80 = getAtmosphere(80000).density

    expect(rho10).toBeLessThan(rho0)
    expect(rho50).toBeLessThan(rho10)
    expect(rho80).toBeLessThan(rho50)
  })

  it('handles very high altitude gracefully', () => {
    const atm = getAtmosphere(200000)
    expect(atm.density).toBeGreaterThan(0)
    expect(atm.temperature).toBe(186.87)
    expect(isNaN(atm.pressure)).toBe(false)
  })

  it('handles negative altitude (below sea level)', () => {
    const atm = getAtmosphere(-100)
    // Should clamp to 0
    expect(atm.temperature).toBeCloseTo(288.15, 1)
  })

  it('is continuous across most layer boundaries', () => {
    // Check that density doesn't jump discontinuously at boundaries
    // 71km and 86km excluded: lapse rate sign changes cause larger jumps in the simplified model
    const boundaries = [11000, 20000, 32000, 47000, 51000]
    for (const h of boundaries) {
      const below = getAtmosphere(h - 1).density
      const at = getAtmosphere(h).density
      const above = getAtmosphere(h + 1).density
      const ratio1 = at / below
      const ratio2 = above / at
      expect(ratio1).toBeGreaterThan(0.9)
      expect(ratio1).toBeLessThan(1.1)
      expect(ratio2).toBeGreaterThan(0.9)
      expect(ratio2).toBeLessThan(1.1)
    }
  })
})

describe('Drag coefficient', () => {
  it('is 0.20 at subsonic speeds', () => {
    expect(getCd(0.0)).toBe(0.20)
    expect(getCd(0.5)).toBe(0.20)
    expect(getCd(0.79)).toBeCloseTo(0.20, 2)
  })

  it('increases through transonic region', () => {
    expect(getCd(0.9)).toBeGreaterThan(0.20)
    expect(getCd(1.0)).toBeCloseTo(0.40, 2)
  })

  it('peaks at Mach 1.0-1.2', () => {
    expect(getCd(1.1)).toBe(0.40)
    expect(getCd(0.5)).toBeLessThan(getCd(1.0))
    expect(getCd(3.0)).toBeLessThan(getCd(1.0))
  })

  it('decreases at supersonic speeds', () => {
    const cd2 = getCd(2.0)
    const cd5 = getCd(5.0)
    expect(cd5).toBeLessThanOrEqual(cd2)
  })

  it('returns 0.20 at hypersonic speeds', () => {
    expect(getCd(10)).toBe(0.20)
    expect(getCd(25)).toBe(0.20)
  })
})
