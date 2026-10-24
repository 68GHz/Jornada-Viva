import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearConfigApi } from "../../src/config/api.js";
import { crearClienteApi, ErrorApi } from "../../src/services/apiClientCore.js";
import { clasificarError } from "../../src/utils/sincronizacion.js";
import { seleccionarParaAvisar, VENTANA_PRIMERA_VEZ_MS } from "../../src/utils/avisosLocales.js";

const respuesta = (estado, cuerpo, texto) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  text: async () => (texto !== undefined ? texto : cuerpo === undefined ? "" : JSON.stringify(cuerpo)),
});
const cliente = (fetchFn, extra = {}) =>
  crearClienteApi({ url: "https://api.test", obtenerToken: async () => "TOKEN", fetchFn, ...extra });

describe("configuración de la API (interruptor por módulo)", () => {
  it("sin URL ningún módulo usa la API (se conserva la lógica local)", () => {
    for (const env of [{}, { EXPO_PUBLIC_API_URL: "" }, { EXPO_PUBLIC_API_URL: "  " }]) {
      const c = crearConfigApi(env);
      assert.equal(c.url, "");
      assert.equal(c.usaApi("jornadas"), false);
    }
  });

  it("con URL, por defecto todos los módulos usan la API y se quita la barra final", () => {
    const c = crearConfigApi({ EXPO_PUBLIC_API_URL: "https://api.test///" });
    assert.equal(c.url, "https://api.test");
    for (const m of ["sesion", "inscripciones", "jornadas", "notificaciones", "usuarios", "reportes"]) {
      assert.equal(c.usaApi(m), true, m);
    }
  });

  it("se puede apagar un módulo para volver a la lógica local", () => {
    const c = crearConfigApi({ EXPO_PUBLIC_API_URL: "https://api.test", EXPO_PUBLIC_API_MODULOS: "inscripciones, sesion" });
    assert.equal(c.usaApi("inscripciones"), true);
    assert.equal(c.usaApi("sesion"), true);
    assert.equal(c.usaApi("jornadas"), false);
    assert.equal(c.usaApi("usuarios"), false);
  });
});

describe("cliente HTTP de la API", () => {
  it("envía el token, el método, la ruta y el cuerpo JSON", async () => {
    let pedido;
    const api = cliente(async (url, opciones) => { pedido = { url, ...opciones }; return respuesta(200, { resultado: "completada" }); });
    const r = await api.llamar("PUT", "/v1/jornadas/j1/inscripcion", { cuerpo: { nombreUsuario: "Ana" } });
    assert.deepEqual(r, { resultado: "completada" });
    assert.equal(pedido.url, "https://api.test/v1/jornadas/j1/inscripcion");
    assert.equal(pedido.method, "PUT");
    assert.equal(pedido.headers.Authorization, "Bearer TOKEN");
    assert.equal(pedido.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(pedido.body), { nombreUsuario: "Ana" });
  });

  it("sin cuerpo no envía Content-Type; 204 devuelve null; modo texto devuelve el CSV tal cual", async () => {
    let cabeceras;
    const api = cliente(async (_u, o) => { cabeceras = o.headers; return respuesta(204); });
    assert.equal(await api.llamar("DELETE", "/v1/x"), null);
    assert.equal("Content-Type" in cabeceras, false);
    const csv = cliente(async () => respuesta(200, undefined, "sep=;\r\nA;B"));
    assert.equal(await csv.llamar("GET", "/v1/x.csv", { texto: true }), "sep=;\r\nA;B");
  });

  it("sin red, con tiempo agotado o con 502/503/504: ErrorRed (temporal, se reintenta)", async () => {
    const casos = [
      cliente(async () => { throw new TypeError("Network request failed"); }),
      cliente(() => new Promise(() => {}), { espera: 20 }),
      cliente(async () => respuesta(503, { error: { codigo: "SERVICIO_OCUPADO", mensaje: "ocupado" } })),
      cliente(async () => respuesta(502, undefined, "<html>Bad gateway</html>")),
      cliente(async () => respuesta(504)),
    ];
    for (const api of casos) {
      await assert.rejects(api.llamar("GET", "/v1/x"), (e) => e.name === "ErrorRed" && clasificarError(e).tipo === "red");
    }
  });

  it("409 con código de negocio: ErrorNegocio con el mismo código y mensaje (no se reintenta)", async () => {
    const api = cliente(async () => respuesta(409, { error: { codigo: "SIN_CUPOS", mensaje: "La jornada ya no tiene cupos disponibles." } }));
    await assert.rejects(api.llamar("PUT", "/v1/x"), (e) => {
      const c = clasificarError(e);
      return e.name === "ErrorNegocio" && e.codigo === "SIN_CUPOS" && c.tipo === "negocio" && c.mensaje === "La jornada ya no tiene cupos disponibles.";
    });
  });

  it("403, 401, 404, 400, correo repetido y otros 409 se traducen a los códigos que ya entiende la app", async () => {
    const esperados = [
      [403, { codigo: "SIN_PERMISO" }, "permission-denied", "permanente"],
      [403, { codigo: "CUENTA_DESACTIVADA" }, "permission-denied", "permanente"],
      [401, { codigo: "NO_AUTENTICADO" }, "unauthenticated", "permanente"],
      [404, { codigo: "NO_ENCONTRADO" }, "not-found", "permanente"],
      [400, { codigo: "VALIDACION", campos: { titulo: "Escribe el título de la jornada." } }, "invalid-argument", "permanente"],
      [409, { codigo: "EMAIL_EN_USO" }, "email-already-in-use", "permanente"],
      [409, { codigo: "FECHA_PASADA" }, "failed-precondition", "permanente"],
      [500, { codigo: "ERROR_INTERNO" }, "internal", "red"],
    ];
    for (const [estado, error, code, tipo] of esperados) {
      const api = cliente(async () => respuesta(estado, { error: { ...error, mensaje: "m" } }));
      await assert.rejects(api.llamar("POST", "/v1/x"), (e) => {
        assert.ok(e instanceof ErrorApi);
        assert.equal(e.code, code, `${estado} ${error.codigo}`);
        assert.equal(e.estado, estado);
        assert.equal(clasificarError(e).tipo, tipo, `${estado} ${error.codigo}`);
        if (error.campos) assert.deepEqual(e.campos, error.campos);
        return true;
      });
    }
  });

  it("una respuesta de error que no es JSON no rompe el cliente", async () => {
    const api = cliente(async () => respuesta(403, undefined, "<html>Forbidden</html>"));
    await assert.rejects(api.llamar("GET", "/v1/x"), (e) => e.code === "permission-denied" && e.message.length > 0);
  });

  it("sin sesión (token imposible) es un error de permisos; sin red para renovar el token, de conexión", async () => {
    const sinSesion = crearClienteApi({ url: "https://api.test", obtenerToken: async () => { throw Object.assign(new Error("x"), { code: "auth/no-user" }); } });
    await assert.rejects(sinSesion.llamar("GET", "/v1/x"), (e) => e.code === "unauthenticated");
    const sinRed = crearClienteApi({ url: "https://api.test", obtenerToken: async () => { throw Object.assign(new Error("x"), { code: "auth/network-request-failed" }); } });
    await assert.rejects(sinRed.llamar("GET", "/v1/x"), (e) => e.name === "ErrorRed");
  });

  it("sin URL configurada falla con un error claro (nunca llama a otro sitio)", async () => {
    let llamado = false;
    const api = crearClienteApi({ url: "", obtenerToken: async () => "t", fetchFn: async () => { llamado = true; return respuesta(200, {}); } });
    await assert.rejects(api.llamar("GET", "/v1/x"), /no está configurada/);
    assert.equal(llamado, false);
  });
});

