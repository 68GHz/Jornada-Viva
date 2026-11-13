import { useEffect, useState } from "react";
import { useConnectivity } from "../context/ConnectivityContext";
import { disponibilidadEnServidor, pedirAlternos, pedirDisponibilidad } from "../services/espaciosService";

// Resultado del servidor, o null mientras no lo haya (sin conexión, API apagada, error o cargando):
// en ese caso la pantalla usa su cálculo local con las jornadas guardadas en el dispositivo.
// Las consultas esperan un momento tras el último cambio para no llamar a la API en cada tecla.
function useConsulta(clave, pedir, habilitado, espera = 350) {
  const { enLinea } = useConnectivity();
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    setResultado(null);
    if (!habilitado || !enLinea || !disponibilidadEnServidor()) return undefined;
    let vigente = true;
    const temporizador = setTimeout(() => {
      pedir()
        .then((r) => vigente && setResultado(r))
        .catch(() => vigente && setResultado(null));
    }, espera);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado, enLinea]);

  return resultado;
}

// Espacios ocupados en [inicio, fin) -> Map espacio -> jornadas, o null
export function useOcupadosServidor(inicio, fin, excluirId) {
  const valida = Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio;
  const r = useConsulta(`${inicio}|${fin}|${excluirId ?? ""}`, () => pedirDisponibilidad(inicio, fin, excluirId), valida);
  return r ? new Map(Object.entries(r.ocupados)) : null;
}

// Sugerencia de espacios alternos de una jornada: undefined = sin respuesta del servidor,
// null = el servidor dice que no hay nada que sugerir
export function useAlternosServidor(jornadaId) {
  const r = useConsulta(`alt|${jornadaId ?? ""}`, () => pedirAlternos(jornadaId), !!jornadaId, 0);
  return r ? r.sugerencia : undefined;
}
