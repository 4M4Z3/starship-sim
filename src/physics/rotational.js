// ============================================================
// Rotational Dynamics — Angular integration
// ============================================================

/**
 * Wrap angle to [-π, π]
 */
export function wrapAngle(a) {
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  return a
}

/**
 * Integrate angular dynamics for one timestep (symplectic Euler)
 *
 * @param {Object} params
 * @param {number} params.angle — current body angle (rad)
 * @param {number} params.omega — current angular velocity (rad/s)
 * @param {number} params.I — moment of inertia (kg·m²)
 * @param {number} params.engineTorque — torque from engine gimbal (N·m)
 * @param {number} params.aeroTorque — aerodynamic moment + damping (N·m)
 * @param {number} params.finTorque — grid fin torque (N·m)
 * @param {number} params.rcsTorque — RCS torque (N·m)
 * @param {number} params.dt — timestep (s)
 * @returns {{ angle: number, omega: number, angularAccel: number }}
 */
export function rotationalStep({ angle, omega, I, engineTorque, aeroTorque, finTorque, rcsTorque, dt }) {
  if (I <= 0) return { angle, omega, angularAccel: 0 }

  const totalTorque = engineTorque + aeroTorque + finTorque + rcsTorque
  const angularAccel = totalTorque / I

  // Symplectic Euler: velocity first, then position
  const newOmega = omega + angularAccel * dt
  let newAngle = angle + newOmega * dt

  // Wrap angle to [-π, π] to prevent accumulation
  newAngle = ((newAngle % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI

  return { angle: newAngle, omega: newOmega, angularAccel }
}
