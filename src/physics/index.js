// Public API — only exports consumed by components
export { physicsStep, createInitialState } from './physics.js'
export { EARTH_RADIUS, BOOSTER, SHIP, LAUNCH_LAT, LAUNCH_LON } from './constants.js'
export { default as SCENARIOS, applyScenario } from './scenarios.js'
