// El mapa de hexágonos en canvas, montado sobre el mapa base (lib/mapaBase.ts).
// Recibe, por celda, un valor de color t ∈ [0, 1] y si está en el top N; se
// encarga de dibujar y de animar la transición entre un estado y el
// siguiente. No sabe nada del modelo.
//
// La cámara (centro y zoom) la manda el mapa base. Con rotación e
// inclinación apagadas, mover y hacer zoom en Web Mercator es escalar y
// trasladar el plano: los hexágonos se construyen una vez, en coordenadas
// Mercator locales, y en cada cuadro solo cambia la transformación.
//
// Dos canvas: `hex` lleva solo los rellenos (su opacidad la controla la
// interfaz, para ver las calles debajo) y `capa` todo lo que debe seguir
// visible: contornos, top N, rótulos y el hexágono bajo el mouse.

import { colorDe, PALETA } from "./color";
import type { Datos } from "./datos";
import { utmAGeo, geoAMercator } from "./geo";

export const DURACION = 650; // ms: lo bastante lenta para verla, no para esperarla

/** Con «reducir movimiento» en el sistema, los cambios son inmediatos. */
export const sinMovimiento = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const suavizar = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

// Los nombres oficiales no caben sobre el mapa a tamaño de proyector.
export const NOMBRE_CORTO: Record<string, string> = {
  "Cadereyta Jiménez": "Cadereyta",
  "General Escobedo": "Escobedo",
  "General Zuazua": "Zuazua",
  "San Nicolás de los Garza": "San Nicolás",
  "San Pedro Garza García": "San Pedro",
};

/** Márgenes, en px, que el encuadre inicial deja libres para los controles que flotan encima. */
export interface Relleno {
  arr: number;
  aba: number;
  izq: number;
  der: number;
}

/**
 * Cámara del mapa base: centro en unidades de mundo Mercator de MapLibre y
 * cuántos px mide una unidad de mundo (512 · 2^zoom).
 */
export interface Camara {
  cx: number;
  cy: number;
  escala: number;
}

// Coordenadas locales: Mercator relativo a un origen en la ZMM, por 2^22. Un
// hexágono de 500 m mide así unas 58 unidades: números cómodos para Path2D.
const LOCAL = 2 ** 22;

/** Un valor por celda que se interpola entre dos estados. */
class Animado {
  actual: Float32Array;
  private desde: Float32Array;
  private hasta: Float32Array;

  constructor(n: number) {
    this.actual = new Float32Array(n);
    this.desde = new Float32Array(n);
    this.hasta = new Float32Array(n);
  }

  apuntar(v: ArrayLike<number>, inmediato: boolean) {
    this.desde.set(this.actual);
    this.hasta.set(v);
    if (inmediato) this.actual.set(v);
  }

  avanzar(e: number) {
    for (let i = 0; i < this.actual.length; i++)
      this.actual[i] = this.desde[i] + (this.hasta[i] - this.desde[i]) * e;
  }
}

export class Mapa {
  hover: number | null = null;
  etiquetas = true;
  /** Familia de los rótulos; con next/font se lee de --font-montserrat. */
  fuente = "Montserrat, 'Segoe UI', sans-serif";
  /** [[oeste, sur], [este, norte]] de todos los hexágonos, para encuadrar. */
  readonly extension: [[number, number], [number, number]];

  private readonly hex: CanvasRenderingContext2D;
  private readonly capa: CanvasRenderingContext2D;
  private readonly n: number;
  private readonly color: Animado;
  private readonly atenuado: Animado;
  private readonly seleccion: Animado;
  private readonly caminos: Path2D[];
  private readonly contornos: Path2D[] = [];
  private readonly centros: Float64Array; // [2i, 2i+1] en coordenadas locales
  private readonly radio: number; // del centro a un vértice, en coordenadas locales
  private readonly rotulos: { j: number; texto: string; x: number; y: number; peso: number }[];
  private readonly ox: number; // origen de las coordenadas locales, en Mercator
  private readonly oy: number;
  private inicio = 0;
  private animando = false;
  private ancho = 0;
  private alto = 0;
  // Tamaño base de la interfaz (px por rem): los trazos y rótulos crecen con
  // la pantalla igual que el resto de la página.
  private rem = 16;
  private cam: Camara | null = null;

