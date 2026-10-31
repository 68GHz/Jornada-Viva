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
| `DELETE /v1/jornadas/{id}/inscripcion` | cualquier cuenta activa | `{ canceladaEn? }` (ms): hora en que el usuario canceló **sin conexión**; si falta se usa la hora del servidor | `200 { resultado: "completada" \| "ya-cancelada" }` · `400` (hora inválida) · `409 PLAZO_VENCIDO` (solo hasta 2 días calendario antes de la jornada, hora de Colombia) · `409 ACCION_DEMASIADO_ANTIGUA` (`canceladaEn` con más de `CANCELACION_ANTIGUEDAD_MAX_HORAS`, 7 días por defecto). Repetir una cancelación ya hecha es siempre `ya-cancelada`. Si la jornada ya no existe, la inscripción huérfana se borra igual |

Idempotentes: repetirlas no duplica inscripción ni cupos. Si faltan nombre/correo se usan los del perfil.

## Gestión de jornadas (M3)

Cuerpo de crear/editar: `{ titulo, descripcion, entidad, responsable, lugar, fecha (ms epoch), cuposTotales, creadoPor? }`.
Límites: título/entidad/responsable ≤ 120, descripción ≤ 2000, cupos 1–1000 enteros, `lugar` de la lista (Bloque 1–13, Auditorio, Cancha, Coliseo).

| Método y ruta | Rol | Notas | Respuesta |
|---|---|---|---|
| `POST /v1/jornadas` | gestor, administrador | Fecha futura. `duracionMin` (entero, 10–1440): opcional, por defecto 60, para no romper versiones de la app sin el campo. `categoria` (opcional para versiones anteriores de la app): una de `Salud`, `Alfabetización digital`, `Proyección social`, `Talleres`, `Asesorías`; si llega y no es de la lista (incluido vacío) → `400`. `bannerUrl` (opcional): enlace `https` a una imagen, máx. 500 caracteres; vacío = sin banner; otro valor → `400`. Gestor: a su nombre (otro `creadoPor` → 403). Administrador: `creadoPor` = gestor/administrador activo (por defecto él) | `201 { id }` · `400 VALIDACION` |
| `PUT /v1/jornadas/{id}` | gestor (suyas), administrador (todas) | Cupos ≥ inscritos; `duracionMin` (si no llega se conserva la guardada); `categoria` (si no llega se conserva; si llega debe ser de la lista); `bannerUrl` (si no llega se conserva; `""` lo quita; un enlace `https` lo fija); si está activa, fecha futura; `creadoPor` distinto = reasignar (solo administrador, a un responsable válido). Crea avisos a los inscritos | `204` · `400` · `403` · `404` |
| `POST /v1/jornadas/{id}/cancelar` | ídem | `activa:false`; avisa a los inscritos | `204` |
| `POST /v1/jornadas/{id}/reactivar` | ídem | Exige fecha futura; avisa | `204` · `409 FECHA_PASADA` |
| `DELETE /v1/jornadas/{id}` | ídem | Las inscripciones se conservan; avisa | `204` |
| `GET /v1/jornadas/{id}/inscritos` | gestor (suyas), administrador | — | `200 { inscritos: [{ id, userId, nombreUsuario, emailUsuario, inscritoEn (ms), asistio, metodoAsistencia ("qr" \| "manual" \| null) }] }` |
| `GET /v1/jornadas/{id}/planilla.csv` | ídem | CSV UTF-8 con BOM, `sep=;`, fórmulas neutralizadas | `200 text/csv` (adjunto `planilla-<titulo>.csv`) |
| `POST /v1/mantenimiento/vencidas` | cualquier cuenta activa | Desactiva las activas que ya terminaron (inicio + `duracionMin`; 60 si no la tienen). Una jornada en curso sigue activa. No avisa | `200 { desactivadas }` |

### Estado de una jornada

No se guarda: se deduce de `activa`, `fecha` y `duracionMin` (`estadoJornada.js`, idéntico en la app y la API).

| Estado | Cuándo |
|---|---|
| `activa` | `activa: true` y aún no empieza |
| `en_curso` | `activa: true`, ya empezó y no ha terminado (`fecha + duracionMin`) |
| `cancelada` | `activa: false` y aún no empieza |
| `finalizada` | ya terminó; también una cancelada cuya hora de inicio ya llegó |

