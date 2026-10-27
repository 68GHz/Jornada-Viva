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

1. **Respaldo** de Firestore (`gcloud firestore export gs://<bucket>/respaldo-antes-api`) y anotar la versión actual de las reglas (`304ecec8-9ad5-46d1-ad08-bb67dd9a9946`).
2. Desplegar la API y pasar la verificación.
3. Compilar/publicar la app con `EXPO_PUBLIC_API_URL`. Se puede encender por etapas con `EXPO_PUBLIC_API_MODULOS`:
   `sesion` → `inscripciones` → `jornadas` → `notificaciones` → `usuarios` → `reportes`. Probar cada etapa con las cuentas de prueba antes de pasar a la siguiente.
4. **Cuidado con las versiones mezcladas:** con `jornadas` encendido el servidor crea los avisos y la app nueva deja de detectarlos. Una app **vieja** (con lógica local) seguiría detectándolos y podría duplicar un aviso. Publicar la app como actualización obligatoria o aceptar el duplicado ocasional durante la transición.
5. **Cierre (M7) — solo cuando todo lo anterior esté validado y no queden apps viejas:** publicar `firestore.api.rules` (las apps antiguas dejarán de poder escribir), retirar la lógica local sin uso y eliminar `functions/` (la Cloud Function sin desplegar duplicaría avisos si algún día se desplegara).

## 5. Procedimiento de recuperación

| Situación | Acción | Tiempo |
|---|---|---|
| Un módulo falla en la app | Publicar la app con ese módulo fuera de `EXPO_PUBLIC_API_MODULOS` (vuelve a la lógica local). Funciona mientras las reglas actuales sigan publicadas | actualización de la app |
| La API se cae o se despliega mal | Redesplegar la versión anterior desde el hosting (los datos no cambian de formato, nada que revertir). Mientras tanto, la app puede seguir leyendo (listeners) pero no escribir | minutos |
| Se publicaron las reglas de solo lectura y hay que volver atrás | `git checkout <commit> -- firestore.rules` y `npx firebase-tools deploy --only firestore:rules --project jornadaviva-476ff`, o publicar de nuevo el ruleset `304ecec8-9ad5-46d1-ad08-bb67dd9a9946` | minutos |
| Datos dañados | Restaurar el respaldo (`gcloud firestore import`) | según tamaño |
| Una jornada o cuenta quedó mal | Se corrige desde el módulo de administración; todo cambio del administrador está en `auditoria` | — |

La API **no migra ni transforma datos**: escribe el mismo esquema que la app. Por eso la vuelta
atrás nunca requiere un script de datos.

## 6. Operación

- **Registro:** la API escribe en la salida estándar (sin tokens ni contraseñas); el hosting lo conserva.
- **Vencidas:** si no hay tráfico, la tarea periódica sigue desactivando jornadas vencidas.
- **Escalado:** las operaciones críticas son transacciones de Firestore; varias instancias son seguras.
