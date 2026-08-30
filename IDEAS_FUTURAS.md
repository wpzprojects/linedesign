# Ideas futuras — sin implementar

Este archivo documenta ideas discutidas con el usuario para posibles fases
futuras del proyecto. **Nada de lo que hay acá está implementado** — es
referencia para retomar la conversación de diseño antes de escribir código,
no un plan aprobado. Si alguna se implementa, mover su sección a
`DATA_MODEL.md`/`README.md` y borrarla de aquí.

---

## 1. Múltiples circuitos por estructura ("Fase 4")

**Motivación**: hoy el proyecto asume un solo circuito (un conductor, con
sus fases definidas en `structureCatalog[].attachmentPoints`) por
estructura/vano. En la realidad, una torre puede llevar más de un circuito
de potencia, un hilo de guarda, y/o un cable ADSS de comunicaciones — cada
uno con su propio conductor, su propia geometría de enganche en el poste, y
su propia curva de catenaria.

**Veredicto**: viable, pero es un cambio de arquitectura real — toca cada
capa del sistema (catálogo, modelo de datos, `loadTree.js`, ambas vistas
Planta/Perfil, Resumen, exportador DXF), no es un campo nuevo aislado.

### Comparación de enfoques discutidos

- **Sets fijos por tipo de estructura** (idea inicial del usuario): definir
  de entrada, por tipo, sets reservados (guarda / circuito 1 / circuito 2 /
  ADSS). Problema: rígido — la mayoría de estructuras tienen 1 circuito, y
  cargar el modelo con sets "reservados pero vacíos" en todas es ruido.
- **Agregar el circuito desde el vano** (alternativa del usuario, al
  seleccionar un vano entre estructuras de retención en Propiedades):
  mejor instinto de UX, pero el punto de fijación físico (offsetX/offsetZ
  en el poste) es una propiedad del **tipo de estructura**, no del vano —
  si se agrega solo "al vano" no se sabe dónde dibujarlo en el poste.
- **Recomendado — combinar ambas**: los circuitos se siguen definiendo en
  el catálogo (ahí vive la geometría física), pero un tipo arranca con 1
  circuito por defecto (como hoy) y el usuario agrega circuitos
  adicionales *al tipo* solo cuando los necesita — no sets reservados de
  entrada. Luego, en Propiedades de una estructura/sección, el usuario
  activa/asigna cuáles de los circuitos definidos en su tipo están
  realmente tendidos ahí (un tipo puede tener el circuito 2 "reservado en
  el diseño del poste" sin cable tendido todavía en una torre puntual).

### Forma del modelo de datos (borrador)

- `structureCatalog[].attachmentPoints` deja de ser una lista plana de
  fases → pasa a ser una lista de **circuitos**, cada uno con su propia
  lista de puntos:
  ```js
  circuits: [
    { id: 'C1', name: 'Circuito 1', role: 'power', points: [{name, offsetX, offsetZ}, ...] },
    { id: 'GUARD', name: 'Guarda', role: 'guard', points: [{name, offsetX, offsetZ}] }
  ]
  ```
- `project.conductor`/`conductorCatalog` ya no alcanza con un conductor
  activo único — se necesita un conductor (o "sin cable tendido") **por
  circuito**.
- `project.sectionConductors` pasa de `{fromId, toId, conductorId}` a
  `{fromId, toId, circuitId, conductorId}`.
- A decidir: ¿cada circuito tiene su propia hipótesis de
  referencia/tensión de tendido, o comparten la del proyecto?

### Qué se rompe / hay que tocar (no exhaustivo)

1. Catálogo de estructuras: UI para agregar/quitar circuitos por tipo, no
   solo puntos de fijación dentro de uno.
2. `loadTree.js`: las fuerzas (vertical/transversal/longitudinal) sobre un
   poste hoy asumen un conductor — con N circuitos hay que **sumar** la
   contribución de cada uno (peso, tensión propios).
3. `profileView.js`/`dxfExport.js`: el loop "una curva por fase" (ver
   v3.20.46) pasa a ser "una curva por fase, por circuito" — necesita
   distinguir cada circuito visualmente (color/capa DXF propia).
4. `planView.js`: el "circuito" en planta (línea recta entre estructuras)
   hoy es uno — con varios, ¿se dibujan todos o solo el principal?
5. Resumen (Tabla de estructuras): flecha/distancia al piso hoy es una
   columna — con N circuitos, ¿una fila por circuito, o la peor de todas?
6. Exportación DXF: nueva capa por circuito.

### Pasos sugeridos si se retoma

1. Modelo de datos + migración (proyectos existentes deben seguir abriendo
   con 1 circuito implícito, sin romper nada guardado).
2. Catálogo: UI para circuitos por tipo (la parte más aislada del resto,
   buen punto de partida).
3. `loadTree.js`: sumar cargas por circuito (el corazón del cálculo
   mecánico — el paso más riesgoso, requiere más cuidado/pruebas).
4. Perfil + Planta: dibujar N circuitos.
5. Resumen + DXF al final, una vez el resto esté estable.

---

## 2. Estructuras tipo H (postes gemelos)

**Motivación**: permitir un tipo de estructura compuesto por dos postes
separados una distancia configurable (en vez de uno solo), típico de
estructuras de mayor capacidad sin llegar a una torre de celosía completa,
con validación mecánica propia.

**Veredicto**: viable pero es un tipo de estructura genuinamente distinto,
no una variación menor del poste sencillo actual — afecta geometría
(Planta/Perfil) y la física de "Cumple poste".

### Puntos a resolver

- **Catálogo**: nuevo campo a nivel de tipo, ej. `poleConfiguration:
  'single' | 'h-frame'`, con `poleSeparation` (m) cuando es H.
- **Planta**: hoy una estructura es un solo punto (x, y) — un H-frame
  necesita mostrar dos postes separados (perpendicular a la dirección de
  la línea, típicamente) — cambia el marcador/dibujo de estructura.
- **Perfil**: como los dos postes de un H-frame normalmente quedan a la
  misma station (se separan transversalmente, no a lo largo de la línea),
  es probable que en Perfil sigan viéndose como una sola posición — a
  confirmar si eso es aceptable o si conviene alguna indicación visual de
  que es un H-frame.
- **Cálculo mecánico** ("Cumple poste"): la física de un H-frame no es la
  de un poste circular aislado flexado por la resultante horizontal (el
  criterio actual, ver `loadTree.js#checkPoleCapacity`) — es más parecido
  a un pórtico de dos patas que comparten momento vía la cruceta. Para una
  herramienta de diseño preliminar, probablemente valga con un criterio
  simplificado explícito (ej. repartir el momento entre las dos patas, o
  validar cada poste bajo la mitad de la carga tributaria) — documentar
  la simplificación igual que se hace con contravientos hoy, no fingir
  precisión que no hay.

---

## 3. Importar conductor desde archivo .WIR

**Motivación**: al agregar un conductor nuevo (formulario "Agregar nuevo"
en la tarjeta Conductor, ver v3.20.31), ofrecer un botón "Cargar archivo
.wir" que lea un archivo de biblioteca de conductores en ese formato (usado
por PLS-CADD y software similar del sector) y rellene automáticamente los
campos del formulario (diámetro, peso por longitud, área de sección,
carga de rotura, módulo de elasticidad, coef. de expansión térmica) en vez
de digitarlos a mano.

