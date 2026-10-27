import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, Timestamp, auth, coleccion, docJornada, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

const registros = async () =>
  (await coleccion("auditoria")).map((a) => ({ accion: a.accion, entidadId: a.entidadId, detalle: a.detalle, actorId: a.actorId, actorNombre: a.actorNombre }));

describe("M5 · administración de cuentas (solo administrador)", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => { await limpiar(); await sembrarPerfiles(); });

  describe("crear cuenta", () => {
    const nueva = (extra = {}) => ({ nombre: "Laura Gómez", correo: "Laura@TdeA.edu.co", clave: "secreto1", rol: "gestor", ...extra });

    it("crea la cuenta de acceso y el perfil con el rol indicado, y lo audita", async () => {
      const r = await api.llamar("admin1", "POST", "/v1/usuarios", nueva());
      assert.equal(r.estado, 201);
      const cuenta = await auth.getUser(r.cuerpo.id);
      assert.equal(cuenta.email, "laura@tdea.edu.co");
      assert.equal(cuenta.displayName, "Laura Gómez");
      const perfil = await leer(`users/${r.cuerpo.id}`);
      assert.deepEqual(
        { uid: perfil.uid, nombre: perfil.nombre, email: perfil.email, rol: perfil.rol, activo: perfil.activo },
        { uid: r.cuerpo.id, nombre: "Laura Gómez", email: "laura@tdea.edu.co", rol: "gestor", activo: true }
      );
      assert.ok(perfil.creadoEn);
      assert.deepEqual(await registros(), [
        { accion: "usuario.crear", entidadId: r.cuerpo.id, detalle: "laura@tdea.edu.co · Gestor de jornadas", actorId: "admin1", actorNombre: "Admin" },
      ]);
    });

    it("puede crear cada uno de los tres roles", async () => {
      for (const [i, rol] of ["estudiante", "gestor", "administrador"].entries()) {
        const r = await api.llamar("admin1", "POST", "/v1/usuarios", nueva({ correo: `u${i}@x.co`, rol }));
        assert.equal(r.estado, 201, rol);
        assert.equal((await leer(`users/${r.cuerpo.id}`)).rol, rol);
      }
    });

    it("la cuenta creada puede usarse de inmediato con el rol asignado", async () => {
      const r = await api.llamar("admin1", "POST", "/v1/usuarios", nueva());
      const como = await api.llamar(r.cuerpo.id, "GET", "/v1/me");
      assert.equal(como.cuerpo.rol, "gestor");
    });

    it("valida nombre, correo, contraseña y rol", async () => {
      const casos = [
        [{ nombre: "" }, "nombre"], [{ nombre: "x".repeat(101) }, "nombre"],
        [{ correo: "no-es-correo" }, "correo"], [{ correo: "" }, "correo"],
        [{ clave: "123" }, "clave"], [{ clave: undefined }, "clave"],
        [{ rol: "superadmin" }, "rol"], [{ rol: "maestro" }, "rol"], [{ rol: undefined }, "rol"],
      ];
      for (const [cambio, campo] of casos) {
        const r = await api.llamar("admin1", "POST", "/v1/usuarios", nueva(cambio));
        assert.equal(r.estado, 400, JSON.stringify(cambio));
        assert.ok(r.cuerpo.error.campos[campo], campo);
      }
      assert.deepEqual(await registros(), []);
    });

    it("un correo repetido es 409 EMAIL_EN_USO y no deja perfil ni auditoría", async () => {
      await api.llamar("admin1", "POST", "/v1/usuarios", nueva());
      const antes = (await coleccion("users")).length;
      const r = await api.llamar("admin1", "POST", "/v1/usuarios", nueva({ nombre: "Otra" }));
      assert.equal(r.estado, 409);
      assert.equal(r.cuerpo.error.codigo, "EMAIL_EN_USO");
      assert.equal(r.cuerpo.error.mensaje, "Ya existe una cuenta con ese correo.");
      assert.equal((await coleccion("users")).length, antes);
      assert.equal((await registros()).length, 1);
    });

    it("gestores, estudiantes y sin sesión no pueden crear cuentas", async () => {
      for (const uid of ["gestorA", "est1", "maestroViejo"]) {
        assert.equal((await api.llamar(uid, "POST", "/v1/usuarios", nueva())).estado, 403, uid);
      }
      assert.equal((await api.llamar(null, "POST", "/v1/usuarios", nueva())).estado, 401);
      assert.equal((await coleccion("users")).length, Object.keys((await import("./entorno.mjs")).perfiles).length);
    });

    it("un administrador desactivado no puede crear cuentas", async () => {
      await sembrar("users/admin1", { ...(await leer("users/admin1")), activo: false });
      assert.equal((await api.llamar("admin1", "POST", "/v1/usuarios", nueva())).estado, 403);
    });
  });

  describe("editar nombre, rol y estado", () => {
    it("cambia el rol (usuario.rol) y lo audita en la misma operación", async () => {
      const r = await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { rol: "gestor" });
      assert.deepEqual(r.cuerpo, { cambiado: true });
      assert.equal((await leer("users/est1")).rol, "gestor");
      assert.deepEqual(await registros(), [
        { accion: "usuario.rol", entidadId: "est1", detalle: "ana@x.co · rol: estudiante → gestor", actorId: "admin1", actorNombre: "Admin" },
      ]);
    });

    it("desactiva y reactiva una cuenta (usuario.estado); la desactivada deja de operar", async () => {
      await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { activo: false });
      assert.equal((await leer("users/est1")).activo, false);
      assert.equal((await api.llamar("est1", "GET", "/v1/me")).estado, 403);
      assert.equal((await api.llamar("est1", "PUT", "/v1/jornadas/x/inscripcion", {})).estado, 403);
      await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { activo: true });
      assert.equal((await api.llamar("est1", "GET", "/v1/me")).estado, 200);
      assert.deepEqual((await registros()).map((a) => a.accion), ["usuario.estado", "usuario.estado"]);
    });

    it("cambia el nombre (usuario.editar)", async () => {
      await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { nombre: "  Ana María " });
      assert.equal((await leer("users/est1")).nombre, "Ana María");
      assert.equal((await registros())[0].accion, "usuario.editar");
    });

    it("sin cambios reales no escribe ni audita", async () => {
      const r = await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { rol: "estudiante", activo: true, nombre: "Ana" });
      assert.deepEqual(r.cuerpo, { cambiado: false });
      assert.deepEqual(await registros(), []);
    });

    it("el alias antiguo maestro se considera gestor al comparar (como en la app)", async () => {
      const r = await api.llamar("admin1", "PATCH", "/v1/usuarios/maestroViejo", { rol: "gestor" });
      assert.deepEqual(r.cuerpo, { cambiado: false });
      assert.equal((await leer("users/maestroViejo")).rol, "maestro");
    });

    it("un administrador NO puede cambiar su propio rol ni su estado (ni otro administrador el suyo)", async () => {
      for (const [uid, cambio] of [["admin1", { rol: "estudiante" }], ["admin1", { activo: false }], ["admin1", { nombre: "x" }], ["admin2", { rol: "gestor" }]]) {
        const r = await api.llamar(uid, "PATCH", `/v1/usuarios/${uid}`, cambio);
        assert.equal(r.estado, 403, JSON.stringify([uid, cambio]));
      }
      assert.equal((await leer("users/admin1")).rol, "administrador");
      assert.deepEqual(await registros(), [], "al fallar no queda auditoría falsa");
    });

    it("un administrador sí puede cambiar el rol de OTRO administrador", async () => {
      assert.equal((await api.llamar("admin1", "PATCH", "/v1/usuarios/admin2", { rol: "estudiante" })).estado, 200);
      assert.equal((await leer("users/admin2")).rol, "estudiante");
    });

    it("valida los datos y la existencia de la cuenta", async () => {
      for (const cambio of [{ rol: "dios" }, { activo: "no" }, { nombre: "" }, { nombre: "x".repeat(101) }]) {
        assert.equal((await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", cambio)).estado, 400, JSON.stringify(cambio));
      }
      assert.equal((await api.llamar("admin1", "PATCH", "/v1/usuarios/fantasma", { rol: "gestor" })).estado, 404);
      assert.equal((await leer("users/est1")).rol, "estudiante");
    });

    it("gestores, estudiantes y sin sesión no pueden editar cuentas ni asignarse el rol de administrador", async () => {
      for (const uid of ["gestorA", "est1", "est2"]) {
        assert.equal((await api.llamar(uid, "PATCH", "/v1/usuarios/est2", { rol: "administrador" })).estado, 403, uid);
        assert.equal((await api.llamar(uid, "PATCH", `/v1/usuarios/${uid}`, { rol: "administrador" })).estado, 403, uid);
      }
      assert.equal((await api.llamar(null, "PATCH", "/v1/usuarios/est2", { rol: "administrador" })).estado, 401);
      assert.equal((await leer("users/est2")).rol, "estudiante");
      assert.equal((await leer("users/est1")).rol, "estudiante");
    });

    it("al ascender a una cuenta, adquiere de inmediato las funciones del rol; al quitarlo, las pierde", async () => {
      const cuerpo = { titulo: "T", descripcion: "D", entidad: "E", responsable: "R", lugar: "Coliseo", fecha: reloj.ahora + DIA, cuposTotales: 5 };
      assert.equal((await api.llamar("est1", "POST", "/v1/jornadas", cuerpo)).estado, 403);
      await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { rol: "gestor" });
      const creada = await api.llamar("est1", "POST", "/v1/jornadas", cuerpo);
      assert.equal(creada.estado, 201);
      await api.llamar("admin1", "PATCH", "/v1/usuarios/est1", { rol: "estudiante" });
      assert.equal((await api.llamar("est1", "POST", `/v1/jornadas/${creada.cuerpo.id}/cancelar`)).estado, 403);
    });
  });
});

