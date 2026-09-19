// Copia el worker de MapLibre a public/mapa/maplibre/, desde donde lo carga el
// navegador (lib/mapaBase.ts, setWorkerUrl). Corre antes de `npm run dev` y
// `npm run build`.
//
// Hace falta porque MapLibre busca su worker junto a su propio archivo
// (import.meta.url) y el bundler de Next no lo copia: sin esto el estilo del
// mapa base nunca termina de cargar y solo se ve el fondo gris, sin error.
// Se copia de node_modules para que la versión coincida siempre con la del
// paquete instalado.

import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ARCHIVOS = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const origen = fileURLToPath(new URL("../node_modules/maplibre-gl/dist/", import.meta.url));
const destino = fileURLToPath(new URL("../public/mapa/maplibre/", import.meta.url));

mkdirSync(destino, { recursive: true });
for (const a of ARCHIVOS) copyFileSync(origen + a, destino + a);
console.log(`Worker de MapLibre copiado a public/mapa/maplibre/ (${ARCHIVOS.length} archivos)`);