describe("avisos locales de notificaciones creadas por el servidor", () => {
  const ahora = 1_000_000_000_000;
  const n = (id, extra = {}) => ({ id, leida: false, creadaEn: ahora - 1000, ...extra });

  it("avisa las no leídas que aún no se habían avisado, de la más antigua a la más nueva", () => {
    const { nuevas, avisadas } = seleccionarParaAvisar(
      [n("c", { creadaEn: ahora - 10 }), n("a", { creadaEn: ahora - 300 }), n("b", { creadaEn: ahora - 200 }), n("vieja")],
      ["vieja"], ahora
    );
    assert.deepEqual(nuevas.map((x) => x.id), ["a", "b", "c"]);
    assert.deepEqual(avisadas, ["vieja", "a", "b", "c"]);
  });

  it("no repite las ya avisadas y no avisa las leídas", () => {
    const { nuevas } = seleccionarParaAvisar([n("a"), n("b", { leida: true })], ["a"], ahora);
    assert.deepEqual(nuevas, []);
    assert.deepEqual(seleccionarParaAvisar([n("b", { leida: true })], [], ahora).nuevas, []);
  });

  it("sesión nueva (sin historial): solo avisa las no leídas de las últimas 24 h y recuerda todas", () => {
    const lista = [n("reciente"), n("antigua", { creadaEn: ahora - VENTANA_PRIMERA_VEZ_MS - 1 }), n("leida", { leida: true })];
    const { nuevas, avisadas } = seleccionarParaAvisar(lista, null, ahora);
    assert.deepEqual(nuevas.map((x) => x.id), ["reciente"]);
    assert.deepEqual(avisadas.sort(), ["antigua", "leida", "reciente"]);
    // y la segunda lectura ya no repite
    assert.deepEqual(seleccionarParaAvisar(lista, avisadas, ahora).nuevas, []);
  });

  it("limita la memoria a las últimas 300", () => {
    const lista = Array.from({ length: 350 }, (_, i) => n(`n${i}`, { leida: true }));
    assert.equal(seleccionarParaAvisar(lista, null, ahora).avisadas.length, 300);
  });
});
