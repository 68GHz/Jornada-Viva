import express from "express";
import { autenticar, soloAdministrador } from "./middleware/autenticacion.js";
import { manejarErrores, rutaNoEncontrada } from "./middleware/errores.js";
import * as perfiles from "./servicios/perfiles.js";
import * as inscripciones from "./servicios/inscripciones.js";
import * as jornadas from "./servicios/jornadas.js";
import * as notificaciones from "./servicios/notificaciones.js";
import * as usuarios from "./servicios/usuarios.js";
import * as estadisticas from "./servicios/estadisticas.js";
import { desactivarVencidas } from "./servicios/mantenimiento.js";

// Crea la aplicación Express. Todo lo externo se inyecta para poder probarla sin red:
//   db              Firestore (Admin SDK)
//   auth            Firebase Auth (Admin SDK): solo se usa para crear cuentas
//   verificarToken  (idToken) => { uid, email?, name? }; lanza si no es válido
//   ahora           reloj en ms (por defecto Date.now)
//   registro        consola (por defecto console)
export function crearApp({ db, auth, verificarToken, ahora = Date.now, registro = console, origenesCors = [] }) {
  const ctx = { db, auth, ahora, registro };
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    const origen = req.get("origin");
    if (origen && origenesCors.includes(origen)) {
      res.set("Access-Control-Allow-Origin", origen);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
  });

  // Sin datos: sirve a los balanceadores y al hosting para saber si la API está viva
  app.get("/v1/salud", (_req, res) => res.json({ estado: "ok" }));

  const v1 = express.Router();
  v1.use(autenticar({ db, verificarToken }));

  // ---- Sesión y perfil (M1) ----
  v1.get("/me", (req, res) => res.json(perfiles.miPerfil(req.usuario)));
  v1.post("/me/perfil", async (req, res) => {
    const { creado } = await perfiles.crearPerfil(ctx, req.usuario, req.body);
    res.status(creado ? 201 : 200).json({ creado });
  });

  // ---- Inscripciones (M2) ----
  v1.put("/jornadas/:id/inscripcion", async (req, res) => {
    res.json({ resultado: await inscripciones.inscribir(ctx, req.usuario, req.params.id, req.body) });
  });
  v1.delete("/jornadas/:id/inscripcion", async (req, res) => {
    res.json({ resultado: await inscripciones.cancelar(ctx, req.usuario, req.params.id) });
  });

  // ---- Gestión de jornadas (M3) ----
  v1.post("/jornadas", async (req, res) => {
    res.status(201).json(await jornadas.crear(ctx, req.usuario, req.body));
  });
  v1.put("/jornadas/:id", async (req, res) => {
    await jornadas.editar(ctx, req.usuario, req.params.id, req.body);
    res.status(204).end();
  });
  v1.post("/jornadas/:id/cancelar", async (req, res) => {
    await jornadas.cancelar(ctx, req.usuario, req.params.id);
    res.status(204).end();
  });
  v1.post("/jornadas/:id/reactivar", async (req, res) => {
    await jornadas.reactivar(ctx, req.usuario, req.params.id);
    res.status(204).end();
  });
  v1.delete("/jornadas/:id", async (req, res) => {
    await jornadas.eliminar(ctx, req.usuario, req.params.id);
    res.status(204).end();
  });
  v1.get("/jornadas/:id/inscritos", async (req, res) => {
    const { inscritos } = await jornadas.inscritos(ctx, req.usuario, req.params.id);
    res.json({ inscritos });
  });
  v1.get("/jornadas/:id/planilla.csv", async (req, res) => {
    const { nombre, csv } = await jornadas.planilla(ctx, req.usuario, req.params.id);
    res.type("text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="${nombre}"`).send(csv);
  });

  // Cualquier usuario con sesión puede pedirlo (antes lo hacía cualquier cliente); además corre solo
  v1.post("/mantenimiento/vencidas", async (_req, res) => {
    res.json(await desactivarVencidas(ctx));
  });

  // ---- Notificaciones (M4) ----
  v1.patch("/me/notificaciones/:id", async (req, res) => {
    if (req.body?.leida !== true) {
      return res.status(400).json({
        error: { codigo: "VALIDACION", mensaje: "Solo se puede marcar como leída.", campos: { leida: "Debe ser true." } },
      });
    }
    await notificaciones.marcarLeida(ctx, req.usuario, req.params.id);
    res.status(204).end();
  });
  v1.post("/me/notificaciones/leer-todas", async (req, res) => {
    res.json({ marcadas: await notificaciones.marcarTodasLeidas(ctx, req.usuario, req.body?.ids) });
  });
  v1.delete("/me/notificaciones/:id", async (req, res) => {
    await notificaciones.eliminar(ctx, req.usuario, req.params.id);
    res.status(204).end();
  });
  v1.put("/me/push-token", async (req, res) => {
    await notificaciones.registrarPushToken(ctx, req.usuario, req.body);
    res.status(204).end();
  });

  // ---- Administración de cuentas (M5) ----
  v1.post("/usuarios", soloAdministrador, async (req, res) => {
    res.status(201).json(await usuarios.crear(ctx, req.usuario, req.body));
  });
  v1.patch("/usuarios/:id", soloAdministrador, async (req, res) => {
    res.json(await usuarios.actualizar(ctx, req.usuario, req.params.id, req.body));
  });

  // ---- Estadísticas y reportes (M6) ----
  v1.get("/admin/estadisticas", soloAdministrador, async (_req, res) => {
    res.json(await estadisticas.estadisticas(ctx));
  });
  v1.get("/admin/reporte-jornadas.csv", soloAdministrador, async (req, res) => {
    const { nombre, csv } = await estadisticas.reporteJornadas(ctx, req.usuario);
    res.type("text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="${nombre}"`).send(csv);
  });

  app.use("/v1", v1);
  app.use(rutaNoEncontrada);
  app.use(manejarErrores(registro));
  return app;
}
