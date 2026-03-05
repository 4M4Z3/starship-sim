import { describe, it, expect } from 'vitest'
import SCENARIOS, { applyScenario } from '../src/physics/scenarios.js'
import { createInitialState } from '../src/physics/physics.js'
import { BOOSTER, EARTH_RADIUS } from '../src/physics/constants.js'

describe('Scenarios', () => {
  it('has at least 3 scenarios defined', () => {
    expect(Object.keys(SCENARIOS).length).toBeGreaterThanOrEqual(3)
  })

  it('all scenarios have required fields', () => {
    for (const [id, s] of Object.entries(SCENARIOS)) {
      expect(s.name, `${id} missing name`).toBeDefined()
      expect(s.description, `${id} missing description`).toBeDefined()
      expect(s.category, `${id} missing category`).toBeDefined()
      expect(s.config, `${id} missing config`).toBeDefined()
    }
  })

  it('ift5 applies no overrides (default state)', () => {
    const base = createInitialState()
    const applied = applyScenario(base, 'ift5')
    expect(applied.boosterFuel).toBe(base.boosterFuel)
    expect(applied.shipFuel).toBe(base.shipFuel)
  })

  it('suborbital reduces booster fuel', () => {
    const base = createInitialState()
    const applied = applyScenario(base, 'suborbital')
    expect(applied.boosterFuel).toBeLessThan(base.boosterFuel)
  })

  it('boosterOnly starts pre-staged', () => {
    const base = createInitialState()
    const applied = applyScenario(base, 'boosterOnly')
    expect(applied.staged).toBe(true)
    expect(applied.phase).toBe('staged')
    expect(applied.altitude).toBeGreaterThan(0)
    expect(applied.boosterPhase).toBe('coast')
  })

  it('maxPayload has payload config', () => {
    const base = createInitialState()
    const applied = applyScenario(base, 'maxPayload')
    expect(applied.scenarioConfig.payload).toBe(150_000)
  })

  it('unknown scenario returns base state unchanged', () => {
    const base = createInitialState()
    const applied = applyScenario(base, 'nonexistent')
    expect(applied.boosterFuel).toBe(base.boosterFuel)
  })
})
