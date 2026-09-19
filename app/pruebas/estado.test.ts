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

describe("proyección y controles visibles", () => {
  const cambios: PresetListo = {
    tecla: "5",
    pregunta: "¿Y si los municipios cambian cómo reportan?",
    etiqueta: "Los municipios pueden cambiar cómo reportan",
    municipios: [],
    anioAntes: 2027,
    anio: 2027,
    proyeccionAntes: "estable",
    proyeccion: "cambios",
    escenario: null,
  };

  it("arranca con la proyección que validó el notebook", () => {
    expect(vistaDe(INICIAL).proyeccion).toBe("estable");
  });

  it("la proyección alterna, o se fija con un valor", () => {
    expect(vistaDe(correr({ tipo: "proyeccion" })).proyeccion).toBe("cambios");
    expect(vistaDe(correr({ tipo: "proyeccion" }, { tipo: "proyeccion" })).proyeccion).toBe("estable");
    expect(vistaDe(correr({ tipo: "proyeccion", proyeccion: "cambios" }, { tipo: "proyeccion", proyeccion: "cambios" })).proyeccion).toBe("cambios");
  });

  it("la lente se fija con un valor sin alternar", () => {
    expect(vistaDe(correr({ tipo: "lente", lente: "neto" }, { tipo: "lente", lente: "neto" })).lente).toBe("neto");
  });

  it("un preset puede preguntar con una proyección y revelar con otra", () => {
    const antes = correr({ tipo: "proyeccion", proyeccion: "cambios" }, { tipo: "lanzar", preset: cambios });
    expect(vistaDe(antes)).toMatchObject({ anio: 2027, proyeccion: "estable" });
    const despues = reducir(antes, { tipo: "revelar" });
    expect(vistaDe(despues)).toMatchObject({ anio: 2027, proyeccion: "cambios" });
    expect(despues.referencia?.proyeccion).toBe("estable");
  });

  it("un preset sin proyección conserva la elegida", () => {
    const e = correr({ tipo: "proyeccion", proyeccion: "cambios" }, { tipo: "lanzar", preset: guadalupe }, { tipo: "revelar" });
    expect(vistaDe(e).proyeccion).toBe("cambios");
  });

  it("antes/después se elige directo, y solo si hay referencia", () => {
    expect(correr({ tipo: "verReferencia", ver: true })).toBe(INICIAL);
    const e = correr({ tipo: "lanzar", preset: guadalupe }, { tipo: "revelar" }, { tipo: "verReferencia", ver: true });
    expect(vistaDe(e).escenario).toBeNull();
    expect(vistaDe(reducir(e, { tipo: "verReferencia", ver: false })).escenario).toBe(guadalupe.escenario);
  });

  it("quitar el escenario conserva año y lente, y borra la comparación", () => {
    const e = correr({ tipo: "lanzar", preset: guadalupe }, { tipo: "revelar" }, { tipo: "quitarEscenario" });
    expect(e).toMatchObject({ referencia: null, pregunta: null, viendoReferencia: false });
    expect(vistaDe(e)).toMatchObject({ anio: 2025, escenario: null, etiqueta: null });
  });

  it("quitar el escenario también cancela una pregunta pendiente", () => {
    expect(correr({ tipo: "lanzar", preset: guadalupe }, { tipo: "quitarEscenario" }).pregunta).toBeNull();
  });

  it("el top se elige directo, dentro del rango", () => {
    expect(correr({ tipo: "topEn", k: 3 }).top).toBe(3);
    expect(correr({ tipo: "topEn", k: 99 }).top).toBe(5);
  });
});
