"use client";

// La app completa: carga el posterior, guarda el estado (año, lente, top N,
// escenario, referencia) y decide qué mostrar. El modelo calcula
// (lib/modelo.ts); el mapa y la serie dibujan (lib/mapa.ts, lib/serie.ts).
//
// El diseño visual es provisional: es el de la primera versión (Vite),
// portado sin cambios. Ver docs/app_web.md, «Pendientes».

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { gradienteCss } from "@/lib/color";
import { cargar, type Datos } from "@/lib/datos";
import { PRESETS } from "@/lib/escenarios";
import {
  type Accion, INICIAL, type Lente, type PresetListo, reducir, TOPS, type Vista, vistaDe,
} from "@/lib/estado";
import { DURACION, Mapa } from "@/lib/mapa";
import { ANIOS, concentracion, cuantil, esProyeccion, Modelo, type Escenario, type Resumen } from "@/lib/modelo";
import { Serie } from "@/lib/serie";

// --- Contexto: lo que se calcula una vez al cargar ----------------------------

interface Contexto {
  datos: Datos;
  modelo: Modelo;
  presets: PresetListo[];
  observados: (number | null)[];
  maxCrudo: number;
  netoLo: number;
  netoHi: number;
  dominio: [number, number];
}

function preparar(datos: Datos): Contexto {
  const modelo = new Modelo(datos);
  const { municipios } = datos.meta;

  const presets = PRESETS.map((p) => {
    const idx = p.municipios.map((nombre) => {
      const j = municipios.indexOf(nombre);
      if (j < 0) throw new Error(`escenarios.ts: no existe el municipio «${nombre}». Opciones: ${municipios.join(", ")}`);
      return j;
    });
    const escenario = idx.length ? { municipios: idx, comoEn: p.comoEn, factor: p.factor } : null;
    return { ...p, escenario };
  });

  // Escalas de color fijas para todos los años: si se reescalaran por año, un
  // municipio que empieza a reportar no se vería «encenderse».
  const todos = datos.celdas.conteos.flat().sort((a, b) => a - b);
  const neto = Float64Array.from(modelo.neto).sort();

  // Eje Y de la serie: fijo, para que el público compare datos y no ejes. El
  // techo es el de 2025; más allá, la cola t de las innovaciones llevaría el eje
  // a cientos de miles y aplastaría la historia, así que la banda se recorta y
  // una etiqueta dice hasta dónde llega.
  const estados = [null, ...presets.map((p) => p.escenario)];
  const rs = estados.flatMap((e) => ANIOS.map((a) => modelo.totales(a, e).total));
  const techo = estados.map((e) => modelo.totales(2025, e).total.p95);
  const observados = ANIOS.map((a) => modelo.totalObservado(a));
  const obs = observados.filter((o): o is number => o !== null);

  return {
    datos,
    modelo,
    presets,
    observados,
    maxCrudo: cuantil(todos, 0.99),
    netoLo: cuantil(neto, 0.02),
    netoHi: cuantil(neto, 0.98),
    dominio: [Math.min(...rs.map((r) => r.p5), ...obs) * 0.95, Math.max(...techo, ...obs)],
  };
}

// --- Formato ------------------------------------------------------------------

const miles = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const redondear = (v: number) => Math.round(v / 100) * 100; // una proyección no tiene precisión de unidades
const pct = (f: number) => `${Math.round(f * 100)} %`;

// --- Componente raíz: carga -----------------------------------------------------

