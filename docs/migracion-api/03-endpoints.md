# Documentación de endpoints (`/v1`)

Todos requieren `Authorization: Bearer <ID token de Firebase Auth>` salvo `GET /v1/salud`.
Cuerpos y respuestas en JSON (salvo los CSV). Errores: ver [02-arquitectura-y-servicios.md](02-arquitectura-y-servicios.md).
"Gestor" incluye el alias antiguo `maestro`.

## Sesión y perfil (M1)

| Método y ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|
| `GET /v1/salud` | público | — | `200 { estado: "ok" }` |
| `GET /v1/me` | cualquiera | — | `200 { uid, email, nombre, rol, activo }` (rol normalizado) |
| `POST /v1/me/perfil` | cualquiera (sin perfil) | `{ nombre }` (1–100) | `201 { creado: true }` · `200 { creado: false }` si ya existía. Siempre `rol: estudiante`; ignora cualquier otro campo |

## Inscripciones (M2)

| Método y ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|
| `PUT /v1/jornadas/{id}/inscripcion` | cualquier cuenta activa | `{ nombreUsuario?, emailUsuario?, tituloJornada? }` | `200 { resultado: "completada" \| "ya-inscrito" }` · `409 JORNADA_NO_DISPONIBLE` («La jornada ya no existe.» / «…fue desactivada.» / «…ya finalizó.») · `409 SIN_CUPOS` |
| `DELETE /v1/jornadas/{id}/inscripcion` | cualquier cuenta activa | — | `200 { resultado: "completada" \| "ya-cancelada" }` |

Idempotentes: repetirlas no duplica inscripción ni cupos. Si faltan nombre/correo se usan los del perfil.

## Gestión de jornadas (M3)

Cuerpo de crear/editar: `{ titulo, descripcion, entidad, responsable, lugar, fecha (ms epoch), cuposTotales, creadoPor? }`.
Límites: título/entidad/responsable ≤ 120, descripción ≤ 2000, cupos 1–1000 enteros, `lugar` de la lista (Bloque 1–13, Auditorio, Cancha, Coliseo).

| Método y ruta | Rol | Notas | Respuesta |
|---|---|---|---|
| `POST /v1/jornadas` | gestor, administrador | Fecha futura. Gestor: a su nombre (otro `creadoPor` → 403). Administrador: `creadoPor` = gestor/administrador activo (por defecto él) | `201 { id }` · `400 VALIDACION` |
| `PUT /v1/jornadas/{id}` | gestor (suyas), administrador (todas) | Cupos ≥ inscritos; si está activa, fecha futura; `creadoPor` distinto = reasignar (solo administrador, a un responsable válido). Crea avisos a los inscritos | `204` · `400` · `403` · `404` |
| `POST /v1/jornadas/{id}/cancelar` | ídem | `activa:false`; avisa a los inscritos | `204` |
| `POST /v1/jornadas/{id}/reactivar` | ídem | Exige fecha futura; avisa | `204` · `409 FECHA_PASADA` |
| `DELETE /v1/jornadas/{id}` | ídem | Las inscripciones se conservan; avisa | `204` |
| `GET /v1/jornadas/{id}/inscritos` | gestor (suyas), administrador | — | `200 { inscritos: [{ id, userId, nombreUsuario, emailUsuario, inscritoEn (ms), asistio }] }` |
| `GET /v1/jornadas/{id}/planilla.csv` | ídem | CSV UTF-8 con BOM, `sep=;`, fórmulas neutralizadas | `200 text/csv` (adjunto `planilla-<titulo>.csv`) |
| `POST /v1/mantenimiento/vencidas` | cualquier cuenta activa | Desactiva las activas con fecha pasada (no avisa) | `200 { desactivadas }` |

Cuando actúa un **administrador**, cada operación escribe en `auditoria` (`jornada.crear`, `.editar`, `.reasignar`, `.cancelar`, `.reactivar`, `.eliminar`) en la misma operación atómica.

## Notificaciones (M4)

Las notificaciones las crea el servidor al ejecutar los cambios de jornada (la app las lee por Firestore).

| Método y ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|
| `PATCH /v1/me/notificaciones/{id}` | dueño | `{ leida: true }` (nada más) | `204` · `403` ajena · `404` |
| `POST /v1/me/notificaciones/leer-todas` | dueño | `{ ids? }` (sin `ids`: todas las no leídas; si alguno es ajeno se rechaza todo) | `200 { marcadas }` |
| `DELETE /v1/me/notificaciones/{id}` | dueño | — | `204` |
| `PUT /v1/me/push-token` | cualquiera con perfil | `{ token }` | `204` |

## Administración de cuentas (M5) — solo administrador

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /v1/usuarios` | `{ nombre, correo, clave (≥6), rol }` | `201 { id }` · `400` · `409 EMAIL_EN_USO`. Crea la cuenta de acceso + perfil + auditoría `usuario.crear` |
| `PATCH /v1/usuarios/{id}` | `{ nombre?, rol?, activo? }` | `200 { cambiado }`. Nunca sobre sí mismo (403). Auditoría `usuario.rol` / `usuario.estado` / `usuario.editar`. Sin cambios reales: no escribe ni audita |

## Estadísticas y reportes (M6) — solo administrador

| Método y ruta | Respuesta |
|---|---|
| `GET /v1/admin/estadisticas` | `200` indicadores (`totalUsuarios`, `estudiantes`, `gestores`, `administradores`, `cuentasInactivas`, `totalJornadas`, `porEstado`, `porEspacio`, `porGestor`, `cuposTotales`, `cuposOcupados`, `ocupacion`) + `porGestorNombre: [{ id, nombre, jornadas }]` |
| `GET /v1/admin/reporte-jornadas.csv` | `200 text/csv`; registra `reporte.exportar` en la auditoría |

## Lo que NO tiene endpoint (a propósito)

Listar jornadas, «Mis jornadas», el perfil/rol propio, la lista de usuarios y la auditoría siguen
leyéndose con los listeners de Firestore de solo lectura (decisión: conservar tiempo real y modo sin
conexión). El inicio de sesión sigue siendo Firebase Auth.
