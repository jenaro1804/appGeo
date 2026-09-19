// El mapa de hexágonos en canvas. Recibe, por celda, un valor de color
// t ∈ [0, 1] y si está en el top N; se encarga de dibujar y de animar la
// transición entre un estado y el siguiente. No sabe nada del modelo.

import { COLOR, colorDe } from "./color";
import type { Datos } from "./datos";

export const DURACION = 650; // ms: lo bastante lenta para verla, no para esperarla

const suavizar = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

// Los nombres oficiales no caben sobre el mapa a tamaño de proyector.
export const NOMBRE_CORTO: Record<string, string> = {
  "Cadereyta Jiménez": "Cadereyta",
  "General Escobedo": "Escobedo",
  "General Zuazua": "Zuazua",
  "San Nicolás de los Garza": "San Nicolás",
  "San Pedro Garza García": "San Pedro",
};

const PADDING = 24;

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
  /** Municipios que cambian en el escenario activo: su contorno va en rojo. */
  resaltados = new Set<number>();
  etiquetas = true;
  /** Familia de los rótulos; con next/font se lee de --font-montserrat. */
  fuente = "Montserrat, 'Segoe UI', sans-serif";

  private readonly ctx: CanvasRenderingContext2D;
  private readonly n: number;
  private readonly color: Animado;
  private readonly atenuado: Animado;
  private readonly seleccion: Animado;
  private caminos: Path2D[] = [];
  private contornos: Path2D[] = [];
  private rotulos: { texto: string; x: number; y: number }[] = [];
  private inicio = 0;
  private animando = false;
  private ancho = 0;
  private alto = 0;
  // Transformación UTM → coordenadas del escenario (px de la maqueta 1920×1080).
  private k = 1;
  private ox = 0;
  private oy = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly datos: Datos,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.n = datos.meta.n_hex;
    this.color = new Animado(this.n);
    this.atenuado = new Animado(this.n);
    this.seleccion = new Animado(this.n);
  }

  /** Tamaño en px de la maqueta, y cuánto la escala la pantalla real. */
  medir(ancho: number, alto: number, escala: number) {
    const dpr = window.devicePixelRatio || 1;
    this.ancho = ancho;
    this.alto = alto;
    this.canvas.style.width = `${ancho}px`;
    this.canvas.style.height = `${alto}px`;
    // Resolución real = tamaño en pantalla, no el de la maqueta: nítido a
    // cualquier resolución de proyector.
    this.canvas.width = Math.round(ancho * escala * dpr);
    this.canvas.height = Math.round(alto * escala * dpr);
    this.ctx.setTransform(escala * dpr, 0, 0, escala * dpr, 0, 0);
    this.construir();
    this.dibujar();
  }

  private construir() {
    const { x, y } = this.datos.celdas;
    const L = this.datos.meta.lado_m;
    const h = (Math.sqrt(3) / 2) * L;
    const xmin = Math.min(...x) - L;
    const xmax = Math.max(...x) + L;
    const ymin = Math.min(...y) - h;
    const ymax = Math.max(...y) + h;
    this.k = Math.min((this.ancho - 2 * PADDING) / (xmax - xmin), (this.alto - 2 * PADDING) / (ymax - ymin));
    this.ox = (this.ancho - this.k * (xmax - xmin)) / 2 - this.k * xmin;
    this.oy = (this.alto - this.k * (ymax - ymin)) / 2 + this.k * ymax;

    // Flat-top, como espacial.rejilla_hexagonal: vértices a 0°, 60°, …, 300°.
    const angulos = [0, 1, 2, 3, 4, 5].map((k) => (k * Math.PI) / 3);
    this.caminos = x.map((cx, i) => {
      const p = new Path2D();
      angulos.forEach((a, k) => {
        const [px, py] = this.aPantalla(cx + L * Math.cos(a), y[i] + L * Math.sin(a));
        if (k === 0) p.moveTo(px, py);
        else p.lineTo(px, py);
      });
      p.closePath();
      return p;
    });

    this.contornos = [];
    for (const { j, anillos } of this.datos.contornos.municipios) {
      const p = new Path2D();
      for (const anillo of anillos)
        anillo.forEach(([ax, ay], k) => {
          const [px, py] = this.aPantalla(ax, ay);
          if (k === 0) p.moveTo(px, py);
          else p.lineTo(px, py);
        });
      this.contornos[j] = p;
    }

    // Rótulo en la celda del municipio más cercana a su centro: cae siempre
    // dentro del territorio, aunque la forma sea cóncava.
    const { municipio } = this.datos.celdas;
    this.rotulos = this.datos.meta.municipios.map((nombre, j) => {
      const mias = municipio.flatMap((m, i) => (m === j ? [i] : []));
      const mx = mias.reduce((s, i) => s + x[i], 0) / mias.length;
      const my = mias.reduce((s, i) => s + y[i], 0) / mias.length;
      const mejor = mias.reduce((a, b) =>
        (x[a] - mx) ** 2 + (y[a] - my) ** 2 <= (x[b] - mx) ** 2 + (y[b] - my) ** 2 ? a : b,
      );
      const [px, py] = this.aPantalla(x[mejor], y[mejor]);
      return { texto: NOMBRE_CORTO[nombre] ?? nombre, x: px, y: py };
    });
  }

  private aPantalla(ux: number, uy: number): [number, number] {
    return [this.ox + this.k * ux, this.oy - this.k * uy];
  }

  /** Celda bajo un punto en px de la maqueta, o null. */
  celdaEn(px: number, py: number): number | null {
    const ux = (px - this.ox) / this.k;
    const uy = (this.oy - py) / this.k;
    const { x, y } = this.datos.celdas;
    const L = this.datos.meta.lado_m;
    let mejor: number | null = null;
    let d2 = L * L;
    for (let i = 0; i < this.n; i++) {
      const d = (x[i] - ux) ** 2 + (y[i] - uy) ** 2;
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
    const c = this.ctx;
    c.clearRect(0, 0, this.ancho, this.alto);
    const t = this.color.actual;
    const at = this.atenuado.actual;
    const sel = this.seleccion.actual;

    // Relleno y trazo del mismo color: tapa las costuras de antialias entre
    // hexágonos vecinos.
    c.lineWidth = 0.6;
    for (let i = 0; i < this.n; i++) {
      const col = colorDe(t[i], at[i]);
      c.fillStyle = col;
      c.strokeStyle = col;
      c.fill(this.caminos[i]);
      c.stroke(this.caminos[i]);
    }

    c.strokeStyle = COLOR.enfasis;
    c.lineWidth = 1.6;
    for (let i = 0; i < this.n; i++) {
      if (sel[i] < 0.02) continue;
      c.globalAlpha = sel[i];
      c.stroke(this.caminos[i]);
    }
    c.globalAlpha = 1;

    c.lineJoin = "round";
    c.strokeStyle = COLOR.texto;
    c.lineWidth = 1.4;
    c.globalAlpha = 0.55;
    this.contornos.forEach((p) => c.stroke(p));
    c.globalAlpha = 1;
    c.strokeStyle = COLOR.enfasis;
    c.lineWidth = 4;
    for (const j of this.resaltados) c.stroke(this.contornos[j]);

    if (this.etiquetas) {
      c.font = `600 17px ${this.fuente}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 4;
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.fillStyle = COLOR.texto;
      for (const r of this.rotulos) {
        c.strokeText(r.texto, r.x, r.y);
        c.fillText(r.texto, r.x, r.y);
      }
    }

    if (this.hover !== null) {
      c.strokeStyle = COLOR.texto;
      c.lineWidth = 3;
      c.stroke(this.caminos[this.hover]);
    }
  }
}
