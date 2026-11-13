import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { auth, cuerpoJornada, iniciarApi, limpiar, perfiles, sembrar, sembrarPerfiles } from "./entorno.mjs";

describe("autenticación, cuenta activa y formato de errores", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => { await limpiar(); await sembrarPerfiles(); });

  it("la salud de la API no pide sesión", async () => {
    const r = await api.llamar(null, "GET", "/v1/salud");
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { estado: "ok" });
  });

  it("sin token, con token inválido o sin el esquema Bearer: 401 NO_AUTENTICADO", async () => {
    for (const encabezado of [undefined, "Bearer invalido", "Basic abc", "Bearer "]) {
      const r = await fetch(api.base + "/v1/me", { headers: encabezado ? { Authorization: encabezado } : {} });
      assert.equal(r.status, 401, String(encabezado));
      assert.equal((await r.json()).error.codigo, "NO_AUTENTICADO");
    }
  });

  it("GET /v1/me devuelve el rol normalizado (el alias maestro es gestor)", async () => {
    assert.equal((await api.llamar("est1", "GET", "/v1/me")).cuerpo.rol, "estudiante");
    assert.equal((await api.llamar("maestroViejo", "GET", "/v1/me")).cuerpo.rol, "gestor");
    assert.equal((await api.llamar("admin1", "GET", "/v1/me")).cuerpo.rol, "administrador");
  });

  it("un usuario sin perfil (recién registrado) se trata como estudiante activo", async () => {
    const r = await api.llamar("nuevo", "GET", "/v1/me");
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.rol, "estudiante");
    assert.equal(r.cuerpo.activo, true);
  });

  it("valores de rol inesperados nunca dan permisos de gestor ni de administrador", async () => {
    for (const rol of ["admin", "MAESTRO", true, 1, "gestor "]) {
      await sembrar("users/raro", { rol, nombre: "Raro" });
      assert.equal((await api.llamar("raro", "GET", "/v1/me")).cuerpo.rol, "estudiante", String(rol));
      assert.equal((await api.llamar("raro", "POST", "/v1/jornadas", cuerpoJornada())).estado, 403, String(rol));
    }
  });

  it("una cuenta desactivada no puede operar: 403 CUENTA_DESACTIVADA", async () => {
    await sembrar("users/baja", { ...perfiles.est1, uid: "baja", activo: false });
    const r = await api.llamar("baja", "GET", "/v1/me");
    assert.equal(r.estado, 403);
    assert.equal(r.cuerpo.error.codigo, "CUENTA_DESACTIVADA");
  });

  it("un JSON inválido es 400 y una ruta inexistente 404, con el formato de error de la API", async () => {
    const malo = await fetch(api.base + "/v1/jornadas", {
      method: "POST",
      headers: { Authorization: "Bearer gestorA", "Content-Type": "application/json" },
      body: "{no es json",
    });
    assert.equal(malo.status, 400);
    assert.equal((await malo.json()).error.codigo, "VALIDACION");
    const r = await api.llamar("est1", "GET", "/v1/no-existe");
    assert.equal(r.estado, 404);
    assert.equal(r.cuerpo.error.codigo, "RUTA_NO_ENCONTRADA");
  });

  it("no se aceptan orígenes web no autorizados (CORS cerrado por defecto)", async () => {
    const r = await fetch(api.base + "/v1/salud", { headers: { Origin: "https://malo.example" } });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  });

  it("con el emulador de Auth: un ID token REAL se verifica y el rol sale del perfil", { skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST }, async () => {
    const real = await iniciarApi({ verificarToken: (t) => auth.verifyIdToken(t) });
    try {
      const cuenta = await auth.createUser({ email: "real@x.co", password: "secreto123", displayName: "Real" });
      await sembrar(`users/${cuenta.uid}`, { uid: cuenta.uid, nombre: "Real", email: "real@x.co", rol: "gestor" });
      const respuesta = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "real@x.co", password: "secreto123", returnSecureToken: true }) }
      );
      const { idToken } = await respuesta.json();
      const ok = await fetch(real.base + "/v1/me", { headers: { Authorization: `Bearer ${idToken}` } });
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).rol, "gestor");
      const mal = await fetch(real.base + "/v1/me", { headers: { Authorization: "Bearer abc.def.ghi" } });
      assert.equal(mal.status, 401);
    } finally {
      await real.cerrar();
    }
  });
});
