// Conversión de coordenadas para montar los hexágonos sobre el mapa base.
//
// Los hexágonos viven en UTM 14N (metros), que es donde son regulares
// (espacial.rejilla_hexagonal). El mapa base usa Web Mercator. Aquí se pasa
// de uno a otro sin dependencias: UTM inversa (fórmulas de Snyder, error de
// milímetros a menos de 2° del meridiano central) y Mercator en las unidades
// de mundo de MapLibre ([0, 1] en x e y).
//
// Probado contra celdas.lon/lat, que calcula geopandas en el export
// (pruebas/geo.test.ts).

const A = 6378137; // WGS84
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const LON0 = -99; // meridiano central de la zona 14
const RAD = Math.PI / 180;

/** UTM zona 14 norte (metros) → [lon, lat] en grados. */
export function utmAGeo(este: number, norte: number): [number, number] {
  const x = este - 500000;
  const m = norte / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const s = Math.sin(phi1);
  const c = Math.cos(phi1);
  const t = Math.tan(phi1);
  const C1 = EP2 * c * c;
  const T1 = t * t;
  const N1 = A / Math.sqrt(1 - E2 * s * s);
  const R1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const D = x / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * t) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) / 720);
  const lon =
    LON0 * RAD +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120) / c;
  return [lon / RAD, lat / RAD];
}

/** [lon, lat] → Mercator en unidades de mundo de MapLibre: x, y ∈ [0, 1], y hacia el sur. */
export function geoAMercator(lon: number, lat: number): [number, number] {
  return [(180 + lon) / 360, (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))) / 360];
}

export const utmAMercator = (este: number, norte: number) => geoAMercator(...utmAGeo(este, norte));
