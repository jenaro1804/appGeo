// Estado de la escena y sus transiciones. Es una función pura (reducir), así
// que se prueba sin navegador: ver pruebas/estado.test.ts.

import { ANIOS } from "./modelo";

export type Lente = "crudo" | "neto";

/** Lo que el mapa y la serie dibujan. */
export interface Vista {
  anio: number;
  lente: Lente;
}

export interface Estado {
  actual: Vista;
  top: number; // índice en TOPS
  ayuda: boolean;
  etiquetas: boolean;
}

export type Accion =
  | { tipo: "anio"; anio: number }
  | { tipo: "moverAnio"; paso: number }
  | { tipo: "lente"; lente?: Lente } // sin valor, alterna
  | { tipo: "top"; paso: number }
  | { tipo: "topEn"; k: number }
  | { tipo: "reiniciar" }
  | { tipo: "ayuda" }
  | { tipo: "etiquetas" };

export const TOPS = [0, 0.01, 0.02, 0.05, 0.1, 0.2];
export const BASE: Vista = { anio: 2024, lente: "crudo" };

export const INICIAL: Estado = {
  actual: BASE,
  top: 0,
  ayuda: false,
  etiquetas: true,
};

export function reducir(e: Estado, a: Accion): Estado {
  const modificar = (cambio: Partial<Vista>): Estado => ({ ...e, actual: { ...e.actual, ...cambio } });

  switch (a.tipo) {
    case "anio":
      return modificar({ anio: a.anio });
    case "moverAnio": {
      const k = ANIOS.indexOf(e.actual.anio) + a.paso;
      return k >= 0 && k < ANIOS.length ? modificar({ anio: ANIOS[k] }) : e;
    }
    case "lente":
      return modificar({ lente: a.lente ?? (e.actual.lente === "crudo" ? "neto" : "crudo") });
    case "top":
      return { ...e, top: Math.min(TOPS.length - 1, Math.max(0, e.top + a.paso)) };
    case "topEn":
      return { ...e, top: Math.min(TOPS.length - 1, Math.max(0, a.k)) };
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
