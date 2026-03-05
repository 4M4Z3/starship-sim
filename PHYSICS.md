# Starship Simulation — Physics & Calculations Plan

## 1. Vehicle Specifications

### Super Heavy Booster (First Stage)
| Parameter | Value | Source |
|-----------|-------|--------|
| Dry mass | 200,000 kg | Estimated (SpaceX unpublished) |
| Propellant mass | 3,400,000 kg | ~2,700t LOX + ~700t CH4 |
| Engines | 33x Raptor 2 (sea-level) | |
| Thrust per engine | 2,256 kN | |
| Total thrust | 74,448 kN | |
| Specific impulse (Isp) | 347 s | |
| Mass flow rate (total) | ~21,879 kg/s | F / (Isp × g₀) |
| Burn time | ~165 s | |
| Staging altitude | ~65–70 km | |
| Staging velocity | ~1,500–1,800 m/s | |

### Starship Ship (Upper Stage)
| Parameter | Value | Source |
|-----------|-------|--------|
| Dry mass | 120,000 kg | Estimated |
| Propellant mass | 1,200,000 kg | Block 1 |
| Engines | 3x Raptor SL + 3x RVac | |
| SL thrust per engine | 2,256 kN | |
| Vac thrust per engine | 2,530 kN | |
| Total thrust | 14,358 kN | 3×2256 + 3×2530 |
| Isp (SL / Vac) | 347 / 363 s | |
| Burn time to orbit | ~360–400 s | |

### Full Stack
| Parameter | Value |
|-----------|-------|
| Liftoff mass | ~5,020,000 kg |
| Height | ~121 m |
| Diameter | 9.0 m |
| T/W ratio at liftoff | ~1.51 |

---

## 2. Aerodynamics (Drag)

### Drag Force Equation
```
F_drag = ½ × ρ × v² × Cd × A
```
- **A** = π × 4.5² = **63.62 m²** (cross-sectional area)
- **ρ** = air density at altitude (see §3)
- **v** = velocity relative to air
- **Cd** = drag coefficient (varies with Mach number)

### Drag Coefficient vs Mach Number
For a slender body with fineness ratio ~13:

| Mach | Cd | Regime |
|------|----|--------|
| 0–0.6 | 0.25 | Subsonic |
| 0.6–0.8 | 0.25–0.30 | Pre-transonic |
| 0.8–1.0 | 0.30–0.50 | Transonic drag rise |
| 1.0–1.2 | 0.50 | **Peak** (wave drag) |
| 1.2–2.0 | 0.50→0.35 | Supersonic decline |
| 2.0–5.0 | 0.35→0.25 | High supersonic |
| 5.0+ | 0.25 | Hypersonic plateau |

### Implementation Plan
Piecewise linear interpolation:
```js
function getCd(mach) {
  if (mach < 0.8)  return 0.25;
  if (mach < 1.0)  return 0.25 + (mach - 0.8) / 0.2 * 0.25; // 0.25 → 0.50
  if (mach < 1.2)  return 0.50;                                // peak
  if (mach < 2.0)  return 0.50 - (mach - 1.2) / 0.8 * 0.15;  // 0.50 → 0.35
  if (mach < 5.0)  return 0.35 - (mach - 2.0) / 3.0 * 0.10;  // 0.35 → 0.25
  return 0.25;
}
```

### Mach Number
```
Mach = v / a(h)
```
Speed of sound `a` depends on temperature at altitude (see §3).

---

## 3. Atmosphere Model (US Standard 1976)

### Simple Exponential (good enough for most of ascent)
```
ρ(h) = 1.225 × exp(−h / 8500)
```

### Higher Fidelity — Piecewise Layers
**Troposphere (0–11 km):**
```
T = 288.15 − 6.5 × h/1000       (K)
P = 101325 × (T / 288.15)^5.2561 (Pa)
ρ = P / (287.058 × T)            (kg/m³)
a = √(1.4 × 287.058 × T)        (m/s, speed of sound)
```

**Tropopause / Lower Stratosphere (11–20 km, isothermal at 216.65 K):**
```
P = 22632 × exp(−9.80665 × (h − 11000) / (287.058 × 216.65))
ρ = P / (287.058 × 216.65)
a = 295.07 m/s (constant)
```

