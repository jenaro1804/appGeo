// Aritmética sobre las muestras del posterior. Ver docs/app_web.md, «Cómo se
// calcula una predicción».
//
//   log μ[i, s] = b0[s] + m[j(i), año, s] + u[i, s]
//
// Todo se calcula por muestra `s` y al final se resume con percentiles.
// **Nunca con medias**: las innovaciones municipales son t de Student y
// E[e^T] = ∞, así que la media predictiva no existe hacia el futuro. Un
// promedio aquí da cifras absurdas que cambian con la semilla.

import { mulberry32, normal, tStudent } from "./azar";
import type { Datos } from "./datos";

export const ANIOS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
export const PRIMER_ANIO = ANIOS[0];
export const ULTIMO_OBSERVADO = 2024;
const N_OBSERVADOS = ULTIMO_OBSERVADO - PRIMER_ANIO + 1;
const N_ANIOS = ANIOS.length;
const NU = 3; // grados de libertad de las innovaciones, como en el modelo

/** Cambio del régimen de reporte de uno o varios municipios, desde 2025. */
export interface Escenario {
  municipios: number[];
  /** Que reporte como en ese año: se desplaza por m[año] − m[2024], por muestra. */
  comoEn?: number;
  /** O un factor multiplicativo fijo sobre su nivel de reporte. */
  factor?: number;
}

export interface Resumen {
  p5: number;
  p50: number;
  p95: number;
}

export interface Totales {
  /** Σ μ por muestra: el nivel esperado, sin ruido de conteo. */
  esperado: Resumen;
  /** Con el ruido Binomial Negativo: lo que se observaría. */
  total: Resumen;
}

/** Cuantil lineal sobre un arreglo ya ordenado; igual que numpy por defecto. */
export function cuantil(ordenado: ArrayLike<number>, q: number): number {
  const h = (ordenado.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, ordenado.length - 1);
  return ordenado[lo] + (h - lo) * (ordenado[hi] - ordenado[lo]);
}

export function resumir(x: ArrayLike<number>): Resumen {
  const o = Float64Array.from(x).sort();
  return { p5: cuantil(o, 0.05), p50: cuantil(o, 0.5), p95: cuantil(o, 0.95) };
}

export const esProyeccion = (anio: number) => anio > ULTIMO_OBSERVADO;


/**
 * Trayectorias de innovación por muestra del posterior. Con una sola, las
 * colas de la t₃ quedan mal muestreadas: el p95 de 2027 cambiaba de 170 a 320
 * mil según la semilla. Con 200 (50,000 escenarios) se estabiliza. Los totales
 * lo pagan barato porque se agregan por municipio (ver `totales`).
 */
const CAMINOS = 200;
/** Para los mapas por celda bastan pocas: la mediana es robusta a las colas. */
const CAMINOS_CELDA = 4;

export class Modelo {
  readonly S: number;
  readonly nHex: number;
  readonly nMun: number;
  readonly municipioDe: Int32Array;
  /** Riesgo propio de cada celda: mediana de e^u, con u centrado por muestra. */
  readonly neto: Float64Array;

  private readonly K: number; // trayectorias por muestra en años proyectados
  private readonly base: Float64Array; // b0[s] + u[i, s], en [i * S + s]
  // Σ sobre las celdas de cada municipio de e^base y de e^(2·base), en [j * S + s].
  // Con eso Σμ y Σμ² de un año salen sin recorrer las 2,241 celdas.
  private readonly sumaE: Float64Array;
  private readonly sumaE2: Float64Array;
  private readonly nivelObs: Float64Array; // m[j, a, s], en [(j * 6 + a) * S + s]
  private readonly nivelProy: Float64Array; // en [(j * 3 + p) * S * K + s * K + k]
  private readonly theta: Float64Array;
  private readonly z: Float64Array; // ruido de conteo del total, una normal por escenario
  private readonly cacheTotales = new Map<string, Totales>();
  private readonly cacheMedianas = new Map<string, Float64Array>();

