# Migración de la lógica de negocio a una API — Diagnóstico, inventario y plan

Estado: **Diagnóstico, inventario y plan completos. Decisiones tomadas (sección 6). Módulos M0–M6 implementados y verificados en emulador; M7 preparado y pendiente de despliegue. Estado actual: [06-estado-pendientes-y-diferencias.md](06-estado-pendientes-y-diferencias.md).**

Documentos: [02 arquitectura y servicios](02-arquitectura-y-servicios.md) · [03 endpoints](03-endpoints.md) · [04 cambios en el móvil y pruebas](04-cambios-en-el-movil-y-pruebas.md) · [05 despliegue y recuperación](05-despliegue-y-recuperacion.md) · [06 estado, diferencias y pendientes](06-estado-pendientes-y-diferencias.md)

## 1. Arquitectura actual

**No existe un backend propio.** La app (Expo / React Native) habla directamente con Firebase:

| Capa | Hoy |
|---|---|
| Autenticación | Firebase Auth (correo/contraseña), sesión persistida en AsyncStorage |
| Base de datos | Firestore (`users`, `jornadas`, `inscripciones`, `notificaciones`, `auditoria`, `eventos_jornadas`) |
| "Backend" | Solo `firestore.rules` (autorización y validación de datos). Es el único código que corre en un servidor |
| Cloud Functions | `functions/index.js` existe pero **no está desplegada** (el proyecto no tiene plan Blaze) |
| Lecturas | Listeners en tiempo real (`onSnapshot`) que alimentan las pantallas y la caché offline |
| Escrituras | Transacciones/lotes de Firestore ejecutados desde el móvil |

Toda la lógica de negocio vive en el cliente (10 archivos importan Firebase, ≈1.500 líneas) y las reglas de Firestore la repiten como validación. Es decir, **hoy el negocio está duplicado** (cliente + reglas), que es justo lo que la migración debe resolver.

## 2. Clasificación de responsabilidades

| Tipo | Qué es | Dónde queda |
|---|---|---|
| **Negocio** | Reglas de inscripción/cancelación y cupos, validación de jornadas, visibilidad (disponible / Mis jornadas), vencimiento, permisos por rol, gestión de cuentas, asignación de gestores, estadísticas, planilla y reporte, detección y creación de avisos, auditoría | **API** |
| **Persistencia** | Lecturas/escrituras de Firestore | **API** (única escritora) |
| **Presentación** | Pantallas, filtros de texto/estado/fecha de las listas, `CalendarioRango`, banner de conexión, mensajes y confirmaciones | **Móvil** |
| **Dispositivo** | AsyncStorage (caché y cola offline), NetInfo, notificaciones locales, archivos/compartir, reloj local | **Móvil** |
| **Externa** | Firebase Auth (inicio de sesión), Expo push (no usado en la práctica) | Auth se conserva (ver 4.2) |

## 3. Inventario de funcionalidades

Leyenda de pruebas: **R** = ya existe prueba de reglas (`tests/rules`), **I** = prueba de integración con SDK real (carpeta temporal de sesión), **U** = prueba unitaria (`tests/unit`). Estas pruebas **describen el comportamiento actual** y se reutilizarán como pruebas de caracterización contra la API.