**Upper Stratosphere (20–32 km):**
```
T = 216.65 + 1.0 × (h/1000 − 20)
P = 5474 × (T / 216.65)^(−34.163)
ρ = P / (287.058 × T)
```

**Above ~47 km:** Density is <0.1% of sea level — drag becomes negligible.

### Quick Reference
| Altitude | Density (kg/m³) | % of sea level | Speed of sound (m/s) |
|----------|----------------|----------------|---------------------|
| 0 km | 1.225 | 100% | 340 |
| 5 km | 0.736 | 60% | 320 |
| 10 km | 0.414 | 34% | 299 |
| 20 km | 0.089 | 7.3% | 295 |
| 40 km | 0.004 | 0.3% | 318 |
| 60 km | 0.0003 | 0.02% | 316 |
| 80 km | 0.00002 | ~0% | — |

---

## 4. Gravity

### Inverse Square Law (sufficient for all altitudes in this sim)
```
g(h) = 9.80665 × (6,371,000 / (6,371,000 + h))²
```

| Altitude | g (m/s²) | % of surface |
|----------|----------|--------------|
| 0 km | 9.807 | 100% |
| 10 km | 9.776 | 99.7% |
| 100 km | 9.505 | 96.9% |
| 200 km (LEO) | 9.210 | 93.9% |
| 400 km (ISS) | 8.69 | 88.6% |

### Relativistic Corrections
**Not needed.** LEO velocity (~7,800 m/s) is 0.0026% of light speed. GR corrections are ~10⁻⁹. Completely negligible.

---

## 5. Thrust & Mass Flow

### Rocket Equation (Tsiolkovsky)
```
Δv = Isp × g₀ × ln(m_initial / m_final)
```

### Real-Time Simulation
Each frame:
```
mass_flow = total_thrust / (Isp × g₀)
mass -= mass_flow × dt
thrust_accel = total_thrust / mass     (increases as fuel burns!)
drag_accel = F_drag / mass
gravity_accel = g(h)

net_accel = thrust_accel − drag_accel − gravity_accel  (along flight path)
velocity += net_accel × dt
altitude += velocity × dt
```

Key insight: **thrust acceleration increases over time** as propellant mass decreases (the rocket gets lighter). At liftoff T/W ≈ 1.5, but just before MECO it can reach 3–4+.

---

## 6. Flight Phases to Simulate

### Phase 1: Liftoff & Vertical Ascent (T+0 to T+~10s)
- All 33 booster engines firing
- Rocket rises vertically through the tower
- Clears tower at ~10 m/s

### Phase 2: Gravity Turn / Pitch Program (T+10s to T+~60s)
- Rocket pitches gradually from vertical toward horizontal (eastward)
- Pitch rate: ~0.5–1.0 deg/s initially
- By T+60s, pitch angle ~20–30° from vertical

### Phase 3: Max-Q (T+~60s)
- Maximum aerodynamic pressure: **~35 kPa** (Max-Q)
- Occurs around Mach 1.5, altitude ~12–14 km
- May throttle down through this region

### Phase 4: Supersonic / Upper Atmosphere (T+60s to T+165s)
- Accelerating through thinning atmosphere
- Drag rapidly decreasing
- Approaching MECO

### Phase 5: MECO & Staging (T+~165s, ~67 km)
- Booster engines shut down (except 3 center for hot staging)
- Ship engines ignite while still attached
- Physical separation
- **Booster begins boostback burn**

### Phase 6: Ship Ascent to Orbit (T+165s to T+~530s)
- Ship fires 6 engines in near-vacuum
- Gravity losses decrease as trajectory flattens
- Achieves orbital velocity ~7,800 m/s

### Phase 7: Booster Return
- Boostback burn (flip + burn to reverse trajectory)
- Entry burn (aerobraking at ~70 km)
- Landing burn (final deceleration, tower catch)

---

## 7. Earth's Rotation (Coriolis)

Launch from Boca Chica, TX (26°N latitude):
```
Surface velocity = 465 × cos(26°) ≈ 418 m/s eastward
```

