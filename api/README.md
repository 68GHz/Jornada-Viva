# API de Jornada Viva

Servidor Node.js + Express con la lógica de negocio de la app (inscripciones, gestión de jornadas,
avisos, cuentas, estadísticas, auditoría). Escribe en Firestore con el Admin SDK; la app móvil
solo lee. Documentación completa en [`docs/migracion-api/`](../docs/migracion-api/).

```bash
cd api
npm install
cp .env.example .env     # completa FIREBASE_SERVICE_ACCOUNT
npm start                # http://localhost:8080/v1/salud
```

Pruebas (desde la raíz del proyecto; requieren Java para los emuladores de Firebase):

```bash
npm run test:api            # unitarias + integración de la API contra los emuladores
npm run test:equivalencia   # los servicios de la app con la lógica local y con la API: mismo resultado
```
