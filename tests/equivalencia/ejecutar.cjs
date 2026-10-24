// Ejecuta los escenarios de equivalencia en los dos modos (cada uno en su propio proceso, porque
// la app lee la configuración de la API al cargar). Se lanza dentro del emulador:
//   npm run test:equivalencia
const { spawnSync } = require("child_process");
const path = require("path");

const correr = (archivo, env = {}) =>
  spawnSync(process.execPath, [path.join(__dirname, archivo)], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  }).status;

if (correr("compilar.cjs") !== 0) process.exit(1);
const local = correr("escenarios.cjs", { MODO: "local" });
const api = correr("escenarios.cjs", { MODO: "api" });
process.exit(local === 0 && api === 0 ? 0 : 1);
