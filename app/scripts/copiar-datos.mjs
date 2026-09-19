// Copia el export del modelo (data/processed/app/, que escribe
// `uv run exportar-app`) a public/datos/, desde donde Next lo sirve.
// Corre solo antes de `npm run dev` y `npm run build` (predev / prebuild).
//
// Si data/processed/app/ no existe —por ejemplo, en un build de Vercel, que
// solo ve el repo— se usan los archivos que ya estén en public/datos/. Si
// tampoco están, falla con un mensaje claro en vez de publicar una app vacía.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ARCHIVOS = ["celdas.json", "meta.json", "contornos.json", "posterior.bin"];
const origen = fileURLToPath(new URL("../../data/processed/app/", import.meta.url));
const destino = fileURLToPath(new URL("../public/datos/", import.meta.url));

const faltan = (dir) => ARCHIVOS.filter((a) => !existsSync(dir + a));

if (faltan(origen).length === 0) {
  mkdirSync(destino, { recursive: true });
  for (const a of ARCHIVOS) copyFileSync(origen + a, destino + a);
  console.log(`Datos del modelo copiados a public/datos/ (${ARCHIVOS.length} archivos)`);
} else if (faltan(destino).length === 0) {
  console.log("data/processed/app/ no está; se usan los datos que ya hay en public/datos/");
} else {
  console.error(
    `Faltan los datos del modelo: ${faltan(origen).join(", ")} en data/processed/app/.\n` +
      "Genéralos desde la raíz del repo con: uv run exportar-app",
  );
  process.exit(1);
}
