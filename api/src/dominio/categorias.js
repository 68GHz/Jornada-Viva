// Categorías de las jornadas (las cinco del enunciado del proyecto). Se guarda el nombre tal cual,
// así los filtros por categoría de la app funcionan con los datos sin conversión.
// Este archivo es idéntico en la app y en la API (api/src/dominio/categorias.js); una prueba lo comprueba.
export const CATEGORIAS = ["Salud", "Alfabetización digital", "Proyección social", "Talleres", "Asesorías"];

export const MENSAJE_CATEGORIA = `Elige una categoría: ${CATEGORIAS.join(", ")}.`;

export const esCategoriaValida = (valor) => typeof valor === "string" && CATEGORIAS.includes(valor);

// Categoría de una jornada para mostrarla; las anteriores a este campo no tienen
export const categoriaDeJornada = (jornada) => (esCategoriaValida(jornada?.categoria) ? jornada.categoria : null);
