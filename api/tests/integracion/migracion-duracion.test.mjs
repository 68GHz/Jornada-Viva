// `node scripts/admin.js migrar` guarda la duración por defecto en las jornadas que no la tienen.
// Se ejecuta el script REAL contra el emulador de Firestore (FIRESTORE_EMULATOR_HOST).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeEach, describe, it } from "node:test";
import { PROYECTO, Timestamp, docJornada, leer, limpiar, sembrar, sembrarPerfiles } from "./entorno.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ejecutar = promisify(execFile);

const migrar = async (...args) => {
  const { stdout } = await ejecutar(process.execPath, [join(raiz, "scripts", "admin.js"), "migrar", ...args], {
    cwd: raiz,
    env: { ...process.env, FIREBASE_PROJECT_ID: PROYECTO },
  });
  return stdout;
};

describe("migración: duración de las jornadas ya creadas", () => {
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/antigua", docJornada({ titulo: "Antigua" }));
    await sembrar("jornadas/otraAntigua", docJornada({ titulo: "Otra antigua" }));
    await sembrar("jornadas/conDuracion", docJornada({ titulo: "Ya migrada", duracionMin: 90 }));
    await sembrar("jornadas/danada", docJornada({ titulo: "Dato dañado", duracionMin: 5 }));
    await sembrar("jornadas/texto", docJornada({ titulo: "Texto", duracionMin: "mucho" }));
  });

  it("sin --aplicar solo informa y no escribe nada", async () => {
    const salida = await migrar();
    assert.match(salida, /Sin duración: 4/);
    assert.match(salida, /simulación/);
    for (const id of ["antigua", "otraAntigua", "danada", "texto"]) {
      assert.notEqual((await leer(`jornadas/${id}`)).duracionMin, 60, id);
    }
    assert.equal("duracionMin" in (await leer("jornadas/antigua")), false);
  });

  it("con --aplicar guarda 60 minutos solo donde falta o es inválida, y no toca lo demás", async () => {
    const antes = await leer("jornadas/antigua");
    const salida = await migrar("--aplicar");
    assert.match(salida, /Se actualizaron 4 jornadas/);

    for (const id of ["antigua", "otraAntigua", "danada", "texto"]) {
      assert.equal((await leer(`jornadas/${id}`)).duracionMin, 60, id);
    }
    assert.equal((await leer("jornadas/conDuracion")).duracionMin, 90, "la ya migrada se respeta");

    // Solo cambia ese campo: lo demás queda igual (fecha incluida, que es un Timestamp)
    const despues = await leer("jornadas/antigua");
    assert.ok(despues.fecha instanceof Timestamp);
    assert.deepEqual({ ...despues, duracionMin: undefined }, { ...antes, duracionMin: undefined });
    assert.equal(despues.duracionMin, 60);
    assert.equal(Number.isInteger(despues.duracionMin), true, "se guarda como entero");
  });

  it("es idempotente: una segunda ejecución no encuentra nada que migrar", async () => {
    await migrar("--aplicar");
    const salida = await migrar("--aplicar");
    assert.match(salida, /Sin duración: 0/);
    assert.doesNotMatch(salida, /Se actualizaron/);
  });
});