| # | Funcionalidad | Reglas actuales | Archivos | Endpoint propuesto | Pruebas actuales |
|---|---|---|---|---|---|
| F1 | Registro | Crea cuenta de acceso + perfil con `rol: estudiante`, `activo` implícito; nadie se registra con otro rol | `AuthContext` | `POST /v1/auth/registro` | R, AuthContext |
| F2 | Inicio/cierre de sesión | Firebase Auth; al cerrar sesión se borra todo lo local; errores de red con mensaje propio | `AuthContext`, `Login/RegisterScreen` | (Auth de Firebase se conserva) | AuthContext |
| F3 | Perfil y rol | Rol normalizado (`maestro`→`gestor`, valor raro→estudiante); cuenta `activo:false` ⇒ cierra sesión | `AuthContext`, `roles.js` | `GET /v1/me` | U, AuthContext |
| F4 | Jornadas disponibles | `activa === true` y fecha futura; orden por fecha; filtros en cliente | `JornadasContext`, `jornadaEstado` | `GET /v1/jornadas` | U |
| F5 | Mis jornadas / Home | Inscripciones del usuario; oculta desactivadas futuras; conserva finalizadas y eliminadas ("No disponible") | `JornadasContext`, `jornadaEstado` | `GET /v1/me/inscripciones` | U |
| F6 | **Inscribirse** | Jornada existe, activa, no vencida, hay cupo; no duplica (ID `uid_jornada` + antiguas); suma cupo; anota `jornadasVistas`; idempotente; rechazos con motivo | `inscripcionService`, `useAccionesInscripcion` | `PUT /v1/jornadas/{id}/inscripcion` | R, I |
| F7 | **Cancelar inscripción** | Borra (incluye ID antiguo), libera cupo sin bajar de 0, quita `jornadasVistas`; idempotente; **plazo de 2 días validado solo en el cliente con la fecha del dispositivo** | ídem + `jornadaFecha` | `DELETE /v1/jornadas/{id}/inscripcion` | R, I, U |
| F8 | Cola offline y sincronización | Acciones guardadas, reintentos con espera, conflictos (sin cupo / desactivada → rechazada), anulación inscribir+cancelar | `syncQueue/Engine`, `SyncContext` | **Se queda en el móvil** (capacidad del dispositivo); llama a F6/F7 | 32 pruebas |
| F9 | Limpieza de jornadas vencidas | Cualquier cliente desactiva (`activa:false`) las vencidas activas; sin fecha no | `JornadasContext`, `jornadaEstadoService` | Tarea del servidor (`POST /v1/mantenimiento/vencidas` / programada) | R, I |
| F10 | Avisos de cambios | Cancelación / reactivación / reprogramación / actualización / eliminación; compara con `jornadasVistas`; vencimiento no es cancelación | `cambiosJornada`, `jornadaEventService` | El servidor crea el aviso al ejecutar el cambio (F12–F15) | U, 20 de servicio |
| F11 | Notificaciones del usuario | Listar, marcar leída(s), eliminar; aviso local en el dispositivo | `NotificationContext`, `NotificationsScreen` | `GET/PATCH/DELETE /v1/me/notificaciones` | R |
| F12 | Crear jornada (gestor/admin) | Espacio de la lista, textos, cupos 1–1000, fecha futura; gestor a su nombre, admin para cualquier gestor; `cuposOcupados 0`, `activa true` | `jornadaForm`, `jornadaAdminService` | `POST /v1/jornadas` | R, I, U |
| F13 | Editar / reasignar | Solo asignada (gestor) o cualquiera (admin); cupos ≥ inscritos; fecha futura si activa; gestor responsable válido | ídem | `PATCH /v1/jornadas/{id}` | R, I |
| F14 | Cancelar / reactivar | Gestor sobre las suyas, admin sobre todas; reactivar exige fecha futura | ídem | `POST /v1/jornadas/{id}/cancelar` · `/reactivar` | R, I |
| F15 | Eliminar jornada | Gestor las suyas, admin todas; las inscripciones se conservan | ídem | `DELETE /v1/jornadas/{id}` | R, I |
| F16 | Inscritos y planilla | Gestor de sus jornadas, admin de todas; CSV con neutralización de fórmulas | `planilla`, `planillaService` | `GET /v1/jornadas/{id}/inscritos` (+ `/planilla.csv`) | R, I, U |
| F17 | Gestión de usuarios (admin) | Crear cuenta con rol, editar nombre, activar/desactivar, **no sobre sí mismo**; roles válidos | `adminService` | `POST/PATCH /v1/usuarios` | R, I |
| F18 | Asignar roles (admin) | Solo otro administrador; confirmación en la UI | ídem | `PUT /v1/usuarios/{id}/rol` | R, I |
| F19 | Consultas admin | Listado de usuarios y gestores, jornadas por gestor, filtros | `useAdmin`, `usuariosAdmin` | `GET /v1/usuarios`, `GET /v1/jornadas?gestor=` | U |
| F20 | Estadísticas y reportes | Conteos por rol/estado/espacio/gestor, ocupación; reporte CSV | `usuariosAdmin`, `planilla` | `GET /v1/admin/estadisticas` · `/reporte.csv` | U |
| F21 | Auditoría | Registro inmutable de acciones del admin, atómico con la acción | `adminService` | Lo escribe el servidor en la misma transacción; `GET /v1/admin/auditoria` | R, I |
| F22 | Autorización por rol | Matriz de permisos; cuentas desactivadas no escriben | `firestore.rules` | Middleware de la API (las reglas pasan a denegar escrituras directas) | 58 de reglas |

> **Nota (decisión 3):** los `GET` propuestos para F4, F5 y F19 (listar jornadas, «Mis jornadas», listar usuarios) **no se crearon**: esas lecturas siguen con los listeners de Firestore de solo lectura. Los endpoints reales están en [03-endpoints.md](03-endpoints.md).

## 4. Decisiones de arquitectura (con recomendación)

### 4.1 Dónde corre la API
El proyecto **no tiene plan Blaze**, así que *Cloud Functions no es una opción gratuita*. La API necesita credenciales de **Admin SDK** (clave de cuenta de servicio) que **nunca** pueden ir en la app. Opciones:

1. **Node.js + Express en un hosting externo** (Render/Railway/Fly/VPS). Recomendada si se quiere seguir sin Blaze. Hay que guardar la clave de servicio como secreto del servidor.
2. **Cloud Functions / Cloud Run en Firebase** (requiere activar Blaze; tiene capa gratuita pero exige tarjeta).
3. Solo servidor local (desarrollo y sustentación).

Elegiría *Node + Express + `firebase-admin`* (el proyecto ya es JavaScript y `functions/` ya usa `firebase-admin`), empaquetado para correr en cualquiera de las tres.

