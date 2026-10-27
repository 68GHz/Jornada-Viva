import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estadoVentanaAsistencia,
  generarPayloadQrAsistencia,
  parsearPayloadQrAsistencia,
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
