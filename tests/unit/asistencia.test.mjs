import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estadoVentanaAsistencia,
  generarPayloadQrAsistencia,
  parsearPayloadQrAsistencia,
  textoVentanaAsistencia,
  ventanaAsistenciaMin,
  VENTANA_ASISTENCIA_MS,
} from "../../src/utils/asistencia.js";

describe("asistencia y ventana de 20 minutos", () => {
  const fechaJornada = 1700000000000;

  it("indica que la jornada aún no ha iniciado si ahora < fecha", () => {
    const ahora = fechaJornada - 5 * 60 * 1000; // 5 minutos antes
    const res = estadoVentanaAsistencia(fechaJornada, ahora);
    assert.equal(res.disponible, false);
    assert.equal(res.estado, "ANTES");
    assert.equal(res.minutosRestantes, 5);
  });

  it("está disponible exactamente al inicio de la jornada", () => {
    const ahora = fechaJornada;
    const res = estadoVentanaAsistencia(fechaJornada, ahora);
    assert.equal(res.disponible, true);
    assert.equal(res.estado, "EN_CURSO");
    assert.equal(res.minutosRestantes, 20);
  });

  it("está disponible a los 10 minutos transcurridos", () => {
    const ahora = fechaJornada + 10 * 60 * 1000;
    const res = estadoVentanaAsistencia(fechaJornada, ahora);
    assert.equal(res.disponible, true);
    assert.equal(res.estado, "EN_CURSO");
    assert.equal(res.minutosRestantes, 10);
  });

  it("está disponible exactamente en el minuto 20 (límite)", () => {
    const ahora = fechaJornada + VENTANA_ASISTENCIA_MS;
    const res = estadoVentanaAsistencia(fechaJornada, ahora);
    assert.equal(res.disponible, true);
    assert.equal(res.estado, "EN_CURSO");
  });

  it("expira pasados los 20 minutos de la hora de inicio", () => {
    const ahora = fechaJornada + VENTANA_ASISTENCIA_MS + 1000; // 20m y 1s
    const res = estadoVentanaAsistencia(fechaJornada, ahora);
    assert.equal(res.disponible, false);
    assert.equal(res.estado, "EXPIRADA");
  });

  it("una jornada de menos de 20 minutos tiene una ventana igual a su duración", () => {
    assert.equal(ventanaAsistenciaMin(60), 20);
    assert.equal(ventanaAsistenciaMin(20), 20);
    assert.equal(ventanaAsistenciaMin(10), 10);
    assert.equal(ventanaAsistenciaMin(undefined), 20, "sin duración usa la de por defecto");

    const alMinuto11 = fechaJornada + 11 * 60 * 1000;
    assert.equal(estadoVentanaAsistencia(fechaJornada, alMinuto11, 10).estado, "EXPIRADA");
    assert.equal(estadoVentanaAsistencia(fechaJornada, alMinuto11, 60).estado, "EN_CURSO");
    assert.match(estadoVentanaAsistencia(fechaJornada, alMinuto11, 10).mensaje, /10 minutos/);
  });

  it("genera y valida correctamente el payload del código QR", () => {
    const jornada = {
      id: "jornada123",
      titulo: "Taller de Liderazgo",
      fecha: fechaJornada,
    };
    const payload = generarPayloadQrAsistencia(jornada, "codigo.firmado");
    assert.equal(typeof payload, "string");

    const parsed = parsearPayloadQrAsistencia(payload);
    assert.equal(parsed.valido, true);
    assert.equal(parsed.datos.jornadaId, "jornada123");
    assert.equal(parsed.datos.tipo, "ASISTENCIA_JORNADA");
    assert.equal(parsed.datos.codigo, "codigo.firmado");
  });

  it("rechaza códigos QR de formato inválido, ajenos o sin código firmado (QR antiguo)", () => {
    assert.equal(parsearPayloadQrAsistencia("texto plano").valido, false);
    assert.equal(parsearPayloadQrAsistencia(JSON.stringify({ otro: 123 })).valido, false);
    const antiguo = parsearPayloadQrAsistencia(
      JSON.stringify({ tipo: "ASISTENCIA_JORNADA", jornadaId: "j1", titulo: "T", fecha: 1, creadoEn: 2 })
    );
    assert.equal(antiguo.valido, false);
    assert.match(antiguo.error, /antiguo/);
  });
});

describe("asistencia durante toda la jornada (opción del gestor)", () => {
  const inicio = 1700000000000;
  const MIN = 60 * 1000;

  it("por defecto sigue siendo de 20 minutos, también con el valor en falso o ausente", () => {
    for (const todaLaJornada of [undefined, false, null, "true", 1]) {
      assert.equal(ventanaAsistenciaMin(120, todaLaJornada), 20, String(todaLaJornada));
      assert.equal(estadoVentanaAsistencia(inicio, inicio + 30 * MIN, 120, todaLaJornada).estado, "EXPIRADA");
    }
  });

  it("activada, la ventana dura lo que dura la jornada", () => {
    assert.equal(ventanaAsistenciaMin(120, true), 120);
    assert.equal(ventanaAsistenciaMin(10, true), 10);
    assert.equal(estadoVentanaAsistencia(inicio, inicio + 30 * MIN, 120, true).disponible, true);
    assert.equal(estadoVentanaAsistencia(inicio, inicio + 119 * MIN, 120, true).disponible, true);
    assert.equal(estadoVentanaAsistencia(inicio, inicio + 120 * MIN, 120, true).disponible, true, "justo al terminar todavía vale");
  });

  it("al terminar la jornada se cierra, y antes de empezar sigue sin abrirse", () => {
    const tarde = estadoVentanaAsistencia(inicio, inicio + 121 * MIN, 120, true);
    assert.equal(tarde.disponible, false);
    assert.equal(tarde.estado, "EXPIRADA");
    assert.match(tarde.mensaje, /jornada ya terminó/);
    const antes = estadoVentanaAsistencia(inicio, inicio - 5 * MIN, 120, true);
    assert.equal(antes.disponible, false);
    assert.equal(antes.estado, "ANTES");
  });

  it("la duración por defecto (60 min) se usa si la jornada no la trae", () => {
    assert.equal(ventanaAsistenciaMin(undefined, true), 60);
  });

  it("el aviso al estudiante cambia según la opción", () => {
    assert.match(textoVentanaAsistencia(120, false), /primeros 20 minutos/);
    assert.match(textoVentanaAsistencia(10, false), /primeros 10 minutos/);
    assert.match(textoVentanaAsistencia(120, true), /cualquier momento mientras dure la jornada/);
  });
});
