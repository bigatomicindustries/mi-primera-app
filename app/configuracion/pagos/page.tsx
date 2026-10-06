"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type ConfiguracionPagos = {
  business_id: string;
  bank_name: string | null;
  account_holder: string | null;
  clabe: string | null;
  account_number: string | null;
  transfer_enabled: boolean;
};

export default function ConfiguracionPagosPage() {
  const {
    negocio,
    puedeAdministrar,
    cargando: cargandoAuth,
  } = useAuth();

  const [banco, setBanco] = useState("");
  const [titular, setTitular] = useState("");
  const [clabe, setClabe] = useState("");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [transferenciasActivas, setTransferenciasActivas] =
    useState(false);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (cargandoAuth) return;

    if (!negocio?.id) {
      setCargando(false);
      return;
    }

    async function cargarConfiguracion() {
      try {
        setCargando(true);
        setError("");

        const { data, error } = await supabase
          .from("business_payment_settings")
          .select(
            `
              business_id,
              bank_name,
              account_holder,
              clabe,
              account_number,
              transfer_enabled
            `
          )
          .eq("business_id", negocio!.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        const configuracion =
          data as ConfiguracionPagos | null;

        if (!configuracion) {
          setBanco("");
          setTitular("");
          setClabe("");
          setNumeroCuenta("");
          setTransferenciasActivas(false);
          return;
        }

        setBanco(configuracion.bank_name ?? "");
        setTitular(configuracion.account_holder ?? "");
        setClabe(configuracion.clabe ?? "");
        setNumeroCuenta(
          configuracion.account_number ?? ""
        );
        setTransferenciasActivas(
          configuracion.transfer_enabled
        );
      } catch (error: any) {
        console.error(
          "Error cargando configuración de pagos:",
          error
        );

        setError(
          error?.message ||
            "No se pudo cargar la configuración."
        );
      } finally {
        setCargando(false);
      }
    }

    void cargarConfiguracion();
  }, [cargandoAuth, negocio?.id]);

  async function guardarConfiguracion() {
    if (!negocio?.id) return;

    setError("");
    setMensaje("");

    const bancoLimpio = banco.trim();
    const titularLimpio = titular.trim();
    const clabeLimpia = clabe.replace(/\D/g, "");
    const cuentaLimpia = numeroCuenta
      .replace(/\D/g, "")
      .trim();

    if (!bancoLimpio) {
      setError("Escribe el nombre del banco.");
      return;
    }

    if (!titularLimpio) {
      setError("Escribe el titular de la cuenta.");
      return;
    }

    if (clabeLimpia.length !== 18) {
      setError(
        "La CLABE debe contener exactamente 18 dígitos."
      );
      return;
    }

    try {
      setGuardando(true);

      const { error } = await supabase
        .from("business_payment_settings")
        .upsert(
          {
            business_id: negocio.id,
            bank_name: bancoLimpio,
            account_holder: titularLimpio,
            clabe: clabeLimpia,
            account_number:
              cuentaLimpia || null,
            transfer_enabled:
              transferenciasActivas,
          },
          {
            onConflict: "business_id",
          }
        );

      if (error) {
        throw error;
      }

      setBanco(bancoLimpio);
      setTitular(titularLimpio);
      setClabe(clabeLimpia);
      setNumeroCuenta(cuentaLimpia);

      setMensaje(
        "La configuración de transferencias se guardó correctamente."
      );
    } catch (error: any) {
      console.error(
        "Error guardando configuración de pagos:",
        error
      );

      setError(
        error?.message ||
          "No se pudo guardar la configuración."
      );
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoAuth || cargando) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <p className="text-slate-500">
            Cargando configuración...
          </p>
        </div>
      </main>
    );
  }

  if (!puedeAdministrar) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-red-200 bg-white p-8">
            <p className="text-sm font-semibold text-red-600">
              Acceso restringido
            </p>

            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              No tienes permiso para administrar esta
              configuración.
            </h1>

            <Link
              href="/"
              className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
            Configuración
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Pagos y transferencias
          </h1>

          <p className="mt-2 max-w-2xl text-slate-500">
            Configura los datos bancarios que se utilizarán
            cuando un cliente elija pagar mediante
            transferencia.
          </p>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {mensaje && (
          <div className="mt-8 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-700">
            {mensaje}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Transferencias bancarias
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Permite recibir pagos mediante transferencia.
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={transferenciasActivas}
                  onChange={(e) =>
                    setTransferenciasActivas(
                      e.target.checked
                    )
                  }
                  className="h-5 w-5 rounded border-slate-300 text-green-600"
                />

                <span className="text-sm font-semibold text-slate-700">
                  Aceptar transferencias
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Banco
              </label>

              <input
                type="text"
                value={banco}
                onChange={(e) =>
                  setBanco(e.target.value)
                }
                placeholder="Ej. BBVA"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Titular de la cuenta
              </label>

              <input
                type="text"
                value={titular}
                onChange={(e) =>
                  setTitular(e.target.value)
                }
                placeholder="Nombre del titular"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                CLABE
              </label>

              <input
                type="text"
                inputMode="numeric"
                value={clabe}
                onChange={(e) =>
                  setClabe(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 18)
                  )
                }
                placeholder="18 dígitos"
                maxLength={18}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />

              <div className="mt-2 flex justify-between gap-4">
                <p className="text-xs text-slate-500">
                  CLABE interbancaria de 18 dígitos.
                </p>

                <p
                  className={`text-xs font-semibold ${
                    clabe.length === 18
                      ? "text-green-600"
                      : "text-slate-400"
                  }`}
                >
                  {clabe.length}/18
                </p>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Número de cuenta
                <span className="ml-2 font-normal text-slate-400">
                  Opcional
                </span>
              </label>

              <input
                type="text"
                inputMode="numeric"
                value={numeroCuenta}
                onChange={(e) =>
                  setNumeroCuenta(
                    e.target.value.replace(/\D/g, "")
                  )
                }
                placeholder="Número de cuenta"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-800">
                Vista previa para el cliente
              </p>

              <div className="mt-4 space-y-2 text-sm">
                <p className="text-slate-600">
                  Banco:{" "}
                  <span className="font-semibold text-slate-900">
                    {banco || "—"}
                  </span>
                </p>

                <p className="text-slate-600">
                  Titular:{" "}
                  <span className="font-semibold text-slate-900">
                    {titular || "—"}
                  </span>
                </p>

                <p className="text-slate-600">
                  CLABE:{" "}
                  <span className="font-mono font-semibold text-slate-900">
                    {clabe || "—"}
                  </span>
                </p>

                {numeroCuenta && (
                  <p className="text-slate-600">
                    Cuenta:{" "}
                    <span className="font-mono font-semibold text-slate-900">
                      {numeroCuenta}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="text-xs text-slate-500">
              Estos datos se utilizarán al preparar el mensaje
              de WhatsApp para el cliente.
            </p>

            <button
              type="button"
              onClick={guardarConfiguracion}
              disabled={guardando}
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando
                ? "Guardando..."
                : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}