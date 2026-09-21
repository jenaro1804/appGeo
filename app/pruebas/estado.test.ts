import { describe, expect, it } from "vitest";
import { type Accion, type Estado, INICIAL, reducir } from "../src/lib/estado";

const correr = (...acciones: Accion[]): Estado => acciones.reduce(reducir, INICIAL);

describe("controles", () => {
  it("arranca en 2024, el último año observado", () => {
    expect(INICIAL.actual).toMatchObject({ anio: 2024, lente: "crudo" });
  });

  it("el año no sale de 2019-2027", () => {
    expect(correr({ tipo: "anio", anio: 2027 }, { tipo: "moverAnio", paso: 1 }).actual.anio).toBe(2027);
    expect(correr({ tipo: "anio", anio: 2019 }, { tipo: "moverAnio", paso: -1 }).actual.anio).toBe(2019);
  });

  it("la lente alterna, o se fija con un valor sin alternar", () => {
    expect(correr({ tipo: "lente" }).actual.lente).toBe("neto");
    expect(correr({ tipo: "lente" }, { tipo: "lente" }).actual.lente).toBe("crudo");
    expect(correr({ tipo: "lente", lente: "neto" }, { tipo: "lente", lente: "neto" }).actual.lente).toBe("neto");
  });

  it("el top N se queda entre apagado y 20 %", () => {
    expect(correr({ tipo: "top", paso: -1 }).top).toBe(0);
    expect(correr(...Array(10).fill({ tipo: "top", paso: 1 })).top).toBe(5);
    expect(correr({ tipo: "topEn", k: 9 }).top).toBe(5);
  });

  it("Esc con la ayuda abierta solo cierra la ayuda", () => {
    const e = correr({ tipo: "anio", anio: 2027 }, { tipo: "ayuda" }, { tipo: "reiniciar" });
    expect(e.ayuda).toBe(false);
    expect(e.actual.anio).toBe(2027);
  });

  it("reiniciar conserva la lente y las etiquetas, y borra lo demás", () => {
    const e = correr(
      { tipo: "lente" }, { tipo: "etiquetas" }, { tipo: "top", paso: 2 }, { tipo: "anio", anio: 2027 },
      { tipo: "reiniciar" },
    );
    expect(e).toMatchObject({ top: 0, etiquetas: false });
    expect(e.actual).toMatchObject({ anio: 2024, lente: "neto" });
  });
});
