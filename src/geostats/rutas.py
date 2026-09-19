"""Rutas del proyecto, resueltas desde la ubicación del paquete.

Todo lo demás importa de aquí en vez de escribir rutas relativas. Así un
notebook en `notebooks/` y un script corrido desde la raíz ven los mismos
archivos, sin depender del directorio de trabajo.

Convención de `data/`:
    raw/        descargas del INEGI tal cual llegaron; nunca se escriben.
    processed/  todo lo que genera este repo; borrable y regenerable.
"""

from __future__ import annotations

from pathlib import Path

# src/geostats/rutas.py -> src/geostats -> src -> raíz del repo
RAIZ = Path(__file__).resolve().parents[2]

DATOS = RAIZ / "data"
CRUDOS = DATOS / "raw"
PROCESADOS = DATOS / "processed"
NOTEBOOKS = RAIZ / "notebooks"

# Serie anual 1997-2025 (sin coordenadas) y el volcado abierto de RATIV.
ATUS_ANUAL = CRUDOS / "ATUS_anual_csv" / "conjunto_de_datos"
RATIV = CRUDOS / "rativ_abierto_22-26.csv"

ATUS_GEORREFERENCIADO = PROCESADOS / "atus_georreferenciado.parquet"
# Mismos registros, con geometría de puntos y CRS embebidos (GeoParquet).
ATUS_GEOPARQUET = PROCESADOS / "atus_georreferenciado_geo.parquet"

# Recorte a la Zona Metropolitana de Monterrey (ver geostats.zonas).
ATUS_ZMM = PROCESADOS / "atus_zmm.parquet"
ATUS_ZMM_GEO = PROCESADOS / "atus_zmm_geo.parquet"

# Salida de geostats.limpieza: las mismas filas del recorte, más las columnas
# derivadas. La limpieza nunca borra filas ni imputa, solo agrega.
ATUS_ZMM_LIMPIO = PROCESADOS / "atus_zmm_limpio.parquet"
ATUS_ZMM_LIMPIO_GEO = PROCESADOS / "atus_zmm_limpio_geo.parquet"

# Salida de geostats.modelo: el posterior del modelo jerárquico en el formato
# que consume la app web (ver docs/app_web.md).
APP_DATOS = PROCESADOS / "app"


def procesado(nombre: str) -> Path:
    """Ruta a un archivo derivado, creando `data/processed/` si hace falta."""
    PROCESADOS.mkdir(parents=True, exist_ok=True)
    return PROCESADOS / nombre
