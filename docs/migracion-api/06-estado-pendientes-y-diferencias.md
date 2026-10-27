# Estado de la migración, diferencias aceptadas y pendientes

## 1. Estado por módulo

«Verificado» = probado con la API real contra los emuladores de Firebase y con los servicios reales
de la app en pruebas de equivalencia. **Ningún módulo se ha ejecutado todavía contra producción**: la API
aún no está desplegada (faltan el hosting y la clave de cuenta de servicio) y la app, sin
`EXPO_PUBLIC_API_URL`, sigue usando su lógica local de siempre.

| Módulo | Contenido | API | App adaptada | Verificado | Lógica local retirada |
|---|---|---|---|---|---|
| M0 Infraestructura | Express, autenticación por ID token, rol/cuenta activa, errores, configuración, `apiClient` | Sí | Sí | Sí (155 pruebas de API + servidor real) | — |
| M1 Sesión y perfil | Registro (perfil como estudiante), `/me` | Sí | Sí | Sí | No |
| M2 Inscripciones | Inscribirse / cancelar (transacciones, idempotencia, concurrencia) | Sí | Sí | Sí (equivalencia 23/23 + 22 de API) | No |
| M3 Jornadas | Crear, editar, reasignar, cancelar, reactivar, eliminar, inscritos, planilla, avisos, vencidas | Sí | Sí | Sí | No |
| M4 Notificaciones | Marcar leída(s), eliminar, token push, aviso local | Sí | Sí | Sí | No |
| M5 Cuentas | Crear cuenta, cambiar nombre/rol/estado | Sí | Sí | Sí | No |
| M6 Estadísticas, reporte y auditoría | Indicadores, reporte CSV, auditoría atómica | Sí | Sí | Sí | No |
| M7 Cierre | Reglas de solo lectura, retirar lógica local y `functions/` | `firestore.api.rules` + 23 pruebas | — | Reglas verificadas | **Pendiente a propósito**: exige API desplegada y apps actualizadas (ver [05](05-despliegue-y-recuperacion.md)) |

No se declara «migrado» ningún módulo: están **implementados y verificados en emulador, pendientes
de despliegue y de validación en producción**.

## 2. Diferencias aceptadas respecto al comportamiento anterior

Inevitables o consecuencia directa de decisiones tomadas con el usuario. Ninguna cambia pantallas ni reglas.

1. **Reloj del servidor.** Inscribirse valida «la jornada ya finalizó» con la hora del servidor (antes, la del dispositivo). El plazo de 2 días para cancelar sigue validándose solo en la app (ver §3).
2. **Los avisos los crea el servidor** en el momento del cambio (decisión del usuario): llegan a *todos* los inscritos aunque no abran la app, y no dependen de su sesión. Un cambio hecho a mano en la consola de Firestore ya no genera aviso.
3. **Aviso local del dispositivo.** Ahora sale de las notificaciones nuevas. Con la sesión recién abierta se avisan las no leídas de las últimas 24 h (para ver lo ocurrido con la sesión cerrada); en una sesión continua, solo las nuevas. En casos raros un aviso ya mostrado antes de cerrar sesión puede volver a mostrarse al entrar. Sigue sin haber *push* con la app cerrada (nunca lo hubo: la Cloud Function no está desplegada).
4. **Mensajes de validación más precisos.** Si alguien se salta el formulario, el servidor responde el error del campo (antes, un genérico «permiso denegado»). Reactivar una jornada con fecha pasada responde «La fecha de la jornada ya pasó…». La app no lo muestra en el uso normal (el formulario valida antes).
5. **Sin conexión.** Marcar una notificación como leída, eliminarla o guardar el token push ya no se encola en el SDK de Firestore: sin conexión no se aplica (queda registrado en consola; vuelve a intentarse al repetir la acción). Las estadísticas y el reporte del administrador requieren conexión y se piden al abrir la pantalla y al volver la red (antes se actualizaban en vivo con los listeners). La inscripción/cancelación sigue funcionando sin conexión por la cola de siempre.
6. **Auditoría.** La escribe el servidor en la misma operación atómica que la acción (antes la pantalla la registraba después, con riesgo de perderse). `reporte.exportar` se registra al generar el reporte, no al terminar de compartirlo.
7. **Edición de jornadas antiguas.** La regla de Firestore rechazaba editar jornadas con campos extra en el documento; la API actualiza solo los campos editables y no tiene esa restricción.
8. **Correo del perfil.** En el registro, el correo guardado es el de la cuenta de Firebase Auth (en minúsculas), no el texto tal cual se escribió.
9. **Cuentas desactivadas.** Sigue igual: la app cierra la sesión y la API rechaza todo con 403. No se deshabilita la cuenta de Firebase Auth (cambiaría el mensaje de inicio de sesión); queda como mejora opcional.

