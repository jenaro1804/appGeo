// Estado de la escena y sus transiciones. Es una función pura (reducir), así
// que se prueba sin navegador: ver pruebas/estado.test.ts.

import type { Preset } from "./escenarios";
import { ANIOS, type Escenario } from "./modelo";

export type Lente = "crudo" | "neto";
/**
 * Cómo se proyecta 2025-2027. «estable»: cada municipio sigue reportando como
 * en 2024 (el supuesto con el que el notebook validó). «cambios»: el nivel
 * municipal sigue su caminata aleatoria con innovaciones t, y la banda se abre.
 */
export type Proyeccion = "estable" | "cambios";

export interface Vista {
  anio: number;
  lente: Lente;
  proyeccion: Proyeccion;
  escenario: Escenario | null;
  etiqueta: string | null;
}

export interface PresetListo extends Preset {
  escenario: Escenario | null;
}

export interface Estado {
  actual: Vista;
  referencia: Vista | null;
  viendoReferencia: boolean;
  top: number; // índice en TOPS
  pregunta: PresetListo | null;
  ayuda: boolean;
  etiquetas: boolean;
}

export type Accion =
  | { tipo: "anio"; anio: number }
  | { tipo: "moverAnio"; paso: number }
  | { tipo: "lente"; lente?: Lente } // sin valor, alterna
  | { tipo: "proyeccion"; proyeccion?: Proyeccion } // sin valor, alterna
  | { tipo: "top"; paso: number }
  | { tipo: "topEn"; k: number }
  | { tipo: "lanzar"; preset: PresetListo }
  | { tipo: "revelar" }
  | { tipo: "fijar" }
  | { tipo: "alternar" }
  | { tipo: "verReferencia"; ver: boolean }
  | { tipo: "quitarEscenario" }
  | { tipo: "reiniciar" }
  | { tipo: "ayuda" }
  | { tipo: "etiquetas" };

export const TOPS = [0, 0.01, 0.02, 0.05, 0.1, 0.2];
export const BASE: Vista = { anio: 2024, lente: "crudo", proyeccion: "estable", escenario: null, etiqueta: null };

export const INICIAL: Estado = {
  actual: BASE,
  referencia: null,
  viendoReferencia: false,
  top: 0,
  pregunta: null,
  ayuda: false,
  etiquetas: true,
};

export const vistaDe = (e: Estado) => (e.viendoReferencia && e.referencia ? e.referencia : e.actual);

export function reducir(e: Estado, a: Accion): Estado {
  // Cualquier cambio del operador actúa sobre el estado actual, no sobre la referencia.
  const modificar = (cambio: Partial<Vista>): Estado => ({
    ...e,
    viendoReferencia: false,
    actual: { ...e.actual, ...cambio },
  });

  switch (a.tipo) {
    case "anio":
      return modificar({ anio: a.anio });
    case "moverAnio": {
      const k = ANIOS.indexOf(e.actual.anio) + a.paso;
      return k >= 0 && k < ANIOS.length ? modificar({ anio: ANIOS[k] }) : e;
    }
    case "lente":
      return modificar({ lente: a.lente ?? (e.actual.lente === "crudo" ? "neto" : "crudo") });
    case "proyeccion":
      return modificar({ proyeccion: a.proyeccion ?? (e.actual.proyeccion === "estable" ? "cambios" : "estable") });
    case "top":
      return { ...e, top: Math.min(TOPS.length - 1, Math.max(0, e.top + a.paso)) };
    case "topEn":
      return { ...e, top: Math.min(TOPS.length - 1, Math.max(0, a.k)) };
    case "lanzar":
      // La pregunta se hace sobre el estado sin escenario, en el mapa crudo: el
      // neto no cambia con el régimen de reporte, ahí no habría nada que revelar.
      return {
        ...e,
        referencia: null,
        viendoReferencia: false,
        pregunta: a.preset,
        actual: {
          anio: a.preset.anioAntes,
          lente: "crudo",
          proyeccion: a.preset.proyeccionAntes ?? e.actual.proyeccion,
          escenario: null,
          etiqueta: null,
        },
      };
    case "revelar": {
      const p = e.pregunta;
      if (!p) return e;
      return {
        ...e,
        pregunta: null,
        referencia: { ...e.actual }, // lo que el público vio al especular: el «antes»
        actual: {
          anio: p.anio,
          lente: "crudo",
          proyeccion: p.proyeccion ?? e.actual.proyeccion,
          escenario: p.escenario,
          etiqueta: p.etiqueta,
        },
      };
    }
    case "fijar":
      return { ...e, referencia: { ...e.actual }, viendoReferencia: false };
    case "alternar":
      return e.referencia ? { ...e, viendoReferencia: !e.viendoReferencia } : e;
    case "verReferencia":
      return e.referencia ? { ...e, viendoReferencia: a.ver } : e;
    case "quitarEscenario":
      return { ...modificar({ escenario: null, etiqueta: null }), referencia: null, pregunta: null };
    case "reiniciar":
      // Con la ayuda abierta, Esc solo la cierra: no borra lo que se estaba mostrando.
      if (e.ayuda) return { ...e, ayuda: false };
      return { ...INICIAL, etiquetas: e.etiquetas, actual: { ...BASE, lente: e.actual.lente } };
    case "ayuda":
      return { ...e, ayuda: !e.ayuda };
    case "etiquetas":
      return { ...e, etiquetas: !e.etiquetas };
  }
}
