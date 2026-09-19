// Los escenarios preparados para la presentación: son datos, no lógica. Se
// editan aquí sin tocar nada más. Cada uno se lanza con su tecla: primero
// aparece la pregunta con el mapa intacto (en `anioAntes`) y `Espacio` revela
// la respuesta (en `anio`, con el escenario aplicado).
//
// `municipios` usa el nombre oficial, con acentos, como en meta.json. Si uno
// no existe, la app falla al arrancar en vez de ignorarlo en silencio.
// Un escenario solo actúa en proyecciones (2025-2027): es un cambio de
// régimen de reporte hacia adelante.

export interface Preset {
  tecla: string;
  pregunta: string;
  /** Lo que se lee en el panel mientras el escenario está activo. */
  etiqueta: string;
  municipios: string[];
  /** Que esos municipios reporten como en ese año… */
  comoEn?: number;
  /** …o por un factor fijo (2 = el doble). */
  factor?: number;
  anioAntes: number;
  anio: number;
}

export const PRESETS: Preset[] = [
  {
    tecla: "1",
    pregunta: "¿Qué pasa si Guadalupe vuelve a reportar como en 2021?",
    etiqueta: "Guadalupe reporta como en 2021",
    municipios: ["Guadalupe"],
    comoEn: 2021,
    anioAntes: 2025,
    anio: 2025,
  },
  {
    tecla: "2",
    pregunta: "¿Y si Santa Catarina regresa a como reportaba en 2020?",
    etiqueta: "Santa Catarina reporta como en 2020",
    municipios: ["Santa Catarina"],
    comoEn: 2020,
    anioAntes: 2025,
    anio: 2025,
  },
  {
    tecla: "3",
    pregunta: "¿Y si la periferia norte reportara el doble?",
    etiqueta: "Ciénega de Flores y Salinas Victoria reportan el doble",
    municipios: ["Ciénega de Flores", "Salinas Victoria"],
    factor: 2,
    anioAntes: 2025,
    anio: 2025,
  },
  {
    tecla: "4",
    pregunta: "¿Cuántos accidentes habrá en 2027 si nada cambia?",
    etiqueta: "Sin cambios de régimen",
    municipios: [],
    anioAntes: 2024,
    anio: 2027,
  },
];
