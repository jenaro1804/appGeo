// El contrato de datos con `uv run exportar-app`. Está descrito en
// docs/app_web.md; si cambia allá, cambia aquí.
//
// En el navegador los archivos se sirven desde public/datos/, adonde los copia
// scripts/copiar-datos.mjs antes de `npm run dev` y `npm run build`.

export interface Celdas {
  x: number[]; // centro en UTM 14N, metros
  y: number[];
  lon: number[];
  lat: number[];
  municipio: number[]; // índice en Meta.municipios
  conteos: number[][]; // [celda][año 2019..2024], observados
}

export interface Meta {
  n_hex: number;
  n_mun: number;
  n_draws: number;
  anios: number[];
  lado_m: number;
  municipios: string[];
  m: number[][][]; // [municipio][año][muestra]
  b0: number[];
  s_rw: number[];
  theta: number[];
}

export interface Contornos {
  municipios: { j: number; anillos: [number, number][][] }[];
}

export interface Datos {
  celdas: Celdas;
  meta: Meta;
  contornos: Contornos;
  u: Float32Array; // [celda * S + muestra]
}

export const ARCHIVOS = ["celdas.json", "meta.json", "contornos.json", "posterior.bin"] as const;

/** Arma y valida los datos; `posterior` es el contenido crudo de posterior.bin. */
export function armar(celdas: Celdas, meta: Meta, contornos: Contornos, posterior: ArrayBuffer): Datos {
  // numpy escribe float32 en el orden de la máquina, little-endian en x86 y
  // ARM, que es también el de Float32Array en cualquier navegador.
  const u = new Float32Array(posterior);

  // Si el export cambiara de forma, fallar aquí y no dibujar un mapa equivocado.
  if (u.length !== meta.n_hex * meta.n_draws)
    throw new Error(`posterior.bin: ${u.length} valores, se esperaban ${meta.n_hex} × ${meta.n_draws}`);
  if (celdas.x.length !== meta.n_hex)
    throw new Error(`celdas.json: ${celdas.x.length} celdas, meta dice ${meta.n_hex}`);

  return { celdas, meta, contornos, u };
}

/** Descarga los cuatro archivos del servidor. */
export async function cargar(base = "/datos"): Promise<Datos> {
  const pedir = async (nombre: string) => {
    const r = await fetch(`${base}/${nombre}`);
    if (!r.ok) throw new Error(`${base}/${nombre}: ${r.status}. ¿Corriste uv run exportar-app?`);
    return r;
  };
  const [celdas, meta, contornos, posterior] = await Promise.all([
    pedir("celdas.json").then((r) => r.json()),
    pedir("meta.json").then((r) => r.json()),
    pedir("contornos.json").then((r) => r.json()),
    pedir("posterior.bin").then((r) => r.arrayBuffer()),
  ]);
  return armar(celdas, meta, contornos, posterior);
}