### 4.2 Autenticación
Se **conserva Firebase Auth** (las cuentas actuales siguen funcionando y no hay migración de contraseñas). El móvil inicia sesión como hoy y envía su *ID token* en `Authorization: Bearer`; la API lo verifica con Admin SDK y lee rol/estado de `users/{uid}` en cada petición. Registro y creación de cuentas pasan por la API.

### 4.3 Lecturas en tiempo real y modo offline *(punto crítico)*
La app depende de `onSnapshot` para actualizarse sola y de la caché local para el modo offline (requisito de la 2.ª entrega). Reemplazarlo por consultas HTTP **cambiaría el comportamiento** (se perdería la actualización en vivo) y obliga a rehacer la caché. Recomendación para preservar el comportamiento:

- **Todas las escrituras y reglas de negocio → API.** Las reglas de Firestore pasan a *denegar toda escritura directa del cliente* (la API, con Admin SDK, pasa a ser la única escritora).
- **Lecturas simples de datos propios o públicos** siguen con los listeners de Firestore (solo lectura) en una primera etapa; las lecturas con lógica (estadísticas, reportes, planilla, listados del administrador) pasan a la API.
- Una etapa posterior opcional puede mover también las lecturas, con *polling* o SSE, si se acepta la diferencia.

### 4.4 Diferencias inevitables que hay que documentar
- **Fecha del dispositivo vs. del servidor:** hoy el plazo de cancelación y el vencimiento usan la fecha del dispositivo (decisión de la 2.ª entrega). El servidor usa su reloj. Para no cambiar el resultado de acciones hechas sin conexión, la API aceptará la hora de la acción (`accionEn`) acotada y la validará con una tolerancia, igual que hoy.
- **Avisos:** hoy los crea el dispositivo del alumno al abrir la app; con la API los crea el servidor en el momento del cambio (llegan antes y no dependen de la sesión). El aviso local del dispositivo sigue siendo del móvil. Los cambios hechos a mano en la consola de Firestore dejarían de generar aviso (la API ya no los ve).
- **Cuentas desactivadas:** con Admin SDK sí se puede deshabilitar la cuenta de acceso además del bloqueo actual.

### 4.5 Defectos preexistentes (se documentan, **no** se corrigen en la migración)
- El plazo de cancelación de 2 días solo se valida en el cliente.
- El contador de cupos puede moverlo cualquier usuario con sesión dentro de sus límites (las reglas no lo atan a la inscripción).
- El nombre y correo de la planilla vienen de lo que cada alumno guardó al inscribirse.
- La Cloud Function `onJornadaUpdated` está sin desplegar y duplicaría avisos si se desplegara.
- Las 21 jornadas anteriores se asignaron al gestor `brayanprofe@correo.com` (dato, no código).

## 5. Plan de migración por módulos

Cada módulo sigue el ciclo: caracterizar → servicio de negocio → endpoint → pruebas independientes → adaptar el móvil → pruebas de equivalencia → quitar lo local.

| Módulo | Contenido | Depende de | Estado |
|---|---|---|---|
| **M0** Infraestructura | Proyecto `api/`, Express, middleware (token, rol, cuenta activa), validación, errores, logging, configuración por variables de entorno, pruebas con el emulador, cliente HTTP único en el móvil (`apiClient`) | Decisión 4.1 | Implementado y verificado en emulador |
| **M1** Sesión y perfil | F1, F3 | M0 | Implementado y verificado en emulador |
| **M2** Inscripciones | F6, F7 (transacciones idempotentes; la cola offline del móvil llama a la API) | M0 | Implementado y verificado en emulador |
| **M3** Gestión de jornadas | F12–F16 (+ avisos F10 creados por el servidor, F9 como tarea del servidor) | M0, M2 | Implementado y verificado en emulador |
| **M4** Notificaciones | F11 | M3 | Implementado y verificado en emulador |
| **M5** Administración de cuentas | F17, F18, F19 | M0 | Implementado y verificado en emulador |
| **M6** Estadísticas, reportes y auditoría | F20, F21 | M3, M5 | Implementado y verificado en emulador |
| **M7** Cierre | Reglas de Firestore deniegan escrituras directas; se elimina la lógica local migrada; documentación y plan de recuperación | M1–M6 | Preparado (`firestore.api.rules` + pruebas); pendiente de despliegue |

Recuperación: cada módulo se activa con un *interruptor* de configuración en el móvil (API ↔ lógica local) mientras dure la migración, y las reglas actuales quedan guardadas (versión de ruleset) para revertir. El interruptor se retira en M7.

## 6. Decisiones

1. **Dónde se aloja la API:** Node + Express en hosting externo (elegido). *Hosting concreto: pendiente.*
2. **Credenciales de Admin SDK:** clave de cuenta de servicio como secreto del servidor, nunca en el repositorio ni en la app. *Pendiente de generar y cargar.*
3. **Alcance de lecturas:** se mantienen los listeners de Firestore de solo lectura (elegido).
4. **Avisos creados por el servidor:** aceptado; los cambios hechos a mano en la consola ya no generan aviso (elegido).
