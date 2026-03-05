import { describe, it, expect } from 'vitest'
import { computeShipControl, computeBoosterControl } from '../src/physics/control.js'

describe('Ship attitude control', () => {
  it('commands vertical during early ascent', () => {
    const ctrl = computeShipControl({
      missionTime: 2, vr: 10, vt: 0,
      staged: false, altitude: 100,
      angle: 0, omega: 0,
    })
    // Target should be 0 (vertical) during first 5 seconds
    expect(ctrl.targetAngle).toBeCloseTo(0, 3)
  })

  it('begins pitch program after tower clear', () => {
    const ctrl = computeShipControl({
      missionTime: 20, vr: 200, vt: 100,
      staged: false, altitude: 5000,
      angle: 0, omega: 0,
    })
    // Target should be positive (tilting prograde)
    expect(ctrl.targetAngle).toBeGreaterThan(0)
  })

  it('commands near-horizontal after staging', () => {
    const ctrl = computeShipControl({
      missionTime: 200, vr: 500, vt: 3000,
      staged: true, altitude: 150000,
      angle: 1.2, omega: 0,
    })
    // Should be 55-92 degrees
    expect(ctrl.targetAngle).toBeGreaterThan(55 * Math.PI / 180)
    expect(ctrl.targetAngle).toBeLessThan(92 * Math.PI / 180)
  })

  it('uses RCS in vacuum, gimbal in atmosphere', () => {
    // In atmosphere
    const atmo = computeShipControl({
      missionTime: 30, vr: 300, vt: 200,
      staged: false, altitude: 30000,
      angle: 0.3, omega: 0.01,
    })
    expect(atmo.gimbalAngle).not.toBe(0)
    expect(atmo.rcsTorque).toBe(0)

    // In vacuum
    const vac = computeShipControl({
      missionTime: 300, vr: 100, vt: 5000,
      staged: true, altitude: 150000,
      angle: 1.2, omega: 0.01,
    })
    expect(vac.gimbalAngle).toBe(0)
    expect(vac.rcsTorque).not.toBe(0)
  })

  it('clamps gimbal to max deflection', () => {
    // Large error should saturate gimbal
    const ctrl = computeShipControl({
      missionTime: 30, vr: 300, vt: 200,
      staged: false, altitude: 30000,
      angle: -1.0, omega: 0, // way off target
    })
    const maxGimbal = 15 * Math.PI / 180
    expect(Math.abs(ctrl.gimbalAngle)).toBeLessThanOrEqual(maxGimbal + 0.001)
  })
})

describe('Booster attitude control', () => {
  it('targets retrograde during coast', () => {
    const ctrl = computeBoosterControl({
      boosterPhase: 'coast',
      boosterVr: 500, boosterVt: 1000,
      boosterTheta: 0.01,
      boosterAngle: 0, boosterOmega: 0,
      altitude: 80000,
    })
    // Should target roughly opposite of velocity (PI from flight path)
    const flightPath = Math.atan2(1000, 500)
    expect(ctrl.targetAngle).toBeCloseTo(flightPath + Math.PI, 1)
  })

  it('targets vertical during hover', () => {
    const ctrl = computeBoosterControl({
      boosterPhase: 'hover',
      boosterVr: 0, boosterVt: 0,
      boosterTheta: 0,
      boosterAngle: 0, boosterOmega: 0,
      altitude: 30,
    })
    expect(ctrl.targetAngle).toBeCloseTo(0, 3)
  })

  it('uses grid fins in atmosphere', () => {
    const ctrl = computeBoosterControl({
      boosterPhase: 'descent',
      boosterVr: -200, boosterVt: -50,
      boosterTheta: 0,
      boosterAngle: 1.0, boosterOmega: 0.1,
      altitude: 30000,
    })
    expect(ctrl.finDeflection).not.toBe(0)
  })

  it('uses RCS when unpowered', () => {
    const ctrl = computeBoosterControl({
      boosterPhase: 'coast',
      boosterVr: 500, boosterVt: 1000,
      boosterTheta: 0,
      boosterAngle: 0, boosterOmega: 0,
      altitude: 70000,
    })
    expect(ctrl.rcsTorque).not.toBe(0)
    expect(ctrl.gimbalAngle).toBe(0) // no engines during coast
  })
})
