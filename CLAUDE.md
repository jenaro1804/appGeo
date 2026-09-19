# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Análisis geoestadístico de accidentes de tránsito (ATUS, INEGI), centrado en la
Zona Metropolitana de Monterrey (ZMM). Es un pipeline de datos + notebooks, no
una aplicación. Todo el repo (código, comentarios, docs, commits) está en
**español**; mantener ese idioma. Los commits siguen Conventional Commits en
español (`feat(zonas): …`, `docs(datos): …`).

## Comandos

```bash
uv sync                              # entorno (Python 3.14, gestionado con uv)

uv run consolidar-atus               # raw/ATUS_20XX/*.csv → processed/atus_georreferenciado.parquet
uv run consolidar-atus --geo         # además el GeoParquet (geometría desde LONGITUD/LATITUD)
uv run consolidar-atus --verificar   # contrasta .shp vs CSV por año (lee ~5 GB, lento)

uv run zona-atus                     # processed/atus_georreferenciado.parquet → processed/atus_zmm.parquet
uv run zona-atus --geo               # además atus_zmm_geo.parquet
```

`zona-atus` depende de que `consolidar-atus` haya corrido antes. No hay tests
ni linter configurados en el lado de Python.

**App web** (`app/`, Next.js 16): muestra el posterior del modelo jerárquico.
Estado, decisiones y pendientes en `docs/app_web.md` — leerlo antes de tocarla.

```bash
uv run limpiar-atus --geo            # → atus_zmm_limpio_geo.parquet (lo usa el modelo)
uv run exportar-app                  # ajusta el modelo (~10 min de MCMC) → data/processed/app/
uv run exportar-app --reusar         # solo reescribe los archivos, desde el posterior.npz guardado
cd app && npm run dev                # la app en localhost:3000 (copia los datos a public/datos/)
cd app && npm test                   # pruebas de la aritmética (contra numpy) y del estado
```

Si `import geostats` falla (uv + Python 3.14 en macOS deja el `.pth` oculto y
Python lo ignora en silencio):

```bash
chflags nohidden .venv/lib/python3.14/site-packages/*.pth
```

El `.env` versionado (`PYTHONPATH=src`) es la red de seguridad para el kernel
de Jupyter en VS Code; no contiene secretos.

## Arquitectura

```
src/geostats/
  rutas.py       constantes de rutas absolutas resueltas desde el paquete
  consolidar.py  raw → parquet nacional; validaciones; escribir_geoparquet()
  zonas.py       recorte a la ZMM (usa consolidar.escribir_geoparquet para --geo)
  espacial.py    rejilla hexagonal, CRS métrico (UTM 14N) y celdas(): la partición común de análisis y modelo
  modelo.py      ajusta el modelo jerárquico sobre 2019-2024 y exporta el posterior para la app
notebooks/       consumen processed/ vía `from geostats import rutas, zonas`
app/             app web en Next.js; lee data/processed/app/ (ver docs/app_web.md)
docs/            diccionario de datos, selección de variables y el PDF de cada notebook
docs/reporte/    reporte técnico en LaTeX (latexmk -pdf reporte.tex); figuras/ se extraen del HTML de los notebooks
data/            fuera del repo salvo .gitkeep (~5 GB)
```

**Los notebooks van en Quarto (`.qmd`), no en `.ipynb`.** El `.qmd` es texto
plano y git puede versionarlo de verdad; un `.ipynb` arrastra las salidas
embebidas y hace ilegible el diff. Cada notebook tiene además su PDF renderizado
en `docs/`:

```bash
PYTHONPATH=$PWD/src QUARTO_PYTHON=.venv/bin/python quarto render notebooks/<nombre>.qmd --to html --execute-daemon-restart
chrome --headless --no-pdf-header-footer --print-to-pdf=docs/<nombre>.pdf notebooks/<nombre>.html
```

`quarto render` detecta el proyecto uv y resincroniza el entorno, lo que vuelve
a ocultar el `.pth` **durante el render**: `chflags` no basta. `PYTHONPATH`
absoluto (Quarto lanza el kernel desde `notebooks/`) y `--execute-daemon-restart`
(el daemon conserva el `sys.path` roto entre renders) son los que resuelven.
En Windows, `QUARTO_PYTHON=.venv/Scripts/python.exe`.

El PDF sale del HTML porque no hay LaTeX en estas máquinas. El HTML intermedio
está en `.gitignore`; al repo van solo el `.qmd` y el PDF de `docs/`.

**Regla del proyecto: nunca se escribe en `data/raw/`.** `processed/` es
borrable y regenerable. Toda ruta pasa por `geostats.rutas` (nunca rutas
relativas), para que notebooks y scripts vean los mismos archivos sin importar
el directorio de trabajo.

## Cosas no obvias de los datos que rompen el análisis si se ignoran

- **Encoding**: los CSV son CP1252 pero 740 bytes caen en los huecos que CP1252
  no define. `consolidar.py` registra al importarse un manejador de errores
  (`cp1252_con_respaldo_latin1`) que lee esos bytes con latin-1. No usar
  `chardet` (reporta CP874 con confianza 0.00) ni `latin-1` directo (convierte
  guiones y comillas tipográficas en caracteres de control).
- **`ID` no es llave única.** La llave real es `(ANIO, EDO, MPIO, ID)`;
  `consolidar` falla si hay duplicados por esa llave.
- **Panel nacional desbalanceado**: 91 municipios en 2019 → 198 en 2024. El
  salto de accidentes 2020→2021 es mayormente cobertura, no siniestralidad.
  El recorte a la ZMM sí está balanceado (18 municipios los seis años), por eso
  las series de tiempo se hacen sobre `atus_zmm.parquet`.
- Los 18 municipios de la ZMM son exactamente los únicos de Nuevo León en ATUS
  (`EDO == 19` da lo mismo), pero `zonas.ZMM_MONTERREY` mantiene la lista
  explícita y falla si falta alguno. `CVE_MUN` (5 dígitos) es la llave para
  unir con el marco geoestadístico del INEGI.
- Los `.shp` son idénticos a los CSV (mismas filas, misma geometría); por eso
  `--geo` construye puntos desde `LONGITUD`/`LATITUD` en vez de leer shapefiles.
  Comparar .shp y CSV por posición no sirve (el orden difiere en 2019-2023):
  unir por la llave.
- Faltantes codificados como centinelas (no `NaN`) y MNAR: ver
  `docs/diccionario_de_datos.md` § "Códigos centinela" y
  `notebooks/calidad_datos.qmd` antes de tratar nulos.

## Gráficas

Siguen la identidad visual de GeoStats (tabla completa en el README). Reglas
que se derivan de la validación de colores:

- Serie de datos principal: `#005991` (Azul Prusia ajustado); el `#003153` de
  marca **no** sirve como marca de datos.
- `#8B2C1A` (títulos/énfasis) y `#B15E2E` (detalle cálido) pasan, pero nunca
  como series contiguas.
- Más de dos series: paneles pequeños o la rampa ordinal
  `#005991 → #1b77b8 → #4195d9`; no inventar colores fuera del manual.
- Grafito `#2C2C2C` solo texto/ejes; `#F2F2F2` rejilla/fondos.
- Tipografías: Montserrat / Cormorant Garamond / Roboto Mono, con respaldos
  (no están instaladas por defecto).