This is a **free 418 m/s** toward orbital velocity if launching east. For a realistic trajectory, the rocket should launch eastward and this needs to be added to initial conditions.

For our simulation: can be included as an initial velocity offset, or ignored for a simplified straight-up demo.

---

## 8. What We Can Implement (Priority Order)

### ✅ Easy — Implement First
1. **Variable gravity** — inverse square law, trivial to add
2. **Mass depletion** — subtract mass_flow × dt each frame, thrust accel increases
3. **Basic drag** — exponential atmosphere + constant Cd
4. **Engine cutoff when fuel runs out** — check remaining propellant

### 🔧 Medium — Implement Next
5. **Mach-dependent Cd** — piecewise lookup, needs speed of sound calc
6. **US Standard Atmosphere** — piecewise temperature/pressure model
7. **Staging** — separate booster from ship at ~67 km, different mass/thrust
8. **Max-Q tracking** — display dynamic pressure on HUD

### 🚀 Advanced — Stretch Goals
9. **Gravity turn** — pitch program, 2D trajectory (not just vertical)
10. **Earth rotation** — initial eastward velocity, Coriolis force
11. **Booster return** — boostback burn, entry burn, landing
12. **Re-entry heating** — for ship returning from orbit (>7 km/s)

### ❌ Skip
- **Relativistic corrections** — completely negligible
- **Oblateness of Earth (J2)** — tiny effect, not worth it
- **Solar radiation pressure** — irrelevant at these altitudes
- **Third body effects (Moon/Sun gravity)** — only matters for deep space

---

## 9. Key Formulas Summary

```
// === Per-frame physics update ===

// Atmosphere
T = getTemperature(altitude)
P = getPressure(altitude)
rho = P / (287.058 * T)
speedOfSound = sqrt(1.4 * 287.058 * T)

// Mach & Drag
mach = velocity / speedOfSound
cd = getCd(mach)
F_drag = 0.5 * rho * velocity² * cd * 63.62

// Gravity
g = 9.80665 * (6371000 / (6371000 + altitude))²

// Mass
mass_flow = totalThrust / (Isp * 9.80665)
propellant -= mass_flow * dt
currentMass = dryMass + propellant

// Acceleration
a_thrust = totalThrust / currentMass
a_drag = F_drag / currentMass
a_gravity = g

a_net = a_thrust - a_drag - a_gravity
velocity += a_net * dt
altitude += velocity * dt

// Telemetry
dynamicPressure = 0.5 * rho * velocity²   // Max-Q tracking
```

---

## 10. Full Mission Profile — Booster Return & Ship to Orbit

The sim needs to handle **two independent objects** after staging: the ship
continuing to orbit, and the booster returning to the tower.

### Coordinate System
After the gravity turn, motion is 2D (vertical + downrange). We track each
object with:
- `x` — downrange distance from pad (horizontal, m)
- `y` — altitude above sea level (vertical, m)
- `vx` — horizontal velocity (m/s)
- `vy` — vertical velocity (m/s)
- `pitch` — angle of thrust vector from vertical (radians)

### At Staging (~T+165s)
Both objects inherit the same state:
```
altitude  ≈ 67,000 m
vx        ≈ 1,500 m/s   (downrange, from gravity turn)
vy        ≈ 500 m/s     (still climbing)
downrange ≈ 50–70 km from pad
```

---

### 10a. Booster Return — Three Burns

The booster keeps **~7–10% of its propellant** for return. With 3,400,000 kg
total propellant, that's roughly **240,000–340,000 kg reserved**.

We can calculate all of this from first principles:

#### Fuel Budget
```
Reserved propellant: 280,000 kg (use 8.2% as baseline)
Booster mass at staging: 200,000 + 280,000 = 480,000 kg
```

#### Available Δv (Tsiolkovsky)
Using 13 engines for boostback (most fuel-intensive burn):
```
Δv_total = Isp × g₀ × ln(m_start / m_end)
         = 347 × 9.806 × ln(480,000 / 200,000)
         = 3,402 × ln(2.4)
         = 3,402 × 0.875
         ≈ 2,977 m/s of Δv available
```

