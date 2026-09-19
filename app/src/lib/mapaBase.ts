// El mapa base: calles, colonias y nombres debajo de los hexágonos, con zoom
// y arrastre. Es MapLibre GL leyendo un recorte de OpenStreetMap solo de la
// ZMM (public/mapa/zmm.pmtiles, generado con Protomaps; ver
// docs/app_web.md, «Mapa base»). Todo se sirve desde la propia app: funciona
// sin internet.
//
// MapLibre y pmtiles se importan dinámicamente (en Explorador, al cargar)
// porque tocan `window` al importarse y la página se prerenderiza.

import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import type { Map as MapaML, StyleSpecification } from "maplibre-gl";
import type { Camara, Relleno } from "./mapa";

export type MapLibre = typeof import("maplibre-gl");

/**
 * Hasta dónde se puede arrastrar el mapa. El recorte de calles es
 * -100.78, 25.28, -99.72, 26.40; los límites son más amplios porque MapLibre
 * exige que toda la pantalla quepa dentro de ellos, y con límites justos en
 * una pantalla ancha forzaba un zoom mayor que el del encuadre.
 */
const LIMITES: [[number, number], [number, number]] = [[-103, 24], [-97.5, 27.7]];

export const ATRIBUCION = "© OpenStreetMap · Protomaps";

/**
 * El sabor `grayscale` de Protomaps, aclarado. De fábrica la tierra es
 * #CCCCCC y todo se ve gris oscuro; aquí la tierra es el #F2F2F2 del manual,
 * las calles van en blanco con borde gris suave (se distinguen sin competir
 * con los azules) y los rótulos conservan su contraste. Sin color: el único
 * color de la pantalla es el de los datos.
 */
const CLARO: Flavor = {
  ...namedFlavor("grayscale"),
  background: "#e6e6e6",
  earth: "#f2f2f2",
  park_a: "#e9e9e9",
  park_b: "#e9e9e9",
  wood_a: "#e9e9e9",
  wood_b: "#e9e9e9",
  scrub_a: "#ebebeb",
  scrub_b: "#ebebeb",
  hospital: "#ededed",
  school: "#ededed",
  industrial: "#ebebeb",
  pedestrian: "#ececec",
  aerodrome: "#ebebeb",
  zoo: "#eaeaea",
  military: "#e8e8e8",
  glacier: "#f5f5f5",
  sand: "#efefef",
  beach: "#efefef",
  water: "#dadada",
  pier: "#e0e0e0",
  runway: "#ffffff",
  buildings: "#e5e5e5",
  // Calles: relleno blanco, borde gris.
  highway: "#ffffff",
  major: "#ffffff",
  link: "#ffffff",
  minor_a: "#ffffff",
  minor_b: "#fbfbfb",
  minor_service: "#fbfbfb",
  other: "#fbfbfb",
  highway_casing_early: "#cfcfcf",
  highway_casing_late: "#cfcfcf",
  major_casing_early: "#d6d6d6",
  major_casing_late: "#d6d6d6",
  link_casing: "#d6d6d6",
  minor_casing: "#dedede",
  minor_service_casing: "#e2e2e2",
  bridges_highway: "#ffffff",
  bridges_major: "#ffffff",
  bridges_link: "#ffffff",
  bridges_minor: "#ffffff",
  bridges_other: "#fbfbfb",
  bridges_highway_casing: "#cfcfcf",
  bridges_major_casing: "#d6d6d6",
  bridges_link_casing: "#d6d6d6",
  bridges_minor_casing: "#dedede",
  bridges_other_casing: "#e2e2e2",
  tunnel_highway: "#f7f7f7",
  tunnel_major: "#f7f7f7",
  tunnel_link: "#f7f7f7",
  tunnel_minor: "#f7f7f7",
  tunnel_other: "#f7f7f7",
  tunnel_highway_casing: "#e0e0e0",
  tunnel_major_casing: "#e0e0e0",
  tunnel_link_casing: "#e0e0e0",
  tunnel_minor_casing: "#e0e0e0",
  tunnel_other_casing: "#e0e0e0",
  railway: "#cfcfcf",
  boundaries: "#a3a3a3",
  // Rótulos: el mismo gris de fábrica, con halo del color de la nueva tierra.
  city_label_halo: "#f2f2f2",
  subplace_label_halo: "#f2f2f2",
  state_label_halo: "#f2f2f2",
  roads_label_major_halo: "#ffffff",
  roads_label_minor_halo: "#ffffff",
  address_label_halo: "#ffffff",
};

export function estilo(): StyleSpecification {
  const origen = window.location.origin;
  return {
    version: 8,
    glyphs: `${origen}/mapa/fonts/{fontstack}/{range}.pbf`,
    // Los íconos (casetas, puntos de interés) son los del sabor gris.
    sprite: `${origen}/mapa/sprites/grayscale`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${origen}/mapa/zmm.pmtiles`,
        attribution: ATRIBUCION,
      },
    },
    layers: layers("protomaps", CLARO, { lang: "es" }),
  };
}

let listo = false;

/**
 * Una vez por página: dónde está el worker de MapLibre (lo copia
 * scripts/copiar-maplibre.mjs; MapLibre no lo encuentra solo dentro del
 * bundle de Next) y el protocolo pmtiles:// para leer el recorte local.
 */
export function prepararMapLibre(ml: MapLibre, Protocol: typeof import("pmtiles").Protocol) {
  if (listo) return;
  ml.setWorkerUrl(`${window.location.origin}/mapa/maplibre/maplibre-gl-worker.mjs`);
  ml.addProtocol("pmtiles", new Protocol().tile);
  listo = true;
}

export function crearMapaBase(
  ml: MapLibre,
  contenedor: HTMLElement,
  extension: [[number, number], [number, number]],
  relleno: Relleno,
  tactil: boolean,
): MapaML {
  const mapa = new ml.Map({
    container: contenedor,
    style: estilo(),
    bounds: extension,
    fitBoundsOptions: { padding: { top: relleno.arr, bottom: relleno.aba, left: relleno.izq, right: relleno.der } },
    maxBounds: LIMITES,
    minZoom: 8,
    maxZoom: 17.5,
    // Sin rotación ni inclinación: los hexágonos se dibujan con una
    // transformación de escala y traslado (lib/mapa.ts) y el público no se
    // pierde.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    // El teclado es del presentador (Explorador.tsx).
    keyboard: false,
    attributionControl: false,
    renderWorldCopies: false,
    // En celular, un dedo desplaza la página y dos mueven el mapa.
    cooperativeGestures: tactil,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para acercar o alejar el mapa",
      "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para acercar o alejar el mapa",
      "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
    },
  });
  mapa.touchZoomRotate.disableRotation();
  return mapa;
}

/** La cámara de MapLibre en los términos de lib/mapa.ts. */
export function camaraDe(ml: MapLibre, mapa: MapaML): Camara {
  const c = ml.MercatorCoordinate.fromLngLat(mapa.getCenter());
  return { cx: c.x, cy: c.y, escala: 512 * 2 ** mapa.getZoom() };
}

export function encuadrar(mapa: MapaML, extension: [[number, number], [number, number]], relleno: Relleno, animar: boolean) {
  mapa.fitBounds(extension, {
    padding: { top: relleno.arr, bottom: relleno.aba, left: relleno.izq, right: relleno.der },
    animate: animar,
    duration: animar ? 650 : 0,
  });
}