  constructor(
    private readonly lienzos: { hex: HTMLCanvasElement; capa: HTMLCanvasElement },
    private readonly datos: Datos,
  ) {
    this.hex = lienzos.hex.getContext("2d")!;
    this.capa = lienzos.capa.getContext("2d")!;
    this.n = datos.meta.n_hex;
    this.color = new Animado(this.n);
    this.atenuado = new Animado(this.n);
    this.seleccion = new Animado(this.n);

    const { x, y } = datos.celdas;
    const L = datos.meta.lado_m;
    const [ox, oy] = geoAMercator(...utmAGeo(x.reduce((a, b) => a + b) / x.length, y.reduce((a, b) => a + b) / y.length));
    this.ox = ox;
    this.oy = oy;
    const local = (este: number, norte: number): [number, number] => {
      const [mx, my] = geoAMercator(...utmAGeo(este, norte));
      return [(mx - ox) * LOCAL, (my - oy) * LOCAL];
    };

    // Flat-top, como espacial.rejilla_hexagonal: vértices a 0°, 60°, …, 300°
    // en UTM, donde el hexágono es regular. Cada vértice se proyecta por
    // separado; a esta escala el hexágono sigue viéndose regular.
    const angulos = [0, 1, 2, 3, 4, 5].map((k) => (k * Math.PI) / 3);
    let oeste = Infinity, sur = Infinity, este = -Infinity, norte = -Infinity;
    this.centros = new Float64Array(2 * this.n);
    this.caminos = x.map((cx, i) => {
      const p = new Path2D();
      angulos.forEach((a, k) => {
        const ux = cx + L * Math.cos(a);
        const uy = y[i] + L * Math.sin(a);
        const [lon, lat] = utmAGeo(ux, uy);
        oeste = Math.min(oeste, lon);
        este = Math.max(este, lon);
        sur = Math.min(sur, lat);
        norte = Math.max(norte, lat);
        const [px, py] = local(ux, uy);
        if (k === 0) p.moveTo(px, py);
        else p.lineTo(px, py);
      });
      p.closePath();
      [this.centros[2 * i], this.centros[2 * i + 1]] = local(cx, y[i]);
      return p;
    });
    this.extension = [[oeste, sur], [este, norte]];
    const [vx, vy] = local(x[0] + L, y[0]);
    this.radio = Math.hypot(vx - this.centros[0], vy - this.centros[1]);

    for (const { j, anillos } of datos.contornos.municipios) {
      const p = new Path2D();
      for (const anillo of anillos)
        anillo.forEach(([ax, ay], k) => {
          const [px, py] = local(ax, ay);
          if (k === 0) p.moveTo(px, py);
          else p.lineTo(px, py);
        });
      this.contornos[j] = p;
    }

    // Rótulo en la celda del municipio más cercana a su centro: cae siempre
    // dentro del territorio, aunque la forma sea cóncava.
    const { municipio, conteos } = datos.celdas;
    this.rotulos = datos.meta.municipios.map((nombre, j) => {
      const mias = municipio.flatMap((m, i) => (m === j ? [i] : []));
      const mx = mias.reduce((s, i) => s + x[i], 0) / mias.length;
      const my = mias.reduce((s, i) => s + y[i], 0) / mias.length;
      const mejor = mias.reduce((a, b) =>
        (x[a] - mx) ** 2 + (y[a] - my) ** 2 <= (x[b] - mx) ** 2 + (y[b] - my) ** 2 ? a : b,
      );
      // Peso: accidentes reportados en todo el periodo. Decide quién gana
      // cuando dos rótulos no caben.
      const peso = mias.reduce((s, i) => s + conteos[i].reduce((a, b) => a + b, 0), 0);
      return { j, texto: NOMBRE_CORTO[nombre] ?? nombre, x: this.centros[2 * mejor], y: this.centros[2 * mejor + 1], peso };
    }).sort((a, b) => b.peso - a.peso);
  }

  /** Tamaño de los canvas en px CSS; `rem` escala trazos y rótulos. */
  medir(ancho: number, alto: number, rem: number) {
    const dpr = window.devicePixelRatio || 1;
    this.ancho = ancho;
    this.alto = alto;
    this.rem = rem;
    for (const lienzo of [this.lienzos.hex, this.lienzos.capa]) {
      lienzo.style.width = `${ancho}px`;
      lienzo.style.height = `${alto}px`;
      // Resolución de dispositivo: nítido en cualquier proyector o pantalla retina.
      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
    }
    this.dibujar();
  }

  /** Nueva cámara del mapa base; redibuja solo si cambió. */
  camara(c: Camara) {
    const a = this.cam;
    if (a && a.cx === c.cx && a.cy === c.cy && a.escala === c.escala) return;
    this.cam = c;
    this.dibujar();
  }

  /** De coordenadas locales a px CSS: pantalla = local · s + (tx, ty). */
  private transformacion() {
    const c = this.cam!;
    const s = c.escala / LOCAL;
    return {
      s,
      tx: this.ancho / 2 - (c.cx - this.ox) * c.escala,
      ty: this.alto / 2 - (c.cy - this.oy) * c.escala,
    };
  }

  /** Celda bajo un punto en px CSS del mapa, o null. */
  celdaEn(px: number, py: number): number | null {
    if (!this.cam) return null;
    const { s, tx, ty } = this.transformacion();
    const lx = (px - tx) / s;
    const ly = (py - ty) / s;
    let mejor: number | null = null;
    let d2 = this.radio * this.radio;
    for (let i = 0; i < this.n; i++) {
      const d = (this.centros[2 * i] - lx) ** 2 + (this.centros[2 * i + 1] - ly) ** 2;
      if (d < d2) {
        d2 = d;
        mejor = i;
      }
    }
    return mejor;
  }

