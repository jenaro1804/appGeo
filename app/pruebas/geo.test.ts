// La UTM inversa del cliente contra la de geopandas: celdas.json trae el
// centro de cada hexágono en UTM (x, y) y en grados (lon, lat), este último
// calculado por el export. Si coinciden, los hexágonos caen donde deben sobre
// el mapa base.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geoAMercator, utmAGeo } from "../src/lib/geo";

const celdas = JSON.parse(readFileSync(new URL("../public/datos/celdas.json", import.meta.url), "utf-8")) as {
  x: number[];
  y: number[];
  lon: number[];
  lat: number[];
};

describe("UTM 14N → grados", () => {
  it("coincide con geopandas en las 2,241 celdas, hasta el redondeo del export", () => {
    let peor = 0;
    for (let i = 0; i < celdas.x.length; i++) {
      const [lon, lat] = utmAGeo(celdas.x[i], celdas.y[i]);
      peor = Math.max(peor, Math.abs(lon - celdas.lon[i]), Math.abs(lat - celdas.lat[i]));
    }
    // El export redondea lon/lat a 5 decimales (hasta 5e-6°, medio metro) y
    // x/y a 0.1 m (unos 5e-7°). Contra pyproj sin redondeo, la fórmula difiere
    // en menos de 1e-9°.
    expect(peor).toBeLessThan(5.5e-6);
  });
});

describe("Mercator de MapLibre", () => {
  it("el origen y el ecuador caen en el centro del mundo", () => {
    expect(geoAMercator(0, 0)).toEqual([0.5, 0.5]);
  });

  it("el norte tiene y menor", () => {
    expect(geoAMercator(-100, 26)[1]).toBeLessThan(geoAMercator(-100, 25)[1]);
  });
});