## 3. Defectos preexistentes (documentados, **no corregidos**)

- El plazo de cancelación de 2 días solo lo valida la app, con la fecha del dispositivo: la API acepta cualquier cancelación (igual que las reglas de antes).
- La inscripción no se restringe por rol (la limita la pantalla); un gestor o administrador podría inscribirse llamando a la API.
- Con las reglas actuales, cualquier cliente puede mover el contador de cupos dentro de sus límites. **Se cierra** al publicar `firestore.api.rules` (M7).
- Nombre y correo de la planilla vienen de lo que cada alumno envía al inscribirse (la API usa los del perfil solo si faltan).
- La Cloud Function `functions/index.js` (`onJornadaUpdated`) no está desplegada y duplicaría los avisos si se desplegara junto a la API: eliminarla en M7.
- Un error 500 se trata como temporal en la cola offline y se reintenta con espera creciente (igual que el código `internal` de Firestore).
- Las 21 jornadas anteriores están asignadas al gestor `brayanprofe@correo.com` (dato, no código).

## 4. Pendientes y decisiones abiertas

| # | Pendiente | Quién |
|---|---|---|
| 1 | **Elegir el hosting concreto** y desplegar la API (Render/Railway/Fly/VPS) | Usuario |
| 2 | **Generar la clave de cuenta de servicio** y cargarla como secreto del hosting (nunca en el repositorio) | Usuario |
| 3 | Compilar la app con `EXPO_PUBLIC_API_URL` y validar cada módulo en producción con las cuentas de prueba | Usuario + equipo |
| 4 | M7: publicar `firestore.api.rules`, retirar la lógica local y `functions/` — solo tras 3 y con apps actualizadas | Equipo |
| 5 | Notificaciones *push* reales desde el servidor (Expo Push con el `pushToken` ya guardado): mejora, no existía | Opcional |
| 6 | Limitar la tasa de solicitudes y añadir métricas/alertas | Opcional |
| 7 | Encolar sin conexión «marcar leída/eliminar» notificación (diferencia 5) | Opcional |
| 8 | Validar el plazo de cancelación en el servidor (cambiaría el comportamiento: requiere decisión) | Opcional |
| 9 | Documento OpenAPI de los endpoints | Opcional |

## 5. Cambios posteriores: duración de las jornadas y asistencia por la API

Resueltos a partir de los choques de reglas detectados al probar la asistencia con QR (rama `IA_Agents`):

| Cambio | Detalle |
|---|---|
| **Duración (`duracionMin`)** | Campo nuevo (10–1440 min) en cada jornada, con campo en el formulario. Una jornada está **en curso** desde su hora de inicio hasta `fecha + duración`; solo entonces pasa a finalizada y se desactiva. Las que no tienen el campo se tratan como de 60 min (en la app, la API y las reglas) hasta guardarlo con `node scripts/admin.js migrar --aplicar` (primero sin `--aplicar` para simular) |
| **Asistencia por la API** | El estudiante registra con un QR cuyo código firma el servidor y caduca en 60 s (el modal del gestor lo renueva cada 30 s). La API valida código, ventana (primeros 20 min, o toda la jornada si dura menos), jornada activa e inscripción. `firestore.rules` ya no permite escribir en `inscripciones` |
| **Corrección manual** | Gestor (suyas) y administrador pueden marcar o quitar la asistencia sin límite de tiempo **desde que empieza** la jornada; queda quién y cuándo (y auditoría si es administrador) |
| **Duplicados al reintentar «Crear jornada»** | `POST /v1/jornadas` acepta `claveIdempotencia` (8–100 caracteres `A-Za-z0-9_-`): el formulario genera una por intento y la renueva al cambiar cualquier dato; repetirla devuelve la misma jornada (`200 { id, repetida: true }`) sin duplicar ni auditar otra vez. Además, tras un error de conexión el formulario comprueba (`buscarJornadaIgual`) si el intento anterior sí se guardó antes de volver a crear. La clave solo opera con la API; en modo local queda la comprobación previa |

Diferencias respecto al comportamiento anterior: una jornada ya empezada deja de aparecer como «Finalizada» y pasa a «En curso»; los cambios de duración no generan aviso a los inscritos; una captura del QR deja de servir al minuto, así que «Guardar / Compartir imagen» solo es útil para proyectar enseguida. La asistencia no funciona en modo local (sin `EXPO_PUBLIC_API_URL`).
