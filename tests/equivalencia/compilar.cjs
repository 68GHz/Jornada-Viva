// Transpila los servicios REALES de la app a CommonJS para ejecutarlos en Node contra el emulador.
// Se usa en las pruebas de equivalencia: los mismos escenarios corren con la lógica local (SDK de
// Firestore + reglas) y con la API, y deben dar el mismo resultado.
const babel = require("@babel/core");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..");
const SALIDA = path.join(__dirname, ".build");

const MODULOS = [
  "src/config/api.js",
  "src/services/apiClientCore.js",
  "src/services/apiClient.js",
  "src/services/inscripcionService.js",
  "src/services/asistenciaService.js",
  "src/services/ejecutorAcciones.js",
  "src/services/jornadaEstadoService.js",
  "src/services/jornadaAdminService.js",
  "src/services/jornadaEventService.js",
  "src/services/avisosLocales.js",
  "src/services/adminService.js",
  "src/services/localStore.js",
  "src/utils/avisosLocales.js",
  "src/utils/sincronizacion.js",
  "src/utils/plural.js",
  "src/utils/zonaNegocio.js",
  "src/utils/jornadaFecha.js",
  "src/utils/plazoCancelacion.js",
  "src/utils/duracion.js",
  "src/utils/asistencia.js",
  "src/utils/jornadaForm.js",
  "src/utils/bannerJornada.js",
  "src/utils/categorias.js",
  "src/utils/espacios.js",
  "src/utils/instantaneaJornada.js",
  "src/utils/cambiosJornada.js",
  "src/utils/roles.js",
];

fs.rmSync(SALIDA, { recursive: true, force: true });
for (const modulo of MODULOS) {
  const { code } = babel.transformFileSync(path.join(RAIZ, modulo), {
    babelrc: false,
    configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  const destino = path.join(SALIDA, modulo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, code);
}
// firebaseConfig simulado: cada escenario fija `db` (modo local) y `auth.currentUser` (modo API)
fs.writeFileSync(
  path.join(SALIDA, "firebaseConfig.js"),
  "exports.db = null;\nexports.auth = { currentUser: null };\nexports.firebaseConfig = {};\n"
);
console.log(`${MODULOS.length} módulos transpilados`);
