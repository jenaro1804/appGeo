// Total metropolitano 2019-2027 en SVG: los observados como puntos, la mediana
// del modelo como línea y el intervalo del 90 % como banda. La banda es la que
// cuenta la historia: se abre al entrar en la proyección.

import { COLOR } from "./color";
import { DURACION } from "./mapa";
import { ANIOS, esProyeccion, type Resumen } from "./modelo";

const NS = "http://www.w3.org/2000/svg";
const W = 820;
const H = 250;
const M = { izq: 92, der: 30, arr: 34, aba: 40 };

const suavizar = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, padre: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  padre.appendChild(e);
  return e;
}

// 27 números por estado: p5, p50, p95 de los nueve años, planos.
const aplanar = (r: Resumen[]) => r.flatMap((x) => [x.p5, x.p50, x.p95]);

export class Serie {
  private ymin = 0;
  private ymax = 1;
  private actual: number[] = [];
  private desde: number[] = [];
  private hasta: number[] = [];
  private refActual: number[] | null = null;
  private inicio = 0;
  private animando = false;
  private anio = 2024;

  private readonly banda: SVGPathElement;
  private readonly lineaObs: SVGPathElement;
  private readonly lineaProy: SVGPathElement;
  private readonly refBanda: SVGPathElement;
  private readonly refLinea: SVGPathElement;
  private readonly marca: SVGLineElement;
  private readonly puntos: (SVGCircleElement | null)[];
  private readonly desbordes: SVGTextElement[];
  private readonly ejeY: SVGGElement;

  constructor(
    svg: SVGSVGElement,
    private readonly observados: (number | null)[],
  ) {
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.ejeY = el("g", {}, svg);
    // Separador entre lo observado y la proyección.
    const xs = (this.x(2024) + this.x(2025)) / 2;
    el("line", { x1: xs, x2: xs, y1: M.arr, y2: H - M.aba, stroke: COLOR.texto, "stroke-dasharray": "3 5", opacity: 0.4 }, svg);
    this.refBanda = el("path", { fill: COLOR.texto, opacity: 0.1 }, svg);
    this.refLinea = el("path", { fill: "none", stroke: COLOR.texto, "stroke-width": 2.5, opacity: 0.45, "stroke-dasharray": "2 6", "stroke-linecap": "round" }, svg);
    this.banda = el("path", { fill: COLOR.datos3, opacity: 0.3 }, svg);
    this.lineaObs = el("path", { fill: "none", stroke: COLOR.datos, "stroke-width": 4 }, svg);
    this.lineaProy = el("path", { fill: "none", stroke: COLOR.datos, "stroke-width": 4, "stroke-dasharray": "10 7" }, svg);
    this.marca = el("line", { y1: M.arr, y2: H - M.aba, stroke: COLOR.enfasis, "stroke-width": 3 }, svg);
    this.puntos = observados.map((o) => (o === null ? null : el("circle", { r: 7, fill: COLOR.texto }, svg)));
    // Cuando la banda se sale del eje, una etiqueta dice hasta dónde llega.
    this.desbordes = ANIOS.map((a) => el("text", { x: this.x(a), y: M.arr - 4, "text-anchor": "end", class: "desborde" }, svg));
    for (const a of ANIOS)
      el("text", { x: this.x(a), y: H - 12, "text-anchor": "middle", class: "eje" }, svg).textContent = `'${String(a).slice(2)}`;
  }

  private x(anio: number) {
    return M.izq + ((anio - ANIOS[0]) / (ANIOS.length - 1)) * (W - M.izq - M.der);
  }

  private y(v: number) {
    const f = (v - this.ymin) / (this.ymax - this.ymin);
    return H - M.aba - Math.min(1.02, Math.max(-0.02, f)) * (H - M.arr - M.aba);
  }