export default function Explorador() {
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargar()
      .then((d) => setCtx(preparar(d)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p className="mensaje error">{error}</p>;
  if (!ctx) return <p className="mensaje">Cargando el modelo…</p>;
  return <Escena ctx={ctx} />;
}

// --- La escena: maqueta de 1920×1080 escalada a la pantalla ---------------------

function Escena({ ctx }: { ctx: Contexto }) {
  const { modelo, datos, presets } = ctx;
  const [e, despachar] = useReducer(reducir, INICIAL);
  const v = vistaDe(e);
  const proy = esProyeccion(v.anio);

  const escenaRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const serieRef = useRef<SVGSVGElement>(null);
  const mapaRef = useRef<Mapa | null>(null);
  const serieObj = useRef<Serie | null>(null);
  const primero = useRef(true);
  const [escala, setEscala] = useState(1);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  // Escalas de color
  const tCrudo = (x: number) => Math.log1p(x) / Math.log1p(ctx.maxCrudo);
  const tNeto = (x: number) => (Math.log(x) - Math.log(ctx.netoLo)) / (Math.log(ctx.netoHi) - Math.log(ctx.netoLo));

  // Lo que se muestra en el estado actual
  const calculo = useMemo(() => {
    const observados = modelo.observados(v.anio);
    const pesos = observados ?? modelo.medianas(v.anio, v.escenario);
    const valores = v.lente === "neto" ? modelo.neto : pesos;
    const conc = TOPS[e.top] > 0 ? concentracion(valores, pesos, TOPS[e.top]) : null;
    return { valores, conc, total: modelo.totales(v.anio, v.escenario).total, obs: modelo.totalObservado(v.anio) };
  }, [modelo, v.anio, v.lente, v.escenario, e.top]);

  // --- Mapa y serie: objetos imperativos dentro de React ---
  // useLayoutEffect y declarado primero: tiene que existir antes de que el
  // efecto de medir (abajo) le dé tamaño, y medido antes de dibujar nada.
  useLayoutEffect(() => {
    mapaRef.current = new Mapa(canvasRef.current!, datos);
    const s = new Serie(serieRef.current!, ctx.observados);
    s.dominio(...ctx.dominio);
    serieObj.current = s;
    // Los rótulos del canvas usan Montserrat, que next/font carga con un nombre
    // propio: se lee de la variable CSS y se redibuja cuando termina de cargar.
    const familia = getComputedStyle(document.documentElement).getPropertyValue("--font-montserrat").trim();
    if (familia) mapaRef.current.fuente = familia;
    document.fonts.ready.then(() => mapaRef.current?.dibujar());
  }, [datos, ctx]);

  useLayoutEffect(() => {
    const ajustar = () => setEscala(Math.min(innerWidth / 1920, innerHeight / 1080));
    ajustar();
    addEventListener("resize", ajustar);
    return () => removeEventListener("resize", ajustar);
  }, []);

  useLayoutEffect(() => {
    const caja = cajaRef.current!;
    mapaRef.current!.medir(caja.clientWidth, caja.clientHeight, escala);
  }, [escala]);

  useEffect(() => {
    const mapa = mapaRef.current!;
    const escalar = v.lente === "neto" ? tNeto : tCrudo;
    mapa.resaltados = new Set(v.escenario && proy ? v.escenario.municipios : []);
    mapa.objetivo(Float64Array.from(calculo.valores, escalar), calculo.conc?.mascara ?? null, primero.current);

    const otra = e.referencia && (e.viendoReferencia ? e.actual : e.referencia);
    const serie = (esc: Escenario | null): Resumen[] => ANIOS.map((a) => modelo.totales(a, esc).total);
    serieObj.current!.actualizar(serie(v.escenario), v.anio, otra && serie(otra.escenario), primero.current);
    primero.current = false;
    // tCrudo y tNeto solo dependen de ctx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculo, e.referencia, e.viendoReferencia, e.actual, v.escenario, v.anio, v.lente, proy, modelo]);

  useEffect(() => {
    mapaRef.current!.etiquetas = e.etiquetas;
    mapaRef.current!.dibujar();
  }, [e.etiquetas]);

  // --- Teclado ---
  useEffect(() => {
    const alPresionar = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key;
      const preset = presets.find((p) => p.tecla === k);
      const accion: Accion | null = preset
        ? { tipo: "lanzar", preset }
        : k === "ArrowRight" ? { tipo: "moverAnio", paso: 1 }
        : k === "ArrowLeft" ? { tipo: "moverAnio", paso: -1 }
        : k === "Home" ? { tipo: "anio", anio: ANIOS[0] }
        : k === "End" ? { tipo: "anio", anio: ANIOS[ANIOS.length - 1] }
        : k === "n" || k === "N" ? { tipo: "lente" }
        : k === "ArrowUp" ? { tipo: "top", paso: 1 }
        : k === "ArrowDown" ? { tipo: "top", paso: -1 }
        : k === " " ? { tipo: "revelar" }
        : k === "f" || k === "F" ? { tipo: "fijar" }
        : k === "a" || k === "A" ? { tipo: "alternar" }
        : k === "m" || k === "M" ? { tipo: "etiquetas" }
        : k === "?" ? { tipo: "ayuda" }
        : k === "0" || k === "Escape" ? { tipo: "reiniciar" }
        : null;
      if (!accion) return;
      ev.preventDefault();
      despachar(accion);
    };
    addEventListener("keydown", alPresionar);
    return () => removeEventListener("keydown", alPresionar);
  }, [presets]);

  // --- Tooltip ---
  const moverMouse = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - r.left) / escala;
    const y = (ev.clientY - r.top) / escala;
    const i = mapaRef.current!.celdaEn(x, y);
    if (i !== mapaRef.current!.hover) {
      mapaRef.current!.hover = i;
      mapaRef.current!.dibujar();
    }
    setHover(i === null ? null : { i, x, y });
  };
  const salirMouse = () => {
    mapaRef.current!.hover = null;
    mapaRef.current!.dibujar();
    setHover(null);
  };

  // --- Textos ---
  const { conc, total, obs } = calculo;
  const frase = conc
    ? v.lente === "neto"
      ? <>El {pct(TOPS[e.top])} del territorio con más riesgo propio concentra el <strong>{pct(conc.parte)}</strong> de los accidentes {proy ? "esperados " : ""}de {v.anio}</>
      : <>El {pct(TOPS[e.top])} del territorio concentra el <strong>{pct(conc.parte)}</strong> de los accidentes {proy ? "esperados " : ""}de {v.anio}</>
    : v.lente === "neto" ? "Este mapa no cambia con el año: es el perfil de cada lugar." : null;

  const dx = typeof window === "undefined" ? 0 : (innerWidth - 1920 * escala) / 2;
  const dy = typeof window === "undefined" ? 0 : (innerHeight - 1080 * escala) / 2;

  return (
    <div id="escena" ref={escenaRef} style={{ transform: `translate(${dx}px, ${dy}px) scale(${escala})` }}>
      <div id="mapa-caja" ref={cajaRef}>
        <canvas id="mapa" ref={canvasRef} onMouseMove={moverMouse} onMouseLeave={salirMouse} />
        <div id="insignia" className={e.referencia ? `visible ${e.viendoReferencia ? "antes" : "despues"}` : ""}>
          {e.viendoReferencia ? "ANTES" : "DESPUÉS"}
        </div>
        <div id="pregunta" className={e.pregunta ? "visible" : ""}>
          <p>{e.pregunta?.pregunta}</p>
          <span>Espacio para revelar</span>
        </div>
      </div>

      <aside id="panel">
        <div className="titular">
          <span id="anio">{v.anio}</span>
          <span id="etapa" className={proy ? "proyeccion" : ""}>{proy ? "PROYECCIÓN" : "OBSERVADO"}</span>
        </div>
        <p id="lente">
          {v.lente === "neto"
            ? "Riesgo propio de cada celda, sin el efecto de cuánto reporta su municipio"
            : proy ? "Accidentes esperados por celda" : "Accidentes reportados por celda"}
        </p>
        <Cifra valor={obs ?? redondear(total.p50)} />
        <p id="cifra-sub">
          {proy ? (
            <>entre <span className="mono">{miles.format(redondear(total.p5))}</span> y{" "}
              <span className="mono">{miles.format(redondear(total.p95))}</span> <small>(90 %)</small></>
          ) : "accidentes reportados"}
        </p>
        <p id="frase">{frase}</p>
        <svg id="serie" ref={serieRef} />
        <p id="escenario">
          {v.etiqueta && `Escenario: ${v.etiqueta}${v.escenario && !proy ? " (actúa desde 2025)" : ""}`}
        </p>
      </aside>

      <footer id="pie">
        <div id="anios">
          {ANIOS.map((a) => (
            <span key={a} style={{ display: "contents" }}>
              {a === 2025 && <div className="separador" />}
              <button
                className={`${esProyeccion(a) ? "proy" : ""} ${a === v.anio ? "activo" : ""}`}
                onClick={() => despachar({ tipo: "anio", anio: a })}
              >
                {a}
              </button>
            </span>
          ))}
        </div>
        <Leyenda lente={v.lente} proy={proy} ctx={ctx} tCrudo={tCrudo} tNeto={tNeto} />
        <p id="aviso">Modelo de accidentes <em>reportados</em>, no de siniestralidad. ATUS-INEGI, ZMM 2019-2024.</p>
      </footer>

      <Ayuda visible={e.ayuda} />
      {hover && <Tooltip hover={hover} vista={v} modelo={modelo} />}
    </div>
  );
}

// --- Piezas ---------------------------------------------------------------------

/** La cifra grande cuenta hasta su nuevo valor en vez de saltar. */
function Cifra({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = performance.now();
    const origen = desde.current;
    let id = 0;
    const paso = (ahora: number) => {
      const p = Math.min(1, (ahora - inicio) / DURACION);
      const x = origen + (valor - origen) * (1 - (1 - p) ** 3);
      desde.current = x;
      setMostrado(x);
      if (p < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor]);

  return <div id="cifra">{miles.format(mostrado)}</div>;
}

function Leyenda({ lente, proy, ctx, tCrudo, tNeto }: {
  lente: Lente;
  proy: boolean;
  ctx: Contexto;
  tCrudo: (x: number) => number;
  tNeto: (x: number) => number;
}) {
  const marcas: [number, string][] =
    lente === "crudo"
      ? [...[0, 1, 10, 100, 1000].filter((x) => x <= ctx.maxCrudo).map((x): [number, string] => [tCrudo(x), String(x)]),
         [1, `${Math.round(ctx.maxCrudo)}+`]]
      : [0.1, 0.3, 1, 3, 10, 30].filter((x) => x >= ctx.netoLo && x <= ctx.netoHi).map((x): [number, string] => [tNeto(x), `×${x}`]);
  const titulo =
    lente === "crudo"
      ? proy ? "accidentes esperados por celda (0.65 km²)" : "accidentes por celda (0.65 km²)"
      : "riesgo propio, veces la celda típica";
  return (
    <div id="leyenda">
      <p id="leyenda-titulo">{titulo}</p>
      <div id="leyenda-barra" style={{ background: gradienteCss() }} />
      <div id="leyenda-marcas">
        {marcas.map(([t, texto]) => (
          <span key={texto} style={{ left: `${Math.min(1, Math.max(0, t)) * 100}%` }}>{texto}</span>
        ))}
      </div>
    </div>
  );
}

function Tooltip({ hover, vista, modelo }: { hover: { i: number; x: number; y: number }; vista: Vista; modelo: Modelo }) {
  const { i } = hover;
  const c = modelo.celda(i, vista.anio, vista.escenario);
  const obs = modelo.observados(vista.anio)?.[i];
  const rango = <><span className="mono">{Math.round(c.p50)}</span> <small>({Math.round(c.p5)}–{Math.round(c.p95)})</small></>;
  return (
    <div id="tooltip" style={{ display: "block", left: hover.x + 28, top: hover.y + 20 }}>
      <b>{modelo.municipios[modelo.municipioDe[i]]}</b>
      <br />
      {vista.lente === "neto" ? (
        <>Riesgo propio: <b className="mono">×{modelo.neto[i].toFixed(1)}</b> la celda típica</>
      ) : obs !== undefined ? (
        <>{vista.anio}: <b className="mono">{obs}</b> reportados<br />modelo: {rango}</>
      ) : (
        <>{vista.anio}: {rango} esperados</>
      )}
    </div>
  );
}

function Ayuda({ visible }: { visible: boolean }) {
  const teclas: [string, string][] = [
    ["← →", "año"],
    ["Inicio / Fin", "2019 / 2027"],
    ["N", "mapa crudo ↔ neto"],
    ["↑ ↓", "señalar el top 1, 2, 5, 10, 20 % del territorio"],
    ["1 – 9", "escenario preparado: muestra la pregunta"],
    ["Espacio", "revelar la respuesta"],
    ["F", "fijar el estado actual como «antes»"],
    ["A", "alternar antes ↔ después"],
    ["M", "nombres de municipios"],
    ["0 / Esc", "volver al estado base"],
    ["?", "esta ayuda"],
  ];
  return (
    <div id="ayuda" className={visible ? "visible" : ""}>
      <h2>Teclado</h2>
      <dl>
        {teclas.map(([k, d]) => (
          <span key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{d}</dd>
          </span>
        ))}
      </dl>
    </div>
  );
}
