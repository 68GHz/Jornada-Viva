# Cambios en la app móvil y pruebas

## Cómo se activa la API en la app

La app habla con la API **solo si hay una URL configurada**. Sin ella, todo funciona como antes
(lógica local + Firestore): no hay ningún cambio de comportamiento hasta que se despliegue la API.

```
EXPO_PUBLIC_API_URL=https://tu-api.example.com      # vacío = lógica local anterior
EXPO_PUBLIC_API_MODULOS=todos                       # o una lista: sesion,inscripciones,jornadas,notificaciones,usuarios,reportes
```

Cada módulo se puede apagar por separado (interruptor de recuperación). Las variables
`EXPO_PUBLIC_*` se incorporan al compilar la app, así que cambiarlas exige publicar una actualización.

## Archivos nuevos

| Archivo | Para qué |
|---|---|
| `src/config/api.js` | URL y módulos activos (`usaApi("jornadas")`) |
| `src/services/apiClientCore.js` | Cliente HTTP único (sin Firebase, probable en Node): token, tiempo límite y traducción de errores al vocabulario que ya usaba la app (`ErrorRed`, `ErrorNegocio`, `permission-denied`…) |
| `src/services/apiClient.js` | Conecta el cliente con Firebase Auth (ID token) → `llamarApi(metodo, ruta, { cuerpo, texto, espera })` |
| `src/services/avisosLocales.js`, `src/utils/avisosLocales.js` | Muestra como aviso del dispositivo las notificaciones que crea el servidor |

## Archivos modificados (cada uno conserva su rama local)

| Módulo | Archivo | Con la API… |
|---|---|---|
| `sesion` | `context/AuthContext.jsx` | `registrar` crea el perfil con `POST /v1/me/perfil` (solo el nombre) en vez de `setDoc` |
| `inscripciones` | `services/inscripcionService.js` | `ejecutarAccion` (la que usa la cola offline) llama a `PUT/DELETE …/inscripcion`. La cola, los reintentos y los avisos de conexión **no cambian** |
| `jornadas` | `services/jornadaAdminService.js` | crear/editar/cancelar/reactivar/eliminar/inscritos → endpoints; mensajes de error iguales |
| `jornadas` | `services/jornadaEstadoService.js` | la limpieza de vencidas llama a `POST /v1/mantenimiento/vencidas` |
| `jornadas` | `services/jornadaEventService.js` | el dispositivo **deja de detectar cambios** (los avisos los crea el servidor) |
| `jornadas` | `context/NotificationContext.jsx` | muestra el aviso local de las notificaciones nuevas |
| `jornadas` | `services/planillaService.js` | la planilla la genera el servidor; la app solo la guarda y la comparte |
| `notificaciones` | `services/jornadaEventService.js`, `services/notificationService.js` | marcar leída(s), eliminar y guardar el token push → endpoints |
| `usuarios` | `services/adminService.js` | crear cuenta y cambiar rol/estado/nombre → endpoints (el servidor audita) |
| `reportes` | `hooks/useAdmin.js`, `screens/admin/AdminDashboardScreen.jsx`, `ReportesScreen.jsx` | indicadores y reporte desde la API |

El aspecto de las pantallas, la navegación, los textos, los filtros, `CalendarioRango`, el modo sin
conexión y los avisos de conexión **no cambian** (solo se tocó de dónde salen los datos de las
pantallas de estadísticas y reporte del administrador).

## Pruebas (cómo ejecutarlas y resultado)

| Comando | Qué prueba | Resultado |
|---|---|---|
| `npm test` | Lógica pura de la app (roles, estados, formularios, planilla, avisos, **cliente HTTP y configuración**) | **93/93** |
| `npm run test:rules` | `firestore.rules` actuales + **reglas de solo lectura posteriores a la migración** | **81/81** (58 previas + 23 nuevas) |
| `npm run test:api` | API real contra los emuladores: paridad de reglas, auth con tokens reales, perfil, inscripciones (con concurrencia), jornadas, avisos, vencidas, notificaciones, cuentas, estadísticas/reporte y el **servidor real arrancado** | **155/155** |
| `npm run test:equivalencia` | **Los servicios reales de la app con los mismos escenarios en modo local (reglas) y en modo API** | **23/23 local · 23/23 API** |
| `npm run test:all` | Todo lo anterior | — |

Además (arneses de sesión, no incluidos en el repositorio): AuthContext 14/14 y 3/3 en modo API,
interfaz/contextos 18/18, modo sin conexión 32/32, notificaciones 20/20, y el empaquetado de la app
para Android e iOS compila.

### Pruebas de equivalencia

`tests/equivalencia/escenarios.cjs` transpila los servicios reales de la app y ejecuta los mismos
escenarios con `MODO=local` (SDK de Firestore + `firestore.rules`, el comportamiento de referencia) y
con `MODO=api` (la app llamando a la API real). Cubren: inscripción/cancelación (idempotencia,
dobles toques, antiguas, motivos y mensajes de rechazo), cupos, jornadas vencidas, el CRUD completo
del gestor y del administrador, jornadas ajenas, inscritos, el escenario reportado de cancelación
con la sesión cerrada, reprogramación/actualización/reactivación/eliminación, notificaciones del
usuario y la administración de cuentas con su auditoría. Las diferencias aceptadas están marcadas
con `MODO === "api"` y listadas en [06](06-estado-pendientes-y-diferencias.md).

### ¿Las pruebas detectan fallos?

Se aplicaron 5 mutaciones deliberadas a la API y las 5 fueron detectadas (el gestor edita jornadas
ajenas · inscribirse ignora los cupos · no se crean los avisos · el registro acepta el rol enviado ·
un administrador cambia su propio rol). Además, al arrancar el servidor real se halló y corrigió un
defecto de inicialización (`credential: undefined`) que las pruebas con la app inyectada no veían.
