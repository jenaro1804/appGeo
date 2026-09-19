# App web del modelo jerárquico — plan y estado

Documento de continuidad: qué se está construyendo, qué decisiones ya se
tomaron y por qué, y qué falta. Escrito para que otra sesión pueda retomar sin
contexto previo.

Última actualización: 2026-09-18 (noche).

**Dónde quedó:** la app funciona en Next.js (`app/`) con el diseño provisional
de la primera versión. **Al autor no le gustó el diseño**; la siguiente sesión
empieza por el rediseño (él trae *skills* de diseño) y por las decisiones de
[«Pendientes»](#pendientes-para-la-siguiente-sesión). Nada de `app/` está en
un commit todavía.

## Qué se quiere

Una página web que muestre el mapa de riesgo del modelo jerárquico
(`notebooks/modelo_jerarquico.qmd`) y permita mover parámetros para ver cómo
cambia.

**Escenario de uso principal:** el autor la proyecta desde su laptop frente a
un público. Él mueve los controles; el público solo mira. La dinámica prevista
es preguntar *«¿qué creen que pase si…?»*, dejar que especulen, y entonces
mover el parámetro para revelar la respuesta.

**Escenario secundario (nuevo):** publicarla en internet (Vercel) para que la
gente la use por su cuenta, «como algo sofisticado». No es parte del alcance
del proyecto, pero se decidió hacerlo.

De ahí se derivan las restricciones:

- **Legibilidad de proyector.** Se lee desde la última fila: tipografía
  grande, trazos gruesos, mucho contraste, pocos elementos por pantalla. Si
  además debe verse en celular está **pendiente de decidir**.
- **El operador es experto.** No hace falta proteger la interfaz de un
  desconocido con prisa; los controles pueden ser densos en información.
- **El momento de revelar es el producto.** La transición entre estados tiene
  que verse (animación corta, no salto), y debe existir un antes/después para
  que la comparación no dependa de la memoria del público.
- **Escenarios como botones y atajos de teclado**, no solo sliders: hay que
  poder llegar al estado exacto de un clic mientras se habla.

## Decisiones tomadas

**La app no ajusta el modelo.** Ajustarlo toma minutos de MCMC. Se ajusta una
vez fuera de línea, se exporta el posterior, y la app hace aritmética sobre esas
muestras en el navegador. No hay Python en producción.

**Stack: Next.js 16 (App Router) + TypeScript.** Primero se hizo con Vite y un
HTML de un solo archivo que funcionaba sin servidor; el autor prefirió Next.js
(lo usa en otro proyecto) y aceptó a cambio que la app necesite un servidor
(`npm start`) o un deploy. La página se prerenderiza estática y todo el cálculo
ocurre en el cliente. El mapa es un `<canvas>` (2,241 hexágonos animados) y la
serie un SVG, ambos como clases imperativas envueltas en React.

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
semilla. Esta regla es la que más fácil se rompe por descuido; hay una prueba
que la vigila.

**200 trayectorias de innovación por muestra.** Con una sola por muestra (250
escenarios), el p95 del total de 2027 variaba de 172 a 321 mil según la
semilla: las colas de la *t₃* quedaban mal muestreadas. Con 200 (50,000
escenarios) queda en 221-225 mil con cualquier semilla, y hay una prueba que lo
vigila. Es barato porque el total se agrega por municipio: Σμ = Σⱼ e^{nivel_j}
· Σ_{i∈j} e^{b0+u_i}. Los mapas por celda usan solo 4 trayectorias (la mediana
es robusta a las colas).

**Semilla fija (42).** El ensayo y la presentación muestran exactamente las
mismas cifras.

**Los hexágonos no se envían como geometría.** Son regulares, así que basta el
centro de cada uno y el lado (500 m) y se dibujan en el cliente.

## El contrato de datos

Lo produce `src/geostats/modelo.py` (`uv run exportar-app`), en
`data/processed/app/`. Cuatro archivos:

| Archivo | Contenido |
|---|---|
| `celdas.json` | `x[]`, `y[]` (centro de cada hexágono en UTM 14N, metros: con eso se dibuja), `lon[]`, `lat[]` (el mismo centro en grados), `municipio[]` (índice), `conteos[][]` (2241 × 6 observados) |
| `posterior.bin` | `float32` crudo, orden C: `u[n_hex][S]` — el perfil espacial de cada celda, por muestra |
| `meta.json` | `n_hex`, `n_mun`, `n_draws`, `anios`, `lado_m`, `municipios[]`, `m[n_mun][n_anios][S]`, `b0[S]`, `s_rw[S]`, `theta[S]`, `hiper`, `divergencias`, `convergencia_log_mu` |
| `contornos.json` | `municipios[]`, cada uno con `j` y `anillos[]` (listas de `[x, y]` en UTM): la unión de sus celdas, huecos incluidos |

Los hexágonos son *flat-top* (vértice a la izquierda y a la derecha), como en
`espacial.rejilla_hexagonal`. Los contornos salen de unir las celdas de cada
municipio (no hay marco geoestadístico en `data/raw/`), con un buffer de ida y
vuelta de 1 m que cierra los huecos falsos de la unión.

Dimensiones reales: 2,241 celdas, 18 municipios, 6 años, S = 250 muestras.
`posterior.bin` pesa ~2.2 MB. Si se cambia solo la escritura (etapa 2),
`uv run exportar-app --reusar` rehace los archivos en segundos sin volver a
muestrear.

**Cómo se calcula una predicción** (en `app/src/lib/modelo.ts`; todo por
escenario, luego percentiles):

```
log mu[i,s] = b0[s] + m[j(i), año, s] + u[i,s]
conteo ~ BinomialNegativa(mu, theta[s])
```

- **Escenario municipal.** Cambiar el régimen del municipio `j` es sumar un
  desplazamiento `delta[j,s]` a `m`. Para «que reporte como en 2021»:
  `delta[j,s] = m[j, 2021, s] - m[j, 2024, s]`, por muestra. O un factor fijo
  (`log factor`). **Solo actúa en 2025-2027**: es un cambio de régimen hacia
  adelante.
- **Proyección a 2025-2027.** `m[j, 2024+k] = m[j, 2024] + suma de k
  innovaciones t₃ · s_rw[s]`. Es lo que ensancha el intervalo. Con
  `innovaciones: false` el nivel persiste (lo que validó el notebook); las
  pruebas usan ese modo para compararse contra numpy.
- **Total del año.** Percentiles 5/50/95 del total predictivo. El ruido
  Binomial Negativo del total se aproxima con una normal de varianza
  Σμ + Σμ²/θ (a escala metropolitana es indistinguible).
- **El mapa «neto»** es la mediana de e^{u_i − ū}, con u centrado por muestra
  (b0 y la media de u no se identifican por separado; centrar deja solo lo
  identificado). Se lee como «veces la celda típica». No depende del año ni
  del escenario.

## Cifras que salen de la app (semilla 42)

| | p5 | mediana | p95 |
|---|---|---|---|
| 2024 (observado: 71,249) | 71,269 | 73,645 | 76,068 |
| 2025 | 57,680 | 77,553 | 121,778 |
| 2026 | 54,598 | 82,550 | 168,154 |
| 2027 | 53,058 | 88,071 | 225,432 |

Ojo con la **mediana creciente**: no es que el modelo prevea más accidentes.
Cada municipio tiene innovaciones simétricas, pero el total es una suma de
exponenciales con colas pesadas: un municipio que empieza a reportar suma
mucho, uno que deja de reportar resta poco. La mediana de la suma sube. Frente
a público, esto se malinterpreta fácil como «los accidentes van a subir 23 %».
Ver «Pendientes».

## Cómo correr la app

Requiere Node 24 y haber corrido `uv run exportar-app` (los datos se copian
solos a `app/public/datos/` antes de `dev` y `build`).

```bash
cd app
npm install          # una vez
npm run dev          # desarrollo, con recarga en vivo: http://localhost:3000
npm run build        # compilar para producción
npm start            # servir lo compilado: http://localhost:3000 (así se presenta)
npm test             # genera la referencia con numpy y corre las pruebas (vitest)
npm run lint         # ESLint
```

`npm start` no necesita internet: `next/font` descarga las tipografías al
compilar y las sirve la propia app.

Teclado (también con `?` dentro de la app): ← → año · Inicio/Fin 2019/2027 ·
N crudo↔neto · ↑↓ top 1-20 % · 1-4 escenario preparado (pregunta) · Espacio
revelar · F fijar «antes» · A alternar antes/después · M nombres · 0/Esc
volver al inicio. Mouse sobre un hexágono: sus cifras.

## Estructura de `app/`

```
app/
  src/app/            layout.tsx (fuentes, metadatos), page.tsx, globals.css (estilos provisionales)
  src/components/     Explorador.tsx: carga, escena 1920×1080 escalada, panel, teclado, tooltip
  src/lib/
    modelo.ts         aritmética del posterior (lo importante; probado contra numpy)
    estado.ts         estado de la escena y sus transiciones (función pura, probada)
    escenarios.ts     escenarios preparados: DATOS, se editan sin tocar lógica
    datos.ts          contrato de datos y carga (fetch de public/datos/)
    azar.ts           PRNG con semilla, normal, t de Student
    color.ts          rampa del manual interpolada en OKLab
    mapa.ts, serie.ts canvas de hexágonos y SVG de la serie, con animación
  scripts/copiar-datos.mjs   data/processed/app/ → public/datos/ (predev, prebuild)
  pruebas/            modelo.test.ts, estado.test.ts, referencia.py (numpy)
  AGENTS.md, CLAUDE.md  los genera Next: avisan que Next 16 cambió y que hay que
                        leer node_modules/next/dist/docs/ antes de escribir código
```

Tailwind 4 está instalado (viene con `create-next-app`) pero los estilos
actuales son CSS plano por id. El rediseño puede usarlo.

## Estado actual

Hecho:

- Entorno levantado (`uv sync`); PyMC 6.3.2 y geopandas 1.1.4 importan.
  `uv run limpiar-atus --geo` corrido; las 21 invariantes pasan.
- `geostats.modelo` / `uv run exportar-app`. El panel reproduce el del
  notebook: 2,241 celdas, 0 islas, 18 municipios, 13,446 celda-año.
- **Corrida vigente** (`uv run exportar-app --tune 2000`, 10.5 min): 0
  divergencias, **log μ con R̂ máximo 1.009 y ESS mínimo 848** sobre 13,446
  celda-año. σ_rw R̂ 1.05. b0 (1.19) y σ_m (1.24) mezclan mal, como en el
  notebook: no se identifican por separado y no se leen solos. Hiperparámetros
  iguales a los del notebook (α 0.843, σ_rw 0.28, θ 12.05).
- El export calcula R̂/ESS de log μ antes de aplanar las cadenas y agrega
  `x`/`y` UTM y `contornos.json` (commit pendiente: `src/geostats/modelo.py`).
- App en Next.js: mapa crudo/neto, años 2019-2027 con proyección, top N % con
  frase de concentración, serie con banda del 90 % (recortada arriba con
  etiqueta «↑225 mil»), escenarios con pregunta → revelar, antes/después,
  tooltip, ayuda de teclado, animaciones de ~650 ms.
- **Verificado:** 20 pruebas (la aritmética coincide con numpy a 1e-9; el
  escenario solo actúa en proyecciones; el intervalo se ensancha; las colas no
  dependen de la semilla; una muestra extrema no mueve la mediana; transiciones
  del estado). `npm run build` y `npm run lint` limpios. En Chrome, con el
  build de producción: carga, primer dibujo, y el flujo completo por teclado
  (pregunta, revelar, alternar, años, top 5 %, neto, ayuda, reinicio) leyendo
  el DOM.
- **No verificado visualmente:** las animaciones. La pestaña de Chrome que
  usaba la automatización quedaba oculta (`visibilityState: hidden`) y Chrome
  pausa `requestAnimationFrame` en pestañas ocultas. Revisarlas a ojo.

## Pendientes para la siguiente sesión

Decisiones del autor (en este orden):

1. **Rediseño.** No le gustó el diseño actual (ni el frontend en general).
   Falta saber qué no le gustó: distribución (mapa chico a la izquierda y
   panel a la derecha vs mapa a pantalla completa), estilo, colores, cantidad
   de información, referencias. Trae *skills* de diseño.
   **Decidido (2026-09-19):** se quedan las dos historias, el mapa de riesgo
   (neto, $u_i$) y el pronóstico, pero el riesgo deja de estar escondido tras
   la tecla N: lleva un control visible en pantalla. Al rotularlo, recordar
   que el notebook lo valida para comparar celdas *dentro* de un municipio;
   «veces la celda típica» metropolitana invita a comparar entre municipios,
   que es lo que el modelo separa peor.
   **Decidido (2026-09-19), dirección del rediseño:**
   - Mapa a pantalla completa; cifra, serie, escenarios y controles flotan
     encima en tarjetas. Arriba, un selector visible «Accidentes | Riesgo».
   - Tema claro y oscuro con interruptor (claro por defecto). Los colores de
     datos se revalidan sobre el fondo oscuro.
   - Proyector primero; en celular basta con que se apile y funcione.
   - Texto explicativo visible (frases guía como la de concentración), pensando
     también en quien la use sola en la web.
   - Componentes con shadcn/ui (Tailwind 4) con los tokens mapeados al manual
     (`--primary` = `#005991`, `--chart-*` = la rampa ordinal). Serie: observado
     sólido, proyección punteada, banda tenue, etiquetas directas.
2. **Proyección con o sin innovaciones.** Con innovaciones (actual): 2027 =
   88 mil (53-225 mil), rango honesto pero ancho y con la mediana que sube por
   asimetría. Sin ellas (persistencia, como validó el notebook): ~73,600
   (71-76 mil) todos los años, pero el intervalo ya no se ensancha. La
   recomendación fue dejar las innovaciones y añadir un texto que explique
   por qué sube la mediana.
   **Decidido (2026-09-19): interruptor en la app.** Primero «si nada cambia»
   (persistencia) y luego «si los municipios cambian cómo reportan»
   (innovaciones), como revelación en vivo. `Modelo` ya acepta
   `{ innovaciones: false }`; basta una segunda instancia (con K = 1 es
   barata). El texto de la mediana creciente sigue haciendo falta en el modo
   con innovaciones.
3. ~~**¿Usable en celular?**~~ Decidido: proyector primero (ver 1).
4. **Datos para el deploy.** Vercel construye desde git y `data/` está fuera
   de git. Opciones: versionar `app/public/datos/` (~3 MB de datos públicos;
   recomendado: el script ya usa esos archivos si `data/processed/app/` no
   existe) o publicar desde la laptop con la CLI de Vercel. Hoy
   `public/datos/` está en `app/.gitignore`.
5. **Sección «cómo leer esto»** para la versión pública: límites del modelo y
   enlace al reporte técnico, para que una captura fuera de contexto no diga
   más de lo que el modelo sabe.

Trabajo:

- Rediseño e implementación.
- Revisar a ojo las animaciones y el tooltip.
- Ajustar los escenarios de `app/src/lib/escenarios.ts` a lo que se vaya a
  contar (hoy: Guadalupe como en 2021, Santa Catarina como en 2020, periferia
  norte al doble, 2027 sin cambios).
- Deploy en Vercel.
- Commits: `src/geostats/modelo.py` (contornos y UTM), `.gitignore`, este
  documento y todo `app/`.

## Historial de tropiezos, para no repetirlos

**ArviZ 1.3.0** (la versión nueva). Dos corridas se perdieron por asumir APIs:

- `InferenceData` ya no existe: el objeto que devuelve `pm.sample` es un
  `DataTree` de xarray. No tiene `.stack()`.
- `az.to_netcdf` no existe como función del módulo.
- `az.extract` recibe `random_seed`, **no** `rng`.
- `idata.sample_stats.diverging` sí funciona por atributo.
- `az.summary` devuelve columnas `mean, sd, eti89_lb, eti89_ub, ess_bulk,
  ess_tail, r_hat, mcse_mean, mcse_sd`.
- `az.rhat` y `az.ess` aceptan un `xarray.Dataset` con dims `chain`, `draw`.
- No hay backend de netCDF instalado (ni `netCDF4` ni `h5netcdf`), así que el
  caché va en `.npz` de numpy. No agregar dependencias solo para esto.

De ahí la etapa 1 / etapa 2 del script: el muestreo es lo único caro y se
persiste antes de tocar nada de formato. El `.npz` aplana las cadenas, así que
cualquier diagnóstico por cadena (R̂) se calcula antes de guardarlo.

**App:**

- Next 16.3 cambió cosas respecto a versiones anteriores; `app/AGENTS.md` pide
  leer `node_modules/next/dist/docs/` antes de escribir código. Turbopack es el
  default en `dev` y `build`.
- `next/font` renombra las familias: el canvas no puede usar `"Montserrat"`
  a secas; `Explorador.tsx` lee `--font-montserrat` y se lo pasa al mapa.
- El mapa se crea en un `useLayoutEffect` declarado antes del que lo mide: con
  `useEffect` se intentaba dibujar antes de tener tamaño y la página caía.
- `vitest` pide `@types/node` ≥ 22; `create-next-app` trae la 20. Se subió a 24.
- Chrome pausa `requestAnimationFrame` en pestañas ocultas: si una captura se
  cuelga o una animación «no avanza», revisar `document.visibilityState`.

## Notas técnicas de la máquina

- Windows, Python 3.14, sin `g++`. PyTensor avisa, pero nutpie trae su propio
  compilador y muestrea bien. El aviso se puede ignorar.
- Node 24.16.
- La rejilla tiene **120 componentes desconectados** además de 0 islas. No es
  un problema: el CAR del modelo es *propio* y está bien definido sobre un
  grafo desconectado. Solo implica que las celdas periféricas aisladas toman
  menos prestado de sus vecinas. Es una propiedad preexistente del notebook.

## Lo que la app no debe afirmar

Son los límites del modelo, y salen en cada notebook de la serie:

- **Es un modelo de reportes, no de siniestralidad.** Un municipio que deja de
  capturar accidentes aparece como un municipio donde bajó el riesgo. El modelo
  no distingue las dos cosas. (Está en el pie de la app.)
- **La mediana creciente de la proyección no es una tendencia** (ver «Cifras
  que salen de la app»).
- **Los escenarios son contrafactuales de reporte**, no de seguridad vial:
  «Guadalupe reporta como en 2021» no dice que haya más o menos accidentes.
- **El modelo no mejora el *dónde*.** El PAI se queda en 8.4 en los tres
  notebooks: elegir el 5 % del territorio por puro historial ya captura el 42 %
  de los accidentes del año siguiente, y ninguna especificación lo mueve. Lo
  que el modelo aporta es *cuánto* y *con qué certeza*, más el mapa neto. Para
  mover el *dónde* hacen falta covariables externas (kilómetros de vialidad por
  celda como *offset*, población por AGEB).

## Pendientes de higiene

- El README y `CLAUDE.md` están desfasados: el README no menciona
  `espacial.py` ni los notebooks nuevos; `CLAUDE.md` no menciona `limpieza.py`
  ni `limpiar-atus`. Ninguno menciona `modelo.py`, `exportar-app` ni `app/`.