  constructor(
    private readonly datos: Datos,
    { innovaciones = true, semilla = 42 }: { innovaciones?: boolean; semilla?: number } = {},
  ) {
    const { meta, celdas, u } = datos;
    const S = (this.S = meta.n_draws);
    const K = (this.K = innovaciones ? CAMINOS : 1);
    this.nHex = meta.n_hex;
    this.nMun = meta.n_mun;
    this.municipioDe = Int32Array.from(celdas.municipio);
    this.theta = Float64Array.from(meta.theta);

    this.base = new Float64Array(this.nHex * S);
    this.sumaE = new Float64Array(this.nMun * S);
    this.sumaE2 = new Float64Array(this.nMun * S);
    for (let i = 0; i < this.nHex; i++) {
      const j = this.municipioDe[i];
      for (let s = 0; s < S; s++) {
        const b = meta.b0[s] + u[i * S + s];
        this.base[i * S + s] = b;
        this.sumaE[j * S + s] += Math.exp(b);
        this.sumaE2[j * S + s] += Math.exp(2 * b);
      }
    }

    // Hasta 2024, el nivel municipal estimado. De 2025 en adelante, el de 2024
    // más una innovación t₃ · s_rw por año: es lo que ensancha el intervalo
    // conforme el año se aleja. Con `innovaciones: false` el nivel persiste,
    // que es el escenario conservador con el que el notebook validó.
    const nProy = N_ANIOS - N_OBSERVADOS;
    this.nivelObs = new Float64Array(this.nMun * N_OBSERVADOS * S);
    this.nivelProy = new Float64Array(this.nMun * nProy * S * K);
    const azar = mulberry32(semilla);
    for (let j = 0; j < this.nMun; j++) {
      for (let a = 0; a < N_OBSERVADOS; a++)
        for (let s = 0; s < S; s++) this.nivelObs[(j * N_OBSERVADOS + a) * S + s] = meta.m[j][a][s];
      for (let s = 0; s < S; s++)
        for (let k = 0; k < K; k++) {
          let acumulado = meta.m[j][N_OBSERVADOS - 1][s];
          for (let p = 0; p < nProy; p++) {
            if (innovaciones) acumulado += tStudent(azar, NU) * meta.s_rw[s];
            this.nivelProy[(j * nProy + p) * S * K + s * K + k] = acumulado;
          }
        }
    }

    // Los mismos números aleatorios para el ruido de conteo en todos los
    // estados: así la diferencia entre un antes y un después viene del
    // escenario, no de haber sacado otra muestra.
    const azarRuido = mulberry32(semilla + 1);
    this.z = Float64Array.from({ length: S * K }, () => normal(azarRuido));

    // b0 y el nivel medio de u no se identifican por separado
    // (modelo_jerarquico.qmd §4). Centrar u en cada muestra deja solo lo
    // identificado: cuánto se aparta cada celda de la celda típica. Esta media
    // es sobre celdas, no sobre muestras; no toca la regla de las medianas.
    this.neto = new Float64Array(this.nHex);
    const centro = new Float64Array(S);
    for (let i = 0; i < this.nHex; i++)
      for (let s = 0; s < S; s++) centro[s] += u[i * S + s] / this.nHex;
    const tmp = new Float64Array(S);
    for (let i = 0; i < this.nHex; i++) {
      for (let s = 0; s < S; s++) tmp[s] = Math.exp(u[i * S + s] - centro[s]);
      this.neto[i] = cuantil(tmp.sort(), 0.5);
    }
  }

  get municipios(): string[] {
    return this.datos.meta.municipios;
  }

  /** Conteos observados de un año 2019-2024, o null si es proyección. */
  observados(anio: number): Float64Array | null {
    if (esProyeccion(anio)) return null;
    const a = anio - PRIMER_ANIO;
    return Float64Array.from(this.datos.celdas.conteos, (fila) => fila[a]);
  }

  totalObservado(anio: number): number | null {
    const o = this.observados(anio);
    return o && o.reduce((x, y) => x + y, 0);
  }

  /** Trayectorias por muestra de un año: K en proyección, 1 en lo observado. */
  private caminos(anio: number): number {
    return esProyeccion(anio) ? this.K : 1;
  }

  /**
   * Nivel municipal de un año, con el escenario aplicado si toca. Mide
   * S × caminos(anio): el escenario r corresponde a la muestra ⌊r / caminos⌋.
   */
  private nivel(j: number, anio: number, esc: Escenario | null): Float64Array {
    const S = this.S;
    if (!esProyeccion(anio)) {
      const a = anio - PRIMER_ANIO;
      return this.nivelObs.subarray((j * N_OBSERVADOS + a) * S, (j * N_OBSERVADOS + a + 1) * S);
    }
    const K = this.K;
    const off = (j * (N_ANIOS - N_OBSERVADOS) + anio - ULTIMO_OBSERVADO - 1) * S * K;
    const v = this.nivelProy.subarray(off, off + S * K);
    // El escenario es un cambio de régimen hacia adelante: solo desde 2025.
    if (!esc || !esc.municipios.includes(j)) return v;

    const m = this.datos.meta.m[j];
    const r = new Float64Array(S * K);
    for (let s = 0; s < S; s++) {
      // Por muestra, no sobre medianas: el desplazamiento conserva la
      // correlación entre el nivel de un año y el de otro.
      const delta =
        esc.comoEn !== undefined
          ? m[esc.comoEn - PRIMER_ANIO][s] - m[N_OBSERVADOS - 1][s]
          : Math.log(esc.factor ?? 1);
      for (let k = 0; k < K; k++) r[s * K + k] = v[s * K + k] + delta;
    }
    return r;
  }

