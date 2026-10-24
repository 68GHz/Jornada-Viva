import { crearApp } from "./app.js";
import { leerConfig } from "./config.js";
import { iniciarFirebase } from "./firebase.js";
import { desactivarVencidas } from "./servicios/mantenimiento.js";

const config = leerConfig();
const { db, auth } = iniciarFirebase(config);

const app = crearApp({
  db,
  auth,
  verificarToken: (token) => auth.verifyIdToken(token),
  origenesCors: config.origenesCors,
});

const servidor = app.listen(config.puerto, () => {
  console.log(`API de Jornada Viva escuchando en el puerto ${config.puerto}`);
});

// Desactiva las jornadas vencidas cada cierto tiempo (además del endpoint bajo demanda)
let temporizador = null;
if (config.mantenimientoMs > 0) {
  const ctx = { db, ahora: Date.now, registro: console };
  const ejecutar = () =>
    desactivarVencidas(ctx).catch((error) => console.error("[mantenimiento] falló:", error));
  ejecutar();
  temporizador = setInterval(ejecutar, config.mantenimientoMs);
}

const apagar = () => {
  if (temporizador) clearInterval(temporizador);
  servidor.close(() => process.exit(0));
};
process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);