This Δv is split across three burns:

#### Burn 1: Boostback (~T+170s to T+220s)
**Goal:** Reverse horizontal velocity and aim back at the pad.

The booster needs to cancel ~1,500 m/s of horizontal velocity and add
~200–400 m/s back toward the pad. Total Δv ≈ **1,700–1,900 m/s**.

```
Engines:       13 Raptors (center + inner ring)
Thrust:        13 × 2,256 = 29,328 kN
Start mass:    480,000 kg
Acceleration:  ~61 m/s² initially (increases as fuel burns)
Mass flow:     29,328,000 / (347 × 9.806) = ~8,622 kg/s
Fuel used:     ≈ 190,000 kg (rough — depends on exact Δv)
Duration:      ~22–25 s
```

After boostback, the booster is on a ballistic arc back toward the pad,
coasting upward briefly then falling.

#### Coast Phase (~T+220s to T+380s)
- No engines firing
- Booster follows ballistic trajectory (gravity only, negligible drag above 50 km)
- Reaches apogee ~80–100 km, then falls back
- Flips to engines-down orientation for entry
- **Air resistance helps here**: as the booster descends below 40 km, drag
  starts decelerating it significantly

How much does drag help? At 40 km altitude, ρ ≈ 0.004 kg/m³:
```
F_drag = 0.5 × 0.004 × 800² × 0.50 × 63.62 = 40,800 N ≈ 41 kN
```
Small at 40 km. But at 20 km, ρ ≈ 0.089:
```
F_drag = 0.5 × 0.089 × 600² × 0.50 × 63.62 = 509,000 N ≈ 509 kN
```
And at 10 km, ρ ≈ 0.414:
```
F_drag = 0.5 × 0.414 × 400² × 0.50 × 63.62 = 1,054,000 N ≈ 1,054 kN
```

So drag provides **significant free deceleration** below 20 km — equivalent
to roughly 2–4 m/s² on the ~290,000 kg booster. This saves real fuel.

#### Burn 2: Entry / Reentry Burn (~T+380s, ~40 km altitude)
**Goal:** Slow down before hitting thick atmosphere to reduce heating/loads.

```
Engines:       13 Raptors
Δv:            ~350–500 m/s
Duration:      ~6–8 s
Fuel used:     ~55,000 kg
```

This isn't strictly necessary in our sim (no thermal model yet), but it's
what SpaceX does. We could skip this burn and let drag do more work.

#### Burn 3: Landing Burn — "Hoverslam" (~T+470s, ~1 km altitude)
**Goal:** Decelerate from ~200–300 m/s to 0 m/s at ground level.

This is a **suicide burn** — start at the last possible moment and
decelerate at maximum thrust to reach v=0 exactly at h=0.

```
Engines:       3 Raptors (center engines for precision)
Thrust:        3 × 2,256 = 6,768 kN
Booster mass:  ~230,000 kg (dry + remaining fuel)
Decel:         6,768,000 / 230,000 - 9.806 = ~19.6 m/s²
```

**When to start the burn:**
```
For constant deceleration from velocity v to 0:
  burn_time = v / a_net
  burn_distance = v² / (2 × a_net)

At v = 250 m/s, a_net = 19.6 m/s²:
  burn_time = 250 / 19.6 = 12.8 s
  burn_distance = 250² / (2 × 19.6) = 1,594 m ≈ 1.6 km

So: ignite landing burn at altitude ≈ 1,600 m
```

In reality this needs to account for changing mass (fuel burning) and
gravity, but the above is a solid first approximation for guidance.

#### Booster Fuel Summary
| Burn | Δv (m/s) | Fuel (kg) | Engines |
|------|----------|-----------|---------|
| Boostback | ~1,800 | ~190,000 | 13 |
| Entry | ~400 | ~55,000 | 13 |
| Landing | ~250 | ~25,000 | 3 |
| **Total** | **~2,450** | **~270,000** | |
| Reserve margin | — | ~10,000 | |
| **Total reserved** | — | **~280,000** | |

This leaves about 10,000 kg margin (~3.5%) which is tight but realistic —
SpaceX operates on thin margins.

---

