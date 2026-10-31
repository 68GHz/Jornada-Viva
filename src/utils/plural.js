// Palabra en singular o plural según la cantidad ("lugar ocupado" / "lugares ocupados").
// Se pasan las dos formas completas a propósito: el plural de las palabras en -ción
// pierde la tilde, así que pegarle "es" al singular deja la tilde mal puesta.
export const palabraPlural = (n, singular, plural) => (n === 1 ? singular : plural);

// Cantidad + palabra ("1 inscripción", "2 inscripciones").
export const conteoPlural = (n, singular, plural) => `${n} ${palabraPlural(n, singular, plural)}`;
