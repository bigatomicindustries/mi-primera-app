"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export default function IntegracionesPage() {
  const router = useRouter();
  const { perfil, negocio } = useAuth();

  const [conectando, setConectando] =
    useState(false);

  const [error, setError] =
    useState("");

  async function conectarMercadoPago() {
    try {
      setConectando(true);
      setError("");

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
    router.replace("/");

    return null;
  }

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
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-xl">
                    💳
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Mercado Pago
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Cobros con tarjeta desde tu POS
                    </p>
                  </div>
                </div>

                <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600">
                  Conecta la cuenta de Mercado Pago de
                  tu negocio para recibir pagos de tus
                  clientes directamente desde el punto
                  de venta.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void conectarMercadoPago()
                }
                disabled={conectando}
                className="shrink-0 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {conectando
                  ? "Conectando..."
                  : "Conectar Mercado Pago"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}