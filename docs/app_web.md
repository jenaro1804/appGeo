# App web del modelo jerárquico — plan y estado

Documento de continuidad: qué se está construyendo, qué decisiones ya se
tomaron y por qué, y qué falta. Escrito para que otra sesión pueda retomar sin
contexto previo.

Última actualización: 2026-09-18.

## Qué se quiere

Una página web que muestre el mapa de riesgo del modelo jerárquico
(`notebooks/modelo_jerarquico.qmd`) y permita mover parámetros para ver cómo
cambia.

**Escenario de uso, que manda todo el diseño:** el autor la proyecta desde su
laptop frente a un público. Él mueve los controles; el público solo mira. La
dinámica prevista es preguntar *«¿qué creen que pase si…?»*, dejar que
especulen, y entonces mover el parámetro para revelar la respuesta.

De ahí se derivan las restricciones:

- **Legibilidad de proyector, no de celular.** Se lee desde la última fila:
  tipografía grande, trazos gruesos, mucho contraste, pocos elementos por
  pantalla.
- **El operador es experto.** No hace falta proteger la interfaz de un
  desconocido con prisa; los controles pueden ser densos en información.
- **El momento de revelar es el producto.** La transición entre estados tiene
  que verse (animación corta, no salto), y debe existir un antes/después para
  que la comparación no dependa de la memoria del público.
- **Escenarios como botones y atajos de teclado**, no solo sliders: hay que
  poder llegar al estado exacto de un clic mientras se habla, sin cazar un
  valor con el mouse.
- No hay QR ni público con teléfonos. Esa idea se descartó.

## Decisiones tomadas

**La app no ajusta el modelo.** Ajustarlo toma decenas de minutos de MCMC. Se
ajusta una vez fuera de línea, se exporta el posterior, y la app hace
aritmética sobre esas muestras. Eso la vuelve una página estática: sin backend,
sin Python en producción.

**Ajuste con los seis años (2019-2024), no con la partición del notebook.** El
notebook entrena con 2019-2023 y reserva 2024 para validar; esa pregunta ya se
contestó (calibró el total de 2024 al 1 %, ganó en CRPS al *baseline*). Para la
app conviene usar todo, porque 2024 es el punto de arranque de las proyecciones.
**Costo:** este ajuste no se puede validar contra nada; su credibilidad viene
prestada del notebook. Si alguien pregunta «¿cómo saben que funciona?», la
respuesta apunta al notebook, no a la app.

**Siempre medianas y percentiles, nunca promedios.** No es preferencia
estética. El nivel municipal usa innovaciones *t* de Student, y
$E[e^{T}] = \infty$: la media predictiva literalmente no existe hacia el
futuro. Si la app calcula promedios da números absurdos que cambian con la
semilla. Esta regla es la que más fácil se rompe por descuido.

**Los hexágonos no se envían como geometría.** Son regulares, así que basta el
centro de cada uno y el lado (500 m) y se dibujan en el cliente.

## El contrato de datos

Lo produce `src/geostats/modelo.py` (`uv run exportar-app`), en
`data/processed/app/`. Tres archivos:

| Archivo | Contenido |
|---|---|
| `celdas.json` | `lon[]`, `lat[]` (centro de cada hexágono), `municipio[]` (índice), `conteos[][]` (2241 × 6 observados) |
| `posterior.bin` | `float32` crudo, orden C: `u[n_hex][S]` — el perfil espacial de cada celda, por muestra |
| `meta.json` | `n_hex`, `n_mun`, `n_draws`, `anios`, `lado_m`, `municipios[]`, `m[n_mun][n_anios][S]`, `b0[S]`, `s_rw[S]`, `theta[S]`, `hiper`, `divergencias` |

Dimensiones reales: 2,241 celdas, 18 municipios, 6 años, S = 250 muestras.
`posterior.bin` pesa ~2.2 MB.

**Cómo se calcula una predicción** (todo por muestra `s`, luego se toman
percentiles sobre `s`):

```
log mu[i,s] = b0[s] + m[j(i), año, s] + u[i,s]
conteo ~ BinomialNegativa(mu, theta[s])
```

- **Escenario municipal.** Cambiar el régimen del municipio `j` es sumar un
  desplazamiento `delta[j,s]` a `m`. Para «que reporte como en 2021»:
  `delta[j,s] = m[j, 2021, s] - m[j, 2024, s]`. Se calcula por muestra, no
  sobre las medianas.
- **Proyección a 2025-2027.** `m[j, 2024+k, s] = m[j, 2024, s] + suma de k
  innovaciones`, cada una `t_3 * s_rw[s]`. Es lo que ensancha el intervalo
  conforme se aleja el año. Persistir (`k` innovaciones = 0) es el escenario
  conservador y es el que el notebook usa para validar.
- **El mapa «neto»** es `u[i]` directo: el riesgo de la celda descontado cuánto
  reporta su municipio. Es el producto conceptual del proyecto.

## Diseño propuesto de la interfaz

Vista principal: mapa de la ZMM en hexágonos, con estos controles.

1. **Interruptor crudo / neto.** El gancho principal. El mapa crudo muestra
   dónde se *reportan* accidentes; el neto, dónde de verdad ocurren descontando
   el régimen de captura del municipio. Es la tesis del proyecto en un gesto.
2. **Slider «top N % del territorio»**, con una frase que se actualiza en vivo
   («el 5 % del territorio concentra el 43 % de los accidentes»). Número corto
   y memorable.
3. **Selector de año, 2019-2027**, con el intervalo ensanchándose visiblemente
   al proyectar. Que el modelo se vuelva más humilde a lo lejos es un activo
   frente a público, no un defecto que esconder.
