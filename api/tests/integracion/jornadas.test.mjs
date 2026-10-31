import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, Timestamp, coleccion, cuerpoJornada, docJornada, existe, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

const auditoria = async () => (await coleccion("auditoria")).map((a) => ({ accion: a.accion, entidadId: a.entidadId, detalle: a.detalle, actorId: a.actorId }));

describe("M3 · gestión de jornadas (gestor y administrador)", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA" }));
    await sembrar("jornadas/jB", docJornada({ creadoPor: "gestorB", titulo: "De B" }));
    const legado = docJornada({ titulo: "Anterior a los roles" });
    delete legado.creadoPor;
    await sembrar("jornadas/jLegado", legado);
  });

  describe("crear", () => {
    it("un gestor crea una jornada a su nombre (sin cupos ocupados y activa)", async () => {
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada());
      assert.equal(r.estado, 201);
      const j = await leer(`jornadas/${r.cuerpo.id}`);
      assert.equal(j.creadoPor, "gestorA");
      assert.equal(j.cuposOcupados, 0);
      assert.equal(j.activa, true);
      assert.equal(j.cuposTotales, 10);
      assert.ok(j.fecha instanceof Timestamp);
      assert.equal(j.fecha.toMillis(), cuerpoJornada().fecha);
      assert.ok(j.creadaEn);
      assert.deepEqual(await auditoria(), [], "solo las acciones del administrador se auditan");
    });

    it("el alias antiguo `maestro` también crea jornadas", async () => {
      const r = await api.llamar("maestroViejo", "POST", "/v1/jornadas", cuerpoJornada());
      assert.equal(r.estado, 201);
      assert.equal((await leer(`jornadas/${r.cuerpo.id}`)).creadoPor, "maestroViejo");
    });

    it("un estudiante, un usuario sin perfil o sin sesión no pueden crear jornadas", async () => {
      assert.equal((await api.llamar("est1", "POST", "/v1/jornadas", cuerpoJornada())).estado, 403);
      assert.equal((await api.llamar("sinPerfil", "POST", "/v1/jornadas", cuerpoJornada())).estado, 403);
      assert.equal((await api.llamar(null, "POST", "/v1/jornadas", cuerpoJornada())).estado, 401);
      assert.equal((await coleccion("jornadas")).length, 3);
    });

    it("un gestor no puede crear a nombre de otro gestor (aunque lo pida)", async () => {
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ creadoPor: "gestorB" }));
      assert.equal(r.estado, 403);
      assert.equal((await coleccion("jornadas")).length, 3);
    });

    it("acepta cada espacio permitido y rechaza los que no están en la lista", async () => {
      const permitidos = [...Array.from({ length: 13 }, (_, i) => `Bloque ${i + 1}`), "Auditorio", "Cancha", "Coliseo"];
      for (const lugar of permitidos) {
        assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ lugar }))).estado, 201, lugar);
      }
      for (const lugar of ["Bloque 14", "Bloque 0", "Piscina", "coliseo", "", undefined]) {
        const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ lugar }));
        assert.equal(r.estado, 400, String(lugar));
        assert.equal(r.cuerpo.error.campos.lugar, "Selecciona un espacio de la lista.");
      }
    });

    it("valida textos, cupos y fecha con los mismos mensajes del formulario", async () => {
      const casos = [
        [{ titulo: "" }, "titulo", "Escribe el título de la jornada."],
        [{ titulo: "   " }, "titulo", "Escribe el título de la jornada."],
        [{ titulo: "x".repeat(121) }, "titulo", "Máximo 120 caracteres."],
        [{ descripcion: "" }, "descripcion", "Escribe una descripción."],
        [{ descripcion: "x".repeat(2001) }, "descripcion", "Máximo 2000 caracteres."],
        [{ entidad: "" }, "entidad", "Indica la entidad organizadora."],
        [{ responsable: "" }, "responsable", "Indica el responsable."],
        [{ cuposTotales: 0 }, "cuposTotales", "Los cupos deben ser un número entero mayor que 0."],
        [{ cuposTotales: -3 }, "cuposTotales", "Los cupos deben ser un número entero mayor que 0."],
        [{ cuposTotales: 2.5 }, "cuposTotales", "Los cupos deben ser un número entero mayor que 0."],
        [{ cuposTotales: "10" }, "cuposTotales", "Los cupos deben ser un número entero mayor que 0."],
        [{ cuposTotales: 1001 }, "cuposTotales", "Máximo 1000 cupos."],
        [{ duracionMin: 9 }, "duracionMin", "La duración mínima es de 10 minutos."],
        [{ duracionMin: 1441 }, "duracionMin", "La duración máxima es de 1440 minutos (24 horas)."],
        [{ duracionMin: 45.5 }, "duracionMin", "La duración debe ser un número entero de minutos."],
        [{ duracionMin: "60" }, "duracionMin", "La duración debe ser un número entero de minutos."],
        [{ fecha: reloj.ahora - 1000 }, "fecha", "La fecha y la hora deben ser posteriores a este momento."],
        [{ fecha: reloj.ahora }, "fecha", "La fecha y la hora deben ser posteriores a este momento."],
        [{ fecha: "mañana" }, "fecha", "Fecha u hora no válidas. La hora va como HH:mm (24 h)."],
        [{ fecha: undefined }, "fecha", "Fecha u hora no válidas. La hora va como HH:mm (24 h)."],
      ];
      for (const [cambio, campo, mensaje] of casos) {
        const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada(cambio));
        assert.equal(r.estado, 400, JSON.stringify(cambio));
        assert.equal(r.cuerpo.error.codigo, "VALIDACION");
        assert.equal(r.cuerpo.error.campos[campo], mensaje, JSON.stringify(cambio));
      }
      assert.equal((await coleccion("jornadas")).length, 3);
    });

    it("acepta los límites exactos (120/2000 caracteres, 1 y 1000 cupos) y recorta espacios", async () => {
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({
        titulo: `  ${"x".repeat(120)}  `, descripcion: "d".repeat(2000), cuposTotales: 1000,
      }));
      assert.equal(r.estado, 201);
      assert.equal((await leer(`jornadas/${r.cuerpo.id}`)).titulo.length, 120);
      assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ cuposTotales: 1 }))).estado, 201);
    });

    it("no se guardan campos que no sean de la jornada (nadie fija cupos ocupados, estado ni propietario a mano)", async () => {
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ cuposOcupados: 9, activa: false, extra: "x", creadaEn: 1 }));
      assert.equal(r.estado, 201);
      const j = await leer(`jornadas/${r.cuerpo.id}`);
      assert.equal(j.cuposOcupados, 0);
      assert.equal(j.activa, true);
      assert.equal("extra" in j, false);
    });

    it("el administrador crea para cualquier gestor (o para sí mismo) y queda auditado", async () => {
      const r = await api.llamar("admin1", "POST", "/v1/jornadas", cuerpoJornada({ creadoPor: "gestorB" }));
      assert.equal(r.estado, 201);
      assert.equal((await leer(`jornadas/${r.cuerpo.id}`)).creadoPor, "gestorB");
      const propia = await api.llamar("admin1", "POST", "/v1/jornadas", cuerpoJornada());
      assert.equal((await leer(`jornadas/${propia.cuerpo.id}`)).creadoPor, "admin1");
      const registros = await auditoria();
      assert.equal(registros.length, 2);
      assert.deepEqual(registros.map((a) => a.accion), ["jornada.crear", "jornada.crear"]);
      assert.ok(registros.every((a) => a.actorId === "admin1"));
      assert.ok(registros.some((a) => a.detalle === "Jornada de salud · gestor: Gestor B"));
    });

    it("el administrador no puede asignar a un estudiante, a una cuenta desactivada ni a una inexistente", async () => {
      await sembrar("users/gestorBaja", { uid: "gestorBaja", rol: "gestor", activo: false, nombre: "Baja" });
      for (const creadoPor of ["est1", "gestorBaja", "fantasma"]) {
        const r = await api.llamar("admin1", "POST", "/v1/jornadas", cuerpoJornada({ creadoPor }));
        assert.equal(r.estado, 400, creadoPor);
        assert.ok(r.cuerpo.error.campos.creadoPor);
      }
      assert.equal((await coleccion("jornadas")).length, 3);
      assert.deepEqual(await auditoria(), []);
    });
  });

  describe("banner opcional (enlace https a una imagen)", () => {
    const BANNER = "https://tdea.edu.co/banners/salud.jpg";
    const crear = (extra) => api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada(extra));
    const editar = (extra, id = "jA") => api.llamar("gestorA", "PUT", `/v1/jornadas/${id}`, cuerpoJornada(extra));

    it("sin el campo o con texto vacío la jornada se crea sin banner (no se guarda ni un campo vacío)", async () => {
      for (const extra of [{}, { bannerUrl: "" }, { bannerUrl: "   " }]) {
        const r = await crear(extra);
        assert.equal(r.estado, 201, JSON.stringify(extra));
        assert.equal("bannerUrl" in (await leer(`jornadas/${r.cuerpo.id}`)), false, JSON.stringify(extra));
      }
    });

    it("con un enlace https válido lo guarda (sin espacios sobrantes)", async () => {
      const r = await crear({ bannerUrl: `  ${BANNER}  ` });
      assert.equal(r.estado, 201);
      assert.equal((await leer(`jornadas/${r.cuerpo.id}`)).bannerUrl, BANNER);
    });

    it("rechaza enlaces no https, con espacios, con credenciales, demasiado largos o que no son texto", async () => {
      const invalidos = [
        "http://tdea.edu.co/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "tdea.edu.co/a.jpg",
        "https://tdea.edu.co/mi banner.jpg", "https://usuario:clave@tdea.edu.co/a.jpg", "https://localhost/a.jpg",
        `https://tdea.edu.co/${"a".repeat(500)}`, 123, { url: BANNER }, [BANNER],
      ];
      for (const bannerUrl of invalidos) {
        const r = await crear({ bannerUrl });
        assert.equal(r.estado, 400, JSON.stringify(bannerUrl)?.slice(0, 60));
        assert.match(r.cuerpo.error.campos.bannerUrl, /https:\/\//);
      }
      assert.equal((await coleccion("jornadas")).length, 3, "no se creó ninguna");
    });

    it("al editar: un enlace lo fija; sin el campo se conserva; con texto vacío se quita", async () => {
      assert.equal((await editar({ bannerUrl: BANNER })).estado, 204);
      assert.equal((await leer("jornadas/jA")).bannerUrl, BANNER);

      // una versión de la app sin el campo no borra el banner
      assert.equal((await editar({ titulo: "Otro título" })).estado, 204);
      assert.equal((await leer("jornadas/jA")).bannerUrl, BANNER, "se conserva");
      assert.equal((await leer("jornadas/jA")).titulo, "Otro título");

      assert.equal((await editar({ bannerUrl: "" })).estado, 204);
      assert.equal("bannerUrl" in (await leer("jornadas/jA")), false, "se quitó el campo");
    });

    it("un enlace inválido al editar se rechaza y no cambia nada de la jornada", async () => {
      await editar({ bannerUrl: BANNER });
      const r = await editar({ bannerUrl: "http://tdea.edu.co/a.jpg", titulo: "No debe guardarse" });
      assert.equal(r.estado, 400);
      assert.ok(r.cuerpo.error.campos.bannerUrl);
      const j = await leer("jornadas/jA");
      assert.equal(j.bannerUrl, BANNER);
      assert.notEqual(j.titulo, "No debe guardarse");
    });

    it("el administrador también lo edita y editar el banner no altera cupos ni propietario", async () => {
      await sembrar("jornadas/jB", docJornada({ creadoPor: "gestorB", cuposTotales: 10, cuposOcupados: 3 }));
      assert.equal((await api.llamar("admin1", "PUT", "/v1/jornadas/jB", cuerpoJornada({ bannerUrl: BANNER }))).estado, 204);
      const j = await leer("jornadas/jB");
      assert.equal(j.bannerUrl, BANNER);
      assert.equal(j.cuposOcupados, 3);
      assert.equal(j.creadoPor, "gestorB");
    });
  });

  describe("editar y reasignar", () => {
    it("el gestor edita su propia jornada", async () => {
      const r = await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada({ titulo: "Nuevo título", cuposTotales: 20 }));
      assert.equal(r.estado, 204);
      const j = await leer("jornadas/jA");
      assert.equal(j.titulo, "Nuevo título");
      assert.equal(j.cuposTotales, 20);
      assert.equal(j.creadoPor, "gestorA");
      assert.equal(j.cuposOcupados, 0);
      assert.equal(j.activa, true);
    });

    it("un gestor NO edita jornadas de otro gestor ni las anteriores a los roles", async () => {
      for (const id of ["jB", "jLegado"]) {
        const r = await api.llamar("gestorA", "PUT", `/v1/jornadas/${id}`, cuerpoJornada({ titulo: "Hackeada" }));
        assert.equal(r.estado, 403, id);
        assert.notEqual((await leer(`jornadas/${id}`)).titulo, "Hackeada");
      }
    });

    it("un gestor no puede adueñarse de una jornada ni reasignarla", async () => {
      for (const id of ["jB", "jLegado", "jA"]) {
        const r = await api.llamar("gestorA", "PUT", `/v1/jornadas/${id}`, cuerpoJornada({ creadoPor: "gestorB" }));
        assert.equal(r.estado, 403, id);
      }
      assert.equal((await leer("jornadas/jA")).creadoPor, "gestorA");
      assert.equal((await leer("jornadas/jLegado")).creadoPor, undefined);
    });

    it("un gestor que envía su propio uid como propietario no cambia nada", async () => {
      const r = await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada({ creadoPor: "gestorA" }));
      assert.equal(r.estado, 204);
    });

    it("un estudiante no edita, cancela ni elimina; sin sesión tampoco", async () => {
      assert.equal((await api.llamar("est1", "PUT", "/v1/jornadas/jA", cuerpoJornada())).estado, 403);
      assert.equal((await api.llamar("est1", "POST", "/v1/jornadas/jA/cancelar")).estado, 403);
      assert.equal((await api.llamar("est1", "DELETE", "/v1/jornadas/jA")).estado, 403);
      assert.equal((await api.llamar(null, "DELETE", "/v1/jornadas/jA")).estado, 401);
      assert.equal((await leer("jornadas/jA")).activa, true);
    });

    it("los cupos no pueden quedar por debajo de los inscritos", async () => {
      await sembrar("jornadas/jA", docJornada({ cuposTotales: 10, cuposOcupados: 4 }));
      const r = await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada({ cuposTotales: 3 }));
      assert.equal(r.estado, 400);
      assert.equal(r.cuerpo.error.campos.cuposTotales, "Ya hay 4 inscritos: los cupos no pueden ser menos.");
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada({ cuposTotales: 4 }))).estado, 204);
      assert.equal((await leer("jornadas/jA")).cuposOcupados, 4, "el contador no se toca");
    });

    it("una jornada activa exige fecha futura; una cancelada puede conservar una fecha pasada", async () => {
      const pasada = cuerpoJornada({ fecha: reloj.ahora - DIA });
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", pasada)).estado, 400);
      await sembrar("jornadas/jA", docJornada({ activa: false, fecha: Timestamp.fromMillis(reloj.ahora - 2 * DIA) }));
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", pasada)).estado, 204);
    });

    it("una jornada inexistente es 404", async () => {
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/nada", cuerpoJornada())).estado, 404);
    });

    it("el administrador edita cualquiera (incluidas las anteriores a los roles) y deja auditoría", async () => {
      assert.equal((await api.llamar("admin1", "PUT", "/v1/jornadas/jB", cuerpoJornada({ titulo: "Editada por admin" }))).estado, 204);
      assert.equal((await api.llamar("admin1", "PUT", "/v1/jornadas/jLegado", cuerpoJornada({ titulo: "Legado editada" }))).estado, 204);
      assert.equal((await leer("jornadas/jB")).titulo, "Editada por admin");
      assert.equal((await leer("jornadas/jB")).creadoPor, "gestorB", "sin reasignar conserva el propietario");
      assert.deepEqual((await auditoria()).map((a) => a.accion), ["jornada.editar", "jornada.editar"]);
    });

    it("el administrador reasigna a otro gestor (acción jornada.reasignar) y adopta una jornada sin propietario", async () => {
      assert.equal((await api.llamar("admin1", "PUT", "/v1/jornadas/jA", cuerpoJornada({ creadoPor: "gestorB" }))).estado, 204);
      assert.equal((await leer("jornadas/jA")).creadoPor, "gestorB");
      assert.equal((await api.llamar("admin1", "PUT", "/v1/jornadas/jLegado", cuerpoJornada({ creadoPor: "gestorA" }))).estado, 204);
      assert.equal((await leer("jornadas/jLegado")).creadoPor, "gestorA");
      const registros = await auditoria();
      assert.deepEqual(registros.map((a) => a.accion), ["jornada.reasignar", "jornada.reasignar"]);
      assert.ok(registros.some((a) => a.detalle.endsWith("gestor: Gestor B")));
      // el gestor anterior pierde el acceso
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada())).estado, 403);
      assert.equal((await api.llamar("gestorB", "PUT", "/v1/jornadas/jA", cuerpoJornada())).estado, 204);
    });

    it("no se reasigna a un estudiante ni a una cuenta inexistente; no queda auditoría falsa", async () => {
      for (const creadoPor of ["est1", "fantasma"]) {
        const r = await api.llamar("admin1", "PUT", "/v1/jornadas/jA", cuerpoJornada({ creadoPor }));
        assert.equal(r.estado, 400, creadoPor);
      }
      assert.equal((await leer("jornadas/jA")).creadoPor, "gestorA");
      assert.deepEqual(await auditoria(), []);
    });
  });

  describe("cancelar, reactivar y eliminar", () => {
    it("el gestor cancela y reactiva su jornada", async () => {
      assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas/jA/cancelar")).estado, 204);
      assert.equal((await leer("jornadas/jA")).activa, false);
      assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas/jA/reactivar")).estado, 204);
      assert.equal((await leer("jornadas/jA")).activa, true);
    });

    it("no se reactiva una jornada cuya fecha ya pasó", async () => {
      await sembrar("jornadas/jA", docJornada({ activa: false, fecha: Timestamp.fromMillis(reloj.ahora - 1000) }));
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas/jA/reactivar");
      assert.equal(r.estado, 409);
      assert.equal(r.cuerpo.error.codigo, "FECHA_PASADA");
      assert.equal((await leer("jornadas/jA")).activa, false);
    });

    it("cancelar es idempotente", async () => {
      await api.llamar("gestorA", "POST", "/v1/jornadas/jA/cancelar");
      assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas/jA/cancelar")).estado, 204);
      assert.equal((await leer("jornadas/jA")).activa, false);
    });

    it("un gestor no cancela, reactiva ni elimina jornadas ajenas o sin propietario", async () => {
      for (const id of ["jB", "jLegado"]) {
        assert.equal((await api.llamar("gestorA", "POST", `/v1/jornadas/${id}/cancelar`)).estado, 403, id);
        assert.equal((await api.llamar("gestorA", "POST", `/v1/jornadas/${id}/reactivar`)).estado, 403, id);
        assert.equal((await api.llamar("gestorA", "DELETE", `/v1/jornadas/${id}`)).estado, 403, id);
        assert.equal(await existe(`jornadas/${id}`), true);
        assert.equal((await leer(`jornadas/${id}`)).activa, true);
      }
    });

    it("el gestor elimina su jornada y las inscripciones se conservan", async () => {
      await sembrar("inscripciones/est1_jA", { userId: "est1", jornadaId: "jA", tituloJornada: "Jornada de salud" });
      assert.equal((await api.llamar("gestorA", "DELETE", "/v1/jornadas/jA")).estado, 204);
      assert.equal(await existe("jornadas/jA"), false);
      assert.equal(await existe("inscripciones/est1_jA"), true);
    });

    it("el administrador cancela, reactiva y elimina cualquiera, y cada acción queda auditada con el título", async () => {
      assert.equal((await api.llamar("admin1", "POST", "/v1/jornadas/jB/cancelar")).estado, 204);
      assert.equal((await api.llamar("admin1", "POST", "/v1/jornadas/jB/reactivar")).estado, 204);
      assert.equal((await api.llamar("admin1", "DELETE", "/v1/jornadas/jLegado")).estado, 204);
      assert.deepEqual(
        (await auditoria()).map((a) => [a.accion, a.entidadId, a.detalle]).sort(),
        [
          ["jornada.cancelar", "jB", "De B"],
          ["jornada.eliminar", "jLegado", "Anterior a los roles"],
          ["jornada.reactivar", "jB", "De B"],
        ]
      );
    });

    it("una cuenta de gestor desactivada no puede administrar nada", async () => {
      await sembrar("users/gestorA", { ...(await leer("users/gestorA")), activo: false });
      assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas/jA/cancelar")).estado, 403);
      assert.equal((await leer("jornadas/jA")).activa, true);
    });

    it("operar sobre una jornada inexistente es 404", async () => {
      for (const [m, ruta] of [["POST", "/v1/jornadas/nada/cancelar"], ["POST", "/v1/jornadas/nada/reactivar"], ["DELETE", "/v1/jornadas/nada"]]) {
        assert.equal((await api.llamar("admin1", m, ruta)).estado, 404, ruta);
      }
    });
  });

  describe("inscritos y planilla", () => {
    beforeEach(async () => {
      await sembrar("inscripciones/est1_jA", { userId: "est1", jornadaId: "jA", nombreUsuario: "Ana", emailUsuario: "ana@x.co", asistio: false, inscritoEn: Timestamp.fromMillis(reloj.ahora - DIA) });
      await sembrar("inscripciones/est2_jA", { userId: "est2", jornadaId: "jA", nombreUsuario: "=CMD()", emailUsuario: "beto@x.co", asistio: true, inscritoEn: Timestamp.fromMillis(reloj.ahora) });
      await sembrar("inscripciones/est1_jB", { userId: "est1", jornadaId: "jB", nombreUsuario: "Ana", emailUsuario: "ana@x.co" });
    });

    it("el gestor lee los inscritos de SUS jornadas (solo los de esa jornada)", async () => {
      const r = await api.llamar("gestorA", "GET", "/v1/jornadas/jA/inscritos");
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo.inscritos.map((i) => i.userId).sort(), ["est1", "est2"]);
      const ana = r.cuerpo.inscritos.find((i) => i.userId === "est1");
      assert.deepEqual(
        { nombreUsuario: ana.nombreUsuario, emailUsuario: ana.emailUsuario, asistio: ana.asistio, inscritoEn: ana.inscritoEn },
        { nombreUsuario: "Ana", emailUsuario: "ana@x.co", asistio: false, inscritoEn: reloj.ahora - DIA }
      );
    });

    it("el gestor NO lee los inscritos de jornadas ajenas, anteriores a los roles o inexistentes", async () => {
      for (const id of ["jB", "jLegado", "nada"]) {
        assert.equal((await api.llamar("gestorA", "GET", `/v1/jornadas/${id}/inscritos`)).estado, 403, id);
      }
    });

    it("el estudiante no lee la lista de inscritos; el administrador lee la de cualquiera", async () => {
      assert.equal((await api.llamar("est1", "GET", "/v1/jornadas/jA/inscritos")).estado, 403);
      assert.equal((await api.llamar("admin1", "GET", "/v1/jornadas/jB/inscritos")).cuerpo.inscritos.length, 1);
      assert.equal((await api.llamar("admin1", "GET", "/v1/jornadas/nada/inscritos")).cuerpo.inscritos.length, 0);
    });

    it("la planilla es un CSV para Excel con BOM, separador ; y fórmulas neutralizadas", async () => {
      const r = await api.llamar("gestorA", "GET", "/v1/jornadas/jA/planilla.csv");
      assert.equal(r.estado, 200);
      assert.match(r.cabeceras.get("content-type"), /text\/csv/);
      assert.match(r.cabeceras.get("content-disposition"), /planilla-jornada-de-salud\.csv/);
      const csv = r.cuerpo;
      // fetch().text() descarta el BOM: se comprueban los bytes reales de la respuesta
      const crudo = await fetch(`${api.base}/v1/jornadas/jA/planilla.csv`, { headers: { Authorization: "Bearer gestorA" } });
      assert.deepEqual([...new Uint8Array(await crudo.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 con BOM");
      assert.ok(csv.startsWith("sep=;\r\n"));
      assert.ok(csv.includes("Total de inscritos;2"));
      assert.ok(csv.includes("'=CMD()"), "la fórmula queda neutralizada");
      assert.ok(csv.includes(";Sí"));
    });

    it("la planilla de una jornada ajena es 403 y la de una inexistente 404 (para el administrador)", async () => {
      assert.equal((await api.llamar("gestorA", "GET", "/v1/jornadas/jB/planilla.csv")).estado, 403);
      assert.equal((await api.llamar("admin1", "GET", "/v1/jornadas/nada/planilla.csv")).estado, 404);
    });
  });
});