describe("M6 · estadísticas y reporte global (solo administrador)", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("users/baja", { uid: "baja", nombre: "Baja", rol: "estudiante", activo: false });
    await sembrar("jornadas/a1", docJornada({ creadoPor: "gestorA", lugar: "Coliseo", cuposTotales: 10, cuposOcupados: 5 }));
    await sembrar("jornadas/a2", docJornada({ creadoPor: "gestorA", lugar: "Auditorio", cuposTotales: 10, cuposOcupados: 0, activa: false }));
    await sembrar("jornadas/b1", docJornada({ creadoPor: "gestorB", lugar: "Coliseo", cuposTotales: 20, cuposOcupados: 5, fecha: Timestamp.fromMillis(reloj.ahora - DIA), activa: false }));
    const huerfana = docJornada({ lugar: "Cancha", cuposTotales: 10, cuposOcupados: 0 });
    delete huerfana.creadoPor;
    await sembrar("jornadas/h1", huerfana);
  });

  it("calcula los indicadores globales", async () => {
    const r = await api.llamar("admin1", "GET", "/v1/admin/estadisticas");
    assert.equal(r.estado, 200);
    const s = r.cuerpo;
    assert.equal(s.totalUsuarios, 8);
    assert.equal(s.estudiantes, 3, "est1, est2 y la desactivada");
    assert.equal(s.gestores, 3, "gestorA, gestorB y el alias maestro");
    assert.equal(s.administradores, 2);
    assert.equal(s.cuentasInactivas, 1);
    assert.equal(s.totalJornadas, 4);
    assert.deepEqual(s.porEstado, { activa: 2, en_curso: 0, cancelada: 1, finalizada: 1 });
    assert.deepEqual(s.porEspacio, { Coliseo: 2, Auditorio: 1, Cancha: 1 });
    assert.equal(s.cuposTotales, 50);
    assert.equal(s.cuposOcupados, 10);
    assert.equal(s.ocupacion, 20);
    assert.deepEqual(s.porGestor, { gestorA: 2, gestorB: 1, "sin-gestor": 1 });
  });

  it("resuelve los nombres de los gestores (y 'Sin gestor asignado')", async () => {
    const { porGestorNombre } = (await api.llamar("admin1", "GET", "/v1/admin/estadisticas")).cuerpo;
    const por = Object.fromEntries(porGestorNombre.map((g) => [g.nombre, g.jornadas]));
    assert.deepEqual(por, { "Gestor A": 2, "Gestor B": 1, "Sin gestor asignado": 1 });
  });

  it("el reporte de jornadas es un CSV con el estado, el gestor y la ocupación, y se audita", async () => {
    const r = await api.llamar("admin1", "GET", "/v1/admin/reporte-jornadas.csv");
    assert.equal(r.estado, 200);
    assert.match(r.cabeceras.get("content-type"), /text\/csv/);
    assert.match(r.cabeceras.get("content-disposition"), /reporte-jornadas\.csv/);
    const csv = r.cuerpo;
    assert.ok(csv.startsWith("sep=;"));
    assert.ok(csv.includes("Total de jornadas;4"));
    assert.ok(csv.includes("Jornada;Fecha;Espacio;Estado;Gestor;Cupos;Inscritos;Ocupación (%)".replace("Jornada;Fecha", "Jornada;Fecha")));
    assert.ok(csv.includes(";Coliseo;Activa;Gestor A;10;5;50"));
    assert.ok(csv.includes(";Coliseo;Finalizada;Gestor B;20;5;25"));
    assert.ok(csv.includes(";Cancha;Activa;Sin gestor asignado;10;0;0"));
    assert.deepEqual(await registros(), [
      { accion: "reporte.exportar", entidadId: "jornadas", detalle: "4 jornadas", actorId: "admin1", actorNombre: "Admin" },
    ]);
  });

  it("solo el administrador accede (gestor, estudiante y sin sesión no)", async () => {
    for (const ruta of ["/v1/admin/estadisticas", "/v1/admin/reporte-jornadas.csv"]) {
      assert.equal((await api.llamar("gestorA", "GET", ruta)).estado, 403, ruta);
      assert.equal((await api.llamar("est1", "GET", ruta)).estado, 403, ruta);
      assert.equal((await api.llamar(null, "GET", ruta)).estado, 401, ruta);
    }
    assert.deepEqual(await registros(), []);
  });
});
