import assert from "node:assert/strict";
import { describe, it } from "node:test";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import {
  ANTIGUEDAD_MAX_CANCELACION_MS,
  DIAS_LIMITE_CANCELACION,
  MENSAJE_PLAZO_VENCIDO,
  evaluarCancelacion,
  puedeCancelarEn,
} from "../../src/utils/plazoCancelacion.js";
import { combinarFechaHora } from "../../src/utils/zonaNegocio.js";

dayjs.extend(utc);

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
// Hora de negocio (UTC-5) -> ms
const en = (dia, hora) => combinarFechaHora(dia, hora);

// Misma fórmula que usa hoy la app (src/utils/jornadaFecha.js: puedeCancelarInscripcion), pero con
// la hora de «hoy» como parámetro: la regla del servidor debe dar siempre el mismo resultado.
const formulaDeLaApp = (fecha, ahora) => {
  const d = dayjs.utc(fecha).utcOffset(-300);
  const hoy = dayjs.utc(ahora).utcOffset(-300).startOf("day");
  return d.startOf("day").diff(hoy, "day") >= 2;
};

describe("puedeCancelarEn · plazo de 2 días calendario (hora de negocio UTC-5)", () => {
  it("el plazo es de 2 días", () => {
    assert.equal(DIAS_LIMITE_CANCELACION, 2);
  });

  it("con la jornada el día 20: se puede cancelar hasta el 18 a cualquier hora; desde el 19, no", () => {
    const jornada = en("2026-11-20", "08:00");
    assert.equal(puedeCancelarEn(jornada, en("2026-11-17", "12:00")), true);
    assert.equal(puedeCancelarEn(jornada, en("2026-11-18", "00:00")), true);
    assert.equal(puedeCancelarEn(jornada, en("2026-11-18", "23:59")), true, "el último minuto del día 18");
    assert.equal(puedeCancelarEn(jornada, en("2026-11-19", "00:00")), false, "el primer minuto del día 19");
    assert.equal(puedeCancelarEn(jornada, en("2026-11-19", "23:59")), false);
    assert.equal(puedeCancelarEn(jornada, en("2026-11-20", "07:00")), false, "el mismo día");
    assert.equal(puedeCancelarEn(jornada, en("2026-11-21", "09:00")), false, "después de la jornada");
  });

  it("cuenta días calendario, no 48 horas: 32 horas antes pero 2 días después puede ser válido y 49 h antes inválido", () => {
    const jornada = en("2026-11-20", "00:30");
    // 18/11 23:59 -> 24 h y 31 min antes de la jornada, pero 2 días calendario antes: válido
    assert.equal(puedeCancelarEn(jornada, en("2026-11-18", "23:59")), true);
    // 19/11 00:00 -> 24 h y 30 min antes: inválido (solo 1 día calendario)
    assert.equal(puedeCancelarEn(jornada, en("2026-11-19", "00:00")), false);
  });

  it("el cambio de día es a medianoche de Colombia (05:00 UTC), no a la del servidor", () => {
    const jornada = Date.UTC(2026, 10, 20, 15, 0); // 10:00 del día 20 en Colombia
    // 19/11 23:30 en Colombia = 20/11 04:30 UTC: en UTC ya sería «día 20», en Colombia sigue siendo el 19
    assert.equal(puedeCancelarEn(jornada, Date.UTC(2026, 10, 20, 4, 30)), false);
    // 18/11 23:30 en Colombia = 19/11 04:30 UTC: en UTC sería «día 19», en Colombia es el 18 (válido)
    assert.equal(puedeCancelarEn(jornada, Date.UTC(2026, 10, 19, 4, 30)), true);
  });

  it("valores que no son una hora válida no permiten cancelar", () => {
    for (const malo of [null, undefined, NaN, "2026-11-20", Infinity]) {
      assert.equal(puedeCancelarEn(malo, Date.now()), false, String(malo));
      assert.equal(puedeCancelarEn(Date.now() + 10 * DIA, malo), false, String(malo));
    }
  });

  it("coincide con la fórmula de la app en miles de combinaciones (cada 5 minutos durante 20 días)", () => {
    const jornada = en("2026-11-20", "08:15");
    let comprobadas = 0;
    for (let ahora = jornada - 12 * DIA; ahora < jornada + 8 * DIA; ahora += 5 * 60 * 1000) {
      assert.equal(puedeCancelarEn(jornada, ahora), formulaDeLaApp(jornada, ahora), new Date(ahora).toISOString());
      comprobadas += 1;
    }
    assert.ok(comprobadas > 5000, `solo ${comprobadas} comparaciones`);
  });

  it("coincide con la fórmula de la app para jornadas a distintas horas del día", () => {
    for (const hora of ["00:00", "00:01", "05:00", "12:00", "19:00", "23:59"]) {
      const jornada = en("2026-11-20", hora);
      for (const [dia, h] of [["2026-11-18", "00:00"], ["2026-11-18", "23:59"], ["2026-11-19", "00:00"], ["2026-11-19", "12:00"], ["2026-11-20", "00:00"]]) {
        const ahora = en(dia, h);
        assert.equal(puedeCancelarEn(jornada, ahora), formulaDeLaApp(jornada, ahora), `${hora} vs ${dia} ${h}`);
      }
    }
  });
});