**Veredicto**: probablemente viable — es un formato de texto plano (no
binario), así que no debería requerir ninguna librería externa para
leerlo, en línea con cómo ya se construyó el exportador DXF (texto puro).

### Antes de implementar

- **Falta confirmar el layout exacto** del formato .wir (qué campo va en
  qué posición/columna, separador, encabezados, unidades que usa por
  defecto) — no se debe adivinar el parser sin al menos un archivo de
  muestra real para validar contra él. Pedir al usuario 1-2 archivos .wir
  reales de ejemplo antes de escribir el parser.
- Definir qué pasa con campos que el .wir no traiga (ej.
  `referenceHypothesisId`/tensión de referencia, que son conceptos propios
  de este proyecto, no del archivo) — probablemente se quedan con el
  mismo default que ya usa el formulario manual (ver v3.20.33).
- El formulario debería seguir permitiendo revisar/ajustar los valores
  leídos antes de guardar (no confiar ciegamente en el archivo importado).

### Boceto de implementación

- Nuevo módulo `src/engine/wirImport.js` (puro, sin DOM) con una función
  `parseWirFile(text) -> { name, diameter, weightPerLength, ... }`.
- En el modal de "Agregar conductor" (`hypothesesView.js`), un botón que
  abre un `<input type="file">`, lee el archivo con `FileReader`, llama al
  parser, y rellena los `value` de los inputs ya existentes del formulario
  (el usuario conserva control para ajustar antes de enviar).

---

## 4. Momento residual del poste por altura real del contraviento

**Motivación**: `checkPoleCapacity` (`loadTree.js`) valida el contraviento
con una simplificación de Fase 1 — asume que el contraviento, orientado
para resistir el desequilibrio de tensión del conductor, lo cancela por
completo, y usa solo `guyAnchorAngle` (ángulo respecto a la vertical) para
calcular la tensión del cable. `guyAnchorHeight` (altura de enganche desde
la punta del poste) se guarda como referencia geométrica pero **no entra en
ningún cálculo** — el campo se dejó bloqueado en la UI (v3.20.56) por esto
mismo, para no sugerir una precisión que el cálculo aún no ofrece.

El usuario señaló el vacío real que eso deja: si el contraviento está
enganchado más abajo que el punto de amarre del conductor (caso típico en
campo, por facilidad de instalación o por usar un punto de anclaje
predefinido en el poste), el segmento de poste ENTRE ambas alturas queda
sometido a un momento flector que el contraviento, actuando desde más
abajo, no cancela — y que "Cumple poste" hoy no verifica.

**Veredicto**: gap real y válido, aceptado como simplificación documentada
de Fase 1 (no se implementa todavía). Confirmado con el usuario.

### Qué requeriría implementarlo

- Modelar el poste como una viga con dos apoyos/restricciones a alturas
  distintas (empotramiento en la base + el punto de amarre del
  contraviento), en vez del criterio actual de "poste en voladizo con un
  único punto de aplicación de fuerza en la punta".
- Calcular el momento flector en el tramo entre la altura de enganche del
  contraviento y la altura de amarre del conductor (la fuerza no cancelada
  ahí es la componente horizontal de tensión del conductor que el
  contraviento, actuando más abajo, no alcanza a compensar en ese tramo).
- Verificar ese momento residual contra la resistencia del poste en esa
  cota (no necesariamente la misma resistencia ensayada a 20 cm de la
  punta que usa `checkPoleCapacity` hoy — la resistencia de un poste varía
  con la altura).
- Una vez implementado esto, desbloquear el campo "Altura de enganche desde
  la punta (m)" en Propiedades (hoy deshabilitado a propósito).