  /**
   * Nuevo estado: `t` es la posición de cada celda en la rampa y `top`
   * marca las celdas señaladas (null: sin top N, nada atenuado).
   */
  objetivo(t: ArrayLike<number>, top: Uint8Array | null, inmediato = false) {
    inmediato ||= sinMovimiento();
    this.color.apuntar(t, inmediato);
    this.atenuado.apuntar(top ? top.map((v) => 1 - v) : new Uint8Array(this.n), inmediato);
    this.seleccion.apuntar(top ?? new Uint8Array(this.n), inmediato);
    if (inmediato) return this.dibujar();
    this.inicio = performance.now();
    if (!this.animando) {
      this.animando = true;
      requestAnimationFrame(this.cuadro);
    }
  }

  private cuadro = (ahora: number) => {
    const p = Math.min(1, (ahora - this.inicio) / DURACION);
    const e = suavizar(p);
    this.color.avanzar(e);
    this.atenuado.avanzar(e);
    this.seleccion.avanzar(e);
    this.dibujar();
    if (p < 1) requestAnimationFrame(this.cuadro);
    else this.animando = false;
  };

  dibujar() {
    if (!this.cam || this.ancho === 0) return; // todavía sin cámara o sin tamaño
    const dpr = window.devicePixelRatio || 1;
    const p = PALETA;
    const u = this.rem / 20; // los trazos se diseñaron a 20 px por rem (1080p)
    const t = this.color.actual;
    const at = this.atenuado.actual;
    const sel = this.seleccion.actual;
    const { s, tx, ty } = this.transformacion();

    // Solo las celdas en pantalla: con zoom de calle, casi todas quedan fuera.
    const margen = this.radio;
    const x0 = -tx / s - margen, x1 = (this.ancho - tx) / s + margen;
    const y0 = -ty / s - margen, y1 = (this.alto - ty) / s + margen;
    const visible = (i: number) => {
      const cx = this.centros[2 * i], cy = this.centros[2 * i + 1];
      return cx > x0 && cx < x1 && cy > y0 && cy < y1;
    };

    // --- Rellenos ---
    const h = this.hex;
    h.setTransform(1, 0, 0, 1, 0, 0);
    h.clearRect(0, 0, h.canvas.width, h.canvas.height);
    h.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
    // Relleno y trazo del mismo color: tapa las costuras de antialias entre
    // hexágonos vecinos. El grosor va en coordenadas locales, así que se
    // divide entre la escala para que en pantalla mida siempre 0.6 px.
    h.lineWidth = 0.6 / s;
    for (let i = 0; i < this.n; i++) {
      if (!visible(i)) continue;
      const col = colorDe(p, t[i], at[i]);
      h.fillStyle = col;
      h.strokeStyle = col;
      h.fill(this.caminos[i]);
      h.stroke(this.caminos[i]);
    }

    // --- Capa: lo que sigue visible aunque los rellenos se transparenten ---
    const c = this.capa;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);

    c.strokeStyle = p.enfasis;
    c.lineWidth = (1.6 * u) / s;
    for (let i = 0; i < this.n; i++) {
      if (sel[i] < 0.02 || !visible(i)) continue;
      c.globalAlpha = sel[i];
      c.stroke(this.caminos[i]);
    }
    c.globalAlpha = 1;

    c.lineJoin = "round";
    c.strokeStyle = p.texto;
    c.lineWidth = (1.4 * u) / s;
    c.globalAlpha = 0.5;
    this.contornos.forEach((q) => c.stroke(q));
    c.globalAlpha = 1;

    if (this.hover !== null) {
      c.strokeStyle = p.texto;
      c.lineWidth = (3 * u) / s;
      c.stroke(this.caminos[this.hover]);
    }

    // Rótulos en px de pantalla: no crecen con el zoom.
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.etiquetas) {
      c.font = `600 ${Math.round(0.8 * this.rem)}px ${this.fuente}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 4 * u;
      c.strokeStyle = p.halo;
      c.fillStyle = p.texto;
      // Primero los municipios con más accidentes (this.rotulos ya viene en
      // ese orden); un rótulo que se encimaría con uno ya puesto se omite (a
      // escala chica, Guadalupe y Monterrey no caben juntos).
      const alto = 0.8 * this.rem;
      const puestos: [number, number, number, number][] = [];
      for (const r of this.rotulos) {
        const x = r.x * s + tx;
        const y = r.y * s + ty;
        const w = c.measureText(r.texto).width / 2 + 2 * u;
        const caja: [number, number, number, number] = [x - w, y - alto / 2, x + w, y + alto / 2];
        if (puestos.some((q) => caja[0] < q[2] && q[0] < caja[2] && caja[1] < q[3] && q[1] < caja[3])) continue;
        puestos.push(caja);
        c.strokeText(r.texto, x, y);
        c.fillText(r.texto, x, y);
      }
    }
  }
}
