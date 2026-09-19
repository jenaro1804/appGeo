"use client";

// Piezas de la escena que no tienen estado propio que importe: la cifra que
// cuenta, la leyenda, el tooltip de la celda, la ayuda de teclado y la guía
// «Cómo leer esto».

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Vista } from "@/lib/estado";
import { DURACION, sinMovimiento } from "@/lib/mapa";
import type { Modelo } from "@/lib/modelo";

export const miles = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

/** La cifra grande cuenta hasta su nuevo valor en vez de saltar. */
export function Cifra({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = performance.now();
    const origen = desde.current;
    const duracion = sinMovimiento() ? 0 : DURACION;
    let id = 0;
    const paso = (ahora: number) => {
      const p = duracion ? Math.min(1, (ahora - inicio) / duracion) : 1;
      const x = origen + (valor - origen) * (1 - (1 - p) ** 3);
      desde.current = x;
      setMostrado(x);
      if (p < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor]);

  return (
    <div className="font-mono text-5xl font-medium tracking-tight text-datos tabular-nums" aria-live="polite">
      {miles.format(mostrado)}
    </div>
  );
}

export function Leyenda({ titulo, gradiente, marcas, atribucion }: {
  titulo: string;
  gradiente: string;
  marcas: [number, string][];
  /** El mapa de calles es de OpenStreetMap: su licencia pide citarlo mientras se ve. */
  atribucion: boolean;
}) {
  return (
    <div className="flex w-64 flex-col gap-1.5 rounded-lg bg-card/90 p-3 ring-1 ring-foreground/10 backdrop-blur-sm">
      <p className="text-xs font-semibold text-muted-foreground">{titulo}</p>
      <div className="h-3 rounded-sm" style={{ background: gradiente }} />
      <div className="relative h-4 font-mono text-xs">
        {marcas.map(([t, texto]) => (
          <span key={texto} className="absolute -translate-x-1/2" style={{ left: `${Math.min(1, Math.max(0, t)) * 100}%` }}>
            {texto}
          </span>
        ))}
      </div>
      {atribucion && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="text-[0.65rem] text-muted-foreground underline-offset-2 hover:underline"
        >
          Calles: © OpenStreetMap · Protomaps
        </a>
      )}
    </div>
  );
}

export function TooltipCelda({ i, x, y, ancho, vista, modelo }: {
  i: number;
  x: number;
  y: number;
  ancho: number;
  vista: Vista;
  modelo: Modelo;
}) {
  const c = modelo.celda(i, vista.anio, vista.escenario);
  const obs = modelo.observados(vista.anio)?.[i];
  const rango = (
    <>
      <span className="font-mono font-semibold">{Math.round(c.p50)}</span>{" "}
      <span className="text-muted-foreground">({Math.round(c.p5)}–{Math.round(c.p95)})</span>
    </>
  );
  // Cerca del borde derecho, el tooltip se abre hacia la izquierda.
  const izquierda = x > ancho - 320;
  return (
    <div
      className="pointer-events-none absolute z-20 flex max-w-72 flex-col gap-0.5 rounded-lg bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{ left: izquierda ? undefined : x + 18, right: izquierda ? ancho - x + 18 : undefined, top: y + 14 }}
    >
      <b className="font-semibold">{modelo.municipios[modelo.municipioDe[i]]}</b>
      {vista.lente === "neto" ? (
        <span>
          Riesgo propio: <b className="font-mono">×{modelo.neto[i].toFixed(1)}</b> la zona típica
        </span>
      ) : obs !== undefined ? (
        <>
          <span>
            {vista.anio}: <b className="font-mono">{obs}</b> reportados
          </span>
          <span>modelo: {rango}</span>
        </>
      ) : (
        <span>
          {vista.anio}: {rango} esperados
        </span>
      )}
    </div>
  );
}