  /** Eje Y fijo: si cambiara con cada escenario, el público compararía ejes y no datos. */
  dominio(min: number, max: number) {
    // El paso más fino que deje a lo más cinco marcas legibles.
    const paso = [10000, 20000, 25000, 50000, 100000].find((p) => (max - min) / p <= 5) ?? 100000;
    this.ymin = Math.floor(min / paso) * paso;
    this.ymax = Math.ceil(max / paso) * paso;
    this.ejeY.replaceChildren();
    for (let v = this.ymin; v <= this.ymax; v += paso) {
      el("line", { x1: M.izq, x2: W - M.der, y1: this.y(v), y2: this.y(v), stroke: COLOR.fondo2, "stroke-width": 2 }, this.ejeY);
      el("text", { x: M.izq - 12, y: this.y(v) + 7, "text-anchor": "end", class: "eje" }, this.ejeY).textContent = `${v / 1000} mil`;
    }
    this.observados.forEach((o, k) => {
      const p = this.puntos[k];
      if (o !== null && p) {
        p.setAttribute("cx", String(this.x(ANIOS[k])));
        p.setAttribute("cy", String(this.y(o)));
      }
    });
  }

  actualizar(resumenes: Resumen[], anio: number, referencia: Resumen[] | null, inmediato = false) {
    this.anio = anio;
    const nuevo = aplanar(resumenes);
    this.refActual = referencia && aplanar(referencia);
    if (inmediato || this.actual.length === 0) {
      this.actual = nuevo;
      this.hasta = nuevo;
      return this.dibujar();
    }
    this.desde = [...this.actual];
    this.hasta = nuevo;
    this.inicio = performance.now();
    if (!this.animando) {
      this.animando = true;
      requestAnimationFrame(this.cuadro);
    }
  }

  private cuadro = (ahora: number) => {
    const p = Math.min(1, (ahora - this.inicio) / DURACION);
    const e = suavizar(p);
    this.actual = this.desde.map((d, k) => d + (this.hasta[k] - d) * e);
    this.dibujar();
    if (p < 1) requestAnimationFrame(this.cuadro);
    else this.animando = false;
  };

  private caminos(v: number[]) {
    const pt = (k: number, q: number) => `${this.x(ANIOS[k])},${this.y(v[3 * k + q])}`;
    const ks = ANIOS.map((_, k) => k);
    const obs = ks.filter((k) => !esProyeccion(ANIOS[k]));
    const proy = ks.filter((k) => esProyeccion(ANIOS[k]) || ANIOS[k] === 2024);
    return {
      banda: `M${ks.map((k) => pt(k, 2)).join("L")}L${[...ks].reverse().map((k) => pt(k, 0)).join("L")}Z`,
      obs: `M${obs.map((k) => pt(k, 1)).join("L")}`,
      proy: `M${proy.map((k) => pt(k, 1)).join("L")}`,
      todo: `M${ks.map((k) => pt(k, 1)).join("L")}`,
    };
  }

  private dibujar() {
    const c = this.caminos(this.actual);
    this.banda.setAttribute("d", c.banda);
    this.lineaObs.setAttribute("d", c.obs);
    this.lineaProy.setAttribute("d", c.proy);
    if (this.refActual) {
      const r = this.caminos(this.refActual);
      this.refBanda.setAttribute("d", r.banda);
      this.refLinea.setAttribute("d", r.todo);
    } else {
      this.refBanda.setAttribute("d", "");
      this.refLinea.setAttribute("d", "");
    }
    // Solo el último año que se sale: dos etiquetas vecinas se enciman.
    const fuera = ANIOS.map((_, k) => this.hasta[3 * k + 2] > this.ymax);
    const ultimo = fuera.lastIndexOf(true);
    this.desbordes.forEach((t, k) => {
      t.textContent = k === ultimo ? `↑${Math.round(this.hasta[3 * k + 2] / 1000)} mil` : "";
    });
    const xm = this.x(this.anio);
    this.marca.setAttribute("x1", String(xm));
    this.marca.setAttribute("x2", String(xm));
  }
}
