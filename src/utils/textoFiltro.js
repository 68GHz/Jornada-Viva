// Comparación de texto sin distinguir mayúsculas, tildes ni espacios sobrantes
export const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Opciones únicas de un campo de texto para los chips de filtro.
// "Medellín", "medellin " y "MEDELLÍN" cuentan como una sola opción.
// `valor` es la clave normalizada; `etiqueta` es la primera forma encontrada.
export function opcionesUnicas(items, campo) {
  const mapa = new Map();
  items.forEach((item) => {
    const texto = item[campo]?.toString().trim().replace(/\s+/g, " ");
    if (!texto) return;
    const clave = normalizarTexto(texto);
    if (!mapa.has(clave)) mapa.set(clave, { valor: clave, etiqueta: texto });
  });
  return [...mapa.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}
