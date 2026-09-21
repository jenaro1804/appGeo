"use client";

// La app completa: carga el posterior, guarda el estado (año, lente, top N)
// y decide qué mostrar. El modelo
// calcula (lib/modelo.ts); el mapa y la serie dibujan (lib/mapa.ts,
// lib/serie.ts).
//
// Distribución (docs/app_web.md, «Pendientes»): el mapa ocupa la pantalla y
// los controles flotan encima; la cifra, la serie y las explicaciones van en
// la tarjeta de la izquierda. Todo está en rem y el rem crece con la pantalla
// (globals.css), así que en el proyector queda donde se ensayó.
//
// Debajo de los hexágonos hay un mapa base con calles (lib/mapaBase.ts): se
// acerca y se arrastra como un mapa web, y los hexágonos lo siguen.

import {
  BookOpenIcon, HexagonIcon, KeyboardIcon, MapIcon, MinusIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon,
  RotateCcwIcon, ScanIcon,
} from "lucide-react";
import type { Map as MapaML } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PALETA, PALETA_RIESGO } from "@/lib/color";
import { cargar, type Datos } from "@/lib/datos";
import { type Accion, INICIAL, type Lente, reducir, TOPS } from "@/lib/estado";
import { Mapa, type Relleno, sinMovimiento } from "@/lib/mapa";
import { camaraDe, crearMapaBase, encuadrar, limitar, type MapLibre, prepararMapLibre } from "@/lib/mapaBase";
import { ANIOS, concentracion, cuantil, esProyeccion, Modelo } from "@/lib/modelo";
import { Serie } from "@/lib/serie";
import { cn } from "@/lib/utils";
import { Ayuda, Cifra, Guia, Leyenda, miles, TooltipCelda } from "./Piezas";

// --- Contexto: lo que se calcula una vez al cargar ----------------------------

interface Contexto {
  datos: Datos;
  /** MapLibre, importado al cargar (no se puede importar al prerenderizar). */
  ml: MapLibre;
  /** Persistencia: cada municipio sigue reportando como en 2024 (lo que validó
   *  el notebook). Es la única forma de proyectar que muestra la app. */
  modelo: Modelo;
  observados: (number | null)[];
  maxCrudo: number;
  netoLo: number;
  netoHi: number;
  dominio: [number, number];
}

function preparar(datos: Datos, ml: MapLibre): Contexto {
  const modelo = new Modelo(datos, { innovaciones: false });

  // Escalas de color fijas para todos los años: si se reescalaran por año, un
  // municipio que empieza a reportar no se vería «encenderse».
  const todos = datos.celdas.conteos.flat().sort((a, b) => a - b);

  // Eje Y de la serie: fijo para todos los años, para que el público compare
  // datos y no ejes.
  const rs = ANIOS.map((a) => modelo.totales(a).total);
  const observados = ANIOS.map((a) => modelo.totalObservado(a));
  const obs = observados.filter((o): o is number => o !== null);

  return {
    datos,
    ml,
    modelo,
    observados,
    // Tope de la escala de accidentes: el percentil 99 de las 13,446
    // celda-año, redondeado a una cifra que se pueda leer (300, no 319). El
    // 1 % por encima se satura; el máximo real es 804 y, si fuera el tope,
    // aplastaría contra el mismo color a todo el resto de la ciudad.
    maxCrudo: redondear1235(cuantil(todos, 0.99)),
    // Riesgo: dominio fijo y simétrico (×10 menos … ×10 más), no los
    // percentiles de la distribución. Así el 1 —la zona típica— cae justo en
    // el centro de la rampa y la leyenda se explica con tres palabras. El
    // 10 % de celdas por debajo de 0.1 y el 5 % por encima de 10 se saturan
    // en los extremos; con los percentiles (0.04 y 14.4) el punto neutro
    // quedaba descolocado y las marcas eran ×0.3 y ×3.
    netoLo: 0.1,
    netoHi: 10,
    dominio: [Math.min(...rs.map((r) => r.p5), ...obs) * 0.95, Math.max(...rs.map((r) => r.p95), ...obs)],
  };
}

