import { describe, expect, it } from "vitest";
import { type Accion, type Estado, INICIAL, type PresetListo, reducir, vistaDe } from "../src/lib/estado";

const guadalupe: PresetListo = {
  tecla: "1",
  pregunta: "¿Qué pasa si Guadalupe vuelve a reportar como en 2021?",
  etiqueta: "Guadalupe reporta como en 2021",
  municipios: ["Guadalupe"],
  comoEn: 2021,
  anioAntes: 2025,
  anio: 2025,
  escenario: { municipios: [8], comoEn: 2021 },
};

const correr = (...acciones: Accion[]): Estado => acciones.reduce(reducir, INICIAL);

describe("pregunta → revelar → antes/después", () => {
  it("la pregunta muestra el estado sin escenario, en el año de la pregunta", () => {
    const e = correr({ tipo: "lanzar", preset: guadalupe });
    expect(e.pregunta).toBe(guadalupe);
    expect(vistaDe(e)).toMatchObject({ anio: 2025, lente: "crudo", escenario: null });
    expect(e.referencia).toBeNull();
  });

  it("revelar aplica el escenario y deja el «antes» como referencia", () => {
    const e = correr({ tipo: "lanzar", preset: guadalupe }, { tipo: "revelar" });
    expect(e.pregunta).toBeNull();
    expect(vistaDe(e).escenario).toBe(guadalupe.escenario);
    expect(e.referencia?.escenario).toBeNull();
  });

  it("alternar muestra la referencia y vuelve", () => {
    const e1 = correr({ tipo: "lanzar", preset: guadalupe }, { tipo: "revelar" }, { tipo: "alternar" });
    expect(vistaDe(e1).escenario).toBeNull();
    expect(vistaDe(reducir(e1, { tipo: "alternar" })).escenario).toBe(guadalupe.escenario);
  });

  it("mover el año mientras se ve la referencia actúa sobre el estado actual", () => {
    const e = correr({ tipo: "lanzar", preset: guadalupe }, { tipo: "revelar" }, { tipo: "alternar" }, { tipo: "moverAnio", paso: 1 });
    expect(e.viendoReferencia).toBe(false);
    expect(vistaDe(e)).toMatchObject({ anio: 2026, escenario: guadalupe.escenario });
  });

  it("revelar sin pregunta no hace nada", () => {
    expect(correr({ tipo: "revelar" })).toBe(INICIAL);
  });
});

describe("controles", () => {
  it("el año no sale de 2019-2027", () => {
    expect(vistaDe(correr({ tipo: "anio", anio: 2027 }, { tipo: "moverAnio", paso: 1 })).anio).toBe(2027);
    expect(vistaDe(correr({ tipo: "anio", anio: 2019 }, { tipo: "moverAnio", paso: -1 })).anio).toBe(2019);
  });

  it("el top N se queda entre apagado y 20 %", () => {
    expect(correr({ tipo: "top", paso: -1 }).top).toBe(0);
    expect(correr(...Array(10).fill({ tipo: "top", paso: 1 })).top).toBe(5);
  });

  it("Esc con la ayuda abierta solo cierra la ayuda", () => {
    const e = correr({ tipo: "anio", anio: 2027 }, { tipo: "ayuda" }, { tipo: "reiniciar" });
    expect(e.ayuda).toBe(false);
    expect(vistaDe(e).anio).toBe(2027);
  });

  it("reiniciar conserva la lente y las etiquetas, y borra lo demás", () => {
    const e = correr(
      { tipo: "lente" }, { tipo: "etiquetas" }, { tipo: "top", paso: 2 },
      { tipo: "anio", anio: 2027 }, { tipo: "fijar" }, { tipo: "reiniciar" },
    );
    expect(e).toMatchObject({ referencia: null, top: 0, pregunta: null, etiquetas: false });
    expect(vistaDe(e)).toMatchObject({ anio: 2024, lente: "neto", escenario: null });
  });
});
