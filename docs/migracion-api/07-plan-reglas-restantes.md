# Plan: pasar a la API las reglas que quedaban en la app

Parte del [inventario del 2026-11-02](06-estado-pendientes-y-diferencias.md): 20 reglas ya las decide la
API y 11 quedaban fuera. Este plan clasifica esas 11, dice cuáles se pueden mover y cuáles no, y registra
lo que se hizo.

## Criterio

Una regla se mueve a la API cuando **decide o autoriza datos**. No se mueve lo que, por su naturaleza,
tiene que ocurrir en el dispositivo (sesión, funcionamiento sin conexión, pantalla). Cuando una regla se
mueve pero la app necesita seguir funcionando sin conexión, la app conserva una **copia idéntica**
(comprobada por `paridad.test.mjs`) solo como respaldo.

## Las 11 reglas

| # | Regla | Decisión | Estado |
|---|---|---|---|
| 1 | Inicio y cierre de sesión (Firebase Auth) | **No se mueve.** El SDK de Auth corre en el dispositivo; la API ya verifica el token en cada solicitud. | — |
| 2 | Lecturas en tiempo real (jornadas, inscripciones, notificaciones, usuarios) | **Pendiente de decisión** (ver «Fase 3»). | Pendiente |
| 3 | Modo sin conexión (cola, sincronización, reintentos) | **No se mueve.** Existe para cuando no hay servidor al alcance. | — |
| 4 | Estado visible de la jornada (activa / en curso / finalizada) | Parcial: la API ya lo usa para decidir (módulo idéntico). Mostrarlo lo hace la app para funcionar sin conexión. Pasa a la API completa junto con la Fase 3. | Pendiente |
| 5 | Filtros, búsqueda, historial y conteos | Va con la Fase 3 (necesita lecturas por API). Los filtros de usuarios del administrador, igual. | Pendiente |
| 6 | Espacios ocupados / alternos (FE-01) | **Movida.** `GET /v1/espacios/disponibilidad` y `GET /v1/jornadas/:id/espacios-alternos` con todas las jornadas. La app lo pide al servidor y usa su cálculo local solo sin conexión. | **Hecha** |
| 7 | Validación de formularios | **Ya cubierta.** La API valida todo y responde el error por campo; la validación del formulario se conserva solo como ayuda inmediata (sin esperar red). | Cubierta |
| 8 | Alertas «por vencer / vencido» de préstamos | Parcial: el módulo de cálculo es idéntico en la API; la app lo evalúa en el dispositivo porque depende de la hora actual y debe verse sin conexión. | Se conserva |
| 9 | Cálculo local de estadísticas (respaldo) | **Retirada.** El panel y los reportes del administrador usan solo la API. | **Hecha** |
| 10 | Limpieza al cerrar sesión / cuenta desactivada | **No se mueve.** Borrar datos del dispositivo solo puede hacerlo el dispositivo. | — |
| 11 | Presentación (gráficas, avatar, diseño) | **No se mueve.** | — |

Resultado: de las 11, **2 quedan movidas** (6 y 9), **1 estaba cubierta** (7), **2 se mantienen como copia
de respaldo a propósito** (4 y 8), **4 no son movibles** (1, 3, 10, 11) y **2 dependen de una decisión**
(2 y 5, que arrastran al 4).

## Fases

1. **Hecha — Disponibilidad de espacios en la API (regla 6).**
   Endpoint nuevo, módulo `espaciosLibres.js` copiado idéntico en la API (agregado a la prueba de
   paridad), servicio `servicios/espacios.js` y 9 pruebas de integración. En la app: hook
   `useEspaciosServidor` y respaldo local sin conexión (formulario de jornada y detalle de jornada).
2. **Hecha — Retirar el respaldo local de estadísticas (regla 9).**
   `AdminDashboardScreen` y `ReportesScreen` dejaron de escuchar usuarios y jornadas en Firestore para
   calcular; ahora piden todo a `GET /v1/admin/estadisticas` y el reporte a la API. Además, las
   estadísticas incluyen `porMes` (jornadas por mes) para la gráfica de evolución.
3. **Pendiente de decisión — Lecturas por la API (reglas 2, 4 y 5).**
   Implica crear endpoints de lectura (`GET /jornadas` con estado y filtros, `GET /me/inscripciones` con
   historial y conteos, jornadas del gestor, usuarios del administrador) y reemplazar los *listeners* de
   Firestore. **Costo:** se pierden las actualizaciones en tiempo real (habría que consultar de nuevo o
   sondear) y la copia local que hoy da Firestore sin conexión (habría que construirla). **Beneficio:**
   la API pasaría a ser el único punto de acceso a los datos y las reglas de Firestore podrían cerrarse
   también para lectura. Recomendación: hacerlo por módulos (primero el administrador, que ya requiere
   conexión) y no tocar jornadas/inscripciones del estudiante hasta decidir cómo se resuelve el modo sin
   conexión.
4. **Pendiente de despliegue.** Redesplegar la API en Render (espacios, `porMes`, y lo anterior:
   asistencia diferida, préstamos y plazo de cancelación). Hasta entonces, la app usa el cálculo local de
   espacios (la consulta falla y cae al respaldo) y no muestra la gráfica por mes.

## Verificación

- API: 332 pruebas (unitarias, paridad e integración contra emuladores) en verde.
- App: 252 pruebas unitarias en verde y el paquete de Android compila.
- No se probó en un dispositivo ni contra la API desplegada.

## Actualización — Fase 3a: lecturas sensibles del administrador por la API (hecha)

Se cerró la parte del hueco de lecturas que exponía datos de **otras personas**:

| Lectura | Antes | Ahora |
|---|---|---|
| Lista de cuentas (`users`) | El administrador la leía directo de Firestore (con el token push de cada cuenta incluido) | `GET /v1/admin/usuarios`: solo administrador activo, solo nombre, correo, rol, estado y fecha de alta |
| Auditoría | El administrador la leía directo de Firestore | `GET /v1/admin/auditoria?limite=` (máx. 200), solo administrador |

- **App:** `useUsuarios` y `useAuditoria` (`hooks/useAdmin.js`) llaman a la API; se actualizan al abrir la
  pantalla, al volver a primer plano y cada 30 s mientras está a la vista. Ya no hay actualización en
  vivo ni funcionan sin conexión (lo mismo que ya ocurría con las estadísticas).
- **Reglas (`firestore.api.rules`):** `users` solo se lee el propio (ni un administrador lee perfiles
  ajenos) y `auditoria` no se lee desde la app. La función `esAdmin()` dejó de usarse y se eliminó.
- **Pruebas:** 13 de integración nuevas para las dos consultas (permisos, límites, sin token push) y las
  pruebas de reglas actualizadas.

### Orden de despliegue (importante)
1. Redesplegar la API (trae los endpoints nuevos).
2. Publicar la versión de la app que los usa.
3. **Después** publicar `firestore.api.rules`. Si se publican antes, el administrador no podrá abrir
   Usuarios ni Auditoría.

### Lo que sigue leyéndose directo de Firestore (y por qué)
- Jornadas (cualquier usuario con sesión: es información pública de la app), las inscripciones y
  notificaciones propias, y el propio perfil. Las reglas ya limitan cada una a su dueño; pasarlas a la API
  exige resolver el modo sin conexión y las actualizaciones en vivo (Fase 3b, pendiente de decisión).