## Asistencia

La asistencia solo se escribe por la API (las reglas de Firestore no permiten escribir en `inscripciones`).

| Método y ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|
| `POST /v1/jornadas/{id}/asistencia/codigo` | gestor (suyas), administrador | — | `200 { codigo, expiraEn (ms), renovarEnMs }`. Código firmado (HMAC-SHA256) y válido 60 s para esa jornada; el modal del QR pide uno nuevo cada 30 s · `403` · `404` |
| `POST /v1/jornadas/{id}/asistencia` | estudiante inscrito | `{ codigo, escaneadoEn? (ms) }` | `200 { resultado: "registrada" \| "ya-registrada" }` (método `qr`) · `400` sin código u hora inválida · `409 ACCION_DEMASIADO_ANTIGUA` (más de `ASISTENCIA_ANTIGUEDAD_MAX_HORAS`) / `CODIGO_INVALIDO` / `CODIGO_CADUCADO` / `JORNADA_NO_DISPONIBLE` (cancelada o inexistente) / `ASISTENCIA_FUERA_DE_VENTANA` / `NO_INSCRITO` |
| `PUT /v1/jornadas/{id}/inscritos/{inscripcionId}/asistencia` | gestor (suyas), administrador | `{ asistio: boolean, marcadaEn? (ms) }` | `200 { asistio }` · `400` · `403` · `404` · `409 ASISTENCIA_NO_INICIADA` (antes de la hora de inicio) |

- **Ventana del estudiante:** desde la hora de inicio, los primeros 20 minutos (o toda la jornada si dura menos de 20).
- **Corrección manual:** sin límite de tiempo desde que empieza la jornada. Guarda `metodoAsistencia: "manual"`, `asistenciaModificadaPor` y `asistenciaModificadaEn`; si lo hace un administrador queda en la auditoría (`asistencia.marcar` / `asistencia.desmarcar`). Marcar lo que ya está así no cambia nada.

- **Acciones diferidas (hechas sin conexión).** `escaneadoEn` / `marcadaEn` son la hora del teléfono cuando se hizo la acción. El servidor usa la **menor** entre esa hora y la suya, rechaza con `ACCION_DEMASIADO_ANTIGUA` lo que supere `ASISTENCIA_ANTIGUEDAD_MAX_HORAS` (24 por defecto) y, en el QR, exige que la hora del escaneo caiga dentro de la vigencia del código ± 2 min (`CODIGO_CADUCADO` si pasó, `CODIGO_INVALIDO`/anticipado si es anterior). Una jornada desactivada tras terminar sigue aceptando asistencia diferida válida. Se guardan `asistioEn` (hora del escaneo) y `asistenciaSincronizadaEn`. Sin estos campos el comportamiento es el de siempre (hora del servidor).

Cuando actúa un **administrador**, cada operación escribe en `auditoria` (`jornada.crear`, `.editar`, `.reasignar`, `.cancelar`, `.reactivar`, `.eliminar`) en la misma operación atómica.

## Préstamos de objetos (FE-02)

Colección `prestamos`, solo accesible por la API (las reglas de Firestore niegan lectura y escritura directas).

| Método y ruta | Rol | Cuerpo / consulta | Respuesta |
|---|---|---|---|
| `POST /v1/prestamos` | gestor, administrador | `{ codigo, nombre, tipo: "libro"\|"equipo"\|"material", correo, vence (ms), nota? }` | `201 { id }` · `400` con `campos` · `403` estudiante · `404 ESTUDIANTE_NO_ENCONTRADO` · `409 OBJETO_YA_PRESTADO` (el mismo código con un préstamo activo). Administrador: auditoría `prestamo.crear` |
| `GET /v1/prestamos[?estado=activos]` | gestor (los que registró), administrador (todos) | — | `200 { prestamos: [...] }` |
| `POST /v1/prestamos/{id}/devolucion` | gestor (los suyos), administrador | — | `200 { resultado: "devuelto" \| "ya-devuelto" }` · `403` · `404`. Administrador: auditoría `prestamo.devolver` |
| `GET /v1/me/prestamos` | estudiante | — | `200 { prestamos: [...] }` (solo los propios) |

El plazo máximo es de 90 días y el código del objeto se normaliza (mayúsculas, espacios) para detectar duplicados.

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
