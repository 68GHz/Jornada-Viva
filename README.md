# Jornada Viva

Aplicación móvil (React Native + Expo) para gestionar la inscripción a jornadas, brigadas y actividades de proyección social y bienestar del **Tecnológico de Antioquia**. Los alumnos exploran e inscriben jornadas (también sin internet); los gestores administran las suyas y descargan la planilla de inscritos; los administradores gestionan usuarios, jornadas, reportes y auditoría. La lógica de negocio vive en una **API propia** (`api/`) y los datos en Firebase.

## Funcionalidades

- Registro, inicio y cierre de sesión con **Firebase Authentication**.
- Listado de jornadas en tiempo real desde **Firestore** (con filtros por texto, estado y fecha), detalle con cupos y responsable.
- **Inscripción y cancelación** con control de cupos, sin duplicados y con **modo offline** (las acciones quedan en cola y se sincronizan al reconectar).
- **Notificaciones** cuando cambia una jornada en la que el alumno está inscrito (cancelación, reactivación, reprogramación, actualización, eliminación).
- **Tres roles** — alumno, gestor de jornadas y administrador (ver [Roles y permisos](#roles-y-permisos)): los gestores crean y gestionan sus jornadas y descargan la planilla (CSV para Excel); el administrador gestiona usuarios, gestores, jornadas, estadísticas, reportes y auditoría.
- **API de negocio** en Node + Express que aplica las reglas, crea los avisos y audita (ver [API de negocio](#api-de-negocio)).

## Stack

- **App:** Expo SDK `58` · React Native `0.88` · React `19.3` · React Navigation (native stack)
- **Firebase:** Authentication + Firestore (proyecto `jornadaviva-476ff`)
- **Persistencia local y red:** `@react-native-async-storage/async-storage` y `@react-native-community/netinfo` (modo offline)
- **Archivos y avisos:** `expo-file-system`, `expo-sharing` (planilla y reportes), `expo-notifications` (avisos locales)
- **Fechas:** dayjs
- **API:** Node.js ≥ 20 + Express 5 + `firebase-admin`, desplegable en Render (plan gratuito) o en cualquier hosting Node/Docker

> Este proyecto usa **Expo SDK 58**, que solo funciona con **Expo Go 58** (o un *development build* de SDK 58). Consulta la documentación versionada en <https://docs.expo.dev/versions/v58.0.0/> antes de modificar la configuración nativa o usar APIs de Expo.

## Arquitectura

```
App móvil (Expo)                        API (Node + Express)                 Firebase
────────────────                        ────────────────────                 ────────
Firebase Auth (inicio de sesión) ──ID token──► verifica token, rol y cuenta ──► Auth
apiClient: escrituras y reportes ───/v1/...──► reglas de negocio ──Admin SDK──► Firestore
listeners onSnapshot (solo lectura) ◄───────────── tiempo real ───────────────── Firestore
```

- La **API es la fuente de verdad**: es la única que escribe en Firestore (inscripciones, jornadas, avisos, cuentas, auditoría).
- La **app solo lee** con listeners de Firestore (tiempo real y modo sin conexión). Sin `EXPO_PUBLIC_API_URL`, la app usa su lógica local anterior (Firestore + `firestore.rules`), útil como respaldo.
- Detalles, endpoints, despliegue y recuperación: [`docs/migracion-api/`](docs/migracion-api/).

## Requisitos previos

- **Node.js 22.13+** (o 24.3+). Las versiones impares no están soportadas por Expo SDK 58.
- **Expo Go 58** en el celular (Play Store / App Store) o un emulador.
- Un proyecto de Firebase con Authentication (Email/Password) y Firestore habilitados.
- Para las pruebas con emuladores: **Java** (para el emulador de Firestore).

## Configuración

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea un archivo `.env` en la raíz a partir de `.env.example` y completa tus credenciales de Firebase:

   ```bash
   EXPO_PUBLIC_FIREBASE_API_KEY=
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   EXPO_PUBLIC_FIREBASE_APP_ID=

   # Opcional: usar la API de negocio (vacío = lógica local)
   EXPO_PUBLIC_API_URL=https://jornada-viva.onrender.com
   EXPO_PUBLIC_API_MODULOS=todos
   ```

3. Inicia la app:

   ```bash
   npm start
   ```

   Luego abre en Expo Go (escaneando el QR) o en un emulador con `npm run android` / `npm run ios`. Las variables `EXPO_PUBLIC_*` se incorporan al empaquetar: tras cambiar el `.env`, reinicia con `npx expo start -c`.

## Estructura del proyecto

```
├── App.js · index.js          # Punto de entrada y proveedores
├── firebaseConfig.js          # Inicialización de Firebase (Auth con AsyncStorage + Firestore)
├── firestore.rules            # Reglas actuales (mientras la app pueda escribir directo)
├── firestore.api.rules        # Reglas de solo lectura para cuando la API sea la única escritora
├── src/
│   ├── components/            # JornadaCard, FiltrosJornadas, CalendarioRango, ConnectionBanner, AdminUi...
│   ├── config/api.js          # URL de la API e interruptor por módulo
│   ├── context/               # Auth, Jornadas, Conectividad, Sincronización, Notificaciones
│   ├── hooks/                 # useAdmin, useJornadasMaestro, useAccionesInscripcion
│   ├── navigation/            # AppNavigator (stacks de auth, alumno, gestor y administrador)
│   ├── screens/
│   │   ├── auth/              # Login, Registro
│   │   ├── app/               # Alumno: inicio, jornadas, detalle, Mis jornadas, notificaciones, sincronización
│   │   ├── maestro/           # Gestor (y administrador): GestorHome, formulario y administración de jornada
│   │   └── admin/             # Administrador: dashboard, usuarios, jornadas, reportes, auditoría, perfil
│   ├── services/              # apiClient, inscripciones, jornadas, cuentas, cola offline, almacenamiento local...
│   ├── utils/                 # Reglas puras: roles, estados, fechas, planilla, avisos, sincronización
│   └── theme/                 # Colores
├── api/                       # API de negocio (Node + Express + Admin SDK) — ver su README
├── functions/                 # Cloud Function de avisos (NO desplegada; se retira al cerrar la migración)
├── scripts/admin.js           # Administración de cuentas fuera de la app (gcloud)
├── tests/                     # unit/ · rules/ · equivalencia/
└── docs/                      # migracion-api/ (diseño y operación de la API) · investigacion/ (trabajo de campo)
```

## Modelo de datos (Firestore)

- **`users/{uid}`**: `uid`, `nombre`, `email`, `rol` (`estudiante`, `gestor` o `administrador`; sin rol = estudiante; `maestro` = alias antiguo de `gestor`), `activo` (`false` = cuenta desactivada), `creadoEn`, `jornadasVistas` (estado de cada jornada inscrita, base de los avisos), `pushToken`.
- **`jornadas/{id}`**: `titulo`, `entidad`, `descripcion`, `fecha` (Timestamp, hora de negocio UTC-5), `lugar`, `responsable`, `cuposTotales`, `cuposOcupados`, `activa`, `creadoPor` (uid del gestor responsable; las jornadas anteriores a los roles no lo tienen) y `creadaEn`.
- **`inscripciones/{uid}_{jornadaId}`**: `userId`, `jornadaId`, `nombreUsuario`, `emailUsuario`, `tituloJornada`, `fechaJornada`, `inscritoEn`, `asistio` (las antiguas tienen ID aleatorio y se siguen reconociendo).
- **`notificaciones/{id}`**: `userId`, `jornadaId`, `tipo`, `titulo`, `mensaje`, `leida`, `creadaEn`, `datosJornada`.
- **`auditoria/{id}`**: `accion`, `entidad`, `entidadId`, `detalle`, `actorId`, `actorNombre`, `creadaEn` (inmutable).

## Modo offline

La app sigue siendo útil sin internet (se puede abrir en modo avión): muestra las jornadas y las inscripciones ya descargadas y permite inscribirse o cancelar; esas acciones quedan guardadas en el dispositivo y se envían al servidor al recuperar la conexión.

### Qué se guarda localmente y con qué librería

Todo se guarda con **AsyncStorage**, en claves propias de cada usuario (`jv:v1:<uid>:<nombre>`). Al **cerrar sesión se borran todas** y no se vuelve a escribir nada hasta iniciar sesión de nuevo.

| Clave | Contenido |
|---|---|
| `jornadas` | Última lista de jornadas recibida del servidor (con `fecha` en milisegundos) |
| `inscripciones` | Inscripciones del usuario (`jornadaId`, título, fecha, `asistio`) |
| `cola` | Cola de acciones pendientes de sincronizar |
| `meta` | Fecha de la última sincronización |
| `perfil` | Rol del usuario, para abrir sin conexión |
| `notificacionesAvisadas` | Notificaciones que ya se mostraron como aviso del dispositivo |

El estado de la red se detecta con **NetInfo**. La persistencia propia de Firestore solo se usa como apoyo: en React Native guarda en memoria, así que la lógica offline es la de la app (`src/services/localStore.js`).

### Cómo funciona

1. **Lectura.** `JornadasContext` es la fuente única de datos. Al iniciar carga lo guardado en AsyncStorage y, cuando el servidor responde, se actualiza y se vuelve a guardar. Un snapshot vacío que llega de la caché (sin red) nunca borra lo que ya se muestra, y nunca queda cargando indefinidamente.
2. **Avisos de estado.** `ConnectionBanner` (parte inferior de las pantallas) muestra un solo aviso a la vez: *Conectado* o *Sin conexión* durante exactamente 10 s tras cada cambio de conexión; *Sincronizando datos* mientras se envían los cambios pendientes (se oculta al terminar bien, sin límite de tiempo si la sincronización es larga); y, si algo falla, un aviso de error que conserva los datos pendientes y se reintenta solo. Al tocar un aviso de error se abre la pantalla **Sincronización** (reintentar o descartar cada acción).
3. **Escritura.** Inscribirse y cancelar pasan siempre por la cola (`src/services/syncQueueService.js`). Con conexión se envían al instante; sin conexión quedan como **"Pendiente por sincronizar"** (en la lista, el detalle, Mis jornadas y el inicio) y los cupos mostrados incluyen su efecto. Antes de continuar sin conexión la app informa y pide confirmación.
4. **Sincronización.** `src/services/syncEngine.js` envía las acciones una a una y en orden cuando vuelve internet, al volver a abrir la app o desde "Sincronizar ahora". Cada envío (`src/services/inscripcionService.js`) llama a la **API** (`PUT/DELETE /v1/jornadas/{id}/inscripcion`) o, sin API configurada, ejecuta la transacción de Firestore equivalente; en ambos casos valida jornada activa y vigente, cupos y duplicados.
5. **Cierre de sesión.** Si hay acciones pendientes (o no hay conexión) se avisa de que se perderán y se pide confirmación.

### Reglas de negocio y conflictos

El **servidor manda** sobre cupos y estado de la jornada, y los envíos son **idempotentes**:

| Caso al sincronizar | Resultado |
|---|---|
| Inscripción y la jornada ya no tiene cupos / está desactivada / venció / no existe | Se **rechaza** con el motivo (queda visible en Sincronización; se puede reintentar o descartar) |
| La inscripción ya existe (otro dispositivo, reenvío) | Se da por hecha, sin duplicarla ni sumar otro cupo |
| Cancelación de algo ya cancelado | Se da por hecha, el cupo nunca baja de 0 |
| Inscribirse y cancelar sin haber enviado nada | Se anulan entre sí; no se envía nada |

- **Fechas:** el plazo de cancelación (2 días) se valida en la app con la fecha del dispositivo; el vencimiento de la inscripción ("la jornada ya finalizó") lo valida el servidor con su reloj.
- **Duplicados:** la inscripción nueva usa el ID `<uid>_<jornadaId>` y nunca se actualiza, así que un doble toque o un reenvío no la duplican. También se detectan las inscripciones antiguas (ID aleatorio).
- **Errores de red:** la acción sigue pendiente y se reintenta sola con espera creciente (5 s, 10 s, 20 s... hasta 2 min) o al recuperar la conexión; no se pierde nada aunque se cierre la app (se vuelve a enviar sin duplicar).
- **Errores permanentes** (sin cupos, sin permiso...): la acción queda **rechazada** con el motivo, sin perder datos, y se avisa al usuario.
- Sin conexión la limpieza de jornadas vencidas no se ejecuta (siguen ocultas) y se hace al reconectar.

### Cómo probarlo

1. Inicia sesión con conexión y abre *Jornadas disponibles* y *Mis jornadas* (así se descargan).
2. Activa el **modo avión** y cierra y vuelve a abrir la app: se ven las jornadas y las inscripciones guardadas, y aparece el aviso "Sin conexión" durante 10 s.
3. Sin conexión, inscríbete en una jornada: la app pide confirmación, la marca "Pendiente por sincronizar" y descuenta el cupo en pantalla. Cancela una inscripción y verifica la marca "Cancelación pendiente".
4. Cierra la app con acciones pendientes y vuelve a abrirla: siguen ahí.
5. Desactiva el modo avión: aparece "Conectado" (10 s) o, si hay acciones pendientes, "Sincronizando datos" hasta que terminen; luego el aviso se oculta y la marca de pendiente desaparece. Si una jornada se llenó mientras tanto, la acción queda rechazada y se explica el motivo en *Sincronización*.
6. Con acciones pendientes, intenta **Cerrar sesión**: se avisa y se pide confirmación; al confirmar se borran los datos locales.

## Roles y permisos

La app tiene tres roles. El rol se guarda en `users/{uid}.rol` y decide qué pantallas se muestran; **lo que de verdad se permite lo valida el servidor** (la API, y las reglas de Firestore como segunda barrera), así que manipular la app, las URL o las solicitudes no da más permisos.

| Rol | Valor | Antes | Qué hace |
|---|---|---|---|
| **Usuario/Alumno** | `estudiante` (o sin rol) | Alumno | Consulta jornadas, se inscribe, cancela, Mis jornadas, filtros, modo offline y notificaciones |
| **Gestor de jornadas** | `gestor` | Maestro | Crea jornadas y gestiona las que tiene asignadas: editar, cancelar, reactivar, eliminar, ver inscritos y planilla |
| **Administrador** | `administrador` | (nuevo) | Módulo de administración: usuarios, gestores, jornadas, estadísticas, auditoría |

### Matriz de permisos

| Funcionalidad | Usuario/Alumno | Gestor de jornadas | Administrador |
|---|---|---|---|
| Consultar información propia | Sí | Sí | Sí |
| Participar en jornadas (inscribirse, cancelar) | Sí | No (lo limita la pantalla) | No (lo limita la pantalla) |
| Gestionar jornadas | No | Solo las **asignadas** a él (`creadoPor`) | **Todas**, y puede reasignarlas |
| Crear jornadas | No | A su nombre | Para cualquier gestor |
| Ver inscritos y descargar planilla | No | De sus jornadas | De cualquier jornada |
| Gestionar usuarios (crear, editar, activar/desactivar) | No | No | Sí |
| Asignar roles y permisos | No | No | Sí (nunca el suyo) |
| Dashboard administrativo | No | No | Sí |
| Reportes globales | No | No | Sí |
| Auditoría | No | No | Sí (solo lectura) |

### Pantallas del administrador

`AdminDashboard` (indicadores y accesos) · `UsuariosList` (búsqueda, filtros por rol y estado; también como listado de **gestores**) · `UsuarioDetalle` (datos, cambio de rol, activar/desactivar, jornadas asignadas si es gestor) · `UsuarioForm` (crear cuenta con rol) · `AdminJornadas` (todas las jornadas con filtros por estado, fecha, gestor y texto) · `JornadaForm` y `JornadaAdmin` (las mismas del gestor, con selector de gestor responsable) · `Reportes` (estadísticas y descarga de reporte para Excel) · `Auditoria` · `AdminPerfil`. Los gestores usan `GestorHome` (`screens/maestro/`, nombre de carpeta conservado).

### Cómo se protege (servidor)

- **Rol:** al registrarse solo se puede ser estudiante activo. Nadie puede cambiarse el rol ni su estado de cuenta, tampoco un administrador sobre sí mismo (así nunca se queda el sistema sin administrador). Solo un administrador cambia el rol o el estado de **otras** cuentas. La API lee el rol y el estado de la cuenta en **cada solicitud**.
- **Cuentas desactivadas** (`activo: false`): la app cierra la sesión de inmediato y la API rechaza todo con 403. No se deshabilita la cuenta de acceso de Firebase Auth en sí.
- **Jornadas:** un gestor solo administra las que figuran a su nombre; las anteriores a los roles (sin `creadoPor`) y las ajenas solo las gestiona un administrador. Un gestor no puede reasignarlas. El servidor valida espacio, textos, cupos, fecha futura y que el gestor asignado exista, esté activo y tenga rol de gestor o administrador.
- **Inscritos:** el alumno lee las suyas; el gestor, las de sus jornadas (por la API); el administrador, todas (por la API).
- **Auditoría:** las acciones del administrador (crear cuenta, cambiar rol, activar/desactivar, crear/editar/reasignar/cancelar/reactivar/eliminar jornadas, exportar reportes) se registran en `auditoria` en la **misma operación atómica** que la acción, a su nombre y con la hora del servidor. Los registros no se pueden modificar ni borrar; solo los lee un administrador.
- **Compatibilidad:** el nombre anterior `maestro` se sigue aceptando como `gestor` (en la app, la API y las reglas).

### Crear el primer administrador y administrar cuentas

El primer administrador se crea fuera de la app (usa tu sesión de `gcloud`; sin `--aplicar` solo simula):

```bash
node scripts/admin.js crear-usuario admin@tdea.edu.co ClaveSegura123 administrador Nombre Apellido --aplicar
node scripts/admin.js rol alguien@tdea.edu.co administrador --aplicar   # o convertir una cuenta existente
node scripts/admin.js usuarios [rol]                                    # listar cuentas
```

A partir de ahí el administrador crea gestores y otras cuentas, y cambia roles desde la app.

### Migración de datos (compatible hacia atrás)

No pierde ni duplica cuentas. Renombra el rol `maestro` a `gestor`, asigna `estudiante` a quien no tenía rol y lista las jornadas sin propietario. Es idempotente:

```bash
node scripts/admin.js migrar                 # simula
node scripts/admin.js migrar --aplicar
node scripts/admin.js propietario --huerfanas gestor@tdea.edu.co --aplicar   # opcional: asigna un gestor a las jornadas anteriores
```

### Despliegue de las reglas de Firestore

```bash
npx firebase-tools deploy --only firestore:rules --project <id-del-proyecto>
```

Hoy está publicado `firestore.rules`. `firestore.api.rules` (solo lectura) **no se publica** hasta cerrar la migración: ver [`docs/migracion-api/05-despliegue-y-recuperacion.md`](docs/migracion-api/05-despliegue-y-recuperacion.md).

## Notificaciones

El alumno recibe un aviso (pantalla **Notificaciones** y aviso local del dispositivo) cuando cambia una jornada en la que está inscrito:

| Aviso | Cuándo |
|---|---|
| Cancelación | La jornada pasa a inactiva antes de su fecha (no se avisa si se desactiva por haber vencido) |
| Reactivación | La jornada vuelve a estar activa |
| Reprogramación | Cambia la fecha o la hora |
| Actualización | Cambia el lugar, la descripción, el responsable, el título o la entidad |
| Eliminación | El gestor o el administrador elimina la jornada |

**Cómo funciona (con la API).** Al ejecutar el cambio, el servidor compara la jornada con lo que cada inscrito ya conocía de ella (`users/{uid}.jornadasVistas`, que anota la propia inscripción) y crea la notificación en `notificaciones`. Llega a **todos los inscritos aunque no abran la app o hayan cerrado sesión**. La app solo escucha sus notificaciones y muestra el aviso local de las nuevas (al abrir con la sesión recién iniciada, las no leídas de las últimas 24 h). Marcar como leída y eliminar pasan por la API.

**Sin API** (`EXPO_PUBLIC_API_URL` vacío), la app detecta los cambios ella misma al abrirse, como antes.

**Limitación.** Aún no hay notificaciones *push* con la app cerrada (el `pushToken` se guarda, pero ningún servidor lo usa todavía). `functions/index.js` tiene una Cloud Function antigua, **no desplegada**, que no debe desplegarse junto a la API porque duplicaría los avisos.

## API de negocio

Servidor Node.js + Express (`api/`) que concentra las reglas de negocio y escribe en Firestore con el Admin SDK. Desplegada en Render (plan gratuito): `https://jornada-viva.onrender.com` (`GET /v1/salud`).

| Área | Endpoints (`/v1`) |
|---|---|
| Sesión | `GET /me` · `POST /me/perfil` |
| Inscripciones | `PUT` / `DELETE /jornadas/{id}/inscripcion` |
| Jornadas | `POST /jornadas` · `PUT` / `DELETE /jornadas/{id}` · `POST /jornadas/{id}/cancelar` · `/reactivar` · `GET /jornadas/{id}/inscritos` · `/planilla.csv` · `POST /mantenimiento/vencidas` |
| Notificaciones | `PATCH` / `DELETE /me/notificaciones/{id}` · `POST /me/notificaciones/leer-todas` · `PUT /me/push-token` |
| Cuentas (administrador) | `POST /usuarios` · `PATCH /usuarios/{id}` |
| Reportes (administrador) | `GET /admin/estadisticas` · `/admin/reporte-jornadas.csv` |

Todas piden `Authorization: Bearer <ID token de Firebase Auth>` salvo `/salud`. Documentación completa: [`docs/migracion-api/`](docs/migracion-api/).

**Activar en la app.** Define `EXPO_PUBLIC_API_URL` en `.env` (y opcionalmente `EXPO_PUBLIC_API_MODULOS`, por ejemplo `inscripciones,jornadas`, para activar solo algunos módulos: `sesion`, `inscripciones`, `jornadas`, `notificaciones`, `usuarios`, `reportes`). Vaciándola, la app vuelve a su lógica local.

**Ejecutar la API en local.**

```bash
cd api
npm install
cp .env.example .env     # FIREBASE_PROJECT_ID y FIREBASE_SERVICE_ACCOUNT (clave de la cuenta de servicio, secreto)
npm start                # http://localhost:8080/v1/salud
```

**Despliegue en Render (gratis).** Web Service con *Root Directory* `api`, *Build Command* `npm ci --omit=dev`, *Start Command* `npm start`, *Health Check Path* `/v1/salud` y las variables `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` (JSON de la clave en una línea) y `MANTENIMIENTO_MINUTOS=5`. El plan gratuito **se duerme tras 15 min sin tráfico** y tarda cerca de 1 min en despertar: la primera acción después de una pausa puede tardar o reintentarse (las inscripciones no se pierden: la cola offline las reenvía). Para comprobar un despliegue: `node api/scripts/verificar-despliegue.mjs` (solo lectura; ver su cabecera).

> La clave de la cuenta de servicio es un **secreto**: solo en las variables del hosting, nunca en el repositorio ni en la app.

## Pruebas

```bash
npm test                  # lógica pura de la app: roles, estados, formularios, planilla, avisos, cliente HTTP (93)
npm run test:rules        # reglas de Firestore contra el emulador, actuales y de solo lectura (81)
npm run test:api          # API real contra los emuladores: auth, inscripciones, jornadas, avisos, cuentas, reportes... (155)
npm run test:equivalencia # los servicios de la app con la lógica local y con la API deben dar el mismo resultado (23 + 23)
npm run test:all          # todo lo anterior
```

Las pruebas con emuladores requieren **Java** y descargan el emulador de Firebase la primera vez. Las de reglas cubren la autorización de los tres roles; las de la API, además, concurrencia en inscripciones, verificación de ID tokens reales y el arranque del servidor real.

## Investigación de campo

El material del trabajo de campo en el campus TdeA está en [`docs/investigacion`](docs/investigacion).

### Documentos

- [`informe-hallazgos.pdf`](docs/investigacion/informe-hallazgos.pdf) — problema identificado, hallazgos y conclusión.
- [`matriz-trazabilidad.pdf`](docs/investigacion/matriz-trazabilidad.pdf) — trazabilidad de hallazgos a requisitos, con **FE-01** (listado + detalle) y **FE-02** (inscripción con control de cupo) definidas.
- [`ficha-observacion.pdf`](docs/investigacion/ficha-observacion.pdf) — observación del proceso actual de inscripción y asistencia.

### Entrevistas

Dos entrevistas a actores reales del campus, con autorización registrada:

- [`entrevista-01.pdf`](docs/investigacion/entrevistas/entrevista-01.pdf) — Beatriz (Biblioteca). Audio: [`Beatriz (Biblioteca).mp4`](docs/investigacion/entrevistas/Beatriz%20(Biblioteca).mp4)
- [`entrevista-02.pdf`](docs/investigacion/entrevistas/entrevista-02.pdf) — Alejo (Gimnasio / Bienestar). Audio: [`Alejandro (Gimnasio).mp4`](docs/investigacion/entrevistas/Alejandro%20(Gimnasio).mp4)
- [`Preguntas.pdf`](docs/investigacion/entrevistas/Preguntas.pdf) — guion de preguntas aplicado.

### Registro fotográfico

Fotografías del equipo en campo en [`fotografias/`](docs/investigacion/fotografias): entrevista en biblioteca, entrevista en gimnasio y el equipo en el espacio.
