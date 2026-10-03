"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

type MercadoPagoStatus = {
  connected: boolean;
  mercadopago_user_id?: string;
  expires_at?: string | null;
  connected_at?: string | null;
};

type MercadoPagoTerminal = {
  id: string;
  pos_id: number | string | null;
  store_id: string | null;
  external_pos_id: string | null;
  operating_mode: string | null;
};

type MercadoPagoTerminalsResponse = {
  terminals: MercadoPagoTerminal[];
  total: number;
};

export default function IntegracionesPage() {
  const router = useRouter();
  const { perfil, negocio } = useAuth();

  const [conectando, setConectando] =
    useState(false);

  const [cargandoEstado, setCargandoEstado] =
    useState(true);

  const [estadoMercadoPago, setEstadoMercadoPago] =
    useState<MercadoPagoStatus | null>(null);

  const [terminales, setTerminales] =
    useState<MercadoPagoTerminal[]>([]);

  const [cargandoTerminales, setCargandoTerminales] =
    useState(false);

  const [errorTerminales, setErrorTerminales] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!perfil) return;

    if (perfil.role !== "admin") {
      router.replace("/");
      return;
    }

    void cargarEstadoMercadoPago();
  }, [perfil?.id, perfil?.role, router]);

  async function obtenerSesion() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (
      sessionError ||
      !session?.access_token
    ) {
      throw new Error(
        "Tu sesión ha expirado. Inicia sesión nuevamente."
      );
    }

    return session;
  }

  async function cargarEstadoMercadoPago() {
    try {
      setCargandoEstado(true);
      setError("");

      const session = await obtenerSesion();

      const response = await fetch(
        "/api/mercadopago/oauth/status",
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo consultar la integración con Mercado Pago."
        );
      }

      setEstadoMercadoPago(data);

      if (data.connected) {
        await cargarTerminales(
          session.access_token
        );
      } else {
        setTerminales([]);
      }
    } catch (error: any) {
      console.error(
        "Error consultando Mercado Pago:",
        error
      );

      setError(
        error?.message ||
          "No se pudo consultar Mercado Pago."
      );
    } finally {
      setCargandoEstado(false);
    }
  }

  async function cargarTerminales(
    sessionToken: string
  ) {
    try {
      setCargandoTerminales(true);
      setErrorTerminales("");

      const response = await fetch(
        "/api/mercadopago/terminals",
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${sessionToken}`,
          },
          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as
          MercadoPagoTerminalsResponse & {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudieron consultar las terminales Point."
        );
      }

      setTerminales(
        Array.isArray(data.terminals)
          ? data.terminals
          : []
      );
    } catch (error: any) {
      console.error(
        "Error consultando terminales Point:",
        error
      );

      setTerminales([]);

      setErrorTerminales(
        error?.message ||
          "No se pudieron consultar las terminales Point."
      );
    } finally {
      setCargandoTerminales(false);
    }
  }

  async function conectarMercadoPago() {
    try {
      setConectando(true);
      setError("");

      const session = await obtenerSesion();

      const response = await fetch(
        "/api/mercadopago/oauth/connect",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo iniciar la conexión con Mercado Pago."
        );
      }

      if (
        !data.success ||
        typeof data.authorization_url !== "string" ||
        !data.authorization_url
      ) {
        throw new Error(
          "Mercado Pago no devolvió una URL de autorización válida."
        );
      }

      window.location.href =
        data.authorization_url;
    } catch (error: any) {
      console.error(
        "Error conectando Mercado Pago:",
        error
      );

      setError(
        error?.message ||
          "No se pudo conectar Mercado Pago."
      );

      setConectando(false);
    }
  }

  function formatearFecha(
    fecha?: string | null
  ) {
    if (!fecha) return null;

    const date = new Date(fecha);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(
      "es-MX",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(date);
  }

  if (!perfil) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-slate-500">
            Cargando...
          </p>
        </div>
      </main>
    );
  }

  if (perfil.role !== "admin") {
    return null;
  }

  const conectado =
    estadoMercadoPago?.connected === true;

  const fechaConexion =
    formatearFecha(
      estadoMercadoPago?.connected_at
    );

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {negocio?.name || "Mi negocio"}
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Integraciones
          </h1>

          <p className="mt-2 max-w-2xl text-slate-500">
            Conecta servicios externos con tu punto
            de venta.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            {/* ENCABEZADO MERCADO PAGO */}

            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-xl">
                    💳
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-bold text-slate-900">
                        Mercado Pago
                      </h2>

                      {!cargandoEstado && (
                        conectado ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            ● Conectado
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            No conectado
                          </span>
                        )
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      Cobros con tarjeta desde tu POS
                    </p>
                  </div>
                </div>

                {cargandoEstado ? (
                  <p className="mt-5 text-sm text-slate-500">
                    Consultando conexión...
                  </p>
                ) : conectado ? (
                  <div className="mt-5 space-y-2">
                    <p className="text-sm leading-6 text-slate-600">
                      La cuenta de Mercado Pago de tu
                      negocio está vinculada correctamente.
                    </p>

                    {estadoMercadoPago
                      ?.mercadopago_user_id && (
                      <p className="text-sm text-slate-500">
                        ID de Mercado Pago:{" "}
                        <span className="font-medium text-slate-700">
                          {
                            estadoMercadoPago
                              .mercadopago_user_id
                          }
                        </span>
                      </p>
                    )}

                    {fechaConexion && (
                      <p className="text-sm text-slate-500">
                        Conectado el:{" "}
                        <span className="font-medium text-slate-700">
                          {fechaConexion}
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600">
                    Conecta la cuenta de Mercado Pago de
                    tu negocio para recibir pagos de tus
                    clientes directamente desde el punto
                    de venta.
                  </p>
                )}
              </div>

              <div className="shrink-0">
                {cargandoEstado ? (
                  <button
                    type="button"
                    disabled
                    className="rounded-xl bg-slate-200 px-5 py-3 font-semibold text-slate-500"
                  >
                    Consultando...
                  </button>
                ) : conectado ? (
                  <button
                    type="button"
                    onClick={() =>
                      void conectarMercadoPago()
                    }
                    disabled={conectando}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {conectando
                      ? "Abriendo..."
                      : "Volver a autorizar"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void conectarMercadoPago()
                    }
                    disabled={conectando}
                    className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {conectando
                      ? "Conectando..."
                      : "Conectar Mercado Pago"}
                  </button>
                )}
              </div>
            </div>

            {/* TERMINALES POINT */}

            {conectado && (
              <div className="mt-7 border-t border-slate-200 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Terminales Point
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Terminales asociadas a esta cuenta
                      de Mercado Pago.
                    </p>
                  </div>

                  {!cargandoTerminales && (
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {terminales.length}{" "}
                      {terminales.length === 1
                        ? "terminal"
                        : "terminales"}
                    </span>
                  )}
                </div>

                {cargandoTerminales ? (
                  <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                    <p className="text-sm text-slate-500">
                      Consultando terminales Point...
                    </p>
                  </div>
                ) : errorTerminales ? (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
                    <p className="font-medium text-red-800">
                      No pudimos consultar las terminales
                    </p>

                    <p className="mt-1 text-sm text-red-700">
                      {errorTerminales}
                    </p>
                  </div>
                ) : terminales.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <p className="font-medium text-slate-800">
                      No se encontraron terminales Point
                    </p>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      No hay terminales Point disponibles
                      en esta cuenta de Mercado Pago o
                      todavía no están disponibles para
                      la integración.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4">
                    {terminales.map((terminal) => {
                      const modo =
                        terminal.operating_mode
                          ?.toUpperCase() ||
                        "DESCONOCIDO";

                      const modoPDV =
                        modo === "PDV";

                      return (
                        <div
                          key={terminal.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900">
                                  Point
                                </p>

                                <span
                                  className={
                                    modoPDV
                                      ? "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                                      : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                                  }
                                >
                                  {modo}
                                </span>
                              </div>

                              <p className="mt-3 break-all text-sm text-slate-600">
                                <span className="font-medium text-slate-700">
                                  Terminal:
                                </span>{" "}
                                {terminal.id}
                              </p>

                              {terminal.store_id && (
                                <p className="mt-1 text-sm text-slate-500">
                                  Store ID:{" "}
                                  {terminal.store_id}
                                </p>
                              )}

                              {terminal.pos_id !== null &&
                                terminal.pos_id !== undefined && (
                                  <p className="mt-1 text-sm text-slate-500">
                                    POS ID:{" "}
                                    {terminal.pos_id}
                                  </p>
                                )}

                              {terminal.external_pos_id && (
                                <p className="mt-1 text-sm text-slate-500">
                                  External POS ID:{" "}
                                  {
                                    terminal.external_pos_id
                                  }
                                </p>
                              )}
                            </div>

                            <div className="shrink-0">
                              {modoPDV ? (
                                <span className="text-sm font-semibold text-green-700">
                                  Lista para integrar
                                </span>
                              ) : (
                                <span className="text-sm font-semibold text-amber-700">
                                  Requiere modo PDV
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}