// Colores de la identidad GeoStats (README, «Identidad visual») y la rampa
// del mapa. No se inventan tonos: la rampa interpola las paradas del manual
// en OKLab, que reparte la luminosidad de forma pareja.

export const COLOR = {
  datos: "#005991",
  datos2: "#1b77b8",
  datos3: "#4195d9",
  enfasis: "#8B2C1A",
  texto: "#2C2C2C",
  fondo2: "#F2F2F2",
};

const PARADAS = [COLOR.fondo2, COLOR.datos3, COLOR.datos2, COLOR.datos];

type Rgb = [number, number, number];

const hexARgb = (h: string): Rgb => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255) as Rgb;
const aLineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const aSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function aOklab([r, g, b]: Rgb): Rgb {
  const [R, G, B] = [r, g, b].map(aLineal);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, aSrgb(c)))) as Rgb;
}

const PARADAS_LAB = PARADAS.map((h) => aOklab(hexARgb(h)));

/** Color de la rampa en t ∈ [0, 1]. */
export function rampa(t: number): Rgb {
  const x = Math.min(1, Math.max(0, t)) * (PARADAS_LAB.length - 1);
  const k = Math.min(Math.floor(x), PARADAS_LAB.length - 2);
  const f = x - k;
  const [a, b] = [PARADAS_LAB[k], PARADAS_LAB[k + 1]];
  return deOklab([0, 1, 2].map((c) => a[c] + f * (b[c] - a[c])) as Rgb);
}

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

/**
 * Tabla de colores precalculada: `N_T` pasos de la rampa × `N_D` niveles de
 * atenuación hacia blanco. Dibujar 2,241 hexágonos por cuadro no puede
 * construir colores cada vez.
 */
export const N_T = 96;
export const N_D = 16;
const ATENUACION = 0.72; // cuánto se lava una celda fuera del top N

export const TABLA: string[] = (() => {
  const t: string[] = [];
  for (let i = 0; i < N_T; i++) {
    const c = rampa(i / (N_T - 1));
    for (let d = 0; d < N_D; d++) {
      const w = (ATENUACION * d) / (N_D - 1);
      t.push(css(c.map((v) => v + (1 - v) * w) as Rgb));
    }
  }
  return t;
})();

export function colorDe(t: number, atenuado: number): string {
  const i = Math.round(Math.min(1, Math.max(0, t)) * (N_T - 1));
  const d = Math.round(Math.min(1, Math.max(0, atenuado)) * (N_D - 1));
  return TABLA[i * N_D + d];
}

export const gradienteCss = (n = 12) =>
  `linear-gradient(90deg, ${Array.from({ length: n }, (_, k) => css(rampa(k / (n - 1)))).join(", ")})`;