export const TECLAS: [string, string][] = [
  ["← →", "año anterior / siguiente"],
  ["Inicio · Fin", "2019 · 2027"],
  ["N", "accidentes ↔ riesgo"],
  ["P", "proyección: si nada cambia ↔ si cambia el reporte"],
  ["↑ ↓", "resaltar el 1, 2, 5, 10 o 20 % del territorio"],
  ["1 – 5", "escenario preparado: muestra la pregunta"],
  ["Espacio", "revelar la respuesta"],
  ["F", "fijar lo que se ve como «antes»"],
  ["A", "alternar antes ↔ después"],
  ["M", "nombres de municipios"],
  ["+ · −", "acercar · alejar el mapa (también con la rueda del mouse)"],
  ["E", "encuadrar la zona metropolitana"],
  ["B", "mostrar u ocultar las calles"],
  ["H", "opacidad de los hexágonos: 100, 60, 30, 0 %"],
  ["L", "cómo leer esto"],
  ["0 · Esc", "volver al inicio"],
  ["?", "esta ayuda"],
];

export function Ayuda({ abierta, alCambiar }: { abierta: boolean; alCambiar: (abierta: boolean) => void }) {
  return (
    <Dialog open={abierta} onOpenChange={alCambiar}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teclado</DialogTitle>
          <DialogDescription>Para presentar sin tocar el mouse. Pasa el mouse sobre un hexágono para ver sus cifras.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2">
          {TECLAS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

export function Guia({ abierta, alCambiar }: { abierta: boolean; alCambiar: (abierta: boolean) => void }) {
  return (
    <Sheet open={abierta} onOpenChange={alCambiar}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Cómo leer esto</SheetTitle>
          <SheetDescription>Qué muestra el modelo, y qué no puede decir.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6 leading-relaxed text-muted-foreground">
          <Seccion titulo="Qué muestra el mapa">
            <p>
              Cada hexágono mide 500 m de lado (0.65 km²). En <b>Accidentes</b>, el color es cuántos accidentes se
              reportaron ahí (2019-2024) o cuántos espera el modelo (2025-2027). En <b>Riesgo</b>, es el riesgo
              propio de cada zona: cuántas veces más o menos accidentes tiene que la zona típica, una vez descontado
              cuánto reporta su municipio.
            </p>
          </Seccion>
          <Seccion titulo="El riesgo propio se compara dentro de cada municipio">
            <p>
              El modelo separa dos cosas: cuánto reporta cada municipio y dónde, dentro de él, se concentran los
              accidentes. Esa separación es confiable para comparar zonas de un mismo municipio; entre municipios
              distintos lo es menos, porque parte de la diferencia puede ser de reporte.
            </p>
          </Seccion>
          <Seccion titulo="Dos formas de proyectar 2025-2027">
            <p>
              <b>Si nada cambia</b>: cada municipio sigue reportando como en 2024. Es el supuesto con el que se validó
              el modelo, y acertó el total de 2024 con 1 % de error.
            </p>
            <p>
              <b>Si cambia el reporte</b>: los municipios pueden empezar o dejar de reportar, como ya pasó entre
              2019 y 2024 (Santa Catarina pasó de 77 a 1,793 accidentes de un año a otro). Por eso la banda se abre.
              La mediana del total sube, pero no porque se esperen más accidentes: un municipio que empieza a
              reportar suma mucho más de lo que resta uno que deja de hacerlo.
            </p>
          </Seccion>
          <Seccion titulo="Lo que el modelo no dice">
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                Es un modelo de accidentes <b>reportados</b>, no de siniestralidad. Un municipio que deja de capturar
                accidentes se ve igual que uno donde bajó el riesgo.
              </li>
              <li>
                Los escenarios cambian cómo reporta un municipio, no cuántos accidentes ocurren. «Guadalupe reporta
                como en 2021» no dice que Guadalupe sea más o menos segura.
              </li>
              <li>
                El <i>dónde</i> ya lo da el historial: el 5 % del territorio con más accidentes concentra cerca del
                42 % de los del año siguiente, y el modelo no mejora ese orden. Lo que aporta es <i>cuánto</i>, con
                qué certeza, y el mapa de riesgo propio.
              </li>
            </ul>
          </Seccion>
          <Separator />
          <Seccion titulo="Datos y método">
            <p>
              ATUS (INEGI), 18 municipios de la Zona Metropolitana de Monterrey, 2019-2024. Modelo jerárquico
              bayesiano Binomial Negativo: un nivel de reporte por municipio y año (caminata aleatoria con colas
              pesadas) y un perfil espacial por celda (CAR propio). Esta versión se ajustó con los seis años; la
              validación, entrenando con 2019-2023 y prediciendo 2024, está en el reporte técnico del proyecto.
            </p>
          </Seccion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
