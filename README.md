# GeoStats — Road Traffic Accidents in Mexico (ATUS, INEGI)

*English · [Español](README.es.md)*

Geostatistical analysis of the urban and suburban road traffic accidents
recorded by INEGI (Mexico's National Institute of Statistics and Geography).

## Structure

```
data/                  ← what is versioned and what isn't: see below
  raw/                 INEGI downloads, exactly as they arrived; read-only
    ATUS_2019..2024/   yearly georeferenced dataset (CSV + shapefile)
    ATUS_anual_csv/    yearly series 1997-2025, no coordinates
    rativ_abierto_22-26.csv
    _zips/             the original archives
  processed/           what this repo generates; safe to delete and rebuild
    atus_georreferenciado.parquet       national, 2019-2024
    atus_zmm.parquet                    Monterrey Metropolitan Area (ZMM)
    atus_zmm_limpio.parquet             the ZMM plus 20 derived columns
docs/
  diccionario_de_datos.md   the 50 fields, their code lists and sentinel values
  seleccion_datos.md        which columns to keep and what role each plays
  limpieza.md               the 20 derived columns, and what cleaning does not do
  *.pdf                     each notebook rendered, readable without an environment
notebooks/
  revisiones.ipynb              exploration
  calidad_datos.qmd             missing-data report (modifies nothing)
  analisis_multivariado.qmd     covariance, correlation, factor analysis and STL
src/geostats/
  rutas.py             project paths (no relative paths anywhere)
  consolidar.py        raw/ATUS_20XX → processed/*.parquet
  zonas.py             geographic subsets (Monterrey ZMM)
  limpieza.py          derived columns and validation; never drops or imputes
```

The `raw/` vs `processed/` split is the project's rule: **nothing is ever
written to `raw/`**. If something in `processed/` gets corrupted, delete it and
rebuild it; if something in `raw/` is lost, it has to be downloaded from INEGI
again.

**What is versioned.** `raw/` never: it is ~5 GB of INEGI downloads that can be
fetched again. From `processed/`, the consolidated datasets
(`atus_georreferenciado*`, `atus_zmm*`) are committed, so a clone has data
without repeating that download. The cleaning outputs (`*_limpio*`) are left
out: they are rebuilt in seconds with `uv run limpiar-atus`, and since Parquet
is compressed binary, git cannot store deltas — every committed version would
be stored in full and stay in the history forever.

## Setting up the environment

```bash
uv sync
```

### If `import geostats` fails

Known clash between uv and Python 3.14 on macOS: the editable install's `.pth`
file ends up with the `UF_HIDDEN` flag, and **Python 3.14 silently ignores
hidden `.pth` files**. It comes back intermittently, whenever uv rewrites that
file:

```bash
chflags nohidden .venv/lib/python3.14/site-packages/*.pth
```

The `.env` file at the root (`PYTHONPATH=src`) is the safety net: VS Code
applies it to the Jupyter kernel, so the notebooks keep working even when the
`.pth` is hidden. That is why this `.env` is versioned — it holds no secrets.

## Notebooks

They are written in **Quarto** (`.qmd`), not `.ipynb`. A `.qmd` is plain text:
git can actually diff and merge it, and the file does not carry the embedded
outputs that make a Jupyter notebook's history unreadable.

```bash
uv sync --group dev                        # nbclient and nbformat, used by Quarto
quarto render notebooks/calidad_datos.qmd --to html
```

If `quarto` cannot find the interpreter, point it to the project's:
`QUARTO_PYTHON=.venv/Scripts/python.exe` (Windows) or `.venv/bin/python`.

**Every notebook has its PDF in `docs/`.** It is generated from the HTML,
because these machines have no LaTeX:

```bash
chrome --headless --no-pdf-header-footer   --print-to-pdf=docs/calidad_datos.pdf notebooks/calidad_datos.html
```

The intermediate HTML and everything Quarto leaves in `notebooks/` is in
`.gitignore`; only the `.qmd` and the PDF in `docs/` go into the repo.

## Rebuilding the processed data

The raw data is not in the repo. Download the yearly georeferenced ATUS
datasets from INEGI, unzip them into `data/raw/ATUS_<year>/`, and run:

```bash
uv run consolidar-atus              # tabular parquet (31 MB)
uv run consolidar-atus --geo        # also GeoParquet with geometry (43 MB)
uv run consolidar-atus --verificar  # checks the .shp files against the CSVs
```

It produces 1,317,810 rows × 50 columns (2019-2024) in 31 MB of Parquet,
versus 219 MB of CSV.

### Subset to the Monterrey Metropolitan Area

```bash
uv run zona-atus          # data/processed/atus_zmm.parquet
uv run zona-atus --geo    # also the GeoParquet
```

379,294 records (28.8 % of the national total) in the 18 municipalities of the
ZMM as defined by the National Urban System (Sistema Urbano Nacional). Adds the
`NOM_MUN` column.

**Those 18 municipalities are exactly the only ones from Nuevo León in ATUS**:
the survey's state coverage matches the metropolitan area, so filtering by
`EDO == 19` gives the same result. `geostats.zonas` keeps the explicit list
anyway, and fails if any municipality of the area is missing from the data, so
the subset does not depend on that coincidence.

Advantage over the national dataset: **the panel is balanced**, all 18
municipalities are present in all six years. ZMM time series are comparable
across years, which is not true nationally (coverage goes from 91 to 198
municipalities).

### Cleaning

```bash
uv run limpiar-atus          # data/processed/atus_zmm_limpio.parquet (12 MB)
uv run limpiar-atus --geo    # also the GeoParquet (15 MB)
```

Adds 20 derived columns to the 51 of the subset, and **never drops rows or
imputes**. This is not a matter of style: missingness in this dataset is MNAR —
in fatal accidents the breathalyzer result is unknown 2.4 times more often than
in property-damage-only ones — so `dropna()` biases against severe accidents,
and imputing under a MAR assumption silently introduces bias. If this stage
cannot drop or impute, neither can happen by accident further down the line.

Convention: **UPPERCASE** is what came from INEGI and is left untouched,
sentinel codes included; **lowercase** is what this repo builds. That way, in
any `groupby`, you can tell at a glance where the data comes from.

`validar()` checks 21 invariants and fails with the full list of those that
break; `diagnostico()` prints the twelve figures that change how the analysis
reads. The detail of each column is in [`docs/limpieza.md`](docs/limpieza.md).

> Coordinates come with **up to eight decimal places**, not six as the data
> dictionary's example suggests. Formatting them to six silently merges 8,115
> distinct points, so `id_punto` does not use a fixed format, and an invariant
> checks it on every run.

### Why the shapefiles are not consolidated

The `.shp` files hold the same records as the CSVs. `--verificar` checks it year
by year: all 1,317,810 rows match on the key `(ANIO, EDO, MPIO, ID)`, with no
leftovers on either side, and the shapefile geometry is **identical** to the
`LONGITUD`/`LATITUD` columns (maximum offset: 0.0 degrees across all six years).

That is why `--geo` builds the geometry from those columns instead of re-reading
5 GB of shapefiles: the result is the same, point by point. Watch out: in
2019-2023 the row order differs between `.shp` and CSV, so comparing them by
position gives meaningless results — they must be joined on the key.

## Visual identity in charts

Charts follow the GeoStats brand manual, but the brand colors were designed for
print and not all of them work as data marks on a light background. They were
validated before use (OKLCH lightness band 0.43–0.77, chroma floor 0.10,
separation under color-blindness simulation, WCAG contrast):

| Brand color | Use in charts | Result |
|---|---|---|
| Prussian Blue `#003153` | data | **Fails**: L=0.304 (band 0.43–0.77) and chroma 0.078 (floor 0.10, reads as gray). The 246° hue is kept and L is raised to 0.45 → `#005991` |
| Deep Red `#8B2C1A` | titles, emphasis | Passes unchanged (L=0.434, chroma 0.133) |
| Rust Red `#B15E2E` | warm accent | Passes unchanged (L=0.571, chroma 0.124) |
| Graphite Gray `#2C2C2C` | text, axes | Chroma 0 — right for text, never as a series |
| Light Gray `#F2F2F2` | gridlines, backgrounds | — |

**The two reds are never used as adjacent series:** they are ΔE 14.1 apart
against a floor of 15, so a reader with full color vision cannot tell them
apart well side by side.

Since the brand provides only one data hue, charts with more than two series use
**small multiples** (one series per panel) or the Prussian Blue **ordinal
ramp** `#005991 → #1b77b8 → #4195d9` when the dimension is ordered, instead of
inventing colors outside the manual.

Typefaces: Montserrat (titles), Cormorant Garamond (body), Roboto Mono
(figures). They are not installed on the system, so matplotlib uses fallbacks.
For exact rendering:

```bash
brew install --cask font-montserrat font-cormorant-garamond font-roboto-mono
```

## Notes on the data

The meaning of each field, its code lists and its sentinel values are in
[`docs/diccionario_de_datos.md`](docs/diccionario_de_datos.md) (in Spanish),
which consolidates INEGI's three data dictionaries and checks them against the
data.

Three non-obvious things that break the analysis if ignored:

**Encoding: CP1252 with a fallback, not whatever `chardet` says.** On these
files chardet reports `CP874`/`TIS-620` with confidence `0.00`, because barely
~1 in 250 bytes is non-ASCII. INEGI's `.cpg` declares CP1252 and it is right: in
the `0x80-0x9F` range CP1252 maps dashes and typographic quotes that `latin-1`
turns into control characters (719 characters misread, silently). But 740 bytes
in the source fall into the five gaps CP1252 leaves undefined. `consolidar`
registers an error handler that reads those five bytes with latin-1 semantics:
correct text and zero bytes lost (no U+FFFD).

**`ID` is not a unique key.** In 2019-2020 it is a sequential number *per
municipality* and repeats 268,920 times; from 2021 on it is a composite
identifier. The real key is `(ANIO, EDO, MPIO, ID)`. `consolidar` validates it
and fails if it does not hold.

**Coverage grows: the panel is unbalanced.** From 91 municipalities in 2019 to
198 in 2024. The +52% jump in accidents between 2020 and 2021 is largely *more
municipalities being measured*, not more accidents. Any time series has to be
normalized (rate per municipality, or restricted to the balanced panel).

`consolidar` adds `CVE_MUN` (2-digit state + 3-digit municipality code), which
is the key for joining with INEGI's geostatistical framework.
