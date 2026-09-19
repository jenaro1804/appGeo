"""Cifras de referencia para las pruebas de `app/src/modelo.ts`.

Calcula con numpy, desde los mismos archivos que lee la app, lo que la app
debe reproducir. Es una segunda implementación, independiente de la de
TypeScript: si las dos coinciden, la aritmética está bien.

Solo cubre lo determinista (sin innovaciones ni ruido de conteo, que en la app
dependen de su generador con semilla). `npm test` lo corre antes de vitest.
"""

import json
from pathlib import Path

import numpy as np

from geostats import rutas

d = rutas.APP_DATOS
meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
celdas = json.loads((d / "celdas.json").read_text(encoding="utf-8"))

S = meta["n_draws"]
u = np.fromfile(d / "posterior.bin", dtype=np.float32).reshape(meta["n_hex"], S).astype(float)
m = np.array(meta["m"])  # (mun, año, S)
b0 = np.array(meta["b0"])
j = np.array(celdas["municipio"])


def esperado(nivel: np.ndarray) -> float:
    """Mediana sobre muestras de Σ μ, con `nivel` de forma (mun, S)."""
    return float(np.median(np.exp(b0[None, :] + nivel[j] + u).sum(axis=0)))


ref = {f"esperado_{a}": esperado(m[:, a - 2019, :]) for a in (2019, 2021, 2024)}

# Persistencia: 2025 = nivel de 2024. Con el escenario, Guadalupe al de 2021.
g = meta["municipios"].index("Guadalupe")
nivel = m[:, 5, :].copy()
nivel[g] = m[g, 2021 - 2019, :]
ref["guadalupe_2021_en_2025"] = esperado(nivel)

celdas_prueba = [0, 100, 500, 1000, 2000]
uc = u - u.mean(axis=0, keepdims=True)
ref["neto"] = {str(i): float(np.median(np.exp(uc[i]))) for i in celdas_prueba}
ref["mediana_2024"] = {
    str(i): float(np.median(np.exp(b0 + m[j[i], 5] + u[i]))) for i in celdas_prueba
}
ref["observado_2024"] = int(np.array(celdas["conteos"])[:, 5].sum())

salida = Path(__file__).with_name("referencia.json")
salida.write_text(json.dumps(ref, indent=2), encoding="utf-8")
print(f"Referencia en {salida.name}: esperado 2024 = {ref['esperado_2024']:,.0f}")