describe("evaluarCancelacion · política de reloj", () => {
  const jornada = en("2026-11-20", "08:00");

  it("sin hora del cliente se usa la del servidor", () => {
    assert.deepEqual(evaluarCancelacion({ fechaJornada: jornada, ahora: en("2026-11-18", "10:00") }), {
      ok: true,
      instante: en("2026-11-18", "10:00"),
    });
    const r = evaluarCancelacion({ fechaJornada: jornada, ahora: en("2026-11-19", "10:00") });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "PLAZO_VENCIDO");
    assert.equal(r.mensaje, MENSAJE_PLAZO_VENCIDO);
  });

  it("cancelación diferida: se valida con la hora en que se hizo, aunque se sincronice ya vencido el plazo", () => {
    const r = evaluarCancelacion({
      fechaJornada: jornada,
      canceladaEn: en("2026-11-18", "20:00"), // se hizo sin conexión dentro del plazo
      ahora: en("2026-11-19", "09:00"), // llegó al servidor cuando el plazo ya había vencido
    });
    assert.equal(r.ok, true);
    assert.equal(r.instante, en("2026-11-18", "20:00"));
  });

  it("una hora del cliente adelantada no sirve: se usa la menor entre la del cliente y la del servidor", () => {
    const ahora = en("2026-11-19", "09:00");
    const r = evaluarCancelacion({ fechaJornada: jornada, canceladaEn: en("2026-11-10", "09:00") + 30 * DIA, ahora });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "PLAZO_VENCIDO");
  });

  it("una hora del cliente muy atrasada se rechaza por antigua (no se puede ganar plazo atrasando el reloj)", () => {
    const ahora = en("2026-11-19", "09:00");
    const r = evaluarCancelacion({ fechaJornada: jornada, canceladaEn: ahora - 8 * DIA, ahora });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "ACCION_DEMASIADO_ANTIGUA");
  });

  it("el límite de antigüedad es 7 días por defecto, exacto en el borde, y se puede configurar", () => {
    assert.equal(ANTIGUEDAD_MAX_CANCELACION_MS, 7 * DIA);
    const ahora = en("2026-11-19", "09:00");
    const lejana = en("2027-02-01", "08:00"); // plazo no es problema
    assert.equal(evaluarCancelacion({ fechaJornada: lejana, canceladaEn: ahora - 7 * DIA, ahora }).ok, true);
    assert.equal(evaluarCancelacion({ fechaJornada: lejana, canceladaEn: ahora - 7 * DIA - 1, ahora }).ok, false);
    assert.equal(
      evaluarCancelacion({ fechaJornada: lejana, canceladaEn: ahora - 2 * HORA, ahora, antiguedadMaxMs: HORA }).codigo,
      "ACCION_DEMASIADO_ANTIGUA"
    );
  });

  it("una jornada sin fecha conocida no se puede evaluar: se acepta (liberar el cupo siempre es válido)", () => {
    assert.equal(evaluarCancelacion({ fechaJornada: null, ahora: Date.now() }).ok, true);
    assert.equal(evaluarCancelacion({ fechaJornada: undefined, ahora: Date.now() }).ok, true);
  });
});
