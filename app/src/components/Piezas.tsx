"use client";

// Piezas de la escena que no tienen estado propio que importe: la cifra que
// cuenta, la leyenda, el tooltip de la celda, la ayuda de teclado y la guía
// «Cómo leer esto».

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Vista } from "@/lib/estado";
import { cn } from "@/lib/utils";
import { DURACION, sinMovimiento } from "@/lib/mapa";
import type { Modelo } from "@/lib/modelo";

export const miles = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

/** El multiplicador del mapa de riesgo, sin fracciones: «3.4 veces más». */
const veces = (x: number) => (x >= 1 ? `${x.toFixed(1)} veces más` : `${(1 / x).toFixed(1)} veces menos`);

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

/** Separación mínima entre marcas, en fracción del ancho: por debajo de
 *  esto las etiquetas se tocan («100300+»). La última manda: es el tope. */
const SEPARACION = 0.2;

export function Leyenda({ titulo, gradiente, marcas, atribucion }: {
  titulo: string;
  gradiente: string;
  marcas: [number, string][];
  /** El mapa de calles es de OpenStreetMap: su licencia pide citarlo mientras se ve. */
  atribucion: boolean;
}) {
  return (
    // `bg-card/90`: el token de la tarjeta con transparencia, para no tapar
    // del todo el mapa que queda debajo.
    <Card size="sm" className="w-64 gap-2 bg-card/90 backdrop-blur-sm">
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="h-3 rounded-sm" style={{ background: gradiente }} />
        <div className="relative h-4 text-xs">
          {separadas(marcas).map(([t, texto]) => {
            const x = Math.min(1, Math.max(0, t));
            return (
              <span
                key={texto}
                className={cn("absolute whitespace-nowrap tabular-nums", x > 0.02 && x < 0.98 && "-translate-x-1/2")}
                style={x >= 0.98 ? { right: 0 } : { left: `${x * 100}%` }}
              >
                {texto}
              </span>
            );
          })}
        </div>
      </CardContent>
      {atribucion && (
        <CardFooter>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Calles: © OpenStreetMap · Protomaps
          </a>
        </CardFooter>
      )}
    </Card>
  );
}

/** Quita las marcas que caerían encima de otra, conservando siempre la última. */
function separadas(marcas: [number, string][]): [number, string][] {
  return marcas.reduce<[number, string][]>((puestas, marca, k) => {
    const previa = puestas[puestas.length - 1];
    if (!previa || marca[0] - previa[0] >= SEPARACION) puestas.push(marca);
    else if (k === marcas.length - 1 && puestas.length > 1) puestas[puestas.length - 1] = marca;
    return puestas;
  }, []);
}

export function TooltipCelda({ i, x, y, ancho, vista, modelo }: {
  i: number;
  x: number;
  y: number;
  ancho: number;
  vista: Vista;
  modelo: Modelo;
}) {
  const c = modelo.celda(i, vista.anio);
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
    <Card
      size="sm"
      className="pointer-events-none absolute z-20 max-w-72 shadow-md"
      style={{ left: izquierda ? undefined : x + 18, right: izquierda ? ancho - x + 18 : undefined, top: y + 14 }}
    >
      <CardContent className="flex flex-col gap-0.5">
        <b className="font-semibold">{modelo.municipios[modelo.municipioDe[i]]}</b>
        {vista.lente === "neto" ? (
          <span>
            <b className="font-mono">{veces(modelo.neto[i])}</b> que la zona típica
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
      </CardContent>
    </Card>
  );
}

export const TECLAS: [string, string][] = [
  ["← →", "año anterior / siguiente"],
  ["Inicio · Fin", "2019 · 2027"],
  ["N", "accidentes ↔ riesgo"],
  ["↑ ↓", "resaltar el 1, 2, 5, 10 o 20 % del territorio"],
  ["M", "nombres de municipios"],
  ["T", "esconder o mostrar el panel de la izquierda"],
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
          <Seccion titulo="Cómo se proyecta 2025-2027">
            <p>
              La proyección supone que <b>cada municipio sigue reportando como en 2024</b>. Es el supuesto con el que
              se validó el modelo, y acertó el total de 2024 con 1 % de error. La banda del 90 % es la incertidumbre
              del conteo, no la de un cambio de régimen de reporte.
            </p>
            <p>
              Entre 2019 y 2024 hubo cambios grandes de reporte (Santa Catarina pasó de 77 a 1,793 accidentes de un
              año a otro). Si eso vuelve a pasar, el total real puede quedar fuera de la banda: la proyección no
              intenta anticipar un cambio así.
            </p>
          </Seccion>
          <Seccion titulo="Lo que el modelo no dice">
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                Es un modelo de accidentes <b>reportados</b>, no de siniestralidad. Un municipio que deja de capturar
                accidentes se ve igual que uno donde bajó el riesgo.
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
