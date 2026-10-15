"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import ReconciliationDecision from "./ReconciliationDecision";

type Reconciliation = {
  id: string;
  device_id: string;
  branch_id: string;
  product_id: string;
  local_product_id: string;
  local_change_id: string;
  movement_type: "count" | "legacy";
  previous_stock: number;
  requested_stock: number;
  server_stock: number | null;
  status: string;
  decision: string | null;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("es-MX")
    : "Fecha no disponible";
}

export default function InventoryReconciliationsPage() {
  const { esAdmin, cargando, negocio } = useAuth();

  const [items, setItems] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastCheck, setLastCheck] = useState("");

  const load = useCallback(async () => {
    if (!esAdmin || !negocio?.id) return;

    setLoading(true);
    setError("");

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session?.access_token) {
        throw new Error("Inicia sesión nuevamente.");
      }

      const response = await fetch(
        "/api/inventory/reconciliations",
        {
          headers: {
            Authorization:
              `Bearer ${data.session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const body: unknown = await response.json();

      if (!body || typeof body !== "object") {
        throw new Error("Respuesta inválida del servidor.");
      }

      const result = body as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No se pudieron cargar las conciliaciones."
        );
      }

      if (!Array.isArray(result.items)) {
        throw new Error("Lista de conciliaciones inválida.");
      }

      setItems(result.items as Reconciliation[]);
      setLastCheck(new Date().toLocaleString("es-MX"));
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error
          ? err.message
          : "Error de conexión."
      );
    } finally {
      setLoading(false);
    }
  }, [esAdmin, negocio?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (cargando) {
    return (
      <main className="p-8 text-slate-600">
        Verificando permisos...
      </main>
    );
  }

  if (!esAdmin || !negocio?.id) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">
          Acceso restringido
        </h1>
        <p className="mt-3 text-slate-600">
          Solo el administrador del negocio puede revisar
          conciliaciones de inventario.
        </p>
        <Link href="/inventario" className="mt-5 inline-block underline">
          Volver a inventario
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/inventario"
          className="text-sm font-semibold text-green-700 hover:underline"
        >
          ← Volver a inventario
        </Link>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-700">
              Inventario · Administración
            </p>
            <h1 className="mt-1 text-3xl font-bold">
              Conciliaciones
            </h1>
            <p className="mt-2 text-slate-600">
              Revisa los conteos offline que requieren
              autorización administrativa.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Consultando..." : "Actualizar"}
          </button>
        </div>

        <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong>Modo de revisión.</strong>{" "}
          Esta pantalla todavía no aplica ajustes,
          aprueba solicitudes ni modifica existencias.
          Las decisiones se habilitarán cuando esté
          preparada la transacción auditable en DEV.
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-white p-5 text-red-700">
            {error}
          </div>
        )}

        {!error && lastCheck && (
          <p className="mt-4 text-xs text-slate-500">
            Última consulta: {lastCheck}
          </p>
        )}

        {!error && !loading && items.length === 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">
            No hay solicitudes de conciliación registradas
            para este negocio.
          </div>
        )}

        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">
                  Producto vinculado
                </h2>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                  {item.status}
                </span>
              </div>

              <p className="mt-2 break-all text-sm text-slate-500">
                ID producto: {item.product_id}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    Existencia anterior
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {item.previous_stock}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    Conteo solicitado
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {item.requested_stock}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-900">
                  Existencia registrada en Supabase DEV
                </p>
                <p className="mt-1 text-2xl font-bold text-green-950">
                  {item.server_stock === null
                    ? "No disponible"
                    : item.server_stock}
                </p>
                <p className="mt-2 text-xs text-green-800">
                  Valor consultado al actualizar esta pantalla.
                  Puede cambiar si otro usuario modifica el inventario.
                </p>
              </div>

              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p>
                  Tipo: {item.movement_type === "count"
                    ? "Conteo físico"
                    : "Ajuste heredado"}
                </p>
                <p>Registrado: {readableDate(item.created_at)}</p>
                <p className="break-all">
                  Movimiento local: {item.local_change_id}
                </p>
                <p className="break-all">
                  Dispositivo: {item.device_id}
                </p>
                <p className="break-all">
                  Sucursal: {item.branch_id}
                </p>
              </div>

              {item.status === "pending" ? (
                <ReconciliationDecision
                  reconciliationId={item.id}
                  serverStock={item.server_stock}
                  requestedStock={item.requested_stock}
                  onResolved={load}
                />
              ) : (
                <p className="mt-4 text-sm font-medium text-slate-700">
                  Resolución registrada: {item.status}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
