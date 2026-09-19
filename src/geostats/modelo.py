"""Ajusta el modelo jerárquico espacial y exporta su posterior para la app web.

Es la especificación de `notebooks/modelo_jerarquico.qmd` §2 —Binomial
Negativa, régimen municipal como caminata aleatoria con innovaciones *t*, y
CAR propio por celda— pero ajustada sobre **los seis años (2019-2024)** en vez
de reservar 2024 para validar. La validación ya ocurrió en el notebook; para la
app conviene usar todo, porque 2024 es el punto de arranque de las
proyecciones. El costo está anotado en `docs/app_web.md`: este ajuste no se
puede validar contra nada, su credibilidad viene prestada del notebook.

El trabajo va en dos etapas y se puede reanudar entre ellas, porque el
muestreo es lo único caro:

    1. muestrear  ->  posterior.npz   (minutos de MCMC)
    2. escribir   ->  celdas.json, posterior.bin, meta.json, contornos.json   (segundos)

Si la escritura falla, `--reusar` rehace solo la etapa 2 y el muestreo no se
vuelve a pagar. Nunca se pierde una corrida por un error de formato.

Uso:
    uv run exportar-app              # ajusta y exporta
    uv run exportar-app --reusar     # solo reexporta, desde el .npz
    uv run exportar-app --draws 200 --tune 200 --chains 2   # prueba rápida
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from geostats import espacial, rutas

SEMILLA = 42
ANIOS = list(range(2019, 2025))
LADO = 500

# Cuántas muestras del posterior se le entregan a la app. La app solo calcula
# medianas y percentiles, y 250 bastan para eso; el archivo pesa ~2 MB. Subirlo
# no mejora el mapa y sí la descarga.
DRAWS_EXPORTADOS = 250

HIPER = ["b0", "s_m", "s_rw", "alpha", "s_u", "theta"]


def panel() -> tuple:
    """Rejilla hexagonal, panel celda x año y matriz de adyacencia.

    Reproduce la partición de `analisis_espacial.qmd` a través de
    `espacial.celdas`, que es la que comparten análisis y modelo.
    """
    import geopandas as gpd
    from libpysal import weights

    g = gpd.read_parquet(rutas.ATUS_ZMM_LIMPIO_GEO).to_crs(espacial.UTM_ZMM)
    H, W = espacial.celdas(g, lado=LADO)
    print(f"{len(g):,} accidentes -> {len(H):,} celdas, {len(W.islands)} islas",
          flush=True)

    union = gpd.sjoin(
        g[["geometry", "ANIO", "NOM_MUN"]], H[["hex", "geometry"]],
        predicate="within", how="inner",
    )
    indice = pd.MultiIndex.from_product([H.hex, ANIOS], names=["hex", "anio"])
    p = (
        union.groupby(["hex", "ANIO"]).size()
        .reindex(indice, fill_value=0).rename("y").reset_index()
    )

    # El municipio de una celda es el modal entre sus accidentes: una celda
    # puede cruzar un límite municipal, pero el régimen de reporte que la
    # explica es el de quien levanta la mayoría de sus actas.
    municipio = union.groupby("hex").NOM_MUN.agg(lambda s: s.mode().iloc[0])
    p["municipio"] = p.hex.map(municipio)

    municipios = sorted(municipio.unique())
    hex_a_i = {h: i for i, h in enumerate(H.hex)}
    mun_a_j = {m: j for j, m in enumerate(municipios)}
    p["i"] = p.hex.map(hex_a_i)
    p["j"] = p.municipio.map(mun_a_j)
    p["a"] = p.anio - ANIOS[0]

    # La adyacencia del CAR va binaria, no estandarizada por fila: `pm.CAR`
    # construye D - alpha*A y necesita A simétrica.
    Wb = weights.W(W.neighbors)
    Wb.transform = "b"
    A = Wb.full()[0]
    assert (A == A.T).all(), "la adyacencia debe ser simétrica"

    return H, p, municipios, A


def construir(p: pd.DataFrame, n_hex: int, n_mun: int, A: np.ndarray):
    """El modelo de `modelo_jerarquico.qmd` §4, sobre los seis años."""
    import pymc as pm

    n_anios = len(ANIOS)
    with pm.Model() as modelo:
        b0 = pm.Normal("b0", np.log(p.y.mean() + 1), 2)

        s_m = pm.HalfNormal("s_m", 1.5)
        s_rw = pm.HalfNormal("s_rw", 0.5)
        # La suma cero en el nivel inicial identifica b0: sin ella, subir todos
        # los municipios y bajar b0 da la misma verosimilitud.
        z0 = pm.ZeroSumNormal("z0", sigma=1, shape=n_mun)
        # Innovaciones t_3 y no normales: la mayoría de los municipios se mueve
        # poco de un año a otro y unos pocos saltan un orden de magnitud.
        eps = pm.StudentT("eps", nu=3, mu=0, sigma=1, shape=(n_mun, n_anios - 1))
        m0 = (s_m * z0)[:, None]
        m = pm.Deterministic(
            "m",
            pm.math.concatenate([m0, m0 + pm.math.cumsum(s_rw * eps, axis=1)], axis=1),
        )

        alpha = pm.Beta("alpha", 2, 1)
        s_u = pm.HalfNormal("s_u", 1.5)
        u = pm.CAR("u", mu=np.zeros(n_hex), W=A, alpha=alpha, tau=1 / s_u**2,
                   shape=n_hex)

        theta = pm.Gamma("theta", 2, 0.1)
        log_mu = b0 + m[p.j.values, p.a.values] + u[p.i.values]
        pm.NegativeBinomial("y", mu=pm.math.exp(log_mu), alpha=theta,
                            observed=p.y.values)
    return modelo


def convergencia_log_mu(idata, p: pd.DataFrame) -> dict:
    """R̂ y ESS de log mu, la cantidad que la app calcula en cada celda-año.

    Es el diagnóstico que manda (`modelo_jerarquico.qmd` §4): b0 y s_m mezclan
    mal por construcción, porque compiten con el nivel medio de u, pero su suma
    con m y u sí está identificada. Se calcula aquí porque el `.npz` aplana las
    cadenas y después ya no se puede.
    """
    import arviz as az
    import xarray as xr

    post = idata.posterior
    b0 = post.b0.values                                   # (cadena, draw)
    m = post.m.values                                     # (cadena, draw, mun, año)
    u = post.u.values                                     # (cadena, draw, hex)
    log_mu = (b0[..., None] + m[:, :, p.j.values, p.a.values]
              + u[:, :, p.i.values]).astype(np.float32)
    ds = xr.Dataset({"log_mu": (("chain", "draw", "obs"), log_mu)})
    return {"r_hat_max": float(az.rhat(ds).log_mu.max()),
            "ess_min": float(az.ess(ds).log_mu.min()),
            "n": int(log_mu.shape[-1])}


def muestrear(modelo, p: pd.DataFrame, draws: int, tune: int, chains: int,
              cache: Path) -> dict:
    """Muestrea y deja en `cache` solo los arreglos que la app necesita.

    No se guarda el objeto completo de ArviZ: exigiría netCDF o zarr, que no
    están instalados, y la app no usa ni una décima parte de lo que contiene.
    Un `.npz` de numpy no añade dependencias y pesa mucho menos.
    """
    import arviz as az
    import pymc as pm

    inicio = time.time()
    idata = pm.sample(draws=draws, tune=tune, chains=chains,
                      nuts_sampler="nutpie", random_seed=SEMILLA,
                      progressbar=False, model=modelo)
    print(f"Muestreo en {(time.time() - inicio) / 60:.1f} min", flush=True)
    conv = convergencia_log_mu(idata, p)

    # `az.extract` aplana cadena y draw en una dimensión `sample` y submuestrea
    # de forma consistente entre variables: el draw 7 de `u` es el mismo draw
    # que el 7 de `m`. Eso importa, porque la app los combina por draw.
    post = az.extract(idata, num_samples=DRAWS_EXPORTADOS, random_seed=SEMILLA)
    resumen = az.summary(idata, var_names=HIPER)

    datos = {
        "u": post.u.values.astype(np.float32),        # (n_hex, S)
        "m": post.m.values.astype(np.float32),        # (n_mun, n_anios, S)
        "b0": post.b0.values.astype(np.float32),      # (S,)
        "s_rw": post.s_rw.values.astype(np.float32),
        "theta": post.theta.values.astype(np.float32),
        "hiper": json.dumps({
            k: {"media": float(v["mean"]), "sd": float(v["sd"]),
                "r_hat": float(v["r_hat"]), "ess_bulk": float(v["ess_bulk"])}
            for k, v in resumen.iterrows()
        }),
        "divergencias": int(idata.sample_stats.diverging.sum()),
        "log_mu": json.dumps(conv),
    }

    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, **datos)
    print(f"Posterior en {cache.name} "
          f"({cache.stat().st_size / 1024**2:.0f} MB)", flush=True)
    print(resumen[["mean", "sd", "ess_bulk", "r_hat"]].round(3).to_string())
    print(f"log mu: R̂ máximo {conv['r_hat_max']:.3f}, ESS mínimo "
          f"{conv['ess_min']:,.0f} (sobre {conv['n']:,} celda-año)", flush=True)
    return datos


def leer_cache(cache: Path) -> dict:
    """Relee el `.npz` de la etapa 1."""
    z = np.load(cache)
    return {
        "u": z["u"], "m": z["m"], "b0": z["b0"], "s_rw": z["s_rw"],
        "theta": z["theta"], "hiper": str(z["hiper"]),
        "divergencias": int(z["divergencias"]),
        # Los .npz anteriores a este diagnóstico no lo traen.
        "log_mu": str(z["log_mu"]) if "log_mu" in z else "null",
    }


def contornos(H, mun_por_hex: np.ndarray) -> dict:
    """Contorno de cada municipio como la unión de sus celdas, en UTM (metros).

    No se usa el marco geoestadístico del INEGI: no está en `data/raw/`, y la
    unión de celdas dibuja exactamente el territorio que el modelo ve. Las
    aristas compartidas de dos hexágonos no coinciden al último decimal, y la
    unión directa deja cientos de huecos falsos; el buffer de ida y vuelta de
    1 m los cierra y conserva los reales (celdas vacías, enclaves).
    """
    import geopandas as gpd

    g = gpd.GeoDataFrame({"j": mun_por_hex}, geometry=H.geometry.buffer(1).values,
                         crs=H.crs).dissolve("j")
    g["geometry"] = g.buffer(-1).simplify(5)

    def anillo(r) -> list:
        return [[round(x), round(y)] for x, y in r.coords]

    return {"municipios": [
        {"j": int(j), "anillos": [
            anillo(r)
            for parte in (geom.geoms if hasattr(geom, "geoms") else [geom])
            for r in [parte.exterior, *parte.interiors]
        ]}
        for j, geom in g.geometry.items()
    ]}


def escribir(datos: dict, H, p: pd.DataFrame, municipios: list[str],
             salida: Path) -> None:
    """Etapa 2: los archivos que lee la app. Ver docs/app_web.md."""
    n_hex, n_mun, n_anios = len(H), len(municipios), len(ANIOS)
    S = datos["b0"].shape[0]

    # Si ArviZ cambiara el orden de las dimensiones, esto falla aquí y no
    # produce un mapa silenciosamente equivocado.
    assert datos["u"].shape == (n_hex, S), f"u: {datos['u'].shape}"
    assert datos["m"].shape == (n_mun, n_anios, S), f"m: {datos['m'].shape}"

    salida.mkdir(parents=True, exist_ok=True)
    datos["u"].tofile(salida / "posterior.bin")

    # Los hexágonos son regulares: con el centro y el lado se reconstruyen en
    # el cliente, así que no hace falta enviar geometría. Son regulares en UTM,
    # no en grados, por eso la app dibuja con `x`/`y`; `lon`/`lat` quedan como
    # referencia.
    centros_utm = H.geometry.centroid
    centros = centros_utm.to_crs(4326)
    conteos = p.pivot(index="hex", columns="anio", values="y").reindex(H.hex).values
    mun_por_hex = p.groupby("hex").j.first().reindex(H.hex).values

    (salida / "celdas.json").write_text(json.dumps({
        "x": [round(float(v), 1) for v in centros_utm.x],
        "y": [round(float(v), 1) for v in centros_utm.y],
        "lon": [round(float(v), 5) for v in centros.x],
        "lat": [round(float(v), 5) for v in centros.y],
        "municipio": [int(v) for v in mun_por_hex],
        "conteos": [[int(c) for c in fila] for fila in conteos],
    }), encoding="utf-8")

    (salida / "contornos.json").write_text(json.dumps(
        contornos(H, mun_por_hex)), encoding="utf-8")

    (salida / "meta.json").write_text(json.dumps({
        "n_hex": n_hex, "n_mun": n_mun, "n_draws": S,
        "anios": ANIOS, "lado_m": LADO, "municipios": municipios,
        "m": datos["m"].tolist(),
        "b0": datos["b0"].tolist(),
        "s_rw": datos["s_rw"].tolist(),
        "theta": datos["theta"].tolist(),
        "hiper": json.loads(datos["hiper"]),
        "divergencias": datos["divergencias"],
        "convergencia_log_mu": json.loads(datos["log_mu"]),
    }), encoding="utf-8")

    print()
    for nombre in ("posterior.bin", "celdas.json", "meta.json", "contornos.json"):
        mb = (salida / nombre).stat().st_size / 1024**2
        ruta = salida / nombre
        if ruta.is_relative_to(rutas.RAIZ):
            ruta = ruta.relative_to(rutas.RAIZ)
        print(f"  {ruta}  {mb:.1f} MB")
    print(f"\n{n_hex:,} celdas x {S} muestras | {n_mun} municipios | "
          f"divergencias: {datos['divergencias']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--draws", type=int, default=1000)
    parser.add_argument("--tune", type=int, default=1000)
    parser.add_argument("--chains", type=int, default=4)
    parser.add_argument("--salida", type=Path, default=rutas.APP_DATOS)
    parser.add_argument(
        "--reusar", action="store_true",
        help="salta el muestreo y reexporta desde el posterior.npz guardado",
    )
    argumentos = parser.parse_args()

    H, p, municipios, A = panel()
    print(f"Panel: {len(p):,} celda-año | {len(municipios)} municipios | "
          f"media {p.y.mean():.1f}, ceros {(p.y == 0).mean():.1%}", flush=True)

    cache = argumentos.salida / "posterior.npz"
    if argumentos.reusar:
        datos = leer_cache(cache)
        print(f"Posterior releído de {cache.name}", flush=True)
    else:
        modelo = construir(p, len(H), len(municipios), A)
        datos = muestrear(modelo, p, argumentos.draws, argumentos.tune,
                          argumentos.chains, cache)

    escribir(datos, H, p, municipios, argumentos.salida)


if __name__ == "__main__":
    main()
