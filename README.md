# Margen Agéntico

Complemento profesional para el Motor Agéntico — concurso Imperio Agéntico.

## ¿Qué es?

Una calculadora local que responde la pregunta que el Motor Agéntico no responde:

> ¿Cuánto tengo que cobrar por este proyecto para no perder dinero?

El Motor ya mide gasto IA, actividad y ROI por ahorro de tiempo. **Margen Agéntico** calcula el **precio mínimo rentable** que un automatizador debe cobrar para cubrir todos sus costos y alcanzar el margen deseado.

## Estado actual

**v1.4 — actualizada el 2026-07-11.**

> ⚠ **La integración automática con el Motor Agéntico NO está activa en esta instalación.** Confirmado en navegador: `/_live-data`, `/api/live-data` y `/data` devuelven 404. Margen Agéntico opera siempre en modo manual respecto al Motor hasta que exista un endpoint público confirmado. Todo lo descrito abajo sobre lectura automática es **código preparado**, no una función que hoy autocomplete nada. Detalle completo: `docs/motor-agentico-notas.md`.

Cambios respecto a v1.3 (preparación técnica para integración con Motor Agéntico):
- `obtenerDatosMotor()` corregido: ya no colapsa todo a `null`; devuelve un estado explícito (`conectado` / `endpoint_no_expuesto` / `no_disponible` / `respuesta_invalida`) que la UI muestra en la statusbar
- Se eliminaron los campos inventados `costoSuscripcionesMensuales` y `costoAcumuladoTokensAPI` — no corresponden a ningún schema confirmado del Motor
- Mapeo preparado (sin activar) contra el schema aportado por el usuario: `subscriptions[*].monthlyPrice` (costos mensuales de herramientas) y `runs[].cost` / `runs[].workspace` (costo IA por proyecto) — probado con 12 tests unitarios, pendiente de validar contra un payload real
- Nuevo campo opcional "Workspace / carpeta del proyecto (Motor)" para que el usuario indique a qué workspace del Motor corresponde el proyecto actual — hoy no tiene efecto porque no hay endpoint que responda, queda listo para cuando lo haya
- `usage`, `usage.claudeWindow`, `modelUsage`, `daily`, `recentProjects` existen en el schema descrito pero se dejan deliberadamente fuera de todo cálculo (evita doble conteo; ver `docs/motor-agentico-notas.md`)
- Mensajes de estado nuevos y honestos: "Motor conectado: usando datos del Motor", "Motor conectado: sin workspace claro, usando modo manual", "Endpoint no expuesto: modo manual" (estado confirmado hoy), "Motor no disponible: modo manual", "Respuesta inválida: modo manual"
- "↺ restaurar demo" ahora también limpia el campo workspace y las notas de autocompletado

Cambios respecto a v1.2:
- Selector de moneda ampliado a 24 monedas comunes de Hispanoamérica y globales (antes solo 9)
- Nueva opción "Otra moneda…" para ingresar manualmente cualquier código ISO 4217 (ej. SEK, NOK, AED)
- Validación del código personalizado: mayúsculas automáticas, solo letras, máximo 3 caracteres
- Advertencia visual suave (sin `alert()`) si el código ingresado no es reconocido por el navegador
- Fallback de formato simple (`CÓDIGO valor`) si `Intl.NumberFormat` no soporta la moneda
- La moneda personalizada también persiste en localStorage

Cambios respecto a v1.1:
- Selector multimoneda (USD, EUR, COP, MXN, ARS, CLP, PEN, BOB, CHF) — solo formato de visualización, sin conversión de tasas
- Nuevo módulo independiente de **soporte / mantenimiento mensual** con su propia tarjeta de rentabilidad
- El módulo de soporte NO altera el cálculo de precio mínimo rentable del proyecto
- Persistencia extendida: moneda y valores de soporte también se guardan en localStorage
- "↺ restaurar demo" ahora también restaura moneda por defecto (USD) y valores demo de soporte

Cambios respecto a v1.0:
- Integración local opcional con Motor Agéntico (endpoint `/_live-data`, solo lectura, falla silenciosa)
- Persistencia con localStorage: restaura la última sesión al recargar
- Botón "↺ restaurar demo" para volver a los valores de demostración
- Campo costo IA renombrado a "Costo IA asignado al proyecto"
- Textos en modo preventa: "Cobrarías", "Estarías", "Este precio sería rentable", etc.
- Indicador de estado de conexión con Motor en statusbar

## Cómo usar

Abrir `src/index.html` en el navegador. No requiere servidor ni conexión a internet (funcionalidad 100% local; la fuente tipográfica usa fallback si no hay conexión).

### Campos configurables

