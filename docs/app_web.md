# App web del modelo jerárquico — plan y estado

Documento de continuidad: qué se está construyendo, qué decisiones ya se
tomaron y por qué, y qué falta. Escrito para que otra sesión pueda retomar sin
contexto previo.

Última actualización: 2026-09-20.

**Dónde quedó:** el rediseño y el mapa base ya están en git (con
`app/public/datos/` y `app/public/mapa/` versionados) y la app está
desplegada en Vercel. El **2026-09-20 la app se redujo a dos cosas**: el mapa
por año (accidentes o riesgo propio) y la serie con la proyección de
persistencia. Se quitaron, por decisión del autor, la proyección con
innovaciones y **todo el bloque de escenarios** (pregunta → revelar,
antes/después, el menú y `escenarios.ts`). Ese mismo día se agregó el botón
(y la tecla `T`) que **esconde la tarjeta** y se le puso tope al **alejamiento
del mapa**, para no ver el borde del recorte de calles. Lo siguiente está en
[«Pendientes»](#pendientes-para-la-siguiente-sesión).

## Qué se quiere

Una página web que muestre el mapa de riesgo del modelo jerárquico
(`notebooks/modelo_jerarquico.qmd`) y permita mover parámetros para ver cómo
cambia.

**Escenario de uso principal:** el autor la proyecta desde su laptop frente a
un público. Él mueve los controles; el público solo mira. La dinámica de
*«¿qué creen que pase si…?»* → revelar existió hasta el 2026-09-20 y se quitó
(ver «Decisiones tomadas»): lo que se muestra ahora es el mapa por año y el
riesgo propio, y el relato lo pone quien presenta.

**Escenario secundario (nuevo):** publicarla en internet (Vercel) para que la
gente la use por su cuenta, «como algo sofisticado». No es parte del alcance
del proyecto, pero se decidió hacerlo.

De ahí se derivan las restricciones:

- **Legibilidad de proyector.** Se lee desde la última fila: tipografía
  grande, trazos gruesos, mucho contraste, pocos elementos por pantalla. En
  celular basta con que se apile y funcione.
- **El operador es experto.** No hace falta proteger la interfaz de un
  desconocido con prisa; los controles pueden ser densos en información.
- **Las transiciones se ven.** Cambiar de año o de lente se anima (~650 ms),
  no salta; con «reducir movimiento» del sistema, es inmediato.
- **Todo con atajos de teclado**, para llegar al estado exacto mientras se
  habla, sin buscar el mouse.
  (El antes/después y los escenarios cubrían la misma necesidad y se
  quitaron el 2026-09-20.)

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

**Interfaz con shadcn/ui (base Base UI, estilo nova) sobre Tailwind 4.** Los
tokens de shadcn están mapeados a los colores del manual en `globals.css`
(`--primary` = `#005991`, `--chart-*` = la rampa ordinal). Se agregó una variante propia de `Toggle`, `marca`: la opción elegida
va en azul lleno, porque el `bg-muted` de fábrica no se distingue desde el
fondo de la sala.

**La tarjeta flota sobre el mapa y se esconde (2026-09-20).** Se quitó el
grid de dos columnas: el mapa ocupa siempre la pantalla completa y la tarjeta
va encima, en `absolute`. Con el asa de su borde derecho (o la tecla `T`)
entra y sale con un `translate`. **Esconderla no mueve el mapa**, que era el
punto: el mapa no cambia de tamaño, solo se destapa lo que ya estaba dibujado
debajo.

Para que no se moviera hubo que separar dos cosas que antes iban juntas:

- `medir()` guarda una firma con el tamaño del mapa y los rellenos de arriba,
  abajo y la derecha —los controles flotantes— y **solo reencuadra si esa
  firma cambia**. El relleno de la izquierda (la tarjeta) queda fuera a
  propósito, así que abrir o cerrar no reencuadra ni recalcula `limitar()`.
- El encuadre sí esquiva la tarjeta cuando toca reencuadrar: `relleno().izq`
  mide dónde está el `<aside>` de verdad (`getBoundingClientRect`), no el
  estado de React, porque también se lee a media animación.

Los controles del mapa sí se recorren: las barras de arriba y abajo animan su
`padding-left` entre `3.75rem` (el hueco del asa) y `32.75rem` (tarjeta más
asa). Se anima el relleno y no un `transform` porque el relleno deja menos
espacio y los grupos se apilan solos; con `transform`, a 1024 px el grupo de
los años conservaba su ancho y se encimaba con la leyenda.

Cuidado al tocar esto: en Chrome, `grid-template-columns` no interpola cuando
la lista lleva `minmax()` (la transición se queda congelada a medio camino),
y **en una pestaña de fondo las transiciones CSS no avanzan**, igual que
`requestAnimationFrame`: desde la automatización hay que apagarlas
(`style.transition = "none"`) para medir el estado final.

**Tamaño fluido en rem.** Todo está en rem y el rem de `<html>` crece con la
pantalla (`min(1.04vw, 1.85vh)`, 20 px a 1920×1080; 16 px fijos en celular).
Reemplaza a la maqueta fija de 1920×1080 escalada: en cualquier pantalla
16:9 todo queda en el mismo lugar relativo, y el mapa ocupa el hueco real.
La tarjeta de la izquierda se midió para que su estado más largo quepa en
54 rem de alto (16:9) sin scroll; si se le agrega texto, volver a medirla.

**Sin tema oscuro (decidido 2026-09-19).** Se implementó y el autor lo
descartó: no servía para proyectar. Se quitó todo (botón, tecla T, tokens
`.dark`, paleta oscura del mapa). En `globals.css` queda la variante `dark`
atada a una clase que nunca se pone, para que los `dark:` de los componentes
de shadcn no se activen con el modo oscuro del sistema.

**Mapa base de calles, guardado dentro de la app.** Debajo de los
hexágonos hay un mapa de OpenStreetMap con zoom y arrastre, como un mapa
web, para ver qué calles y cruces caen en cada hexágono. Decisiones:

- **MapLibre GL** dibuja el mapa base; los hexágonos siguen en el canvas
  propio (`lib/mapa.ts`), que copia la cámara de MapLibre. Sin rotación ni
  inclinación, mover y hacer zoom en Web Mercator es escalar y trasladar: los
  hexágonos se construyen una vez y cada cuadro solo cambia la
  transformación. Así se conservan intactas las animaciones, el top N, los
  contornos, el top N y el tooltip.
- **Sin internet:** los mosaicos son un recorte de Protomaps solo de la ZMM
  (`public/mapa/zmm.pmtiles`, 25 MB, zoom 0-15; más allá de 15 MapLibre
  amplía los del 15). Las tipografías del mapa (Noto Sans, solo los rangos
  latinos) y los íconos (del sabor `grayscale`) también están en
  `public/mapa/`. Cómo regenerarlo: ver «Mapa base» más abajo.
- **Sabor propio, gris claro** (`CLARO` en `lib/mapaBase.ts`): el
  `grayscale` de Protomaps con la tierra en el `#F2F2F2` del manual, calles
  blancas con borde gris suave y los rótulos con su contraste de fábrica. El
  `grayscale` tal cual (tierra `#CCCCCC`) se veía demasiado gris.
- **Controles:** columna a la derecha con acercar, alejar, encuadrar la ZMM,
  mostrar u ocultar las calles, y un deslizador de opacidad de los
  hexágonos (en 0 % solo quedan calles, contornos y rótulos). Ocultar los
  hexágonos no lleva botón aparte: el deslizador ya lo hace. Teclas: + −, E,
  B, H.
- **El encuadre es lo más lejos que se puede ver (2026-09-20).** `limitar()`
  en `lib/mapaBase.ts` pone `minZoom` en el zoom que `cameraForBounds` da
  para la extensión de los hexágonos con el relleno de los controles, y
  `maxBounds` en lo que se ve desde ahí más 10 %. Se recalcula cuando cambia
  la firma de `medir()` (tamaño del mapa y controles), no al esconder la
  tarjeta. Antes se podía alejar hasta
  ver el borde del recorte de calles.
- **El fondo del estilo es el color de la tierra** (`#F2F2F2`, antes
  `#E6E6E6`): donde no hay mosaicos ya no se dibuja un cuadro gris, solo
  sigue el mismo claro. Hace falta porque **«nunca ver el borde» y «ver toda
  la ZMM» no caben juntos con este recorte**: los mosaicos guardados son los
  que tocan la caja `-100.78,25.28,-99.72,26.40`, y su unión mide 1.41° de
  alto a zoom 9 y 1.41° a zoom 10, contra los 1.007° de la ZMM más el
  relleno; en una pantalla 16:9 a pantalla completa, el encuadre necesita
  ~1.48° de alto. Faltan ~5 %. Para cerrarlo de verdad hay que **regenerar el
  recorte con una caja más amplia** (ver «Mapa base»; pide internet y el CLI
  de Protomaps).
- **Los UTM se convierten en el cliente** (`lib/geo.ts`, UTM inversa sin
  dependencias), no en el export: el contrato de datos no cambió. La fórmula
  coincide con pyproj a menos de 1e-9° (prueba en `pruebas/geo.test.ts`).
- **Atribución:** la licencia de OpenStreetMap pide citarla mientras se ve el
  mapa; va en la leyenda y desaparece si se ocultan las calles.

**Una sola forma de proyectar: persistencia (decidido 2026-09-20).** La app
usa `Modelo(datos, { innovaciones: false })` y nada más: cada municipio sigue
reportando como en 2024, que es lo que validó el notebook. Se quitó el
interruptor «Si nada cambia | Si cambia el reporte», su tecla `P`, el
escenario 5 y `Vista.proyeccion`. **Consecuencia:** 2025, 2026 y 2027 dan
exactamente la misma cifra y la misma banda (71,269 / 73,645 / 76,068), así
que la serie sale plana desde 2024 y el intervalo ya no se ensancha con el
horizonte. `modelo.ts`
conserva la opción `innovaciones` (con sus pruebas y las 200 trayectorias):
la máquina sigue ahí por si se quiere recuperar la historia, pero la interfaz
no la expone.

**Sin escenarios (decidido 2026-09-20).** Se quitó el bloque completo: los
cinco (luego cuatro) escenarios preparados, el menú, la pregunta a pantalla
completa con «Revelar», el aviso flotante, el antes/después (teclas `F` y
`A`) y `src/lib/escenarios.ts`. Con eso, `Estado` se quedó en
`{ actual: { anio, lente }, top, ayuda, etiquetas }` y `mapa.ts` perdió
`resaltados`. **Consecuencia:** la app ya no tiene nada que mover en
2025-2027; los tres años proyectados muestran la misma cifra. Lo que queda es
el mapa por año, el interruptor Accidentes/Riesgo, el top N, el mapa base y la
serie. La maquinaria del contrafactual sigue viva en `modelo.ts`
(`Escenario`, el parámetro `esc` de `totales`/`medianas`/`celda`) y la
referencia de numpy la sigue probando; también sigue el parámetro
`referencia` de `serie.ts` (la línea punteada del «antes»). Para recuperar
la interfaz: `0117636` y anteriores.

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

**200 trayectorias de innovación por muestra** (vigente solo dentro de
`modelo.ts`, ver arriba)**.** Con una sola por muestra (250
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

- **Escenario municipal** (ya no se usa en la interfaz; sigue en `modelo.ts`).
  Cambiar el régimen del municipio `j` es sumar un desplazamiento
  `delta[j,s]` a `m`. Para «que reporte como en 2021»:
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

**La escala del mapa de riesgo (2026-09-20).** El dominio de color es fijo,
`0.1` a `10`, no los percentiles 2 y 98 de la distribución (que son 0.04 y
14.4). Así el 1 —la zona típica— cae en el centro exacto de la rampa y la
leyenda se lee con tres palabras: **10× menos · igual · 10× más**, en vez de
las marcas `×0.1 ×0.3 ×1 ×3 ×10` de antes, que obligaban al público a pensar
en fracciones. Se satura el 10 % de celdas por debajo de 0.1 y el 5 % por
encima de 10 (la distribución llega a ×45). El tooltip dice «3.4 veces más
(o menos) que la zona típica», por lo mismo. La rampa es logarítmica porque
el multiplicador cubre tres órdenes de magnitud: p2 = 0.04, mediana = 1.18,
p95 = 9.9.

## Cifras que salen de la app (semilla 42)

Con la proyección de persistencia, que es la única desde 2026-09-20:

| | p5 | mediana | p95 |
|---|---|---|---|
| 2024 (observado: 71,249) | 71,269 | 73,645 | 76,068 |
| 2025 | 71,269 | 73,645 | 76,068 |
| 2026 | 71,269 | 73,645 | 76,068 |
| 2027 | 71,269 | 73,645 | 76,068 |

Los tres años proyectados son idénticos por construcción: sin innovaciones el
nivel municipal de 2024 persiste y solo queda el ruido Binomial Negativo del
conteo. Con los escenarios también fuera, nada los distingue: la serie se ve
plana de 2024 en adelante.

Para referencia, lo que daba el modo con innovaciones que se quitó (sigue
disponible en `modelo.ts`): 2025 = 77,553 (57,680-121,778), 2026 = 82,550
(54,598-168,154), 2027 = 88,071 (53,058-225,432). Su mediana creciente no era
una tendencia, sino la asimetría de una suma de exponenciales con colas
pesadas; frente a público se malinterpretaba como «los accidentes van a subir
23 %», y esa fue una de las razones para quitarlo.

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
compilar y las sirve la propia app, y el mapa base sale de `public/mapa/`.
`predev`/`prebuild` también copian el worker de MapLibre a
`public/mapa/maplibre/` (`scripts/copiar-maplibre.mjs`).

Teclado (también con `?` dentro de la app): ← → año · Inicio/Fin 2019/2027 ·
N accidentes↔riesgo · ↑↓ top 1-20 % · T esconder o mostrar la tarjeta ·
M nombres · + − acercar/alejar · E encuadrar · B calles · H opacidad de los
hexágonos · L cómo leer esto · 0/Esc volver al inicio. Mouse sobre
un hexágono: sus cifras; rueda y arrastre: mover el mapa; clic en una columna
de la serie: ese año. Todo lo del teclado tiene también botón en pantalla,
salvo F y M.

### Mapa base

Lo que hay en `public/mapa/` y cómo se regenera (por ejemplo, para
actualizar las calles):

```bash
# CLI oficial de Protomaps: https://github.com/protomaps/go-pmtiles/releases (se usó la v1.31.2)
pmtiles extract https://build.protomaps.com/20260919.pmtiles app/public/mapa/zmm.pmtiles \
  --bbox=-100.78,25.28,-99.72,26.40 --maxzoom=15
# Las compilaciones disponibles están en https://build-metadata.protomaps.dev/builds.json
```

- El recorte es la extensión de los hexágonos (`celdas.json`) más 0.05°.
- `fonts/` y `sprites/` vienen de
  `https://protomaps.github.io/basemaps-assets/` (`fonts/<fuente>/<rango>.pbf`,
  `sprites/v4/grayscale[@2x].{json,png}`). Solo se bajaron los rangos latinos
  (0-1023, 7680-7935, 8192-8959) de Noto Sans Regular, Medium e Italic: un
  nombre con otro alfabeto no se rotularía.
- El estilo lo arma `@protomaps/basemaps` en el cliente (`lib/mapaBase.ts`);
  su versión debe corresponder a la del recorte (la 4.x del recorte con la
  5.x del paquete funciona).

El teclado se escucha en captura: aunque el foco haya quedado en un botón
tras un clic, las flechas y el espacio siguen siendo del presentador. Con un
diálogo o la guía abiertos, el teclado es de ellos.

## Estructura de `app/`

```
app/
  src/app/            layout.tsx (fuentes, metadatos), page.tsx, globals.css (tokens del manual, serie)
  src/components/     Explorador.tsx: carga, distribución, controles, teclado
                      Piezas.tsx: cifra, leyenda, tooltip, ayuda de teclado, guía «Cómo leer esto»
                      ui/: componentes de shadcn (se agregan con `npx shadcn@latest add`)
  public/mapa/        mapa base sin internet: zmm.pmtiles, fonts/, sprites/ (y maplibre/, copiado)
  src/lib/
    modelo.ts         aritmética del posterior (lo importante; probado contra numpy)
    estado.ts         estado de la escena y sus transiciones (función pura, probada)
    datos.ts          contrato de datos y carga (fetch de public/datos/)
    azar.ts           PRNG con semilla, normal, t de Student
    color.ts          paleta del mapa: rampa del manual interpolada en OKLab
    geo.ts            UTM 14N → grados → Mercator, para montar los hexágonos en el mapa base
    mapaBase.ts       MapLibre: estilo local, límites, encuadre, cámara
    mapa.ts, serie.ts canvas de hexágonos y SVG de la serie, con animación
    utils.ts          cn() de shadcn
  scripts/copiar-datos.mjs   data/processed/app/ → public/datos/ (predev, prebuild)
  scripts/copiar-maplibre.mjs  worker de MapLibre → public/mapa/maplibre/ (predev, prebuild)
  pruebas/            modelo.test.ts, estado.test.ts, geo.test.ts, referencia.py (numpy)
  AGENTS.md, CLAUDE.md  los genera Next: avisan que Next 16 cambió y que hay que
                        leer node_modules/next/dist/docs/ antes de escribir código
```

`components.json` es la configuración de shadcn. Antes de agregar o cambiar
componentes, la skill de shadcn pide correr `npx shadcn@latest info` y leer
la documentación del componente (`npx shadcn@latest docs <componente>`).

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
  `x`/`y` UTM y `contornos.json`.
- App en Next.js: mapa crudo/neto, años 2019-2027 con proyección, top N % con
  frase de concentración, serie con banda del 90 %, tooltip, ayuda de teclado,
  animaciones de ~650 ms.
- **Rediseño (2026-09-19)**, en git (`155c6f7`). Mapa a pantalla completa con los
  controles flotando: arriba «Accidentes | Riesgo» y los botones (guía,
  teclado, reinicio); abajo años, «Resaltar» y leyenda. A la
  izquierda, una tarjeta con año, cifra, frase explicativa, serie y el
  supuesto de la proyección. Rótulos de municipios sin encimarse (ganan los
  de más accidentes). Respeta «reducir movimiento» del sistema.
- **Verificado del rediseño:** `lint` y `build` limpios. En Chrome
  a 1920×855, con el servidor de desarrollo: riesgo con top N, proyección,
  tooltip, guía, ayuda; nada se sale de la pantalla; la tarjeta cabe en todos
  los estados medidos. En un iframe de 400 px: se apila sin scroll
  horizontal.
- **Mapa base (2026-09-19)**, en git (`155c6f7`, `a842cd4`). Verificado en Chrome: las calles
  se dibujan desde el recorte local, los hexágonos caen sobre ellas (el
  contorno Monterrey–San Pedro sigue el río Santa Catarina), el zoom con
  botones y teclado se conserva al cambiar el tamaño de la ventana, E
  reencuadra, B oculta las calles, H y el deslizador transparentan los
  hexágonos, tooltip con zoom. Después se aclaró el mapa base y se quitó el
  tema oscuro; con los hexágonos al 60 % se leen los nombres de las calles. 32 pruebas,
  `lint` y `build` limpios.
- **No verificado visualmente:** las animaciones, otra vez. La pestaña de la
  automatización queda oculta y Chrome pausa `requestAnimationFrame`; los
  estados finales se revisaron simulando «reducir movimiento». Revisarlas a
  ojo, igual que el tamaño real a 1920×1080 en el proyector.

## Pendientes para la siguiente sesión

Decisiones del autor (en este orden):

1. ~~**Rediseño.**~~ Implementado; falta que el autor lo revise. No le gustó el diseño anterior (ni el frontend en general).
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
   - Mapa a pantalla completa; cifra, serie y controles flotan encima en
     tarjetas. Arriba, un selector visible «Accidentes | Riesgo».
   - ~~Tema claro y oscuro con interruptor.~~ Implementado y descartado: se
     quitó el tema oscuro.
   - Proyector primero; en celular basta con que se apile y funcione.
   - Texto explicativo visible (frases guía como la de concentración), pensando
     también en quien la use sola en la web.
   - Componentes con shadcn/ui (Tailwind 4) con los tokens mapeados al manual
     (`--primary` = `#005991`, `--chart-*` = la rampa ordinal). Serie: observado
     sólido, proyección punteada, banda tenue, etiquetas directas.
2. ~~**Proyección con o sin innovaciones.**~~ **Cerrado (2026-09-20): solo
   persistencia.** El interruptor se implementó el 2026-09-19 y el autor lo
   descartó: la historia de «si cambia el reporte» se quita de la app. Queda
   la proyección «si nada cambia», con la serie plana de 2024 a 2027 (ver
   «Decisiones tomadas» y «Cifras que salen de la app»). Si alguna vez se
   quiere recuperar: `modelo.ts` todavía acepta `{ innovaciones: true }`, y
   habría que volver a meter `Vista.proyeccion`, la tecla `P` y el escenario
   5 (están en `155c6f7`).
3. ~~**¿Usable en celular?**~~ Decidido: proyector primero (ver 1).
4. ~~**Datos para el deploy.**~~ Resuelto: `app/public/datos/` se versionó
   (`acff1be`, ~3 MB) aunque siga listado en `app/.gitignore` (entró
   forzado), así que Vercel construye desde git sin el pipeline de Python.
5. ~~**Sección «cómo leer esto»**~~ Implementada como panel lateral (botón y
   tecla L), con los límites de «Lo que la app no debe afirmar». Falta el
   **enlace** al reporte técnico: hoy solo lo menciona, porque el PDF vive en
   el repo y no hay URL pública todavía.

6. ~~**¿Los 26 MB de `public/mapa/` van al repo?**~~ Resuelto: sí, se
   versionaron (`a842cd4`).

Trabajo:

- **Segundo paso del mapa (decidido):** con mucho zoom, mostrar los
  accidentes reales del año elegido como puntos (`LONGITUD`/`LATITUD` de
  `atus_zmm_limpio_geo.parquet`, unos 70 mil por año). Es lo que deja ver
  los cruces; el hexágono solo dice qué calles caen dentro. Requiere un
  archivo nuevo en el export y decidir desde qué zoom aparecen.
- Revisión del autor del rediseño a pantalla completa, y ajustes.
- Revisar a ojo las animaciones.
- **Recorte de calles más amplio**, si se quiere que el borde no pueda verse
  nunca (hoy se evita con el tope de zoom y con el fondo del color de la
  tierra): `pmtiles extract --bbox=-101.6,24.7,-98.9,27.0`, que pesa más.
- Decidir qué cuentan los años 2025-2027 ahora que son idénticos entre sí y
  nada los mueve: si se quedan como están, si se muestra solo 2025, o si la
  proyección sale de la app.
- Limpieza pendiente por los recortes del 2026-09-20 (decidir si se borra o
  se conserva por si vuelve): `innovaciones` y `Escenario` en `modelo.ts`
  con sus pruebas y `pruebas/referencia.py`, y el parámetro `referencia` de
  `serie.ts`.
- Anotar aquí la URL del deploy de Vercel.

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
  Para revisar estados finales desde la automatización, sustituir
  `window.matchMedia` para que «reduced-motion» dé `true`: la app lo consulta
  en cada cambio y entonces no anima.
- Crear el `Mapa` en un efecto y medirlo en otro rompía con Strict Mode y la
  recarga en caliente: se llegaba a dibujar un `Mapa` sin medir y el canvas
  lanzaba «parameter 1 is not of type 'Path2D'». Ahora se crean y miden en el
  mismo efecto, y `dibujar()` no hace nada si aún no hay tamaño.
- **MapLibre 6 no encuentra su worker dentro del bundle de Next**: lo busca
  junto a su archivo (`import.meta.url`). Síntoma: el mapa se queda en el
  fondo gris, `isStyleLoaded()` nunca llega a `true` y no hay ningún error.
  Solución: `scripts/copiar-maplibre.mjs` + `setWorkerUrl`.
- **`maxBounds` de MapLibre exige que toda la pantalla quepa dentro de los
  límites.** Con límites justos al recorte, en una pantalla ancha forzaba un
  zoom mayor que el del encuadre y el mapa salía cortado. Los límites son
  holgados a propósito.
- MapLibre tampoco dibuja en una pestaña oculta. Para revisarlo desde la
  automatización: sustituir `requestAnimationFrame` por un `setTimeout` antes
  de que cargue el mapa y forzar `map.redraw()`.
- MapLibre le pone `position: relative` a su contenedor; por eso el
  contenedor del mapa va dentro de otra caja absoluta.
- `shadcn init --preset base-nova` ya no existe; los presets se llaman `nova`,
  `vega`, etc. (la base Base UI es la de fábrica). El `init` instala el
  paquete `cn` (reemplazo de clsx + tailwind-merge del propio shadcn).

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
  no distingue las dos cosas. El pie de la app dice «modelo de accidentes
  **reportados**» y el «no de siniestralidad» se quitó el 2026-09-20 por
  decisión del autor; la frase completa sigue en «Cómo leer esto».
- **La proyección no es un pronóstico de lo que va a pasar**: supone que cada
  municipio sigue reportando como en 2024. Si un municipio cambia su reporte
  —como ya pasó entre 2019 y 2024— el total real puede quedar fuera de la
  banda. Por eso la banda no se ensancha con el horizonte: mide el ruido del
  conteo, no el riesgo de un cambio de régimen.
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
