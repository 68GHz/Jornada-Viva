# Despliegue, puesta en marcha y recuperación

## 1. Requisitos

- **Hosting Node.js** (decisión del usuario: Node + Express en hosting externo — Render, Railway, Fly.io o un VPS). Sirve cualquiera que ejecute Node ≥ 20 o un contenedor (hay `api/Dockerfile`).
- **Clave de cuenta de servicio** de Firebase (*Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada*). Es un secreto: se pega en las variables del hosting, **nunca** en el repositorio ni en la app. *(Pendiente del usuario: ver [06](06-estado-pendientes-y-diferencias.md).)*
- Una URL pública con HTTPS (los hostings la dan).

## 2. Variables de entorno de la API

| Variable | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `jornadaviva-476ff` |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de la clave (una línea) o su base64 |
| `PORT` | lo fija el hosting (por defecto 8080) |
| `MANTENIMIENTO_MINUTOS` | `5` (desactiva jornadas que ya terminaron); `0` = solo bajo demanda |
| `ASISTENCIA_SECRETO` | (opcional) cadena larga y aleatoria con la que se firman los códigos del QR de asistencia. Si falta se deriva de `FIREBASE_SERVICE_ACCOUNT` |
| `CORS_ORIGINS` | vacío (la app móvil no lo necesita) |

## 3. Despliegue

```bash
cd api
npm ci --omit=dev
npm start            # o: docker build -t jornadaviva-api . && docker run -p 8080:8080 --env-file .env jornadaviva-api
```

Configurar la comprobación de salud del hosting en `GET /v1/salud`. Usar **una sola instancia** al
principio (la tarea periódica de vencidas es idempotente, pero así los registros son más claros).

### Verificación posterior (solo lectura)

```bash
API_URL=https://tu-api.example.com FIREBASE_API_KEY=<EXPO_PUBLIC_FIREBASE_API_KEY> \
CORREO=<una cuenta> CLAVE=<su clave> node api/scripts/verificar-despliegue.mjs
```

Debe mostrar `OK` en: salud, rechazo sin token (401) e inicio de sesión + `GET /v1/me` con el rol de la cuenta.

## 4. Orden de puesta en marcha en la app

1. **Respaldo** de Firestore y anotar la versión actual de las reglas. `gcloud firestore export` necesita un bucket de Storage (plan Blaze); en el plan sin facturación, el respaldo se hace descargando las colecciones por la API REST (`jornadas`, `inscripciones`, `users`, `notificaciones`, `auditoria`) a archivos JSON con `gcloud auth print-access-token`. Reglas publicadas el 2026-10-31, antes del cierre: conjunto `projects/jornadaviva-476ff/rulesets/a45c22b5-1a54-42e0-ab2b-bbfc93419c26` (26-oct-2026).
2. Desplegar la API y pasar la verificación.
3. Compilar/publicar la app con `EXPO_PUBLIC_API_URL`. Se puede encender por etapas con `EXPO_PUBLIC_API_MODULOS`:
   `sesion` → `inscripciones` → `jornadas` → `notificaciones` → `usuarios` → `reportes`. Probar cada etapa con las cuentas de prueba antes de pasar a la siguiente.
4. **Cuidado con las versiones mezcladas:** con `jornadas` encendido el servidor crea los avisos y la app nueva deja de detectarlos. Una app **vieja** (con lógica local) seguiría detectándolos y podría duplicar un aviso. Publicar la app como actualización obligatoria o aceptar el duplicado ocasional durante la transición.
5. **Migrar los datos** (idempotente; solo guarda `duracionMin: 60` en las jornadas que no la tienen y renombra el rol `maestro`): `node scripts/admin.js migrar` (simulación) y luego `node scripts/admin.js migrar --aplicar`. Comparar después contra el respaldo.
6. **Cierre (M7) — solo cuando todo lo anterior esté validado y no queden apps viejas:** publicar las reglas de solo lectura (las apps antiguas dejarán de poder escribir), retirar la lógica local sin uso y eliminar `functions/` (la Cloud Function sin desplegar duplicaría avisos si algún día se desplegara).

   ```bash
   npx firebase-tools deploy --only firestore:rules --config firebase.produccion.json --project jornadaviva-476ff
   ```

   `firebase.produccion.json` apunta a `firestore.api.rules`. **No** publicar con `firebase.json` (carga `firestore.rules`, que permite escritura directa). Después de publicar, probar con el token de cada rol que escribir `jornadas/{id}.cuposOcupados` directamente devuelve 403 y que las acciones normales de cada rol siguen funcionando por la API.

## 5. Procedimiento de recuperación

| Situación | Acción | Tiempo |
|---|---|---|
| Un módulo falla en la app | Publicar la app con ese módulo fuera de `EXPO_PUBLIC_API_MODULOS` (vuelve a la lógica local). Funciona mientras las reglas actuales sigan publicadas | actualización de la app |
| La API se cae o se despliega mal | Redesplegar la versión anterior desde el hosting (los datos no cambian de formato, nada que revertir). Mientras tanto, la app puede seguir leyendo (listeners) pero no escribir | minutos |
| Se publicaron las reglas de solo lectura y hay que volver atrás | Volver a apuntar la publicación al conjunto anterior (sigue existiendo): `PATCH https://firebaserules.googleapis.com/v1/projects/jornadaviva-476ff/releases/cloud.firestore` con `{"release":{"name":"projects/jornadaviva-476ff/releases/cloud.firestore","rulesetName":"projects/jornadaviva-476ff/rulesets/a45c22b5-1a54-42e0-ab2b-bbfc93419c26"}}` (token de `gcloud auth print-access-token`), o `npx firebase-tools deploy --only firestore:rules --project jornadaviva-476ff` (publica `firestore.rules`, que permite escritura directa) | segundos |
| Datos dañados | Restaurar el respaldo (`gcloud firestore import`) | según tamaño |
| Una jornada o cuenta quedó mal | Se corrige desde el módulo de administración; todo cambio del administrador está en `auditoria` | — |

La API **no migra ni transforma datos**: escribe el mismo esquema que la app. Por eso la vuelta
atrás nunca requiere un script de datos. (La única migración, `scripts/admin.js migrar`, solo añade
`duracionMin: 60`, que ya era el valor que se asumía.)

## 6. Operación

- **Registro:** la API escribe en la salida estándar (sin tokens ni contraseñas); el hosting lo conserva.
- **Vencidas:** si no hay tráfico, la tarea periódica sigue desactivando jornadas vencidas.
- **Escalado:** las operaciones críticas son transacciones de Firestore; varias instancias son seguras.
