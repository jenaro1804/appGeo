# GeoStats — Accidentes de tránsito en México (ATUS, INEGI)

*[English](README.md) · Español*

Análisis geoestadístico de los accidentes de tránsito urbanos y suburbanos
registrados por el INEGI.

## Estructura

```
data/                  ← qué se versiona y qué no, abajo
  raw/                 descargas del INEGI, tal cual llegaron; solo lectura
    ATUS_2019..2024/   base georreferenciada anual (CSV + shapefile)
    ATUS_anual_csv/    serie anual 1997-2025, sin coordenadas
    rativ_abierto_22-26.csv
    _zips/             los comprimidos originales
  processed/           lo que genera este repo; borrable y regenerable
    atus_georreferenciado.parquet       nacional, 2019-2024
    atus_zmm.parquet                    Zona Metropolitana de Monterrey
    atus_zmm_limpio.parquet             la ZMM más 20 columnas derivadas
docs/
  diccionario_de_datos.md   los 50 campos, sus catálogos y sus centinelas
  seleccion_datos.md        qué columnas conservar y con qué papel
  limpieza.md               las 20 derivadas, y lo que la limpieza no hace
  *.pdf                     el render de cada notebook, para leer sin entorno
notebooks/
  revisiones.ipynb              exploración
  calidad_datos.qmd             reporte de faltantes (no modifica nada)
  analisis_multivariado.qmd     covarianza, correlación, factorial y STL
src/geostats/
  rutas.py             rutas del proyecto (nada de rutas relativas)
  consolidar.py        raw/ATUS_20XX → processed/*.parquet
  zonas.py             recortes geográficos (ZMM de Monterrey)
  limpieza.py          columnas derivadas y validación; no borra ni imputa
```

La separación `raw/` vs `processed/` es la regla del proyecto: **nunca se
escribe en `raw/`**. Si algo en `processed/` se corrompe, se borra y se
regenera; si algo en `raw/` se pierde, hay que volver a bajarlo del INEGI.

**Qué se versiona.** `raw/` nunca: son ~5 GB de descargas del INEGI que se
vuelven a bajar. De `processed/` sí van al repo las bases consolidadas
(`atus_georreferenciado*`, `atus_zmm*`), para que un clon tenga datos sin
repetir esa descarga. Los artefactos de limpieza (`*_limpio*`) quedan fuera: se
regeneran en segundos con `uv run limpiar-atus`, y como Parquet es binario
comprimido git no puede hacer delta — cada versión commiteada se guardaría
entera y se quedaría en el historial para siempre.

## Preparar el entorno

```bash
uv sync
```

### Si `import geostats` falla

Choque conocido entre uv y Python 3.14 en macOS: el `.pth` de la instalación
editable queda con el flag `UF_HIDDEN`, y **Python 3.14 ignora en silencio los
`.pth` ocultos**. Reaparece de forma intermitente, cuando uv reescribe ese
archivo:

```bash
chflags nohidden .venv/lib/python3.14/site-packages/*.pth
```

El archivo `.env` de la raíz (`PYTHONPATH=src`) es la red de seguridad: VS Code
lo aplica al kernel de Jupyter, así que los notebooks siguen funcionando aunque
el `.pth` esté oculto. Por eso ese `.env` sí se versiona — no contiene secretos.

## Los notebooks

Van en **Quarto** (`.qmd`), no en `.ipynb`. El `.qmd` es texto plano: git puede
hacer diff y merge de verdad, y el archivo no carga con las salidas embebidas
que hacen ilegible el historial de un notebook de Jupyter.

```bash
uv sync --group dev                        # nbclient y nbformat, que Quarto usa
quarto render notebooks/calidad_datos.qmd --to html
```

Si `quarto` no encuentra el intérprete, apúntalo al del proyecto:
`QUARTO_PYTHON=.venv/Scripts/python.exe` (Windows) o `.venv/bin/python`.

**Cada notebook tiene su PDF en `docs/`.** Se genera del HTML, porque en estas
máquinas no hay LaTeX:

