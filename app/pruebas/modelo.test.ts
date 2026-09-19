import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { armar, type Datos } from "../src/lib/datos";
import { concentracion, Modelo, resumir } from "../src/lib/modelo";

// La genera pruebas/referencia.py (npm test la corre antes).
const ref = JSON.parse(readFileSync(new URL("./referencia.json", import.meta.url), "utf-8"));
// Los mismos archivos que sirve la app, leídos de donde los escribe exportar-app.
const dir = new URL("../../data/processed/app/", import.meta.url);
const json = (nombre: string) => JSON.parse(readFileSync(new URL(nombre, dir), "utf-8"));
const bin = readFileSync(new URL("posterior.bin", dir));
const datos = armar(
  json("celdas.json"),
  json("meta.json"),
  json("contornos.json"),
  bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer,
);
// Sin innovaciones: la referencia de Python no comparte el generador aleatorio.
const persistente = new Modelo(datos, { innovaciones: false });
const idx = (nombre: string) => datos.meta.municipios.indexOf(nombre);

const cerca = (x: number, y: number) => expect(Math.abs(x - y) / Math.abs(y)).toBeLessThan(1e-9);

describe("contra la referencia de numpy", () => {
  it("total esperado de años observados", () => {
    for (const a of [2019, 2021, 2024]) cerca(persistente.totales(a).esperado.p50, ref[`esperado_${a}`]);
  });

  it("escenario: Guadalupe reporta como en 2021, en 2025", () => {
    const esc = { municipios: [idx("Guadalupe")], comoEn: 2021 };
    cerca(persistente.totales(2025, esc).esperado.p50, ref.guadalupe_2021_en_2025);
  });

  it("mapa neto y medianas por celda", () => {
    const med = persistente.medianas(2024);
    for (const [i, v] of Object.entries(ref.neto)) cerca(persistente.neto[+i], v as number);
    for (const [i, v] of Object.entries(ref.mediana_2024)) cerca(med[+i], v as number);
  });

  it("total observado de 2024", () => {
    expect(persistente.totalObservado(2024)).toBe(ref.observado_2024);
  });
});

describe("propiedades", () => {
  const modelo = new Modelo(datos);

  it("el escenario solo actúa en proyecciones", () => {
    const esc = { municipios: [idx("Guadalupe")], factor: 3 };
    expect(modelo.totales(2024, esc)).toEqual(modelo.totales(2024));
    expect(modelo.totales(2026, esc).esperado.p50).toBeGreaterThan(modelo.totales(2026).esperado.p50);
  });

  it("el intervalo se ensancha al alejarse de 2024", () => {
    const ancho = (a: number) => {
      const t = modelo.totales(a).total;
      return t.p95 - t.p5;
    };
    expect(ancho(2025)).toBeGreaterThan(ancho(2024));
    expect(ancho(2027)).toBeGreaterThan(ancho(2025));
  });

  it("las colas no dependen de la semilla", () => {
    // Con una sola trayectoria por muestra, el p95 de 2027 iba de 170 a 320 mil.
    const otra = new Modelo(datos, { semilla: 7 }).totales(2027).total;
    const esta = modelo.totales(2027).total;
    expect(Math.abs(otra.p95 / esta.p95 - 1)).toBeLessThan(0.05);
    expect(Math.abs(otra.p50 / esta.p50 - 1)).toBeLessThan(0.01);
  });

  it("mismas cifras con la misma semilla", () => {
    expect(new Modelo(datos).totales(2027)).toEqual(modelo.totales(2027));
  });

  it("la mediana 2024 queda cerca de lo observado", () => {
    const t = modelo.totales(2024).total;
    expect(t.p50 / ref.observado_2024).toBeGreaterThan(0.95);
    expect(t.p50 / ref.observado_2024).toBeLessThan(1.05);
  });
});

describe("regla: percentiles, nunca medias", () => {
  it("una muestra extrema no mueve el resumen", () => {
    // Una cola t produce, de vez en cuando, un e^T astronómico. Con media, el
    // total se iría al infinito; con mediana ni se entera.
    const S = 5;
    const sintetico: Datos = {
      celdas: { x: [0], y: [0], lon: [0], lat: [0], municipio: [0], conteos: [[1, 1, 1, 1, 1, 1]] },
      meta: {
        n_hex: 1, n_mun: 1, n_draws: S, anios: [2019, 2020, 2021, 2022, 2023, 2024], lado_m: 500,
        municipios: ["A"], m: [Array.from({ length: 6 }, () => Array(S).fill(0))],
        b0: Array(S).fill(0), s_rw: Array(S).fill(0.3), theta: Array(S).fill(10),
      },
      contornos: { municipios: [] },
      u: Float32Array.from([0, 0, 0, 0, 80]),
    };
    const r = new Modelo(sintetico, { innovaciones: false }).totales(2024).esperado;
    expect(r.p50).toBe(1);
    expect(resumir([1, 1, 1, 1, Math.exp(80)]).p50).toBe(1);
  });
});

describe("concentracion", () => {
  it("el top se lleva su parte del total", () => {
    const { mascara, parte } = concentracion([5, 1, 3, 0], [50, 10, 30, 10], 0.25);
    expect(Array.from(mascara)).toEqual([1, 0, 0, 0]);
    expect(parte).toBeCloseTo(0.5);
  });
});
