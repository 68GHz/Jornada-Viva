import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  ErrorNegocio,
  ErrorRed,
  MENSAJE_SERVIDOR_DESPERTANDO,
  MENSAJE_SIN_RED,
  clasificarError,
  conTiempoLimite,
  elegirAviso,
  esperaReintento,
  mensajeDeRed,
  resumenSincronizacion,
} from "../../src/utils/sincronizacion.js";
import { errorDeRespuesta } from "../../src/services/apiClientCore.js";

const base = { enLinea: true, sincronizando: false, avisoConexion: null, errorSync: false, nPendientes: 0, nRechazadas: 0 };
const aviso = (extra) => elegirAviso({ ...base, ...extra });

describe("elegirAviso · sin conexión (indicador permanente)", () => {
  it("sin red siempre muestra «Sin conexión», aunque no haya ningún aviso de conexión activo", () => {
    for (const avisoConexion of [null, undefined, "conectado", "sin-conexion"]) {
      assert.deepEqual(aviso({ enLinea: false, avisoConexion }), { tipo: "sin-conexion", texto: "Sin conexión" });
    }
  });

  it("no depende del paso del tiempo: sigue igual después de 10 s, de 1 min y de 1 hora", () => {
    const entrada = { enLinea: false, nPendientes: 2 };
    const antes = aviso(entrada);
    const inicio = Date.now();
    for (const despues of [11_000, 61_000, 3_600_000]) {
      const reloj = mock.method(Date, "now", () => inicio + despues);
      assert.deepEqual(aviso(entrada), antes, `+${despues} ms`);
      reloj.mock.restore();
    }
    assert.equal(antes.texto, "Sin conexión · 2 pendientes");
  });

  it("muestra cuántas acciones están pendientes, en singular y en plural", () => {
    assert.equal(aviso({ enLinea: false, nPendientes: 1 }).texto, "Sin conexión · 1 pendiente");
    assert.equal(aviso({ enLinea: false, nPendientes: 3 }).texto, "Sin conexión · 3 pendientes");
    assert.equal(aviso({ enLinea: false, nPendientes: 0 }).texto, "Sin conexión");
  });

  it("sin red tiene prioridad sobre las acciones con error, el error de sincronización y «sincronizando»", () => {
    for (const extra of [{ nRechazadas: 2 }, { errorSync: true, nPendientes: 1 }, { sincronizando: true }]) {
      assert.equal(aviso({ enLinea: false, ...extra }).tipo, "sin-conexion", JSON.stringify(extra));
    }
  });
});

describe("elegirAviso · con conexión", () => {
  it("«Sincronizando datos» tiene prioridad sobre «Conectado» y sobre las acciones con error", () => {
    assert.deepEqual(aviso({ sincronizando: true, avisoConexion: "conectado", nRechazadas: 1 }), {
      tipo: "sincronizando",
      texto: "Sincronizando datos",
    });
  });

  it("«Conectado» solo aparece mientras haya un aviso de conexión «conectado»", () => {
    assert.deepEqual(aviso({ avisoConexion: "conectado" }), { tipo: "conectado", texto: "Conectado" });
    assert.equal(aviso({ avisoConexion: null }), null);
  });

  it("un aviso «sin-conexion» que quedó desfasado se ignora cuando ya hay red", () => {
    assert.equal(aviso({ avisoConexion: "sin-conexion" }), null);
  });

  it("acciones rechazadas: singular y plural, y se pueden revisar", () => {
    assert.equal(aviso({ nRechazadas: 1 }).texto, "1 acción no se pudo completar · Toca para revisar");
    assert.equal(aviso({ nRechazadas: 2 }).texto, "2 acciones no se pudieron completar · Toca para revisar");
    assert.equal(aviso({ nRechazadas: 1 }).tipo, "rechazadas");
  });

  it("las acciones rechazadas tienen prioridad sobre el error de sincronización", () => {
    assert.equal(aviso({ nRechazadas: 1, errorSync: true, nPendientes: 1 }).tipo, "rechazadas");
  });

  it("error de sincronización: solo con red, con error y con algo pendiente", () => {
    assert.equal(aviso({ errorSync: true, nPendientes: 1 }).tipo, "error-sync");
    assert.equal(aviso({ errorSync: true, nPendientes: 0 }), null);
    assert.equal(aviso({ errorSync: false, nPendientes: 1 }), null);
  });

  it("sin nada que informar no muestra ningún aviso", () => {
    assert.equal(aviso({}), null);
  });
});