```bash
chrome --headless --no-pdf-header-footer   --print-to-pdf=docs/calidad_datos.pdf notebooks/calidad_datos.html
```

El HTML intermedio y todo lo que Quarto deja en `notebooks/` está en
`.gitignore`; al repo solo van el `.qmd` y el PDF de `docs/`.

## Reconstruir los datos procesados

Los datos crudos no están en el repo. Bajar de INEGI las bases ATUS
georreferenciadas por año, descomprimirlas en `data/raw/ATUS_<año>/`, y correr:

```bash
uv run consolidar-atus              # parquet tabular (31 MB)
uv run consolidar-atus --geo        # además GeoParquet con geometría (43 MB)
uv run consolidar-atus --verificar  # contrasta los .shp contra los CSV
```

Produce 1,317,810 filas × 50 columnas (2019-2024) en 31 MB de Parquet, contra
219 MB de CSV.

### Recorte a la Zona Metropolitana de Monterrey

```bash
uv run zona-atus          # data/processed/atus_zmm.parquet
uv run zona-atus --geo    # además el GeoParquet
```

379,294 registros (28.8 % del total nacional) en los 18 municipios de la ZMM
según el Sistema Urbano Nacional. Agrega la columna `NOM_MUN`.

**Esos 18 municipios son exactamente los únicos de Nuevo León que trae ATUS**:
la cobertura estatal de la encuesta coincide con la zona metropolitana, así que
filtrar por `EDO == 19` da el mismo resultado. `geostats.zonas` mantiene la lista
explícita de todos modos, y falla si algún municipio de la zona no aparece en los
datos, para que el recorte no dependa de esa coincidencia.

Ventaja sobre la base nacional: **el panel está balanceado**, los 18 municipios
están presentes los seis años. Las series de tiempo de la ZMM sí son comparables
entre años, cosa que a nivel nacional no ocurre (la cobertura va de 91 a 198
municipios).

### Limpieza

```bash
uv run limpiar-atus          # data/processed/atus_zmm_limpio.parquet (12 MB)
uv run limpiar-atus --geo    # además el GeoParquet (15 MB)
```

Agrega 20 columnas derivadas a las 51 del recorte, y **nunca borra filas ni
imputa**. No es estilo: el faltante de esta base es MNAR —en accidentes fatales
el aliento alcohólico se ignora 2.4 veces más seguido que en los de solo daños—,
así que `dropna()` sesga contra los accidentes graves e imputar bajo supuesto
MAR mete sesgo en silencio. Si la etapa no puede borrar ni imputar, ninguna de
las dos cosas puede pasar por descuido más adelante.

Convención: **mayúsculas** es lo que llegó del INEGI y no se toca, incluidos los
códigos centinela; **minúsculas** es lo que construye este repo. Así en cualquier
`groupby` se sabe de un vistazo de dónde viene el dato.

`validar()` recorre 21 invariantes y falla con la lista completa de las que se
rompan; `diagnostico()` imprime las doce cifras que cambian la lectura del
análisis. El detalle de cada columna está en [`docs/limpieza.md`](docs/limpieza.md).

> Las coordenadas traen **hasta ocho decimales**, no seis como sugiere el
> ejemplo del diccionario. Formatearlas a seis fusiona 8,115 puntos distintos en
> silencio, así que `id_punto` no usa formato fijo y una invariante lo comprueba
> en cada corrida.

### Por qué no se consolidan los shapefiles

Los `.shp` traen los mismos registros que los CSV. `--verificar` lo comprueba
año por año: coinciden las 1,317,810 filas por la llave `(ANIO, EDO, MPIO, ID)`,
sin sobrantes de ningún lado, y la geometría del shapefile es **idéntica** a las
columnas `LONGITUD`/`LATITUD` (desfase máximo: 0.0 grados en los seis años).

