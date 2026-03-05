// ============================================================
// Starship Physics Constants
// All units SI: meters, seconds, kilograms, Newtons
// ============================================================

export const G0 = 9.80665 // standard gravity (m/s²)
export const EARTH_RADIUS = 6_371_000 // m
export const GM = 3.986004418e14 // m³/s² (IERS standard gravitational parameter)
export const GAMMA = 1.4
export const R_AIR = 287.058

// Target orbit altitude (m)
export const TARGET_ORBIT = 200_000

// Launch site: SpaceX Starbase, Boca Chica TX
export const LAUNCH_LAT = 25.99622065480988 * (Math.PI / 180) // rad
export const LAUNCH_LON = -97.15443150451574 * (Math.PI / 180) // rad

const PAYLOAD_MASS = 0 // IFT-5: no payload (test flight)

export const BOOSTER = {
  dryMass: 200_000, // kg (Wikipedia)
  propellantMass: 3_400_000, // kg (Wikipedia)
  numEngines: 33,
  thrustPerEngine: 2_256_000, // N (Raptor 2 SL, 230 tf)
  isp: 347, // s (Raptor 2 SL)
  throttle: 0.90, // avg throttle (throttled for max-Q)
  returnFuelReserve: 0.12, // 12% reserved for boostback + landing
  boostbackEngines: 13, // center + middle ring
  landingEngines: 3, // center engines only for landing
  coastAfterSep: 2, // seconds of coast before boostback (flip begins immediately via RCS)
  landingFuelFrac: 0.10, // 10% of return fuel for landing burn + burnoff hover
  bellyFlopArea: 9 * 69, // m² broadside cross-section (9m dia × 69m height)
  bellyFlopCd: 1.2, // drag coeff for cylinder broadside
  hoverAlt: 30, // meters — hover altitude for fuel burnoff
  burnoffDuration: 4, // seconds of hover before splash
  boostbackVtCutoff: 80, // m/s — stop boostback when |vt| below this
  diameter: 9, // m
  length: 69, // m
  get totalThrust() { return this.numEngines * this.thrustPerEngine * this.throttle },
  get massFlow() { return this.totalThrust / (this.isp * G0) },
  get ascentPropellant() { return this.propellantMass * (1 - this.returnFuelReserve) },
  get returnPropellant() { return this.propellantMass * this.returnFuelReserve },
  get boostbackThrust() { return this.boostbackEngines * this.thrustPerEngine },
  get boostbackMassFlow() { return this.boostbackThrust / (this.isp * G0) },
  get landingThrust() { return this.landingEngines * this.thrustPerEngine },
  get landingMassFlow() { return this.landingThrust / (this.isp * G0) },
  get boostbackFuel() { return this.returnPropellant * (1 - this.landingFuelFrac) },
  get landingFuel() { return this.returnPropellant * this.landingFuelFrac },
}

export const SHIP = {
  dryMass: 100_000, // kg (~100t)
  payloadMass: PAYLOAD_MASS,
  propellantMass: 1_200_000, // kg (Block 1)
  slEngines: 3,
  vacEngines: 3,
  thrustPerSL: 2_256_000, // N (Raptor 2 SL)
  thrustPerVac: 2_530_000, // N (Raptor 2 Vac, 258 tf)
  ispSL: 347, // s
  ispVac: 380, // s
  diameter: 9, // m
  length: 50, // m
  get totalThrust() { return this.slEngines * this.thrustPerSL + this.vacEngines * this.thrustPerVac },
  get avgIsp() {
    const slThrust = this.slEngines * this.thrustPerSL
    const vacThrust = this.vacEngines * this.thrustPerVac
    return (slThrust * this.ispSL + vacThrust * this.ispVac) / (slThrust + vacThrust)
  },
  get massFlow() { return this.totalThrust / (this.avgIsp * G0) },
  get totalDryMass() { return this.dryMass + this.payloadMass },
}

export const CROSS_SECTION_AREA = Math.PI * 4.5 * 4.5 // 63.6 m² (9m diameter)
