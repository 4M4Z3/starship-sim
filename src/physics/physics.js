// ============================================================
// Starship 2D Orbital Physics Engine
// Polar coordinates (r, θ) centered on Earth
// All units SI: meters, seconds, kilograms, Newtons
//
// Now with rotational dynamics, mass model, individual engines,
// grid fin control surfaces, and PD attitude control.
// ============================================================

import {
  G0, EARTH_RADIUS, GM, BOOSTER, SHIP, CROSS_SECTION_AREA, TARGET_ORBIT,
} from './constants.js'
import { computeMassProperties } from './massModel.js'
import { computeEngineForces, getActiveEngines, getConfigThrust } from './engines.js'
import { computeAeroForces, getAtmosphere, getCd } from './aero.js'
import { computeShipControl, computeBoosterControl } from './control.js'
import { rotationalStep } from './rotational.js'

// === Orbital Elements ===

export function getOrbitalElements(r, vr, vt) {
  const v2 = vr * vr + vt * vt
  const specificEnergy = v2 / 2 - GM / r
  const h = r * vt

  if (Math.abs(h) < 1) return { apoapsis: -EARTH_RADIUS, periapsis: -EARTH_RADIUS, eccentricity: 1, semiMajorAxis: 0, inOrbit: false }

  if (specificEnergy >= 0) {
    const e = Math.sqrt(1 + 2 * specificEnergy * h * h / (GM * GM))
    const rp = h * h / (GM * (1 + e))
    return { apoapsis: Infinity, periapsis: rp - EARTH_RADIUS, eccentricity: e, semiMajorAxis: Infinity, inOrbit: false }
  }

  const a = -GM / (2 * specificEnergy)
  const e = Math.sqrt(Math.max(0, 1 + 2 * specificEnergy * h * h / (GM * GM)))
  const periapsis = a * (1 - e) - EARTH_RADIUS
  const apoapsis = a * (1 + e) - EARTH_RADIUS

  return {
    semiMajorAxis: a,
    eccentricity: e,
    apoapsis,
    periapsis,
    inOrbit: periapsis > 0,
  }
}

// === Initial State ===

export function createInitialState() {
  return {
    // 2D polar state
    r: EARTH_RADIUS,
    theta: 0,
    vr: 0,
    vt: 0,

    // Rotational state (ship)
    angle: 0,           // body orientation (rad, 0 = radial up)
    omega: 0,           // angular velocity (rad/s)
    shipCom: 0,
    shipI: 0,
    gimbalAngle: 0,
    targetAngle: 0,
    alpha: 0,           // angle of attack

    // Derived
    altitude: 0,
    velocity: 0,
    speed: 0,
    heading: 0,

    // Fuel
    boosterFuel: BOOSTER.ascentPropellant,
    shipFuel: SHIP.propellantMass,

    // Phase
    phase: 'idle',
    missionTime: 0,
    enginesOn: false,
    staged: false,
    stageTime: 0,

    // Booster state after separation
    boosterR: EARTH_RADIUS,
    boosterTheta: 0,
    boosterVr: 0,
    boosterVt: 0,
    boosterHeading: 0,
    boosterLanded: false,
    boosterReturnFuel: BOOSTER.returnPropellant,
    boosterBoostbackFuel: BOOSTER.boostbackFuel,
    boosterLandingFuel: BOOSTER.landingFuel,
    boosterPhase: 'attached',
    boosterSepTheta: 0,
    boosterBurnoffTimer: 0,

    // Booster rotational state
    boosterAngle: 0,
    boosterOmega: 0,
    boosterCom: 0,
    boosterI: 0,
    boosterGimbalAngle: 0,
    boosterFinDeflection: 0,
    boosterTargetAngle: 0,
    boosterAlpha: 0,

    // Orbital elements
    apoapsis: 0,
    periapsis: 0,
    eccentricity: 0,
    inOrbit: false,

    // Telemetry
    totalMass: 0,
    thrustForce: 0,
    thrustAccel: 0,
    dragForce: 0,
    dragAccel: 0,
    gravity: G0,
    netAccel: 0,
    mach: 0,
    cd: 0,
    dynamicPressure: 0,
    maxQ: 0,
    massFlow: 0,
    fuelPercent: 100,
  }
}

