// Espacios donde se pueden programar las jornadas. La misma lista está en
// firestore.rules (un test comprueba que coinciden).
export const ESPACIOS = [
  ...Array.from({ length: 13 }, (_, i) => `Bloque ${i + 1}`),
  "Auditorio",
  "Cancha",
  "Coliseo",
];

export const esEspacioValido = (valor) => ESPACIOS.includes(valor);
