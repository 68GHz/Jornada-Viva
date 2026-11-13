// Comprobación de solo lectura de una API desplegada. No modifica datos.
//
//   API_URL=https://mi-api.example.com \
//   FIREBASE_API_KEY=<EXPO_PUBLIC_FIREBASE_API_KEY> \
//   CORREO=alguien@correo.com CLAVE=su-clave \
//   node scripts/verificar-despliegue.mjs
//
// Verifica: 1) la API responde, 2) rechaza solicitudes sin sesión, 3) acepta el ID token de una
// cuenta real y devuelve su rol (con el Admin SDK y la clave de servicio ya funcionando).
const { API_URL, FIREBASE_API_KEY, CORREO, CLAVE } = process.env;
if (!API_URL || !FIREBASE_API_KEY || !CORREO || !CLAVE) {
  console.error("Faltan variables: API_URL, FIREBASE_API_KEY, CORREO y CLAVE.");
  process.exit(2);
}
const base = API_URL.replace(/\/+$/, "");
let fallos = 0;
const paso = (ok, texto) => {
  console.log(`${ok ? "OK   " : "FALLA"} ${texto}`);
  if (!ok) fallos += 1;
};

try {
  const salud = await fetch(`${base}/v1/salud`);
  paso(salud.ok, `GET /v1/salud -> ${salud.status}`);

  const sinSesion = await fetch(`${base}/v1/me`);
  paso(sinSesion.status === 401, `GET /v1/me sin token -> ${sinSesion.status} (se espera 401)`);

  const acceso = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CORREO, password: CLAVE, returnSecureToken: true }),
    }
  );
  const { idToken } = await acceso.json();
  paso(!!idToken, "inicio de sesión en Firebase Auth");

  if (idToken) {
    const me = await fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${idToken}` } });
    const datos = await me.json().catch(() => ({}));
    paso(me.ok, `GET /v1/me con token -> ${me.status}${me.ok ? ` (rol: ${datos.rol})` : ""}`);
  }
} catch (error) {
  paso(false, `error de red: ${error.message}`);
}
process.exit(fallos ? 1 : 0);