  private clave(anio: number, esc: Escenario | null): string {
    if (!esc || !esProyeccion(anio)) return `${anio}`;
    return `${anio}|${esc.municipios.join(",")}|${esc.comoEn ?? ""}|${esc.factor ?? ""}`;
  }

  /** Total metropolitano del año, en percentiles 5/50/95. */
  totales(anio: number, esc: Escenario | null = null): Totales {
    const k = this.clave(anio, esc);
    const cache = this.cacheTotales.get(k);
    if (cache) return cache;

    // μ[i, r] = e^base[i, s] · e^nivel[j, r], así que por municipio
    // Σμ = e^nivel · Σ e^base y Σμ² = e^(2·nivel) · Σ e^(2·base).
    const S = this.S;
    const K = this.caminos(anio);
    const R = S * K;
    const M = new Float64Array(R);
    const V = new Float64Array(R);
    for (let j = 0; j < this.nMun; j++) {
      const lv = this.nivel(j, anio, esc);
      for (let r = 0; r < R; r++) {
        const s = Math.floor(r / K);
        const e = Math.exp(lv[r]);
        const suma = this.sumaE[j * S + s] * e;
        M[r] += suma;
        V[r] += suma + (this.sumaE2[j * S + s] * e * e) / this.theta[s];
      }
    }
    // Suma de Binomiales Negativas independientes: a escala metropolitana
    // (decenas de miles) la normal con la misma varianza es indistinguible.
    const T = M.map((m, r) => m + Math.sqrt(V[r]) * this.z[r]);
    const res = { esperado: resumir(M), total: resumir(T) };
    this.cacheTotales.set(k, res);
    return res;
  }

  /** μ de la celda i en cada escenario usado para mapas (S × CAMINOS_CELDA como mucho). */
  private muestrasCelda(i: number, lv: Float64Array, K: number, destino: Float64Array): Float64Array {
    const S = this.S;
    const kc = Math.min(K, CAMINOS_CELDA);
    for (let s = 0; s < S; s++) {
      const b = this.base[i * S + s];
      for (let k = 0; k < kc; k++) destino[s * kc + k] = Math.exp(b + lv[s * K + k]);
    }
    return destino.subarray(0, S * kc);
  }

  /** Mediana de μ por celda: el valor esperado de cada hexágono. */
  medianas(anio: number, esc: Escenario | null = null): Float64Array {
    const clave = this.clave(anio, esc);
    const cache = this.cacheMedianas.get(clave);
    if (cache) return cache;

    const K = this.caminos(anio);
    const niv = Array.from({ length: this.nMun }, (_, j) => this.nivel(j, anio, esc));
    const r = new Float64Array(this.nHex);
    const tmp = new Float64Array(this.S * CAMINOS_CELDA);
    for (let i = 0; i < this.nHex; i++)
      r[i] = cuantil(this.muestrasCelda(i, niv[this.municipioDe[i]], K, tmp).sort(), 0.5);
    this.cacheMedianas.set(clave, r);
    return r;
  }

  /** μ de una celda en percentiles, para el tooltip. */
  celda(i: number, anio: number, esc: Escenario | null = null): Resumen {
    const K = this.caminos(anio);
    const lv = this.nivel(this.municipioDe[i], anio, esc);
    return resumir(this.muestrasCelda(i, lv, K, new Float64Array(this.S * CAMINOS_CELDA)));
  }
}


/**
 * Las celdas del `fraccion` superior según `valores`, y qué parte de `pesos`
 * se llevan. Es la frase «el 5 % del territorio concentra el X %».
 */
export function concentracion(
  valores: ArrayLike<number>,
  pesos: ArrayLike<number>,
  fraccion: number,
): { mascara: Uint8Array; parte: number } {
  const n = valores.length;
  const orden = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => valores[b] - valores[a] || pesos[b] - pesos[a],
  );
  const k = Math.max(1, Math.round(fraccion * n));
  const mascara = new Uint8Array(n);
  let arriba = 0;
  let total = 0;
  for (let r = 0; r < n; r++) {
    const i = orden[r];
    total += pesos[i];
    if (r < k) {
      mascara[i] = 1;
      arriba += pesos[i];
    }
  }
  return { mascara, parte: total > 0 ? arriba / total : 0 };
}
