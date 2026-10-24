// Arranque real del servidor (server.js): configuración por variables de entorno, Firebase Admin,
// verificación de ID tokens de Auth y la tarea periódica de jornadas vencidas.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DIA, Timestamp, docJornada, leer, limpiar, reloj, sembrar } from "./entorno.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const puertoLibre = () =>
  new Promise((resolver) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolver(port));
    });
  });

async function hasta(condicion, ms = 15000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      const valor = await condicion();
      if (valor) return valor;
    } catch {
      /* todavía no */
    }
    await esperar(150);
  }
  throw new Error("Tiempo de espera agotado");
}

describe("servidor real (server.js)", { skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST }, () => {
  let proceso;
  let base;
  const salida = [];

  before(async () => {
    await limpiar();
    const puerto = await puertoLibre();
    base = `http://127.0.0.1:${puerto}`;
    proceso = spawn(process.execPath, [join(aqui, "..", "..", "src", "server.js")], {
      env: {
        ...process.env,
        PORT: String(puerto),
        FIREBASE_PROJECT_ID: "demo-jornadaviva",
        MANTENIMIENTO_MINUTOS: "0.01", // cada 0,6 s para la prueba
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proceso.stdout.on("data", (d) => salida.push(String(d)));
    proceso.stderr.on("data", (d) => salida.push(String(d)));
    try {
      await hasta(async () => (await fetch(`${base}/v1/salud`)).ok);
    } catch (error) {
      throw new Error(`El servidor no arrancó:
${salida.join("")}`);
    }
  });

  after(() => { proceso?.kill(); });

  it("responde la salud y rechaza solicitudes sin token", async () => {
    assert.equal((await fetch(`${base}/v1/salud`)).status, 200);
    assert.equal((await fetch(`${base}/v1/me`)).status, 401);
  });

  it("flujo real: se registra una cuenta en Auth, crea su perfil por la API y consulta /me con su ID token", async () => {
    const auth = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
    const registro = await fetch(`${auth}/accounts:signUp?key=fake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Nuevo@Correo.com", password: "secreto123", returnSecureToken: true }),
    });
    const { idToken, localId } = await registro.json();

    const cabeceras = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
    const perfil = await fetch(`${base}/v1/me/perfil`, { method: "POST", headers: cabeceras, body: JSON.stringify({ nombre: "Nuevo", rol: "administrador" }) });
    assert.equal(perfil.status, 201);
    const me = await (await fetch(`${base}/v1/me`, { headers: cabeceras })).json();
    assert.equal(me.uid, localId);
    assert.equal(me.rol, "estudiante", "aunque envíe rol, se registra como estudiante");
    assert.equal(me.email, "nuevo@correo.com");
    assert.equal((await leer(`users/${localId}`)).rol, "estudiante");
  });

  it("la tarea periódica desactiva las jornadas vencidas sin que nadie la pida", async () => {
    await sembrar("jornadas/vencida", docJornada({ fecha: Timestamp.fromMillis(Date.now() - DIA) }));
    await sembrar("jornadas/futura", docJornada({ fecha: Timestamp.fromMillis(Date.now() + 5 * DIA) }));
    await hasta(async () => (await leer("jornadas/vencida")).activa === false);
    assert.equal((await leer("jornadas/futura")).activa, true);
    assert.equal(reloj.ahora > 0, true);
  });

  it("el servidor no escribe secretos ni tokens en su registro", () => {
    const todo = salida.join("");
    assert.ok(!/Bearer|idToken|password/i.test(todo), todo);
  });
});
