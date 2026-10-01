"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import DetalleVenta from "../components/DetalleVenta";
import { useAuth } from "@/context/AuthContext";
import { nombreRol } from "@/lib/roles";

type Venta = {
  id: string;
  number: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  change_due: number;
  payment_method: "cash" | "card";
  created_at: string;

  user_id: string | null;
  user_name: string | null;
  user_role: "admin" | "manager" | "cashier" | null;
};

type VentaItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  subtotal: number;
};

export default function HistorialPage() {
  const { puedeAdministrar } = useAuth();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ventaSeleccionada, setVentaSeleccionada] =
  useState<Venta | null>(null);
  const [itemsVenta, setItemsVenta] = useState<VentaItem[]>([]);

useEffect(() => {
  async function cargarVentas() {
    const { data, error } = await supabase.rpc(
      "get_sales_history"
    );

    if (error) {
      console.error(error);
      setError(error.message);
    } else {
      setVentas((data as Venta[]) ?? []);
    }

    setLoading(false);
  }

  cargarVentas();
}, []);

async function abrirVenta(venta: Venta) {
  setVentaSeleccionada(venta);
  setItemsVenta([]);

  if (puedeAdministrar) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("sale_items")
      .select(`
        id,
        sale_id,
        product_id,
        name,
        unit_price,
        quantity,
        subtotal
      `)
      .eq("sale_id", venta.id);

    if (itemsError) {
      console.error("Error cargando detalle:", itemsError);
      return;
    }

    const { data: costosData, error: costosError } =
      await supabase.rpc("get_sale_item_costs", {
        p_sale_ids: [venta.id],
      });

    if (costosError) {
      console.error("Error cargando costos:", costosError);
      return;
    }

    const costosPorProducto = new Map<string | null, number>(
      (costosData ?? []).map(
        (item: {
          product_id: string | null;
          unit_cost: number;
        }): [string | null, number] => [
          item.product_id,
          Number(item.unit_cost),
        ]
      )
    );

    const itemsConCosto: VentaItem[] = (itemsData ?? []).map(
      (item) => ({
        ...item,
        unit_price: Number(item.unit_price),
        unit_cost:
          costosPorProducto.get(item.product_id) ?? 0,
        subtotal: Number(item.subtotal),
      })
    );

    setItemsVenta(itemsConCosto);
    return;
  }

  const { data, error } = await supabase
    .from("sale_items")
    .select(`
      id,
      sale_id,
      product_id,
      name,
      unit_price,
      quantity,
      subtotal
    `)
    .eq("sale_id", venta.id);

  if (error) {
    console.error("Error cargando detalle:", error);
    return;
  }

  const itemsSinCosto: VentaItem[] = (data ?? []).map(
    (item) => ({
      ...item,
      unit_price: Number(item.unit_price),
      unit_cost: 0,
      subtotal: Number(item.subtotal),
    })
  );

  setItemsVenta(itemsSinCosto);
}

  const formatoDinero = (cantidad: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(cantidad);

  const formatoFecha = (fecha: string) =>
    new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(fecha));

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-10">
      <div className="mx-auto max-w-5xl">

        <div className="mb-8">
          <p className="text-sm font-medium text-indigo-600">
            MI NEGOCIO POS
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Historial de ventas
          </h1>

          <p className="mt-2 text-slate-500">
            Consulta las ventas realizadas
          </p>
        </div>

        {loading && (
          <div className="rounded-2xl border bg-white p-8 text-center">
            Cargando ventas...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            Error: {error}
          </div>
        )}

        {!loading && !error && ventas.length === 0 && (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <p className="font-semibold">
              Todavía no hay ventas
            </p>
          </div>
        )}

        {!loading && !error && ventas.length > 0 && (
          <div className="overflow-hidden rounded-2xl border bg-white">

<div className="hidden grid-cols-5 border-b bg-slate-50 px-6 py-3 text-xs font-semibold uppercase text-slate-500 md:grid">
  <div>Venta</div>
  <div>Fecha</div>
  <div>Método</div>
  <div>Atendió</div>
  <div className="text-right">Total</div>
</div>

            {ventas.map((venta) => (
  <div
    key={venta.id}
    onClick={() => abrirVenta(venta)}
    className="grid cursor-pointer gap-3 border-b px-6 py-5 transition hover:bg-slate-50 last:border-b-0 md:grid-cols-5 md:items-center"
  >
                <div>
                  <p className="font-semibold">
                    {venta.number ?? "Sin folio"}
                  </p>

                  <p className="text-xs text-slate-400 md:hidden">
                    Venta
                  </p>
                </div>

                <div className="text-sm text-slate-600">
                  {formatoFecha(venta.created_at)}
                </div>

<div>
  <span
    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
      venta.payment_method === "card"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-green-100 text-green-700"
    }`}
  >
    {venta.payment_method === "card"
      ? "Tarjeta"
      : "Efectivo"}
  </span>
</div>

<div className="text-sm">
  {venta.user_name ? (
    <>
      <p className="font-medium text-slate-900">
        {venta.user_name}
      </p>

{venta.user_role && (
  <p className="mt-1 text-xs text-slate-400">
    {nombreRol(venta.user_role)}
  </p>
)}
    </>
  ) : (
    <span className="text-slate-400">—</span>
  )}
</div>

                <div className="text-lg font-bold md:text-right">
                  {formatoDinero(Number(venta.total))}
                </div>
              </div>
            ))}

          </div>
        )}

      </div>

      <DetalleVenta
  venta={ventaSeleccionada}
  items={itemsVenta}
  onCerrar={() => {
    setVentaSeleccionada(null);
    setItemsVenta([]);
  }}
/>

    </main>
    
  );
}