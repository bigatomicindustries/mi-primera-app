"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { nombreRol } from "@/lib/roles";

type Movimiento = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_barcode: string | null;

  movement_type:
    | "purchase"
    | "stock_in"
    | "sale"
    | "adjustment"
    | "return"
    | "purchase_cancel";

  quantity: number;
  stock_before: number;
  stock_after: number;

  reference_id: string | null;
  note: string | null;
  created_at: string;

  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
};

type FiltroTipo =
  | "all"
  | "purchase"
  | "stock_in"
  | "sale"
  | "adjustment"
  | "return"
  | "purchase_cancel";

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] =
    useState<FiltroTipo>("all");

  useEffect(() => {
    cargarMovimientos();
  }, []);

async function cargarMovimientos() {
  setLoading(true);
  setError("");

  const { data, error } = await supabase.rpc(
    "get_inventory_movements"
  );

  if (error) {
    console.error("Error al cargar movimientos:", error);
    setError(error.message);
    setLoading(false);
    return;
  }

  setMovimientos((data as Movimiento[]) ?? []);
  setLoading(false);
}

  const movimientosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return movimientos.filter((movimiento) => {
      const coincideTipo =
        filtroTipo === "all" ||
        movimiento.movement_type === filtroTipo;

      const nombre =
  movimiento.product_name?.toLowerCase() ?? "";

const codigo =
  movimiento.product_barcode?.toLowerCase() ?? "";

const nota =
  movimiento.note?.toLowerCase() ?? "";

const usuario =
  movimiento.user_name?.toLowerCase() ?? "";
  
const coincideBusqueda =
  !texto ||
  nombre.includes(texto) ||
  codigo.includes(texto) ||
  nota.includes(texto) ||
  usuario.includes(texto);

      return coincideTipo && coincideBusqueda;
    });
  }, [movimientos, busqueda, filtroTipo]);

  const entradas = movimientos.reduce(
    (total, movimiento) =>
      movimiento.quantity > 0
        ? total + movimiento.quantity
        : total,
    0
  );

  const salidas = movimientos.reduce(
    (total, movimiento) =>
      movimiento.quantity < 0
        ? total + Math.abs(movimiento.quantity)
        : total,
    0
  );

function nombreTipo(tipo: Movimiento["movement_type"]) {
  switch (tipo) {
    case "purchase":
      return "Compra";

    case "stock_in":
      return "Entrada manual";

    case "sale":
      return "Venta";

    case "adjustment":
      return "Ajuste";

    case "return":
      return "Devolución";

    case "purchase_cancel":
      return "Cancelación de compra";

    default:
      return tipo;
  }
}

  function formatoFecha(fecha: string) {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(fecha));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-slate-500">
            Cargando movimientos...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-7xl">

        {/* ENCABEZADO */}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">
              Mi Negocio POS
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Movimientos de inventario
            </h1>

            <p className="mt-2 text-slate-500">
              Historial de entradas y salidas de mercancía
            </p>
          </div>

          <Link
            href="/inventario"
            className="rounded-xl border bg-white px-5 py-3 text-center font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            ← Inventario
          </Link>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* RESUMEN */}

        <div className="mt-10 grid gap-5 md:grid-cols-3">

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Movimientos registrados
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {movimientos.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Unidades de entrada
            </p>

            <p className="mt-2 text-3xl font-bold text-green-600">
              +{entradas}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Unidades de salida
            </p>

            <p className="mt-2 text-3xl font-bold text-red-600">
              -{salidas}
            </p>
          </div>

        </div>

        {/* FILTROS */}

        <div className="mt-8 flex flex-col gap-4 lg:flex-row">

          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, código o movimiento..."
            className="flex-1 rounded-xl border bg-white px-5 py-4 outline-none transition focus:border-indigo-500"
          />

          <select
            value={filtroTipo}
            onChange={(e) =>
              setFiltroTipo(e.target.value as FiltroTipo)
            }
            className="rounded-xl border bg-white px-5 py-4 outline-none focus:border-indigo-500"
          >
            <option value="all">
              Todos los movimientos
            </option>

            <option value="purchase">
              Entradas
            </option>

            <option value="stock_in">
  Entradas manuales
</option>

            <option value="sale">
              Ventas
            </option>

            <option value="adjustment">
              Ajustes
            </option>

            <option value="return">
              Devoluciones
            </option>
          
          <option value="purchase_cancel">
  Cancelaciones de compra
</option>

</select>

        </div>

        {/* TABLA */}

        <div className="mt-6 overflow-hidden rounded-2xl border bg-white">

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="border-b bg-slate-50">

                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">

                  <th className="px-6 py-4">
                    Fecha
                  </th>

                  <th className="px-6 py-4">
                    Producto
                  </th>

                  <th className="px-6 py-4">
                    Tipo
                  </th>

                  <th className="px-6 py-4 text-right">
                    Movimiento
                  </th>

                  <th className="px-6 py-4 text-center">
                    Stock
                  </th>

                  <th className="px-6 py-4">
                    Detalle
                  </th>

                  <th className="px-6 py-4">
  Realizado por
</th>

                </tr>

              </thead>

              <tbody className="divide-y">

                {movimientosFiltrados.map((movimiento) => {

                  const entrada =
                    movimiento.quantity > 0;

                  return (
                    <tr
                      key={movimiento.id}
                      className="transition hover:bg-slate-50"
                    >

                      <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-500">
                        {formatoFecha(movimiento.created_at)}
                      </td>

                      <td className="px-6 py-5">
<p className="font-semibold text-slate-900">
  {movimiento.product_name ?? "Producto"}
</p>

{movimiento.product_barcode && (
  <p className="mt-1 text-xs text-slate-400">
    {movimiento.product_barcode}
  </p>
)}
                      </td>

                      <td className="px-6 py-5">

                        <span
className={`rounded-full px-3 py-1 text-xs font-semibold ${
  movimiento.movement_type === "sale"
    ? "bg-red-100 text-red-700"
    : movimiento.movement_type === "adjustment"
    ? "bg-amber-100 text-amber-700"
    : movimiento.movement_type === "purchase_cancel"
    ? "bg-slate-200 text-slate-700"
    : "bg-green-100 text-green-700"
}`}
                        >
                          {nombreTipo(
                            movimiento.movement_type
                          )}
                        </span>

                      </td>

                      <td
                        className={`px-6 py-5 text-right text-lg font-bold ${
                          entrada
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {entrada ? "+" : ""}
                        {movimiento.quantity}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-center font-medium text-slate-700">
                        {movimiento.stock_before}
                        {" → "}
                        {movimiento.stock_after}
                      </td>

                      <td className="px-6 py-5 text-sm text-slate-500">
                        {movimiento.note || "—"}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5">
  {movimiento.user_name ? (
    <>
      <p className="font-medium text-slate-900">
        {movimiento.user_name}
      </p>

      {movimiento.user_role && (
        <p className="mt-1 text-xs text-slate-400">
{nombreRol(movimiento.user_role)}
        </p>
      )}
    </>
  ) : (
    <span className="text-slate-400">—</span>
  )}
</td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          </div>

          {movimientosFiltrados.length === 0 && (
            <div className="p-12 text-center">

              <p className="font-medium text-slate-700">
                No encontramos movimientos
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Prueba con otros filtros.
              </p>

            </div>
          )}

        </div>

      </div>
    </main>
  );
}