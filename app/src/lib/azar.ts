// Números aleatorios con semilla. Todo lo aleatorio de la app sale de aquí,
// para que el ensayo y la presentación muestren exactamente las mismas cifras.

export type Azar = () => number;

/** mulberry32: uniforme en [0, 1), pequeño y suficiente para esto. */
export function mulberry32(semilla: number): Azar {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar por Box-Muller. */
export function normal(azar: Azar): number {
  const u1 = 1 - azar(); // (0, 1]: evita log(0)
  const u2 = azar();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** t de Student con `nu` entero: Z / sqrt(χ²_nu / nu). */
export function tStudent(azar: Azar, nu: number): number {
  let chi2 = 0;
  for (let k = 0; k < nu; k++) chi2 += normal(azar) ** 2;
  return normal(azar) / Math.sqrt(chi2 / nu);
}