### 10b. Ship to Orbit

After staging, the ship needs to reach orbital velocity.

```
Orbital velocity at 200 km:  ~7,780 m/s
Velocity at staging:          ~1,700 m/s (mostly horizontal after gravity turn)
Δv needed:                    ~6,080 m/s
+ gravity losses (~400 m/s):  ~6,480 m/s needed
```

**Can the ship do this?**
```
Ship start mass:  120,000 + 1,200,000 = 1,320,000 kg
Ship end mass:    120,000 + ~50,000 (reserve) = 170,000 kg
Δv = 363 × 9.806 × ln(1,320,000 / 170,000)
   = 3,560 × ln(7.76)
   = 3,560 × 2.049
   ≈ 7,294 m/s
```

Yes — **7,294 m/s available vs ~6,480 m/s needed**. That leaves ~800 m/s
for deorbit and landing burns (the ship needs to come back too).

Ship ascent is simpler to simulate since it's mostly in vacuum:
- Negligible drag above 70 km
- Gravity turn continues, pitch flattens toward horizontal
- Burn until orbital velocity reached, then cut engines
- Orbit is achieved when horizontal velocity provides enough centripetal
  acceleration: v² / r = g(h), i.e., v = √(g × (R + h))

---

### 10c. Guidance Algorithm (How to steer)

We don't need a full-blown guidance computer. Simple approach:

**Booster return:**
1. At staging: flip 180° (takes ~5s in reality)
2. Boostback: thrust toward the pad (aim thrust vector at pad position).
   Use a simple proportional guidance:
   ```
   target_angle = atan2(pad_x - booster_x, pad_y - booster_y)
   thrust_direction = target_angle  (point engines away from pad)
   ```
3. Cut boostback when predicted landing point ≈ pad location
4. Coast on ballistic arc
5. Entry burn: optional, fire retrograde to slow down
6. Landing burn: start when `altitude ≤ v² / (2 × a_net)` — the suicide
   burn equation. Thrust straight down (retrograde).

**Ship to orbit:**
1. Continue gravity turn — pitch angle follows a smooth profile
2. Simple approach: pitch = f(altitude), e.g.:
   - At 67 km: ~25° from horizontal
   - At 100 km: ~10° from horizontal
   - At 150 km: ~2° from horizontal (nearly horizontal)
3. Cut engines when v ≥ orbital velocity at current altitude

---

## 11. Simulation Architecture

### After Staging, Track Two Objects:
```js
state = {
  booster: { x, y, vx, vy, fuel, phase },  // phase: boostback|coast|entry|landing|landed
  ship:    { x, y, vx, vy, fuel, phase },  // phase: ascent|orbit
  camera:  { following: 'booster' | 'ship' }
}
```

### Camera
Let the player toggle between following the booster or the ship with a key
(e.g., Tab). Both are simulated simultaneously.

### Time Acceleration
The full mission takes ~8 minutes. Consider offering:
- 1x (real time)
- 5x
- 10x
- 20x (full mission in ~25 seconds)

---

## 12. Implementation Order (Revised)

### Phase 1: Core Physics (vertical only, what we have now + upgrades)
1. Mass depletion + variable thrust
2. Variable gravity (inverse square)
3. Exponential atmosphere drag
4. Fuel exhaustion → engine cutoff

### Phase 2: Realistic Ascent (2D trajectory)
5. Switch to 2D physics (x, y, vx, vy)
6. Gravity turn pitch program
7. Mach-dependent drag + US Standard Atmosphere
8. Max-Q display + throttle-down logic
9. Staging — ship separates from booster

### Phase 3: Booster Return
10. Boostback burn (aim at pad)
11. Ballistic coast
12. Entry burn (optional)
13. Suicide burn landing guidance
14. Tower catch animation

### Phase 4: Ship to Orbit
15. Ship continues burn to orbital velocity
16. Orbit insertion (engine cutoff)
17. Orbital display (maybe a minimap?)

### Phase 5: Polish
18. Tab to switch camera between booster/ship
19. Time warp controls
20. Telemetry graphs (altitude, velocity, acceleration over time)
21. Smoke/flame/re-entry visual effects