4. **Escenarios por municipio:** elegir municipio y desplazar su nivel de
   reporte, más presets («Guadalupe vuelve a 2021», «Santa Catarina a su
   régimen viejo»).

Identidad visual: la del repo (ver README). Azul `#005991` para datos, rampa
ordinal `#005991 → #1b77b8 → #4195d9`, rojo `#8B2C1A` solo títulos y énfasis,
grafito `#2C2C2C` texto, `#F2F2F2` rejilla.

Técnica sugerida: **canvas**, no SVG — son 2,241 hexágonos que deben animar sin
tirones.

## Estado actual

Hecho:

- Entorno levantado (`uv sync`); PyMC 6.3.2 y geopandas 1.1.4 importan.
- `uv run limpiar-atus --geo` corrido. Las 21 invariantes pasan y el
  diagnóstico coincide con lo documentado (379,294 filas, 72.3 % comparte
  coordenada, 3 de precisión baja).
- `geostats.modelo` escrito y registrado como `uv run exportar-app`. El panel
  reproduce el del notebook: 2,241 celdas, 0 islas, 18 municipios, 13,446
  celda-año, media 28.2, 23.9 % ceros.
- **Costo medido del ajuste: 7.5 minutos** con 4 cadenas × (1,000 + 1,000) en
  la máquina del autor. No son horas.

- Primera corrida completa (4 × (1,000 + 1,000), 8.8 min): 0 divergencias
  e hiperparámetros iguales a los del notebook (α 0.844 vs 0.848, σ_rw 0.29
  vs 0.29, θ 12.1 vs 12.2). Mezcló peor que el notebook en σ_m (R̂ 1.43 vs
  1.17) y σ_rw (1.13 vs 1.03). σ_rw importa: la app lo usa para proyectar.
- El script ahora calcula R̂ y ESS de **log μ** antes de aplanar las cadenas
  (después ya no se puede) y lo guarda en `meta.json` como
  `convergencia_log_mu`. Es el diagnóstico que manda, igual que en el notebook
  §4: b0 y σ_m mezclan mal por construcción y no se leen solos.

- **Corrida vigente** (`uv run exportar-app --tune 2000`, 10.5 min): 0
  divergencias, **log μ con R̂ máximo 1.009 y ESS mínimo 848** sobre 13,446
  celda-año. σ_rw mejoró a R̂ 1.05. b0 (1.19) y σ_m (1.24) siguen mal, como en
  el notebook: no se leen solos. Este es el posterior que usa la app.

Falta:

- Construir la app.
- Decidir si `data/processed/app/` se versiona. `posterior.bin` es binario: el
  README ya argumenta por qué los artefactos regenerables se quedan fuera del
  control de versiones, y este se regenera en 7.5 minutos.

## Historial de tropiezos, para no repetirlos

Dos corridas se perdieron por asumir APIs en vez de verificarlas. El proyecto
usa **ArviZ 1.3.0**, la versión nueva, donde:

- `InferenceData` ya no existe: el objeto que devuelve `pm.sample` es un
  `DataTree` de xarray. No tiene `.stack()`.
- `az.to_netcdf` no existe como función del módulo.
- `az.extract` recibe `random_seed`, **no** `rng`.
- `idata.sample_stats.diverging` sí funciona por atributo.
- `az.summary` devuelve columnas `mean, sd, eti89_lb, eti89_ub, ess_bulk,
  ess_tail, r_hat, mcse_mean, mcse_sd`.
- No hay backend de netCDF instalado (ni `netCDF4` ni `h5netcdf`), así que el
  caché va en `.npz` de numpy. No agregar dependencias solo para esto.

De ahí la etapa 1 / etapa 2 del script: el muestreo es lo único caro y se
persiste antes de tocar nada de formato.

## Notas técnicas de la máquina

- Windows, Python 3.14, sin `g++`. PyTensor avisa, pero nutpie trae su propio
  compilador y muestrea bien. El aviso se puede ignorar.
- Costo observado: ~2 CPU-segundos por iteración-cadena en la prueba de humo
  (con calentamiento corto, que es el caso más caro).
- La rejilla tiene **120 componentes desconectados** además de 0 islas. No es
  un problema: el CAR del modelo es *propio* y está bien definido sobre un
  grafo desconectado. Solo implica que las celdas periféricas aisladas toman
  menos prestado de sus vecinas. Es una propiedad preexistente del notebook.

## Lo que la app no debe afirmar

Son los límites del modelo, y salen en cada notebook de la serie:

- **Es un modelo de reportes, no de siniestralidad.** Un municipio que deja de
  capturar accidentes aparece como un municipio donde bajó el riesgo. El modelo
  no distingue las dos cosas.
- **Los intervalos son un piso de la incertidumbre real**, porque el pronóstico
  es condicional a que ningún municipio cambie de régimen.
- **El modelo no mejora el *dónde*.** El PAI se queda en 8.4 en los tres
  notebooks: elegir el 5 % del territorio por puro historial ya captura el 42 %
  de los accidentes del año siguiente, y ninguna especificación lo mueve. Lo
  que el modelo aporta es *cuánto* y *con qué certeza*, más el mapa neto. Para
  mover el *dónde* hacen falta covariables externas (kilómetros de vialidad por
  celda como *offset*, población por AGEB).

## Pendientes de higiene

- El README y `CLAUDE.md` están desfasados entre sí: el primero no menciona
  `espacial.py` ni los tres notebooks nuevos, el segundo no menciona
  `limpieza.py` ni `limpiar-atus`. Ninguno menciona todavía `modelo.py` ni
  `exportar-app`.
