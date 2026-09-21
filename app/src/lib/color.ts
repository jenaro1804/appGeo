// Colores de la identidad GeoStats (README, «Identidad visual») y la rampa
// del mapa. No se inventan tonos: la rampa interpola las paradas del manual
// en OKLab, que reparte la luminosidad de forma pareja.
//
// La rampa va de #F2F2F2 al azul oscuro. Validada con el script de la skill
// dataviz: luminosidad OKLab monótona (0.96 → 0.45).

export const MANUAL = {
  datos: "#005991",
  datos2: "#1b77b8",
  datos3: "#4195d9",
  enfasis: "#8B2C1A",
  calido: "#B15E2E",
  grafito: "#2C2C2C",
  fondo2: "#F2F2F2",
};

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

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

/**
 * Tabla de colores precalculada: `N_T` pasos de la rampa × `N_D` niveles de
 * atenuación hacia el fondo. Dibujar 2,241 hexágonos por cuadro no puede
 * construir colores cada vez.
 */
export const N_T = 96;
export const N_D = 16;
const ATENUACION = 0.72; // cuánto se lava una celda fuera del top N

export interface Paleta {
  tabla: string[];
  /** Degradado CSS de la rampa, para la leyenda. */
  gradiente: string;
  texto: string;
  /** Contorno del top N del territorio. */
  enfasis: string;
  /** Halo detrás de los rótulos, para que se lean sobre cualquier celda. */
  halo: string;
}

function crearPaleta(paradas: string[], fondo: string, texto: string, enfasis: string, halo: string): Paleta {
  const lab = paradas.map((h) => aOklab(hexARgb(h)));
  const rampa = (t: number): Rgb => {
    const x = Math.min(1, Math.max(0, t)) * (lab.length - 1);
    const k = Math.min(Math.floor(x), lab.length - 2);
    const f = x - k;
    const [a, b] = [lab[k], lab[k + 1]];
    return deOklab([0, 1, 2].map((c) => a[c] + f * (b[c] - a[c])) as Rgb);
  };
  const f = hexARgb(fondo);
  const tabla: string[] = [];
  for (let i = 0; i < N_T; i++) {
    const c = rampa(i / (N_T - 1));
    for (let d = 0; d < N_D; d++) {
      const w = (ATENUACION * d) / (N_D - 1);
      tabla.push(css(c.map((v, k) => v + (f[k] - v) * w) as Rgb));
    }
  }
  const n = 12;
  const gradiente = `linear-gradient(90deg, ${Array.from({ length: n }, (_, k) => css(rampa(k / (n - 1)))).join(", ")})`;
  return { tabla, gradiente, texto, enfasis, halo };
}

// El fondo coincide con --background de globals.css: la celda atenuada se
// funde con la página, no con un gris ajeno.
export const PALETA: Paleta = crearPaleta(
  [MANUAL.fondo2, MANUAL.datos3, MANUAL.datos2, MANUAL.datos],
  "#FFFFFF", MANUAL.grafito, MANUAL.enfasis, "rgba(255,255,255,0.9)",
);

export function colorDe(p: Paleta, t: number, atenuado: number): string {
  const i = Math.round(Math.min(1, Math.max(0, t)) * (N_T - 1));
  const d = Math.round(Math.min(1, Math.max(0, atenuado)) * (N_D - 1));
  return p.tabla[i * N_D + d];
}
