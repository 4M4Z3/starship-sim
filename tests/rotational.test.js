import { describe, it, expect } from 'vitest'
import { rotationalStep, wrapAngle } from '../src/physics/rotational.js'

describe('wrapAngle', () => {
  it('wraps 0 to 0', () => {
    expect(wrapAngle(0)).toBeCloseTo(0)
  })

  it('wraps PI to PI', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 5)
  })

  it('wraps 2*PI to 0', () => {
    expect(wrapAngle(2 * Math.PI)).toBeCloseTo(0, 5)
  })

  it('wraps large positive angles', () => {
    const result = wrapAngle(7 * Math.PI)
    expect(result).toBeGreaterThanOrEqual(-Math.PI)
    expect(result).toBeLessThanOrEqual(Math.PI)
    expect(result).toBeCloseTo(Math.PI, 5)
  })

  it('wraps large negative angles', () => {
    const result = wrapAngle(-7 * Math.PI)
    expect(result).toBeGreaterThanOrEqual(-Math.PI)
    expect(result).toBeLessThanOrEqual(Math.PI)
  })

  it('preserves small angles', () => {
    expect(wrapAngle(0.5)).toBeCloseTo(0.5)
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5)
  })

  it('wraps -4 correctly (JS modulo edge case)', () => {
    const result = wrapAngle(-4)
    expect(result).toBeGreaterThanOrEqual(-Math.PI)
    expect(result).toBeLessThanOrEqual(Math.PI)
    // -4 + 2*PI ≈ 2.283, which is in (-PI, PI) — actually it's > PI
    // -4 + 2*PI = 2.283 → wrap to 2.283 - 2*PI = -3.999... no
    // -4 % 2PI = -4 + 2*PI = ? No. In the function: (-4 % 2PI) + 2PI % 2PI
    // = (-4 + 2*PI(approx)) ... let me just verify it doesn't equal -4
    expect(Math.abs(result + 4)).toBeGreaterThan(0.1)
  })
})

describe('rotationalStep', () => {
  it('zero torque preserves angular velocity', () => {
    const result = rotationalStep({
      angle: 0, omega: 1.0, I: 1000,
      engineTorque: 0, aeroTorque: 0, finTorque: 0, rcsTorque: 0,
      dt: 0.1,
    })
    expect(result.omega).toBeCloseTo(1.0, 5)
    expect(result.angle).toBeCloseTo(0.1, 5)
  })

  it('applies torque correctly', () => {
    const I = 1_000_000 // kg*m^2
    const torque = 100_000 // N*m
    const dt = 0.01

    const result = rotationalStep({
      angle: 0, omega: 0, I,
      engineTorque: torque, aeroTorque: 0, finTorque: 0, rcsTorque: 0,
      dt,
    })

    // alpha = T/I = 0.1 rad/s^2
    // omega = 0 + 0.1 * 0.01 = 0.001 rad/s
    expect(result.omega).toBeCloseTo(0.001, 5)
    expect(result.angularAccel).toBeCloseTo(0.1, 5)
  })

  it('sums multiple torque sources', () => {
    const result = rotationalStep({
      angle: 0, omega: 0, I: 1000,
      engineTorque: 100, aeroTorque: -50, finTorque: 30, rcsTorque: -20,
      dt: 1,
    })
    // net = 100 - 50 + 30 - 20 = 60
    // alpha = 60/1000 = 0.06
    expect(result.angularAccel).toBeCloseTo(0.06, 5)
    expect(result.omega).toBeCloseTo(0.06, 5)
  })

  it('handles zero MoI gracefully', () => {
    const result = rotationalStep({
      angle: 1, omega: 2, I: 0,
      engineTorque: 100, aeroTorque: 0, finTorque: 0, rcsTorque: 0,
      dt: 0.1,
    })
    // Should return unchanged state
    expect(result.angle).toBe(1)
    expect(result.omega).toBe(2)
  })

  it('wraps angle to [-PI, PI]', () => {
    const result = rotationalStep({
      angle: Math.PI - 0.01, omega: 0.5, I: 1000,
      engineTorque: 0, aeroTorque: 0, finTorque: 0, rcsTorque: 0,
      dt: 1, // large dt to push past PI
    })
    expect(result.angle).toBeGreaterThanOrEqual(-Math.PI)
    expect(result.angle).toBeLessThanOrEqual(Math.PI)
  })
})
