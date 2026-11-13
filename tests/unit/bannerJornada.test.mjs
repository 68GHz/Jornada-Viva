import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITE_BANNER, esUrlDeBanner } from "../../src/utils/bannerJornada.js";

describe("esUrlDeBanner", () => {
  it("acepta enlaces https de imagen, con puerto, ruta y parámetros", () => {
    for (const url of [
      "https://tdea.edu.co/banner.jpg",
      "https://cdn.ejemplo.com/img/a%20b.png?v=2&w=800#x",
      "https://sub.dominio.co:8443/ruta/imagen.webp",
      "https://IMAGENES.Ejemplo.COM",
      "https://192.168.1.10/banner.png",
    ]) {
      assert.equal(esUrlDeBanner(url), true, url);
    }
  });

  it("rechaza otros esquemas y enlaces sin https", () => {
    for (const url of [
      "http://tdea.edu.co/banner.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///sdcard/a.png",
      "ftp://x.com/a.png",
      "//tdea.edu.co/a.png",
      "tdea.edu.co/a.png",
    ]) {
      assert.equal(esUrlDeBanner(url), false, url);
    }
  });

  it("rechaza espacios, credenciales incrustadas y dominios sin punto", () => {
    for (const url of [
      "https://tdea.edu.co/mi banner.jpg",
      "https://tdea.edu.co /a.png",
      "https://usuario:clave@tdea.edu.co/a.png",
      "https://usuario@tdea.edu.co/a.png",
      "https://localhost/a.png",
      "https://",
      "https://.com/a.png",
      "https://tdea..edu.co/a.png",
    ]) {
      assert.equal(esUrlDeBanner(url), false, url);
    }
  });

  it("rechaza lo que no es texto y respeta el máximo de caracteres", () => {
    for (const valor of [undefined, null, 5, {}, ["https://tdea.edu.co/a.png"]]) {
      assert.equal(esUrlDeBanner(valor), false);
    }
    const base = "https://tdea.edu.co/";
    assert.equal(esUrlDeBanner(base + "a".repeat(LIMITE_BANNER - base.length)), true);
    assert.equal(esUrlDeBanner(base + "a".repeat(LIMITE_BANNER - base.length + 1)), false);
  });
});