Por eso `--geo` construye la geometría desde esas columnas en vez de releer 5 GB
de shapefiles: el resultado es el mismo punto por punto. Ojo: en 2019-2023 el
orden de las filas difiere entre `.shp` y CSV, así que compararlos por posición
da resultados sin sentido — hay que unirlos por la llave.

## Identidad visual en las gráficas

Las gráficas siguen el manual de GeoStats, pero los colores de marca están
pensados para impresión y no todos sirven como marcas de datos sobre fondo
claro. Se validaron antes de usarlos (banda de luminosidad OKLCH 0.43–0.77,
piso de croma 0.10, separación bajo simulación de daltonismo, contraste WCAG):

| Color de marca | Uso en gráficas | Resultado |
|---|---|---|
| Azul Prusia `#003153` | datos | **No pasa**: L=0.304 (banda 0.43–0.77) y croma 0.078 (piso 0.10, lee como gris). Se conserva el tono 246° y se sube L a 0.45 → `#005991` |
| Rojo profundo `#8B2C1A` | títulos, énfasis | Pasa sin cambios (L=0.434, croma 0.133) |
| Rojo óxido `#B15E2E` | detalle cálido | Pasa sin cambios (L=0.571, croma 0.124) |
| Gris grafito `#2C2C2C` | texto, ejes | Croma 0 — correcto para texto, nunca como serie |
| Gris claro `#F2F2F2` | rejilla, fondos | — |

**Los dos rojos nunca van como series contiguas:** entre sí quedan en ΔE 14.1
sobre un piso de 15, así que un lector con visión de color plena no los
distingue bien lado a lado.

Como la marca solo aporta un tono de datos, las gráficas con más de dos series
usan **paneles pequeños** (una serie por panel) o la **rampa ordinal** de Azul
Prusia `#005991 → #1b77b8 → #4195d9` cuando la dimensión tiene orden, en vez de
inventar colores fuera del manual.

Tipografías: Montserrat (títulos), Cormorant Garamond (texto), Roboto Mono
(cifras). No están instaladas en el sistema, así que matplotlib usa respaldos.
Para el renderizado exacto:

```bash
brew install --cask font-montserrat font-cormorant-garamond font-roboto-mono
```

## Notas sobre los datos

El significado de cada campo, sus catálogos de códigos y sus valores centinela
están en [`docs/diccionario_de_datos.md`](docs/diccionario_de_datos.md), que
consolida los tres diccionarios del INEGI y los contrasta contra los datos.

Tres cosas que no son obvias y que rompen el análisis si se ignoran:

**Encoding: CP1252 con respaldo, no lo que diga `chardet`.** Sobre estos
archivos chardet reporta `CP874`/`TIS-620` con confianza `0.00`, porque apenas
~1 de cada 250 bytes es no-ASCII. El `.cpg` del INEGI declara CP1252 y tiene
razón: en el rango `0x80-0x9F` CP1252 pone guiones y comillas tipográficas que
`latin-1` convierte en caracteres de control (719 caracteres mal leídos, en
silencio). Pero 740 bytes del origen caen en los cinco huecos que CP1252 no
define. `consolidar` registra un manejador de errores que lee esos cinco bytes
con semántica latin-1: texto correcto y cero bytes perdidos (ningún U+FFFD).

**`ID` no es llave única.** En 2019-2020 es un folio consecutivo *por
municipio* y se repite 268,920 veces; desde 2021 es un identificador compuesto.
La llave real es `(ANIO, EDO, MPIO, ID)`. `consolidar` lo valida y falla si no
se cumple.

**La cobertura crece: el panel está desbalanceado.** De 91 municipios en 2019 a
198 en 2024. El salto de +52% en accidentes entre 2020 y 2021 es en buena parte
*más municipios medidos*, no más accidentes. Cualquier serie de tiempo hay que
normalizarla (tasa por municipio, o restringir al panel balanceado).

`consolidar` agrega `CVE_MUN` (2 dígitos de estado + 3 de municipio), que es la
llave para unir con el marco geoestadístico del INEGI.
