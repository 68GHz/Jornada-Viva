# Arquitectura de la API y servicios de negocio

## Visión general

```
App móvil (Expo)                          API (Node + Express)                  Firebase
────────────────                          ────────────────────                  ────────
Firebase Auth (login)  ──── ID token ───► middleware autenticar ──verifyIdToken──► Auth
apiClient (HTTP)       ──── /v1/... ────► rutas → servicios ─────Admin SDK───────► Firestore
listeners onSnapshot ◄──────────────────────────── lectura en vivo ──────────────── Firestore
```

- **Autenticación:** se conserva Firebase Auth (las cuentas y contraseñas no se migran). La app inicia
  sesión como siempre y manda su *ID token* en `Authorization: Bearer`. La API lo verifica con el Admin
  SDK y lee `users/{uid}` **en cada solicitud** (rol y estado de la cuenta siempre al día).
- **Escritura:** únicamente la API (Admin SDK). Todo cambio de datos pasa por una regla de negocio
  de la API.
- **Lectura:** la app mantiene sus listeners de Firestore de solo lectura (tiempo real y modo sin
  conexión); decisión tomada con el usuario para no cambiar el comportamiento. Lo que tiene lógica
  o es sensible (estadísticas, reporte, planilla, lista de inscritos) lo entrega la API.
- **Formato de los datos:** la API escribe **exactamente el mismo esquema** que escribía la app
  (campos, tipos, ID `uid_jornada`, `jornadasVistas`…). Por eso la app con lógica local y la app con
  API pueden convivir sobre los mismos datos y se puede volver atrás sin migrar nada.

## Estructura de `api/`

```
api/
├── src/
│   ├── server.js            Arranque: configuración, Firebase, tarea de jornadas vencidas
│   ├── app.js               crearApp({ db, auth, verificarToken, ahora }): rutas HTTP (todo inyectable)
│   ├── config.js            Variables de entorno
│   ├── firebase.js          Admin SDK (clave de servicio por entorno)
│   ├── errores.js           ErrorApi y fábricas: validacion, sinPermiso, noEncontrado, negocio
│   ├── middleware/          autenticacion.js (token + rol + cuenta activa), errores.js
│   ├── dominio/             Reglas puras: roles, espacios, zonaNegocio, jornada (validación),
│   │                        cambiosJornada, instantaneaJornada, planilla, usuariosAdmin, estadoJornada
│   └── servicios/           Casos de uso con Firestore (ver tabla)
├── tests/{unit,integracion}
├── scripts/verificar-despliegue.mjs
├── Dockerfile · .env.example · README.md
```

`dominio/` son las mismas reglas puras que tiene la app (copias idénticas; la prueba
`paridad.test.mjs` falla si divergen). Al cerrar la migración (M7) la copia de la app se retira.

## Servicios

| Servicio | Casos de uso | Reglas que aplica (idénticas a las de antes) |
|---|---|---|
| `perfiles` | Crear perfil al registrarse; consultar `/me` | Siempre rol `estudiante`; idempotente; nunca modifica un perfil existente |
| `inscripciones` | Inscribirse, cancelar | Transacción; ID `uid_jornada` + búsqueda de inscripciones antiguas; jornada existe/activa/no vencida/con cupo; idempotente (`ya-inscrito`, `ya-cancelada`); cupos nunca < 0; anota/quita `jornadasVistas` |
| `jornadas` | Crear, editar/reasignar, cancelar, reactivar, eliminar, inscritos, planilla | Gestor solo lo suyo (`creadoPor`), administrador todo; cupos ≥ inscritos; jornada activa exige fecha futura; reactivar exige fecha futura; responsable válido (existe, activo, gestor/administrador); auditoría del administrador en la misma operación |
| `avisos` | Avisos de cancelación, reactivación, reprogramación, actualización y eliminación | Compara con `users/{uid}.jornadasVistas`; vencer no es cancelar; sin estado anotado no avisa, solo anota; lotes de 200 alumnos |
| `mantenimiento` | Desactivar jornadas vencidas | Solo `activa:true` con fecha pasada; sin fecha no se toca; corre cada `MANTENIMIENTO_MINUTOS` y bajo demanda |
| `notificaciones` | Marcar leída(s), eliminar, token push | Solo las propias; solo `leida`/`leidaEn` |
| `usuarios` | Crear cuenta, cambiar nombre/rol/estado | Solo administrador; nunca sobre sí mismo; roles válidos; cuenta de acceso + perfil + auditoría (si falla el perfil se borra la cuenta de acceso) |
| `estadisticas` | Indicadores globales, reporte de jornadas | Mismos cálculos (`calcularEstadisticas`); el reporte se audita |

## Modelo de errores

Todas las respuestas de error son `{ "error": { "codigo", "mensaje", "campos"? } }`:

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Datos inválidos; `campos` = `{ campo: mensaje }` con los mismos mensajes del formulario |
| 401 | `NO_AUTENTICADO` | Sin token o token inválido/vencido |
| 403 | `SIN_PERMISO` / `CUENTA_DESACTIVADA` | El rol no permite la acción / cuenta con `activo:false` |
| 404 | `NO_ENCONTRADO` / `RUTA_NO_ENCONTRADA` | Recurso o ruta inexistente |
| 409 | `JORNADA_NO_DISPONIBLE`, `SIN_CUPOS`, `FECHA_PASADA`, `EMAIL_EN_USO` | Regla de negocio incumplida (mismos códigos y mensajes que la app) |
| 503 | `SERVICIO_OCUPADO` | Contención de transacciones agotada: la app lo trata como temporal y reintenta |
| 500 | `ERROR_INTERNO` | Error inesperado; el detalle solo va al registro del servidor |

## Seguridad

- La clave de la cuenta de servicio vive **solo** en variables de entorno del servidor; la app solo
  conoce la URL de la API. Nada de `api/.env` entra al repositorio (`.gitignore`).
- El rol y el estado de la cuenta se leen de Firestore en cada solicitud: un cambio de rol o una
  desactivación surte efecto de inmediato (no se confía en datos del token ni de la solicitud).
- Quien se registra es siempre estudiante: el cuerpo de `POST /v1/me/perfil` nunca decide el rol.
- Cuerpo JSON limitado a 100 kB; CORS cerrado por defecto (la app móvil no lo necesita); cabeceras
  `X-Content-Type-Options` y `Cache-Control: no-store`.
- El registro del servidor no contiene tokens ni contraseñas (hay una prueba que lo verifica).