// === Translational Step (unchanged polar equations of motion) ===

function stepBody(r, theta, vr, vt, thrustR, thrustT, dragR, dragT, mass, dt) {
  const ar = (vt * vt) / r - GM / (r * r) + (thrustR + dragR) / mass
  const at = -(vr * vt) / r + (thrustT + dragT) / mass

  const newVr = vr + ar * dt
  const newVt = vt + at * dt
  const newR = r + newVr * dt
  const newTheta = theta + newVt / newR * dt

  return { r: newR, theta: newTheta, vr: newVr, vt: newVt, ar, at }
}

// === Main Physics Step ===

export function physicsStep(state, dt, phase) {
  const s = { ...state }
  s.missionTime += dt

  const altitude = s.r - EARTH_RADIUS
  s.altitude = altitude

  // === Mass properties ===
  let currentFuel, massProps
  if (s.staged) {
    currentFuel = s.shipFuel
    massProps = computeMassProperties('ship', currentFuel)
    s.totalMass = massProps.totalMass
    s.shipCom = massProps.com
    s.shipI = massProps.I
  } else {
    // During ascent: booster carries everything
    currentFuel = s.boosterFuel + BOOSTER.returnPropellant
    massProps = computeMassProperties('booster', currentFuel)
    // Add ship mass on top (simplified: ship sits above booster)
    const shipMassProps = computeMassProperties('ship', s.shipFuel)
    s.totalMass = massProps.totalMass + shipMassProps.totalMass
    // Combined CoM (ship is on top of 69m booster)
    const shipOffset = BOOSTER.length
    const combinedCom = (massProps.totalMass * massProps.com + shipMassProps.totalMass * (shipOffset + shipMassProps.com)) / s.totalMass
    // Combined I using parallel axis theorem
    const dBooster = massProps.com - combinedCom
    const dShip = (shipOffset + shipMassProps.com) - combinedCom
    s.shipI = massProps.I + massProps.totalMass * dBooster * dBooster +
              shipMassProps.I + shipMassProps.totalMass * dShip * dShip
    s.shipCom = combinedCom
  }
  s.fuelPercent = ((s.boosterFuel + s.shipFuel) / (BOOSTER.ascentPropellant + SHIP.propellantMass)) * 100

  // Gravity
  s.gravity = GM / (s.r * s.r)

  // Speed
  s.speed = Math.sqrt(s.vr * s.vr + s.vt * s.vt)
  s.velocity = s.speed

  if (phase === 'launching' || phase === 'staged') {
    s.enginesOn = true

    // === Attitude control ===
    const ctrl = computeShipControl({
      missionTime: s.missionTime, vr: s.vr, vt: s.vt,
      staged: s.staged, altitude: s.altitude,
      angle: s.angle, omega: s.omega,
    })
    s.targetAngle = ctrl.targetAngle
    s.gimbalAngle = ctrl.gimbalAngle

    // === Engine forces ===
    let activeEngines, engineThrottle
    if (!s.staged) {
      // Booster ascent — all 33 engines at configured throttle
      activeEngines = getActiveEngines('booster', 'ascent')
      engineThrottle = BOOSTER.throttle

      if (s.boosterFuel > 0) {
        const engineResult = computeEngineForces('booster', ctrl.gimbalAngle, s.shipCom, engineThrottle, activeEngines)
        s.thrustForce = engineResult.totalThrust
        s.massFlow = engineResult.massFlow

        const fuelBurned = s.massFlow * dt
        s.boosterFuel = Math.max(0, s.boosterFuel - fuelBurned)

        // Rotational dynamics from engine gimbal
        const aero = computeAeroForces({
          altitude, vr: s.vr, vt: s.vt, angle: s.angle, omega: s.omega,
          com: s.shipCom, vehicle: 'booster',
        })
        s.alpha = aero.alpha
        s.mach = aero.mach
        s.cd = aero.cd
        s.dynamicPressure = aero.dynamicPressure
        s.dragForce = Math.sqrt(aero.dragR * aero.dragR + aero.dragT * aero.dragT)

        const rot = rotationalStep({
          angle: s.angle, omega: s.omega, I: s.shipI,
          engineTorque: engineResult.thrustTorque,
          aeroTorque: aero.aeroTorque,
          finTorque: 0, rcsTorque: ctrl.rcsTorque, dt,
        })
        s.angle = rot.angle
        s.omega = rot.omega

        // Thrust direction from body angle
        s.heading = s.angle
        const thrustR = s.thrustForce * Math.cos(s.angle)
        const thrustT = s.thrustForce * Math.sin(s.angle)

        if (s.dynamicPressure > s.maxQ) s.maxQ = s.dynamicPressure
        s.thrustAccel = s.thrustForce / s.totalMass
        s.dragAccel = s.dragForce / s.totalMass

        const result = stepBody(s.r, s.theta, s.vr, s.vt, thrustR, thrustT, aero.dragR, aero.dragT, s.totalMass, dt)
        s.r = result.r
        s.theta = result.theta
        s.vr = result.vr
        s.vt = result.vt
        s.netAccel = Math.sqrt(result.ar * result.ar + result.at * result.at)
      } else {
        // Ascent fuel depleted → stage separation
        s.staged = true
        s.phase = 'staged'
        s.stageTime = s.missionTime
        s.boosterR = s.r
        s.boosterTheta = s.theta
        s.boosterVr = s.vr
        s.boosterVt = s.vt
        s.boosterHeading = Math.atan2(s.vt, s.vr)
        s.boosterAngle = s.angle // inherit current attitude
        s.boosterOmega = 0
        s.boosterLanded = false
        s.boosterReturnFuel = BOOSTER.returnPropellant
        s.boosterBoostbackFuel = BOOSTER.boostbackFuel
        s.boosterLandingFuel = BOOSTER.landingFuel
        s.boosterSepTheta = s.theta
        s.boosterPhase = 'coast'

        // Recalculate ship mass properties (now without booster)
        const shipProps = computeMassProperties('ship', s.shipFuel)
        s.totalMass = shipProps.totalMass
        s.shipCom = shipProps.com
        s.shipI = shipProps.I
        s.thrustForce = SHIP.totalThrust
        s.massFlow = SHIP.massFlow
      }
    } else {
      // Ship powered flight after staging
      const orb = getOrbitalElements(s.r, s.vr, s.vt)
      const targetReached = orb.periapsis > 100_000 && orb.apoapsis > 0 && orb.apoapsis < 500_000

      if (s.shipFuel > 0 && !targetReached) {
        activeEngines = getActiveEngines('ship', 'staged')
        engineThrottle = 1.0

        const engineResult = computeEngineForces('ship', ctrl.gimbalAngle, s.shipCom, engineThrottle, activeEngines)
        s.thrustForce = engineResult.totalThrust
        s.massFlow = engineResult.massFlow

        const shipBurned = s.massFlow * dt
        s.shipFuel = Math.max(0, s.shipFuel - shipBurned)

        // Recalc mass after burn
        const shipProps = computeMassProperties('ship', s.shipFuel)
        s.totalMass = shipProps.totalMass
        s.shipCom = shipProps.com
        s.shipI = shipProps.I

        // Aero
        const aero = computeAeroForces({
          altitude, vr: s.vr, vt: s.vt, angle: s.angle, omega: s.omega,
          com: s.shipCom, vehicle: 'ship',
        })
        s.alpha = aero.alpha
        s.mach = aero.mach
        s.cd = aero.cd
        s.dynamicPressure = aero.dynamicPressure
        s.dragForce = Math.sqrt(aero.dragR * aero.dragR + aero.dragT * aero.dragT)
        if (s.dynamicPressure > s.maxQ) s.maxQ = s.dynamicPressure

        // Rotational dynamics
        const rot = rotationalStep({
          angle: s.angle, omega: s.omega, I: s.shipI,
          engineTorque: engineResult.thrustTorque,
          aeroTorque: aero.aeroTorque,
          finTorque: 0, rcsTorque: ctrl.rcsTorque, dt,
        })
        s.angle = rot.angle
        s.omega = rot.omega

        // Thrust from body angle
        s.heading = s.angle
        const thrustR = s.thrustForce * Math.cos(s.angle)
        const thrustT = s.thrustForce * Math.sin(s.angle)
        s.thrustAccel = s.thrustForce / s.totalMass
        s.dragAccel = s.dragForce / s.totalMass

        const result = stepBody(s.r, s.theta, s.vr, s.vt, thrustR, thrustT, aero.dragR, aero.dragT, s.totalMass, dt)
        s.r = result.r
        s.theta = result.theta
        s.vr = result.vr
        s.vt = result.vt
        s.netAccel = Math.sqrt(result.ar * result.ar + result.at * result.at)
      } else if (targetReached) {
        s.thrustForce = 0
        s.enginesOn = false
        s.massFlow = 0
        s.phase = 'orbit'
      } else {
        s.thrustForce = 0
        s.enginesOn = false
        s.massFlow = 0
        s.phase = 'fuel_exhausted'
      }
    }

  } else if (phase === 'falling' || phase === 'fuel_exhausted' || phase === 'orbit') {
    s.enginesOn = false
    s.thrustForce = 0
    s.thrustAccel = 0
    s.massFlow = 0

    // Aero forces (drag only, no thrust)
    const aero = computeAeroForces({
      altitude, vr: s.vr, vt: s.vt, angle: s.angle, omega: s.omega,
      com: s.shipCom, vehicle: 'ship',
    })
    s.alpha = aero.alpha
    s.mach = aero.mach
    s.cd = aero.cd
    s.dynamicPressure = aero.dynamicPressure
    s.dragForce = Math.sqrt(aero.dragR * aero.dragR + aero.dragT * aero.dragT)
    s.dragAccel = s.dragForce / s.totalMass

    // Rotational — only aero + RCS
    const ctrl = computeShipControl({
      missionTime: s.missionTime, vr: s.vr, vt: s.vt,
      staged: s.staged, altitude: s.altitude,
      angle: s.angle, omega: s.omega,
    })
    s.targetAngle = ctrl.targetAngle
    s.gimbalAngle = 0

    const rot = rotationalStep({
      angle: s.angle, omega: s.omega, I: s.shipI,
      engineTorque: 0,
      aeroTorque: aero.aeroTorque,
      finTorque: 0, rcsTorque: ctrl.rcsTorque, dt,
    })
    s.angle = rot.angle
    s.omega = rot.omega

    if (s.speed > 1) {
      s.heading = Math.atan2(s.vt, s.vr)
    }

    const result = stepBody(s.r, s.theta, s.vr, s.vt, 0, 0, aero.dragR, aero.dragT, s.totalMass, dt)
    s.r = result.r
    s.theta = result.theta
    s.vr = result.vr
    s.vt = result.vt
    s.netAccel = Math.sqrt(result.ar * result.ar + result.at * result.at)

    if (s.r <= EARTH_RADIUS) {
      s.r = EARTH_RADIUS
      s.altitude = 0
      s.vr = 0
      s.vt = 0
      s.phase = 'landed'
    }
  }

  // Derived values
  s.altitude = s.r - EARTH_RADIUS
  s.speed = Math.sqrt(s.vr * s.vr + s.vt * s.vt)
  s.velocity = s.speed

  // Orbital elements
  const orb = getOrbitalElements(s.r, s.vr, s.vt)
  s.apoapsis = orb.apoapsis
  s.periapsis = orb.periapsis
  s.eccentricity = orb.eccentricity
  s.inOrbit = orb.inOrbit

  // === Booster physics after separation ===
  if (s.staged && !s.boosterLanded) {
    const timeSinceSep = s.missionTime - s.stageTime
    const bAlt = s.boosterR - EARTH_RADIUS
    const bSpeed = Math.sqrt(s.boosterVr * s.boosterVr + s.boosterVt * s.boosterVt)
    const bMass = BOOSTER.dryMass + s.boosterBoostbackFuel + s.boosterLandingFuel
    const gLocal = GM / (s.boosterR * s.boosterR)

    // Mass properties for booster
    const boosterFuelTotal = s.boosterBoostbackFuel + s.boosterLandingFuel
    const bMassProps = computeMassProperties('booster', boosterFuelTotal)
    s.boosterCom = bMassProps.com
    s.boosterI = bMassProps.I

    // Booster attitude control
    const bCtrl = computeBoosterControl({
      boosterPhase: s.boosterPhase,
      boosterVr: s.boosterVr, boosterVt: s.boosterVt,
      boosterTheta: s.boosterTheta,
      boosterAngle: s.boosterAngle, boosterOmega: s.boosterOmega,
      altitude: bAlt,
    })
    s.boosterTargetAngle = bCtrl.targetAngle
    s.boosterGimbalAngle = bCtrl.gimbalAngle
    s.boosterFinDeflection = bCtrl.finDeflection

    // Determine if belly-flop
    const isBellyFlop = s.boosterPhase === 'descent'

    // Booster aero forces
    const bAero = computeAeroForces({
      altitude: bAlt, vr: s.boosterVr, vt: s.boosterVt,
      angle: s.boosterAngle, omega: s.boosterOmega,
      com: s.boosterCom, vehicle: 'booster',
      finDeflection: bCtrl.finDeflection,
      isBellyFlop,
    })
    s.boosterAlpha = bAero.alpha

    let bThrustR = 0, bThrustT = 0
    let bEngineTorque = 0

    // --- Phase: Coast ---
    if (s.boosterPhase === 'coast' && timeSinceSep >= BOOSTER.coastAfterSep) {
      s.boosterPhase = 'boostback'
    }

    // --- Phase: Boostback ---
    if (s.boosterPhase === 'boostback') {
      if (s.boosterBoostbackFuel > 0 && Math.abs(s.boosterVt) > BOOSTER.boostbackVtCutoff) {
        const activeEng = getActiveEngines('booster', 'boostback')
        const engineResult = computeEngineForces('booster', bCtrl.gimbalAngle, s.boosterCom, 1.0, activeEng)

        // Thrust direction: body angle determines thrust vector
        const thrustMag = engineResult.totalThrust
        bThrustR = thrustMag * Math.cos(s.boosterAngle)
        bThrustT = thrustMag * Math.sin(s.boosterAngle)
        bEngineTorque = engineResult.thrustTorque

        const bFuelBurned = engineResult.massFlow * dt
        s.boosterBoostbackFuel = Math.max(0, s.boosterBoostbackFuel - bFuelBurned)
      }

      if (s.boosterBoostbackFuel <= 0 || Math.abs(s.boosterVt) <= BOOSTER.boostbackVtCutoff) {
        s.boosterLandingFuel += s.boosterBoostbackFuel
        s.boosterBoostbackFuel = 0
        s.boosterPhase = 'descent'
      }
    }

    // --- Phase: Descent (belly-flop, high drag, no thrust) ---
    if (s.boosterPhase === 'descent') {
      if (bAlt < 3_000 && s.boosterVr < 0 && s.boosterLandingFuel > 0) {
        const landingMass = BOOSTER.dryMass + s.boosterLandingFuel
        const netAccel = BOOSTER.landingThrust / landingMass - gLocal
        if (netAccel > 0) {
          const fallSpeed = Math.abs(s.boosterVr)
          const burnAlt = (fallSpeed * fallSpeed) / (2 * netAccel) * 1.2 + 150
          if (bAlt <= burnAlt) {
            s.boosterPhase = 'landing'
          }
        }
      }
    }

    // --- Phase: Landing (ZEM/ZEV guided to hover altitude) ---
    if (s.boosterPhase === 'landing') {
      if (s.boosterLandingFuel > 0) {
        const hTarget = BOOSTER.hoverAlt
        const hError = bAlt - hTarget
        const tGo = Math.max(1, 2 * Math.max(0, hError) / Math.max(1, Math.abs(s.boosterVr)))

        const aR_cmd = (0 - s.boosterVr) / tGo + gLocal
        const aT_cmd = (0 - s.boosterVt) / tGo
        const aCmdMag = Math.sqrt(aR_cmd * aR_cmd + aT_cmd * aT_cmd)

        const activeEng = getActiveEngines('booster', 'landing')
        const maxThrust = getConfigThrust('booster', activeEng, 1.0).thrust
        const maxAccel = maxThrust / bMass
        const throttle = Math.min(1, aCmdMag / maxAccel)

        const engineResult = computeEngineForces('booster', bCtrl.gimbalAngle, s.boosterCom, throttle, activeEng)

        const thrustMag = maxThrust * throttle
        if (aCmdMag > 0.1) {
          bThrustR = thrustMag * (aR_cmd / aCmdMag)
          bThrustT = thrustMag * (aT_cmd / aCmdMag)
        }
        bEngineTorque = engineResult.thrustTorque

        if (thrustMag > 100) {
          s.boosterHeading = Math.atan2(bThrustT, bThrustR)
        }

        const bFuelBurned = engineResult.massFlow * dt
        s.boosterLandingFuel = Math.max(0, s.boosterLandingFuel - bFuelBurned)

        // Transition to hover when near target: low velocity, near hover alt
        if (Math.abs(s.boosterVr) < 3 && Math.abs(s.boosterVt) < 3 && bAlt < hTarget + 20) {
          s.boosterPhase = 'hover'
          s.boosterBurnoffTimer = 0
        }
      } else {
        // Out of fuel — skip to splash
        s.boosterPhase = 'splashed'
      }
    }

    // --- Phase: Hover (hold position at ~30m, burn remaining fuel) ---
    if (s.boosterPhase === 'hover') {
      s.boosterBurnoffTimer += dt
      const hTarget = BOOSTER.hoverAlt

      if (s.boosterLandingFuel > 0 && s.boosterBurnoffTimer < BOOSTER.burnoffDuration) {
        // PD altitude hold: target vr = gain * (hTarget - bAlt), then thrust to achieve that
        const altError = hTarget - bAlt
        const targetVr = altError * 1.5 // proportional gain
        const vrError = targetVr - s.boosterVr

        // Vertical: gravity compensation + PD correction
        const aR_cmd = gLocal + vrError * 2.0 // PD on vertical
        // Horizontal: damp any drift
        const aT_cmd = -s.boosterVt * 2.0

        const aCmdMag = Math.sqrt(aR_cmd * aR_cmd + aT_cmd * aT_cmd)
        const activeEng = getActiveEngines('booster', 'hover')
        const maxThrust = getConfigThrust('booster', activeEng, 1.0).thrust
        const maxAccel = maxThrust / bMass
        const throttle = Math.min(1, Math.max(0.1, aCmdMag / maxAccel))

        const thrustMag = maxThrust * throttle
        if (aCmdMag > 0.01) {
          bThrustR = thrustMag * (aR_cmd / aCmdMag)
          bThrustT = thrustMag * (aT_cmd / aCmdMag)
        } else {
          bThrustR = bMass * gLocal // pure hover
          bThrustT = 0
        }
        s.boosterHeading = 0

        const engineResult = computeEngineForces('booster', 0, s.boosterCom, throttle, activeEng)
        bEngineTorque = engineResult.thrustTorque
        const bFuelBurned = engineResult.massFlow * dt
        s.boosterLandingFuel = Math.max(0, s.boosterLandingFuel - bFuelBurned)
      } else {
        // Fuel depleted or burnoff time elapsed — cut engines, free fall
        s.boosterPhase = 'splashed'
      }
    }

    // Booster rotational dynamics
    const bRot = rotationalStep({
      angle: s.boosterAngle, omega: s.boosterOmega, I: s.boosterI,
      engineTorque: bEngineTorque,
      aeroTorque: bAero.aeroTorque,
      finTorque: bAero.finTorque,
      rcsTorque: bCtrl.rcsTorque, dt,
    })
    s.boosterAngle = bRot.angle
    s.boosterOmega = bRot.omega

    // Translational step
    const bResult = stepBody(
      s.boosterR, s.boosterTheta, s.boosterVr, s.boosterVt,
      bThrustR, bThrustT, bAero.dragR, bAero.dragT, bMass, dt
    )
    s.boosterR = bResult.r
    s.boosterTheta = bResult.theta
    s.boosterVr = bResult.vr
    s.boosterVt = bResult.vt

    s.boosterReturnFuel = s.boosterBoostbackFuel + s.boosterLandingFuel

    if (s.boosterPhase !== 'landing' && s.boosterPhase !== 'hover' && bSpeed > 1) {
      s.boosterHeading = Math.atan2(s.boosterVt, s.boosterVr)
    }

    if (s.boosterR <= EARTH_RADIUS) {
      s.boosterR = EARTH_RADIUS
      s.boosterVr = 0
      s.boosterVt = 0
      s.boosterLanded = true
      s.boosterPhase = 'splashed'
    }
  }

  return s
}
