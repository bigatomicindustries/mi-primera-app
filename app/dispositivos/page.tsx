
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type Dispositivo = {
  id: string;
  name: string;
  platform: "android" | "ios";
  status: "active" | "revoked";
  branch_id: string;
  created_at: string;
  linked_at: string | null;
  last_sync_at: string | null;
  revoked_at: string | null;
};

export default function DispositivosPage() {
  const { perfil, sucursales } = useAuth();
  const router = useRouter();

  const [nombreDispositivo, setNombreDispositivo] = useState("");
  const [plataforma, setPlataforma] = useState<"android" | "ios">(
    "android"
  );
  const [sucursalId, setSucursalId] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState("");
  const [registrandoDispositivo, setRegistrandoDispositivo] =
    useState(false);

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [cargandoDispositivos, setCargandoDispositivos] =
    useState(false);
  const [errorDispositivos, setErrorDispositivos] = useState("");
const [generandoCodigoId, setGenerandoCodigoId] =
  useState<string | null>(null);

const [codigoVinculacion, setCodigoVinculacion] =
  useState<string | null>(null);

const [codigoDispositivoId, setCodigoDispositivoId] =
  useState<string | null>(null);

const [expiracionCodigo, setExpiracionCodigo] =
  useState<number | null>(null);

const [errorVinculacion, setErrorVinculacion] = useState("");

useEffect(() => {
  if (!expiracionCodigo) return;

  const tiempoRestante = expiracionCodigo - Date.now();

  const limpiarCodigo = () => {
    setCodigoVinculacion(null);
    setCodigoDispositivoId(null);
    setExpiracionCodigo(null);
  };

  if (tiempoRestante <= 0) {
    limpiarCodigo();
    return;
  }

  const timeout = window.setTimeout(limpiarCodigo, tiempoRestante);

  return () => window.clearTimeout(timeout);
}, [expiracionCodigo]);

  const sucursalesDisponibles = sucursales.filter(
    (sucursal) => sucursal.active
  );

  const cargarDispositivos = useCallback(async () => {
    setCargandoDispositivos(true);
    setErrorDispositivos("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No se encontró una sesión válida.");
      }

      const respuesta = await fetch("/api/devices", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          resultado.error ||
            "No se pudieron consultar los dispositivos."
        );
      }

      if (!Array.isArray(resultado.dispositivos)) {
        throw new Error("La respuesta de dispositivos no es válida.");
      }

      setDispositivos(resultado.dispositivos);
    } catch (error) {
      console.error("Error cargando dispositivos:", error);

      setErrorDispositivos(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los dispositivos."
      );
    } finally {
      setCargandoDispositivos(false);
    }
  }, []);

  useEffect(() => {
    if (!perfil) return;

    if (perfil.role !== "admin") {
      router.replace("/");
      return;
    }

    void cargarDispositivos();
  }, [perfil?.id, perfil?.role, router, cargarDispositivos]);

  async function generarCodigoVinculacion(deviceId: string) {
  if (generandoCodigoId) return;

  setErrorVinculacion("");
  setCodigoVinculacion(null);
  setCodigoDispositivoId(null);
  setExpiracionCodigo(null);
  setGenerandoCodigoId(deviceId);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No se encontró una sesión válida.");
    }

    const respuesta = await fetch("/api/devices/pairing/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ deviceId }),
      cache: "no-store",
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        resultado.error || "No se pudo generar el código."
      );
    }

    if (
      typeof resultado.token !== "string" ||
      !/^[0-9a-f]{64}$/.test(resultado.token) ||
      resultado.expiresInSeconds !== 600
    ) {
      throw new Error("La respuesta del servidor no es válida.");
    }

    setCodigoVinculacion(resultado.token);
    setCodigoDispositivoId(deviceId);
    setExpiracionCodigo(Date.now() + 600_000);
  } catch (error) {
    console.error("Error generando código de vinculación:", error);

    setErrorVinculacion(
      error instanceof Error
        ? error.message
        : "No se pudo generar el código de vinculación."
    );
  } finally {
    setGenerandoCodigoId(null);
  }
}

  async function registrarDispositivo() {
    if (registrandoDispositivo) return;

    setErrorFormulario("");

    const nombre = nombreDispositivo.trim();

    if (!nombre) {
      setErrorFormulario("Escribe un nombre para el dispositivo.");
      return;
    }

    if (nombre.length > 100) {
      setErrorFormulario(
        "El nombre no puede superar los 100 caracteres."
      );
      return;
    }

    if (!sucursalId) {
      setErrorFormulario("Selecciona una sucursal.");
      return;
    }

    if (
      !sucursalesDisponibles.some(
        (sucursal) => sucursal.id === sucursalId
      )
    ) {
      setErrorFormulario(
        "La sucursal seleccionada no está disponible."
      );
      return;
    }

    try {
      setRegistrandoDispositivo(true);

      const { data: deviceId, error } = await supabase.rpc(
        "register_pos_device",
        {
          p_branch_id: sucursalId,
          p_name: nombre,
          p_platform: plataforma,
        }
      );

      if (error) {
        throw error;
      }

      if (!deviceId) {
        throw new Error(
          "No se recibió el identificador del dispositivo."
        );
      }

      setNombreDispositivo("");
      setPlataforma("android");
      setSucursalId("");
      setMostrarFormulario(false);

      await cargarDispositivos();
    } catch (error) {
      console.error("Error registrando dispositivo:", error);

      setErrorFormulario(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el dispositivo."
      );
    } finally {
      setRegistrandoDispositivo(false);
    }
  }

  function obtenerNombreSucursal(branchId: string) {
    return (
      sucursales.find((sucursal) => sucursal.id === branchId)?.name ??
      "Sucursal no disponible"
    );
  }

  function obtenerEstado(dispositivo: Dispositivo) {
    if (dispositivo.status === "revoked") {
      return {
        texto: "Revocado",
        estilo: "bg-red-100 text-red-700",
      };
    }

    if (dispositivo.linked_at) {
      return {
        texto: "Vinculado",
        estilo: "bg-green-100 text-green-700",
      };
    }

    return {
      texto: "Pendiente de vinculación",
      estilo: "bg-amber-100 text-amber-800",
    };
  }

  if (!perfil) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-slate-500">Verificando permisos...</p>
      </main>
    );
  }

  if (perfil.role !== "admin") {
    return null;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Dispositivos
        </h1>

        <p className="mt-2 text-slate-600">
          Administra los teléfonos y tabletas registrados en tu negocio.
        </p>
      </div>

      {/* REGISTRAR DISPOSITIVO */}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Registrar dispositivo
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Prepara un teléfono o tableta para vincularlo a tu negocio.
            </p>
          </div>

          <button
            type="button"
            disabled={registrandoDispositivo}
            onClick={() => {
              setErrorFormulario("");
              setMostrarFormulario((actual) => !actual);
            }}
            className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mostrarFormulario ? "Cancelar" : "Nuevo dispositivo"}
          </button>
        </div>

        {mostrarFormulario && (
          <div className="mt-6 grid gap-5 border-t border-slate-100 pt-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label
                htmlFor="nombre-dispositivo"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Nombre del dispositivo
              </label>

              <input
                id="nombre-dispositivo"
                type="text"
                maxLength={100}
                value={nombreDispositivo}
                disabled={registrandoDispositivo}
                onChange={(e) =>
                  setNombreDispositivo(e.target.value)
                }
                placeholder="Ej. Tablet caja principal"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-green-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="plataforma-dispositivo"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Plataforma
              </label>

              <select
                id="plataforma-dispositivo"
                value={plataforma}
                disabled={registrandoDispositivo}
                onChange={(e) =>
                  setPlataforma(
                    e.target.value as "android" | "ios"
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:opacity-50"
              >
                <option value="android">Android</option>
                <option value="ios">iPhone / iPad</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sucursal-dispositivo"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Sucursal
              </label>

              <select
                id="sucursal-dispositivo"
                value={sucursalId}
                disabled={registrandoDispositivo}
                onChange={(e) => setSucursalId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:opacity-50"
              >
                <option value="">Selecciona una sucursal</option>

                {sucursalesDisponibles.map((sucursal) => (
                  <option
                    key={sucursal.id}
                    value={sucursal.id}
                  >
                    {sucursal.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <p className="text-sm text-slate-500">
                El dispositivo se registrará en tu negocio. Para
                utilizarlo, será necesario completar posteriormente
                la vinculación segura.
              </p>

              {errorFormulario && (
                <p
                  role="alert"
                  className="mt-3 text-sm font-medium text-red-600"
                >
                  {errorFormulario}
                </p>
              )}

              <button
                type="button"
                disabled={registrandoDispositivo}
                onClick={registrarDispositivo}
                className="mt-5 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {registrandoDispositivo
                  ? "Registrando..."
                  : "Registrar dispositivo"}
              </button>
            </div>
          </div>
        )}
      </section>

      {(codigoVinculacion || errorVinculacion) && (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          Código de vinculación
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Utiliza este código únicamente en el dispositivo que deseas vincular.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          setCodigoVinculacion(null);
          setCodigoDispositivoId(null);
          setExpiracionCodigo(null);
          setErrorVinculacion("");
        }}
        className="text-sm font-semibold text-slate-500 hover:text-slate-900"
      >
        Cerrar
      </button>
    </div>

    {errorVinculacion && (
      <p role="alert" className="mt-4 text-sm text-red-600">
        {errorVinculacion}
      </p>
    )}

    {codigoVinculacion && expiracionCodigo && (
      <div className="mt-5 space-y-4">
        <div className="rounded-xl bg-slate-100 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Código temporal
          </p>
          <p className="break-all font-mono text-sm text-slate-900">
            {codigoVinculacion}
          </p>
        </div>

        <p className="text-sm text-amber-700">
          Válido durante 10 minutos desde su generación.
        </p>

        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(codigoVinculacion)}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          Copiar código
        </button>
      </div>
    )}
  </section>
)}

      {/* LISTADO DE DISPOSITIVOS */}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Dispositivos registrados
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Consulta los dispositivos asociados a tu negocio y su
              estado de vinculación.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void cargarDispositivos()}
            disabled={cargandoDispositivos}
            className="rounded-xl border border-green-600 px-5 py-3 font-semibold text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargandoDispositivos
              ? "Actualizando..."
              : "Actualizar"}
          </button>
        </div>

        {errorDispositivos && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {errorDispositivos}
          </div>
        )}

        {cargandoDispositivos && dispositivos.length === 0 ? (
          <div className="mt-6 rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            Cargando dispositivos...
          </div>
        ) : dispositivos.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <p className="font-medium text-slate-700">
              No hay dispositivos registrados
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Registra tu primer dispositivo para comenzar el
              proceso de vinculación.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-4 font-semibold">
                    Dispositivo
                  </th>
                  <th className="px-4 py-4 font-semibold">
                    Plataforma
                  </th>
                  <th className="px-4 py-4 font-semibold">
                    Sucursal
                  </th>
                  <th className="px-4 py-4 font-semibold">
                    Estado
                  </th>
                  <th className="px-4 py-4 font-semibold">
                    Registro
                  </th>
                  <th className="px-4 py-4 font-semibold">
  Acciones
</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {dispositivos.map((dispositivo) => {
                  const estado = obtenerEstado(dispositivo);

                  return (
                    <tr
                      key={dispositivo.id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {dispositivo.name}
                        </p>

                        <p className="mt-1 font-mono text-xs text-slate-400">
                          {dispositivo.id.slice(0, 8)}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {dispositivo.platform === "android"
                          ? "Android"
                          : "iPhone / iPad"}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {obtenerNombreSucursal(
                          dispositivo.branch_id
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${estado.estilo}`}
                        >
                          {estado.texto}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-slate-600">
                        {new Date(
                          dispositivo.created_at
                        ).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-4 py-4">
  {dispositivo.status === "active" &&
  !dispositivo.linked_at ? (
<button
  type="button"
  onClick={() => generarCodigoVinculacion(dispositivo.id)}
  disabled={generandoCodigoId !== null}
  className="rounded-lg border border-green-600 px-3 py-2 text-xs font-semibold text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
>
  {generandoCodigoId === dispositivo.id
    ? "Generando..."
    : "Generar código"}
</button>
  ) : (
    <span className="text-xs text-slate-400">
      No disponible
    </span>
  )}
</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Un dispositivo registrado todavía no puede operar offline
          hasta completar su vinculación y autorización.
        </p>
      </section>
    </main>
  );
}