describe("resumenSincronizacion", () => {
  it("resume lo que falta por enviar", () => {
    assert.equal(resumenSincronizacion({}), "Todo sincronizado");
    assert.equal(resumenSincronizacion(), "Todo sincronizado");
    assert.equal(resumenSincronizacion({ nPendientes: 1 }), "1 pendiente por sincronizar");
    assert.equal(resumenSincronizacion({ nPendientes: 4 }), "4 pendientes por sincronizar");
    assert.equal(resumenSincronizacion({ nRechazadas: 2 }), "2 con error");
    assert.equal(
      resumenSincronizacion({ nPendientes: 1, nRechazadas: 1 }),
      "1 pendiente por sincronizar · 1 con error"
    );
  });
});

describe("reintentos y clasificación de errores", () => {
  it("la espera entre reintentos crece (5 s, 10 s, 20 s...) hasta 2 minutos", () => {
    assert.deepEqual([1, 2, 3, 4].map(esperaReintento), [5000, 10000, 20000, 40000]);
    assert.equal(esperaReintento(10), 120000);
    assert.equal(esperaReintento(0), 5000);
  });

  it("un error de negocio no se reintenta; uno de red sí; el resto es permanente", () => {
    assert.equal(clasificarError(new ErrorNegocio("SIN_CUPOS", "Sin cupos")).tipo, "negocio");
    assert.equal(clasificarError(new ErrorRed()).tipo, "red");
    assert.equal(clasificarError({ code: "unavailable" }).tipo, "red");
    assert.equal(clasificarError({ code: "permission-denied" }).tipo, "permanente");
    assert.equal(clasificarError(new Error("algo raro")).tipo, "permanente");
  });
});

describe("mensaje ante un error de conexión (sin red o servidor despertando)", () => {
  it("sin red por defecto: pide revisar internet", () => {
    assert.equal(new ErrorRed().motivo, "sin-red");
    assert.equal(mensajeDeRed(new ErrorRed()), MENSAJE_SIN_RED);
    assert.equal(mensajeDeRed(undefined), MENSAJE_SIN_RED);
    assert.equal(mensajeDeRed({ code: "unavailable" }), MENSAJE_SIN_RED);
  });

  it("tiempo de espera agotado: el servidor está tardando o despertando", async () => {
    await assert.rejects(
      conTiempoLimite(new Promise(() => {}), 5),
      (e) => e.name === "ErrorRed" && e.motivo === "tiempo-agotado" && mensajeDeRed(e) === MENSAJE_SERVIDOR_DESPERTANDO
    );
  });

  it("502, 503 y 504 del servidor: también «despertando»; sigue siendo un error de red que se reintenta", () => {
    for (const estado of [502, 503, 504]) {
      const e = errorDeRespuesta(estado, null);
      assert.equal(e.name, "ErrorRed", String(estado));
      assert.equal(e.motivo, "servidor-no-disponible");
      assert.equal(mensajeDeRed(e), MENSAJE_SERVIDOR_DESPERTANDO);
      assert.equal(clasificarError(e).tipo, "red");
    }
  });

  it("los dos mensajes son distintos y ninguno culpa a la red cuando el servidor tarda", () => {
    assert.notEqual(MENSAJE_SIN_RED, MENSAJE_SERVIDOR_DESPERTANDO);
    assert.match(MENSAJE_SERVIDOR_DESPERTANDO, /servidor/i);
    assert.doesNotMatch(MENSAJE_SERVIDOR_DESPERTANDO, /internet/i);
  });
});
