// Banner opcional de una jornada: un enlace https a una imagen publicada en internet.
// No se sube ningún archivo (el proyecto no usa Firebase Storage). Lógica pura: la misma copia
// valida el formulario de la app y la API (api/src/dominio/bannerJornada.js; una prueba las compara).
export const LIMITE_BANNER = 500;

export const MENSAJE_BANNER = `Escribe un enlace que empiece por https:// y sin espacios (máximo ${LIMITE_BANNER} caracteres).`;

// https://dominio.ext[:puerto][/ruta]. El dominio exige al menos un punto y no admite
// «usuario:clave@», espacios ni otros esquemas (http, javascript, data...).
const PATRON = /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?(\/[^\s]*)?$/;

export const esUrlDeBanner = (url) =>
  typeof url === "string" && url.length <= LIMITE_BANNER && PATRON.test(url);