// --- Formato ------------------------------------------------------------------

const redondear = (v: number) => Math.round(v / 100) * 100; // una proyección no tiene precisión de unidades

/** Al 1, 2, 3, 5 o 10 más cercano de su orden de magnitud (en escala log):
 *  topes de escala que se leen. 319 → 300. */
function redondear1235(v: number): number {
  const orden = 10 ** Math.floor(Math.log10(v));
  const cerca = (a: number, b: number) => (Math.abs(Math.log(v / a)) <= Math.abs(Math.log(v / b)) ? a : b);
  return [1, 2, 3, 5, 10].map((m) => m * orden).reduce(cerca);
}
const pct = (f: number) => `${Math.round(f * 100)} %`;
const OBSERVADOS = ANIOS.filter((a) => !esProyeccion(a));
const PROYECTADOS = ANIOS.filter(esProyeccion);

// --- Componente raíz: carga -----------------------------------------------------

export default function Explorador() {
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([cargar(), import("maplibre-gl"), import("pmtiles")])
      .then(([d, ml, pm]) => {
        prepararMapLibre(ml, pm.Protocol);
        setCtx(preparar(d, ml));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error)
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>No se pudo cargar el modelo</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  if (!ctx)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-semibold text-foreground">Cargando el modelo…</p>
        <p className="text-sm">50,000 escenarios por año, calculados en el navegador.</p>
      </div>
    );
  return <Escena ctx={ctx} />;
}

// --- La escena ------------------------------------------------------------------