| Campo | Descripción |
|---|---|
| Precio que pienso cobrar | Ingreso bruto del proyecto |
| Costo IA asignado al proyecto | Gasto en IA de este proyecto — siempre manual hoy; preparado para autocompletarse desde `runs[].cost` cuando el Motor exponga un endpoint (no disponible en esta instalación) |
| Workspace / carpeta del proyecto (Motor) | Opcional — se compararía contra `runs[].workspace`; sin efecto hoy por falta de endpoint, queda listo para el futuro |
| Horas estimadas | Horas humanas dedicadas al proyecto |
| Tarifa por hora | Tu tarifa horaria |
| Otros costos | Costos directos del proyecto (licencias, recursos) |
| Costos fijos mensuales | Herramientas, suscripciones, etc. — siempre manual hoy; preparado para sugerirse desde `subscriptions[*].monthlyPrice` cuando el Motor exponga un endpoint |
| Proyectos al mes | Para prorratear los costos fijos |
| Comisión de plataforma | % que cobra la plataforma donde vendes |
| Impuestos / retenciones | % aplicable según tu régimen fiscal |
| Margen deseado | % de utilidad objetivo |

### Modo demo

Tres presets seleccionables para explorar la calculadora:
- **Principiante** — muestra estado *pérdida*
- **Intermedio** — muestra estado *revisar*
- **Avanzado** — muestra estado *rentable*

### Soporte mensual (módulo independiente)

Sección separada para evaluar si una cuota de soporte/mantenimiento mensual es rentable, sin mezclarse con el precio mínimo del proyecto. Reutiliza los mismos % de comisión, impuestos y margen deseado configurados en el panel principal. Estados: *pérdida en soporte*, *revisar soporte*, *soporte rentable*.

### Multimoneda global

El selector de moneda (junto a los botones de modo demo) incluye 24 monedas comunes de Hispanoamérica y globales, más la opción **"Otra moneda…"** para ingresar cualquier código ISO 4217 de 3 letras (ej. SEK, NOK, PLN, AED) que no esté en la lista.

Cambiar de moneda solo actualiza el formato de todos los valores calculados (símbolo, separadores). **No convierte montos entre divisas** — el usuario debe ingresar todas las cifras ya en la moneda elegida.

Para "Otra moneda…": se acepta cualquier código ISO 4217 de 3 letras (mayúsculas automáticas). La app no intenta "detectar" si el código es una moneda real, porque el navegador no puede garantizar eso de forma confiable — en su lugar muestra una nota clara: *"Código ISO 4217 de 3 letras. Si no tiene símbolo reconocido, se mostrará como código + valor."* Si el código no tiene símbolo propio, simplemente se muestra como prefijo (ej. `ZZZ 100`), sin romper la app.

### Integración con Motor Agéntico — preparada, no activa hoy

Margen Agéntico **intenta** leer `http://localhost:8081/_live-data` (solo lectura, nunca escribe nada en el Motor), pero **en esta instalación esa ruta, `/api/live-data` y `/data` devuelven 404** — confirmado en navegador. No hay endpoint público estable disponible hoy, así que Margen Agéntico siempre opera en modo manual respecto al Motor, sin importar que el Motor esté corriendo o no.

Motor Agéntico sí muestra datos por run y por workspace en su propia interfaz — el código de mapeo de Margen Agéntico (`extraerCostoIADeRuns`, `extraerCostosFijosDeSubscripciones`) está escrito y probado unitariamente para el schema que el Motor usaría, listo para activarse el día que exista una ruta pública que lo entregue. La statusbar siempre refleja el estado real: "Endpoint no expuesto: modo manual" es lo que verás hoy; "Motor conectado…" solo aparecería si el endpoint respondiera JSON válido. Contrato completo, campos usados/no usados y estados: `docs/motor-agentico-notas.md`.

## Estructura del proyecto

```
RETO-MARGEN-AGENTICO/
├── CLAUDE.md              # instrucciones para Claude Code
├── README.md              # este archivo
├── memory.md              # memoria persistente de sesiones
├── tasks.json             # tareas y estado del proyecto
├── margen_agentico_v2.html  # maqueta original de referencia
├── docs/
│   ├── referencia-maqueta-v2.html  # copia archivada de la maqueta
│   ├── idea-margen-agentico.md     # idea validada del complemento
│   ├── formulas.md                 # fórmulas de cálculo documentadas
│   ├── contexto-concurso.md
│   ├── motor-agentico-notas.md
│   └── requisitos.md
├── src/
│   ├── index.html         # aplicación principal
│   ├── styles.css         # estilos
│   └── app.js             # lógica y cálculos
├── progress/
│   ├── 2026-06-23-inicio.md
│   └── 2026-06-24-implementacion.md
├── prompts/
└── tests/
```

## Nota sobre impuestos

Esta herramienta es una **simulación financiera, no asesoría tributaria**. Las tasas varían por país y régimen. Verificar con un contador antes de tomar decisiones.

## Licencia

Copyright (C) 2026 Paola Alejandra Bustillo

Este proyecto se distribuye bajo los términos de la GNU General Public License v3.0. Consulta el archivo LICENSE para más detalles.