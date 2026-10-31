// FE-02 · Préstamo y devolución de objetos. Lógica pura: la misma copia valida en la API (la que
// decide) y se usa en la app para mostrar estados y alertas; una prueba comprueba que son idénticas.
//
// Un préstamo: un objeto (libro, equipo o material, identificado por su código de inventario) que
// un gestor o administrador presta a un estudiante hasta una fecha. Mientras no se devuelve está
// «activo». Un mismo objeto no puede estar activo en dos préstamos a la vez.

export const TIPOS_OBJETO = ["libro", "equipo", "material"];
export const ETIQUETA_TIPO_OBJETO = { libro: "Libro", equipo: "Equipo", material: "Material" };

export const LIMITES_PRESTAMO = { codigo: 40, nombre: 120, nota: 300, diasMaximos: 90 };

// Cuántos días antes del vencimiento empieza la alerta «por vencer»
export const DIAS_ALERTA_PRESTAMO = 2;

const DIA_MS = 24 * 60 * 60 * 1000;
const texto = (v) => String(v ?? "").trim();
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Dos escrituras distintas del mismo código («lib-01 », «LIB-01») son el mismo objeto
export const normalizarCodigoObjeto = (codigo) => texto(codigo).replace(/\s+/g, " ").toUpperCase();

// Estado de un préstamo a la hora `ahora`:
//   devuelto · vencido (pasó la fecha) · por_vencer (faltan DIAS_ALERTA_PRESTAMO días o menos) · vigente
export function estadoPrestamo(prestamo, ahora = Date.now()) {
  if (!prestamo || prestamo.activo === false || prestamo.devueltoEn != null) return "devuelto";
  if (!Number.isFinite(prestamo.vence)) return "vigente";
  if (prestamo.vence < ahora) return "vencido";
  if (prestamo.vence - ahora <= DIAS_ALERTA_PRESTAMO * DIA_MS) return "por_vencer";
  return "vigente";
}

export const ETIQUETA_ESTADO_PRESTAMO = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  devuelto: "Devuelto",
};

// Conteos para las alertas (solo cuentan los préstamos activos)
export function contarPrestamos(prestamos, ahora = Date.now()) {
  const conteo = { activos: 0, vencidos: 0, porVencer: 0 };
  for (const p of prestamos || []) {
    const estado = estadoPrestamo(p, ahora);
    if (estado === "devuelto") continue;
    conteo.activos += 1;
    if (estado === "vencido") conteo.vencidos += 1;
    if (estado === "por_vencer") conteo.porVencer += 1;
  }
  return conteo;
}

// Orden de la lista: primero lo más urgente (vencidos, por vencer, vigentes) y al final lo devuelto;
// dentro de cada grupo, el que vence antes primero (los devueltos, el más reciente primero).
export function ordenarPrestamos(prestamos, ahora = Date.now()) {
  const peso = { vencido: 0, por_vencer: 1, vigente: 2, devuelto: 3 };
  return [...(prestamos || [])].sort((a, b) => {
    const ea = estadoPrestamo(a, ahora);
    const eb = estadoPrestamo(b, ahora);
    if (ea !== eb) return peso[ea] - peso[eb];
    const diferencia = (a.vence ?? 0) - (b.vence ?? 0);
    return ea === "devuelto" ? -diferencia : diferencia;
  });
}

// Valida el registro de un préstamo. `campos.vence` llega en milisegundos epoch.
// Devuelve { errores: { campo: mensaje }, datos } con `datos` en null si hay errores.
export function validarPrestamo(campos, { ahora = Date.now() } = {}) {
  const errores = {};
  const c = campos && typeof campos === "object" ? campos : {};

  const codigo = normalizarCodigoObjeto(c.codigo);
  const nombre = texto(c.nombre);
  const correo = texto(c.correo).toLowerCase();
  const nota = texto(c.nota);

  if (!codigo) errores.codigo = "Escribe el código del objeto (el de inventario).";
  else if (codigo.length > LIMITES_PRESTAMO.codigo) errores.codigo = `Máximo ${LIMITES_PRESTAMO.codigo} caracteres.`;

  if (!nombre) errores.nombre = "Escribe el nombre del objeto.";
  else if (nombre.length > LIMITES_PRESTAMO.nombre) errores.nombre = `Máximo ${LIMITES_PRESTAMO.nombre} caracteres.`;

  if (!TIPOS_OBJETO.includes(c.tipo)) errores.tipo = "Elige el tipo de objeto: libro, equipo o material.";

  if (!correo) errores.correo = "Escribe el correo del estudiante.";
  else if (!CORREO.test(correo)) errores.correo = "El correo no es válido.";

  if (typeof c.vence !== "number" || !Number.isFinite(c.vence)) {
    errores.vence = "Elige hasta cuándo se presta.";
  } else if (c.vence <= ahora) {
    errores.vence = "La fecha de devolución debe ser posterior a este momento.";
  } else if (c.vence > ahora + LIMITES_PRESTAMO.diasMaximos * DIA_MS) {
    errores.vence = `El préstamo no puede pasar de ${LIMITES_PRESTAMO.diasMaximos} días.`;
  }

  if (c.nota !== undefined && c.nota !== null && typeof c.nota !== "string") errores.nota = "La nota debe ser un texto.";
  else if (nota.length > LIMITES_PRESTAMO.nota) errores.nota = `Máximo ${LIMITES_PRESTAMO.nota} caracteres.`;

  if (Object.keys(errores).length > 0) return { errores, datos: null };
  return { errores, datos: { codigo, nombre, tipo: c.tipo, correo, vence: c.vence, ...(nota ? { nota } : {}) } };
}