function Escena({ ctx }: { ctx: Contexto }) {
  const { datos, modelo } = ctx;
  const [e, despachar] = useReducer(reducir, INICIAL);
  const v = e.actual;
  const proy = esProyeccion(v.anio);
  const paleta = v.lente === "neto" ? PALETA_RIESGO : PALETA;

  const cajaRef = useRef<HTMLDivElement>(null);
  const tarjetaRef = useRef<HTMLElement>(null);
  const cabRef = useRef<HTMLDivElement>(null); // la fila de botones de arriba
  const pieRef = useRef<HTMLDivElement>(null);
  const herramientasRef = useRef<HTMLDivElement>(null); // la columna de zoom y capas
  const baseRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLCanvasElement>(null);
  const capaRef = useRef<HTMLCanvasElement>(null);
  const serieRef = useRef<SVGSVGElement>(null);
  const mapaRef = useRef<Mapa | null>(null);
  const baseObj = useRef<{ mapa: MapaML; reencuadrar: () => void } | null>(null);
  const serieObj = useRef<Serie | null>(null);
  const primero = useRef(true);
  const [hover, setHover] = useState<{ i: number; x: number; y: number; ancho: number } | null>(null);
  const [guia, setGuia] = useState(false);
  // La tarjeta de la izquierda se desliza para dejarle toda la pantalla al
  // mapa. Al esconderla cambia el ancho de la caja: el ResizeObserver
  // reencuadra y vuelve a calcular los límites del mapa.
  const [tarjeta, setTarjeta] = useState(true);
  // Las capas: el mapa de calles se enciende y se apaga; los hexágonos se
  // transparentan (en 0 % solo quedan las calles, los contornos y los rótulos).
  const [calles, setCalles] = useState(true);
  const [opacidad, setOpacidad] = useState(100);

  // Escalas de color
  const tCrudo = (x: number) => Math.log1p(x) / Math.log1p(ctx.maxCrudo);
  const tNeto = (x: number) => (Math.log(x) - Math.log(ctx.netoLo)) / (Math.log(ctx.netoHi) - Math.log(ctx.netoLo));

  // Lo que se muestra en el estado actual
  const calculo = useMemo(() => {
    const observados = modelo.observados(v.anio);
    const pesos = observados ?? modelo.medianas(v.anio);
    const valores = v.lente === "neto" ? modelo.neto : pesos;
    const conc = TOPS[e.top] > 0 ? concentracion(valores, pesos, TOPS[e.top]) : null;
    return { valores, conc, total: modelo.totales(v.anio).total, obs: modelo.totalObservado(v.anio) };
  }, [modelo, v.anio, v.lente, e.top]);

  // --- Mapa, mapa base y serie: objetos imperativos dentro de React ---
  // Se crean y se miden en el mismo efecto: un Mapa nunca existe sin tamaño.
  // (Separados, Strict Mode y la recarga en caliente llegaban a dibujar un
  // Mapa recién creado antes de medirlo, y el canvas fallaba.)
  useLayoutEffect(() => {
    const caja = cajaRef.current!;
    const cab = cabRef.current!;
    const pie = pieRef.current!;
    const herramientas = herramientasRef.current!;
    const mapa = new Mapa({ hex: hexRef.current!, capa: capaRef.current! }, datos);
    // Los rótulos del canvas usan Montserrat, que next/font carga con un nombre
    // propio: se lee de la variable CSS y se redibuja cuando termina de cargar.
    const familia = getComputedStyle(document.documentElement).getPropertyValue("--font-montserrat").trim();
    if (familia) mapa.fuente = familia;

    // El encuadre inicial deja libre lo que tapan los controles flotantes.
    // En celular los controles van debajo y el mapa usa toda su caja.
    const ancho = matchMedia("(min-width: 768px)");
    const tamRem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const relleno = (): Relleno => {
      const rem = tamRem();
      const c = caja.getBoundingClientRect();
      return ancho.matches
        ? {
            arr: cab.getBoundingClientRect().bottom - c.top + 0.5 * rem,
            aba: c.bottom - pie.getBoundingClientRect().top + 0.5 * rem,
            // La tarjeta flota sobre el mapa: si está a la vista, el encuadre
            // la esquiva. Se mide dónde está de verdad, no el estado de React,
            // porque se lee también a media animación.
            izq: Math.max(1.25 * rem, tarjetaRef.current!.getBoundingClientRect().right - c.left + 0.5 * rem),
            der: c.right - herramientas.getBoundingClientRect().left + 0.5 * rem,
          }
        : { arr: 0.75 * rem, aba: 0.75 * rem, izq: 0.75 * rem, der: 0.75 * rem };
    };

    const base = crearMapaBase(ctx.ml, baseRef.current!, mapa.extension, relleno(), !ancho.matches);
    const sincronizar = () => mapa.camara(camaraDe(ctx.ml, base));
    base.on("move", sincronizar);
    base.on("render", sincronizar);
    // Mientras nadie mueva el mapa, cada cambio de tamaño lo vuelve a
    // encuadrar; después de mover (con el mouse, los botones o el teclado),
    // se respeta lo que se eligió. Solo los encuadres propios no cuentan.
    let movido = false;
    let encuadrando = false;
    const reencuadrar = (animar: boolean) => {
      encuadrando = true;
      encuadrar(base, mapa.extension, relleno(), animar);
      encuadrando = false;
    };
    base.on("movestart", () => {
      if (!encuadrando) movido = true;
    });
    base.on("mousemove", (ev) => {
      const i = mapa.celdaEn(ev.point.x, ev.point.y);
      if (i !== mapa.hover) {
        mapa.hover = i;
        mapa.dibujar();
      }
      setHover(i === null ? null : { i, x: ev.point.x, y: ev.point.y, ancho: caja.clientWidth });
    });
    base.on("mouseout", () => {
      mapa.hover = null;
      mapa.dibujar();
      setHover(null);
    });

    // Firma de lo que obliga a reencuadrar: el tamaño del mapa y los
    // controles que flotan encima. El relleno de la izquierda (la tarjeta)
    // queda fuera a propósito: esconderla no debe mover el mapa, solo
    // destapar lo que ya estaba dibujado ahí.
    let firma = "";
    const medir = () => {
      const w = caja.clientWidth;
      const h = caja.clientHeight;
      mapa.medir(w, h, tamRem());
      base.resize();
      const r = relleno();
      const ahora = [w, h, r.arr, r.aba, r.der].map((x) => Math.round(x)).join("/");
      if (ahora !== firma) {
        firma = ahora;
        // Con la caja nueva, el encuadre es otro zoom: se recalculan el zoom
        // mínimo y el área por la que se puede arrastrar.
        limitar(base, mapa.extension, r, w, h);
        if (!movido) reencuadrar(false);
      }
      sincronizar();
    };
    medir();
    mapaRef.current = mapa;
    baseObj.current = {
      mapa: base,
      reencuadrar: () => {
        reencuadrar(!sinMovimiento());
        movido = false;
      },
    };

    const s = new Serie(serieRef.current!, ctx.observados, (anio) => despachar({ tipo: "anio", anio }));
    s.dominio(...ctx.dominio);
    serieObj.current = s;
    primero.current = true;

    let vivo = true;
    document.fonts.ready.then(() => vivo && mapa.dibujar());
    const ro = new ResizeObserver(medir);
    [caja, cab, pie, herramientas].forEach((n) => ro.observe(n));
    ancho.addEventListener("change", medir);
    return () => {
      vivo = false;
      ro.disconnect();
      ancho.removeEventListener("change", medir);
      base.remove();
      baseObj.current = null;
    };
  }, [datos, ctx]);

  useEffect(() => {
    const mapa = mapaRef.current!;
    const escalar = v.lente === "neto" ? tNeto : tCrudo;
    mapa.paleta = paleta;
    mapa.objetivo(Float64Array.from(calculo.valores, escalar), calculo.conc?.mascara ?? null, primero.current);

    serieObj.current!.actualizar(ANIOS.map((a) => modelo.totales(a).total), v.anio, null, primero.current);
    primero.current = false;
    // tCrudo y tNeto solo dependen de ctx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculo, v, ctx]);

  useEffect(() => {
    mapaRef.current!.etiquetas = e.etiquetas;
    mapaRef.current!.dibujar();
  }, [e.etiquetas]);

  // --- Teclado ---
  // En captura y con stopPropagation: si el foco quedó en un botón después de
  // un clic, las flechas y el espacio siguen siendo del presentador y no del
  // grupo de botones. Con un diálogo, la guía o el menú abiertos, el teclado
  // es de ellos.
  useEffect(() => {
    const alPresionar = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (document.querySelector('[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="popover-content"]'))
        return;
      const k = ev.key;
      if (k === "l" || k === "L") {
        setGuia(true);
      } else if (k === "t" || k === "T") {
        setTarjeta((t) => !t);
      } else if (k === "b" || k === "B") {
        setCalles((c) => !c);
      } else if (k === "h" || k === "H") {
        // 100 → 60 → 30 → 0 → 100: de ver solo hexágonos a ver solo calles.
        setOpacidad((o) => (o > 60 ? 60 : o > 30 ? 30 : o > 0 ? 0 : 100));
      } else if (k === "+" || k === "=") {
        baseObj.current?.mapa.zoomIn();
      } else if (k === "-") {
        baseObj.current?.mapa.zoomOut();
      } else if (k === "e" || k === "E") {
        baseObj.current?.reencuadrar();
      } else {
        const accion: Accion | null =
            k === "ArrowRight" ? { tipo: "moverAnio", paso: 1 }
          : k === "ArrowLeft" ? { tipo: "moverAnio", paso: -1 }
          : k === "Home" ? { tipo: "anio", anio: ANIOS[0] }
          : k === "End" ? { tipo: "anio", anio: ANIOS[ANIOS.length - 1] }
          : k === "n" || k === "N" ? { tipo: "lente" }
          : k === "ArrowUp" ? { tipo: "top", paso: 1 }
          : k === "ArrowDown" ? { tipo: "top", paso: -1 }
          : k === "m" || k === "M" ? { tipo: "etiquetas" }
          : k === "?" ? { tipo: "ayuda" }
          : k === "0" || k === "Escape" ? { tipo: "reiniciar" }
          : null;
        if (!accion) return;
        despachar(accion);
      }
      ev.preventDefault();
      ev.stopPropagation();
    };
    addEventListener("keydown", alPresionar, { capture: true });
    return () => removeEventListener("keydown", alPresionar, { capture: true });
  }, []);

  // --- Textos ---
  const { conc, total, obs } = calculo;
  const esperados = proy ? "esperados " : "";
  const frase = conc ? (
    <>
      {v.lente === "neto" ? "Las zonas de más riesgo propio, " : "Las zonas con más accidentes, "}
      el {pct(TOPS[e.top])} del territorio, concentran el{" "}
      <strong className="font-bold text-enfasis-texto">{pct(conc.parte)}</strong> de los accidentes {esperados}de {v.anio}.
    </>
  ) : v.lente === "neto" ? (
    <>
      Qué tan cargada está cada zona comparada con la zona promedio. Compara{" "}
      <strong className="font-bold text-enfasis-texto">dentro de un mismo municipio</strong>. Es igual en todos los
      años.
    </>
  ) : proy ? (
    <>
      El mapa muestra el valor central de cada hexágono. La incertidumbre está en la banda de la gráfica.
    </>
  ) : null; // un año observado, sin resaltar nada: el mapa habla solo

  const marcas: [number, string][] =
    v.lente === "crudo"
      ? [[0, "0"], [tCrudo(10), "10"], [1, `${ctx.maxCrudo}+`]]
      : [[0, "10× menos"], [tNeto(1), "igual"], [1, "10× más"]];
  const tituloLeyenda =
    v.lente === "crudo"
      ? proy ? "Accidentes esperados por hexágono" : "Accidentes por hexágono"
      : "Comparado con la zona típica";


  return (
    <div className="flex min-h-dvh flex-col md:relative md:block md:h-dvh md:overflow-hidden">
      {/* --- Tarjeta: cifra, serie y explicación --- */}
      {/* Flota sobre el mapa y entra y sale con un translate: el mapa no
          cambia de tamaño, así que esconderla no lo mueve, solo destapa lo
          que estaba debajo. El asa viaja con ella. */}
      <aside
        ref={tarjetaRef}
        className={cn(
          "order-2 md:absolute md:inset-y-0 md:left-0 md:z-30 md:w-[29rem]",
          "md:transition-transform md:duration-300 md:ease-out motion-reduce:md:transition-none",
          !tarjeta && "md:-translate-x-full",
        )}
      >
        <div className="hidden md:absolute md:top-5 md:right-0 md:block md:translate-x-[calc(100%+0.75rem)]">
          <BotonIcono
            etiqueta={tarjeta ? "Esconder el panel (T)" : "Mostrar el panel (T)"}
            onClick={() => setTarjeta((t) => !t)}
          >
            {tarjeta ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
          </BotonIcono>
        </div>
        <div className="p-3 md:h-full md:overflow-y-auto md:p-4 md:pr-0">
          <Card className="min-h-full gap-4 [--card-spacing:--spacing(6)]">
            <CardHeader>
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">GeoStats · ATUS-INEGI</p>
              <CardTitle className="text-lg leading-tight font-bold">Accidentes viales en la Zona Metropolitana de Monterrey</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-5xl font-bold tracking-tight tabular-nums">{v.anio}</span>
                  <Badge variant={proy ? "default" : "secondary"}>{proy ? "Proyección" : "Observado"}</Badge>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Cifra valor={obs ?? redondear(total.p50)} />
                <p className="text-sm text-muted-foreground">
                  {proy ? (
                    <>
                      accidentes esperados · entre{" "}
                      <span className="font-mono text-foreground">{miles.format(redondear(total.p5))}</span> y{" "}
                      <span className="font-mono text-foreground">{miles.format(redondear(total.p95))}</span> (90 %)
                    </>
                  ) : (
                    "accidentes reportados en la zona metropolitana"
                  )}
                </p>
              </div>

              {frase && <p className="text-base leading-snug">{frase}</p>}

              <figure className="flex flex-col gap-2">
                <figcaption className="text-sm font-semibold">Total por año, 2019-2027</figcaption>
                <svg ref={serieRef} className="w-full overflow-visible" role="img" aria-label="Total de accidentes por año con su intervalo del 90 %" />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-foreground" /> reportado
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-5 rounded-full bg-datos" /> mediana
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-5 rounded-sm bg-banda/25" /> 90 %
                  </span>
                </div>
              </figure>

            </CardContent>
            <CardFooter className="py-2 text-xs text-muted-foreground">
              <p>
                Modelo de accidentes reportados. ATUS-INEGI, 2019-2024.
              </p>
            </CardFooter>
          </Card>
        </div>
      </aside>

      {/* --- Mapa, con los controles flotando encima --- */}
      <section className="relative order-1 flex flex-col md:absolute md:inset-0 md:order-none md:min-h-0">
        <div ref={cajaRef} className="relative h-[85vw] max-h-[65vh] min-h-72 md:absolute md:inset-0 md:h-auto md:max-h-none">
          {/* MapLibre le pone position: relative a su contenedor: por eso va
              dentro de otra caja absoluta. Ocultar las calles solo apaga su
              canvas; el mapa sigue recibiendo el zoom y el arrastre. */}
          <div className="absolute inset-0">
            <div
              ref={baseRef}
              className={cn(
                "size-full [&_.maplibregl-canvas]:outline-none [&_.maplibregl-canvas]:transition-opacity [&_.maplibregl-canvas]:duration-300",
                !calles && "[&_.maplibregl-canvas]:opacity-0",
              )}
              aria-label="Mapa de la zona metropolitana"
            />
          </div>
          <canvas ref={hexRef} className="pointer-events-none absolute inset-0" style={{ opacity: opacidad / 100 }} />
          <canvas ref={capaRef} className="pointer-events-none absolute inset-0" />
          <div
            ref={herramientasRef}
            className="absolute top-3 right-3 z-10 flex flex-col items-center gap-1 rounded-lg bg-card/90 p-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm md:top-1/2 md:right-5 md:-translate-y-1/2"
          >
            <BotonIcono etiqueta="Acercar (+)" variante="ghost" onClick={() => baseObj.current?.mapa.zoomIn()}>
              <PlusIcon />
            </BotonIcono>
            <BotonIcono etiqueta="Alejar (−)" variante="ghost" onClick={() => baseObj.current?.mapa.zoomOut()}>
              <MinusIcon />
            </BotonIcono>
            <BotonIcono etiqueta="Encuadrar la zona metropolitana (E)" variante="ghost" onClick={() => baseObj.current?.reencuadrar()}>
              <ScanIcon />
            </BotonIcono>
            <Separator className="my-1" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Toggle variant="marca" size="lg" pressed={calles} onPressedChange={setCalles} aria-label="Mapa de calles (B)" />
                }
              >
                <MapIcon />
              </TooltipTrigger>
              <TooltipContent side="left">{calles ? "Ocultar las calles (B)" : "Mostrar las calles (B)"}</TooltipContent>
            </Tooltip>
            <Separator className="my-1" />
            <Tooltip>
              <TooltipTrigger render={<div className="flex flex-col items-center gap-1.5 py-1" />}>
                <HexagonIcon className="text-muted-foreground" />
                <Slider
                  orientation="vertical"
                  className="h-28"
                  min={0}
                  max={100}
                  step={5}
                  value={[opacidad]}
                  onValueChange={(x) => setOpacidad(Array.isArray(x) ? x[0] : x)}
                  aria-label="Opacidad de los hexágonos"
                />
                <span className="w-9 text-center font-mono text-xs text-muted-foreground tabular-nums">{opacidad}%</span>
              </TooltipTrigger>
              <TooltipContent side="left">Opacidad de los hexágonos (H)</TooltipContent>
            </Tooltip>
          </div>
          {hover && (
            <TooltipCelda
              i={hover.i}
              x={hover.x}
              y={hover.y}
              ancho={hover.ancho}
              vista={v}
              modelo={modelo}
            />
          )}
        </div>

        <div
          className={cn(
            "order-first flex flex-wrap items-start justify-between gap-3 p-3 md:pointer-events-none md:absolute md:inset-x-0 md:top-0 md:z-20 md:p-5",
            "md:transition-[padding] md:duration-300 md:ease-out motion-reduce:md:transition-none",
            // Hueco para el asa de la tarjeta y, si está a la vista, para la tarjeta.
            tarjeta ? "md:pl-[32.75rem]" : "md:pl-[3.75rem]",
          )}
        >
          <div className="md:pointer-events-auto">
            <div ref={cabRef}>
              <ToggleGroup
                variant="marca"
                size="xl"
                spacing={0}
                value={[v.lente]}
                onValueChange={(x) => x[0] && despachar({ tipo: "lente", lente: x[0] as Lente })}
                aria-label="Qué muestra el mapa"
                className="shadow-sm"
              >
                <ToggleGroupItem value="crudo">Accidentes</ToggleGroupItem>
                <ToggleGroupItem value="neto">Riesgo</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:pointer-events-auto">
            <Button variant="outline" size="lg" onClick={() => setGuia(true)}>
              <BookOpenIcon data-icon="inline-start" />
              Cómo leer esto
            </Button>
            <BotonIcono etiqueta="Teclado (?)" onClick={() => despachar({ tipo: "ayuda" })}>
              <KeyboardIcon />
            </BotonIcono>
            <BotonIcono etiqueta="Volver al inicio (0)" onClick={() => despachar({ tipo: "reiniciar" })}>
              <RotateCcwIcon />
            </BotonIcono>
          </div>
        </div>

        <div
          ref={pieRef}
          className={cn(
            "flex flex-wrap items-end justify-between gap-4 p-3 md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0 md:z-20 md:p-5",
            "md:transition-[padding] md:duration-300 md:ease-out motion-reduce:md:transition-none",
            // Hueco para el asa de la tarjeta y, si está a la vista, para la tarjeta.
            tarjeta ? "md:pl-[32.75rem]" : "md:pl-[3.75rem]",
          )}
        >
          <div className="flex flex-wrap items-end gap-4 md:pointer-events-auto">
            <div className="flex flex-wrap items-end gap-2">
              <GrupoAnios titulo="Reportado" anios={OBSERVADOS} anio={v.anio} alElegir={(a) => despachar({ tipo: "anio", anio: a })} />
              <Separator orientation="vertical" className="mb-1 hidden h-9 md:block" />
              <GrupoAnios titulo="Proyección" anios={PROYECTADOS} anio={v.anio} alElegir={(a) => despachar({ tipo: "anio", anio: a })} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Resaltar {v.lente === "neto" ? "más riesgo" : "más accidentes"}
              </span>
              <ToggleGroup
                variant="marca"
                size="lg"
                spacing={0}
                value={[String(e.top)]}
                onValueChange={(x) => x[0] && despachar({ tipo: "topEn", k: Number(x[0]) })}
                aria-label="Resaltar el top del territorio"
              >
                {TOPS.map((t, k) => (
                  <ToggleGroupItem key={k} value={String(k)} className="font-mono">
                    {t === 0 ? "No" : `${t * 100} %`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
          <div className="md:pointer-events-auto">
            <Leyenda titulo={tituloLeyenda} gradiente={paleta.gradiente} marcas={marcas} atribucion={calles} />
          </div>
        </div>
      </section>

      <Ayuda abierta={e.ayuda} alCambiar={(a) => a !== e.ayuda && despachar({ tipo: "ayuda" })} />
      <Guia abierta={guia} alCambiar={setGuia} />
    </div>
  );
}

function GrupoAnios({ titulo, anios, anio, alElegir }: {
  titulo: string;
  anios: number[];
  anio: number;
  alElegir: (anio: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{titulo}</span>
      <ToggleGroup
        variant="marca"
        size="lg"
        spacing={0}
        value={anios.includes(anio) ? [String(anio)] : []}
        onValueChange={(x) => x[0] && alElegir(Number(x[0]))}
        aria-label={`Años ${titulo.toLowerCase()}`}
      >
        {anios.map((a) => (
          <ToggleGroupItem key={a} value={String(a)} className="font-mono">
            {a}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function BotonIcono({ etiqueta, onClick, variante = "outline", children }: {
  etiqueta: string;
  onClick: () => void;
  variante?: "outline" | "ghost";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant={variante} size="icon-lg" aria-label={etiqueta} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={variante === "ghost" ? "left" : "bottom"}>{etiqueta}</TooltipContent>
    </Tooltip>
  );
}
