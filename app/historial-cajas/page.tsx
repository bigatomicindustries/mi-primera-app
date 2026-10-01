"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import DetalleVenta from "../components/DetalleVenta";
import { useAuth } from "@/context/AuthContext";
import { nombreRol } from "@/lib/roles";

type SesionCaja = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  status: "open" | "closed";

  opened_by: string | null;
  opened_by_name: string | null;
  opened_by_role: "admin" | "manager" | "cashier" | null;

  closed_by: string | null;
  closed_by_name: string | null;
  closed_by_role: "admin" | "manager" | "cashier" | null;
};

type Venta = {
  id: string;
  number: string;
  cash_session_id: string | null;
  total: number;
  paid_amount: number;
  change_due: number;
  payment_method: "cash" | "card";
  created_at: string;

  user_id: string | null;
  user_name: string | null;
  user_role: "admin" | "manager" | "cashier" | null;
};

type ItemVenta = {
  sale_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
};

type MovimientoCaja = {
  id: string;
  cash_session_id: string;
  movement_type: "income" | "expense";
  amount: number;
  concept: string;
  created_at: string;

  user_id: string | null;
  user_name: string | null;
  user_role: "admin" | "manager" | "cashier" | null;
};

export default function HistorialCajasPage() {
  const {
  puedeAdministrar,
  cargando: cargandoAuth,
} = useAuth();
  const [sesiones, setSesiones] = useState<SesionCaja[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sesionSeleccionada, setSesionSeleccionada] =
  useState<SesionCaja | null>(null);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [movimientosCaja, setMovimientosCaja] =
  useState<MovimientoCaja[]>([]);
const [ventaSeleccionada, setVentaSeleccionada] =
  useState<Venta | null>(null);

  useEffect(() => {
    if (cargandoAuth) return;
    async function cargarHistorial() {
      try {
        setLoading(true);
        setError("");

        const { data: sesionesData, error: sesionesError } =
  await supabase.rpc("get_cash_sessions_history");

        if (sesionesError) throw sesionesError;

const { data: ventasTodas, error: ventasError } =
  await supabase.rpc("get_sales_history");

if (ventasError) throw ventasError;

const ventasData = ((ventasTodas as Venta[]) ?? []).filter(
  (venta) => venta.cash_session_id !== null
);

const idsVentas = (ventasData ?? []).map(
  (venta) => venta.id
);

let itemsData: ItemVenta[] = [];

if (idsVentas.length > 0) {
if (puedeAdministrar) {
  // Datos normales de los productos vendidos
  const { data: itemsSinCosto, error: itemsError } =
    await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, name, quantity, unit_price"
      )
      .in("sale_id", idsVentas);

  if (itemsError) throw itemsError;

  // Costos protegidos: solo Admin / Manager
  const { data: costosData, error: costosError } =
    await supabase.rpc("get_sale_item_costs", {
      p_sale_ids: idsVentas,
    });

  if (costosError) throw costosError;

  const costosPorVentaProducto =
    new Map<string, number>();

  (costosData ?? []).forEach(
    (item: {
      sale_id: string;
      product_id: string | null;
      unit_cost: number;
    }) => {
      const clave =
        `${item.sale_id}:${item.product_id ?? "null"}`;

      costosPorVentaProducto.set(
        clave,
        Number(item.unit_cost)
      );
    }
  );

  itemsData = (itemsSinCosto ?? []).map((item) => ({
    ...item,
    unit_cost:
      costosPorVentaProducto.get(
        `${item.sale_id}:${item.product_id ?? "null"}`
      ) ?? 0,
  }));
} else {
    const { data, error: itemsError } = await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, name, quantity, unit_price"
      )
      .in("sale_id", idsVentas);

    if (itemsError) throw itemsError;

    itemsData = (data ?? []).map((item) => ({
      ...item,
      unit_cost: 0,
    }));
  }
}

const resultadosMovimientos = await Promise.all(
  ((sesionesData as SesionCaja[]) ?? []).map((sesion) =>
    supabase.rpc("get_cash_movements", {
      p_cash_session_id: sesion.id,
    })
  )
);

const movimientosData: MovimientoCaja[] = [];

for (const resultado of resultadosMovimientos) {
  if (resultado.error) {
    throw resultado.error;
  }

  movimientosData.push(
    ...((resultado.data as MovimientoCaja[]) ?? [])
  );
}

movimientosData.sort(
  (a, b) =>
    new Date(b.created_at).getTime() -
    new Date(a.created_at).getTime()
);

  setSesiones(sesionesData ?? []);
setVentas(ventasData ?? []);
setItems(itemsData);
setMovimientosCaja(movimientosData ?? []);
      } catch (error: any) {
        console.error("Error al cargar historial de cajas:", error);
        setError(
          error?.message || "No se pudo cargar el historial de cajas."
        );
      } finally {
        setLoading(false);
      }
    }

    cargarHistorial();
}, [cargandoAuth, puedeAdministrar]);

  const formatoDinero = (cantidad: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(cantidad);

  const formatoFecha = (fecha: string) =>
    new Date(fecha).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  function obtenerVentasSesion(idSesion: string) {
    return ventas.filter(
      (venta) => venta.cash_session_id === idSesion
    );
  }

  function obtenerMovimientosSesion(idSesion: string) {
  return movimientosCaja.filter(
    (movimiento) =>
      movimiento.cash_session_id === idSesion
  );
}

const cajaActual = sesiones.find(
  (sesion) => sesion.status === "open"
);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-700">
            Cargando historial de cajas...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">

        {/* ENCABEZADO */}

        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              MI NEGOCIO POS
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Historial de cajas
            </h1>

            <p className="mt-2 text-slate-700">
              Consulta las aperturas y cierres de caja.
            </p>
          </div>

          <a
            href="/caja"
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            ← Caja
          </a>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            {error}
          </div>
        )}

        {/* RESUMEN */}

        <div className="mt-10 grid gap-5 md:grid-cols-3">

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-700">
              Sesiones registradas
            </p>

            <p className="mt-2 text-3xl font-bold">
              {sesiones.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-700">
              Cajas cerradas
            </p>

            <p className="mt-2 text-3xl font-bold">
              {
                sesiones.filter(
                  (sesion) => sesion.status === "closed"
                ).length
              }
            </p>
          </div>

<button
  type="button"
  onClick={() => {
    if (cajaActual) {
      setSesionSeleccionada(cajaActual);
    }
  }}
  disabled={!cajaActual}
  className={`rounded-2xl border bg-white p-6 text-left transition ${
    cajaActual
      ? "cursor-pointer hover:border-indigo-300 hover:shadow-md"
      : "cursor-default"
  }`}
>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-slate-700">
        Caja actual
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          cajaActual
            ? "text-green-600"
            : "text-slate-900"
        }`}
      >
        {cajaActual ? "Abierta" : "Cerrada"}
      </p>
    </div>

    {cajaActual && (
      <span className="text-sm font-semibold text-indigo-600">
        Ver detalle →
      </span>
    )}
  </div>
</button>

        </div>

        {/* HISTORIAL */}

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white">

          <div className="grid grid-cols-6 gap-4 border-b bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-700">
            <div>Apertura</div>
            <div>Cierre</div>
            <div>Ventas</div>
            <div>Ingresos</div>
            <div>Diferencia</div>
            <div>Estado</div>
          </div>

          {sesiones.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-medium text-slate-700">
                No hay sesiones de caja.
              </p>

              <p className="mt-1 text-sm text-slate-700">
                Cuando abras una caja aparecerá aquí.
              </p>
            </div>
          ) : (
            sesiones.map((sesion) => {
              const ventasSesion =
                obtenerVentasSesion(sesion.id);

              const ingresosSesion =
                ventasSesion.reduce(
                  (suma, venta) =>
                    suma + Number(venta.total),
                  0
                );

              const diferencia =
                Number(sesion.difference ?? 0);

return (
  <div
    key={sesion.id}
    onClick={() => setSesionSeleccionada(sesion)}
    className="grid cursor-pointer grid-cols-6 gap-4 border-b px-6 py-5 transition hover:bg-slate-50 last:border-b-0"
  >
                  <div className="text-sm text-slate-700">
                    {formatoFecha(sesion.opened_at)}
                  </div>

                  <div className="text-sm text-slate-700">
                    {sesion.closed_at
                      ? formatoFecha(sesion.closed_at)
                      : "—"}
                  </div>

                  <div className="font-semibold">
                    {ventasSesion.length}
                  </div>

                  <div className="font-bold">
                    {formatoDinero(ingresosSesion)}
                  </div>

                  <div
                    className={`font-bold ${
                      diferencia < 0
                        ? "text-red-600"
                        : diferencia > 0
                        ? "text-amber-600"
                        : "text-green-600"
                    }`}
                  >
                    {sesion.status === "closed"
                      ? formatoDinero(diferencia)
                      : "—"}
                  </div>

                  <div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        sesion.status === "open"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {sesion.status === "open"
                        ? "Abierta"
                        : "Cerrada"}
                    </span>
                  </div>
                </div>
              );
            })
          )}

        </div>

{/* MODAL DETALLE DE CAJA */}

{sesionSeleccionada && (() => {
  const ventasSesion = obtenerVentasSesion(
    sesionSeleccionada.id
  );

  const ingresos = ventasSesion.reduce(
    (suma, venta) => suma + Number(venta.total),
    0
  );

  const ventasEfectivo = ventasSesion.filter(
  (venta) => venta.payment_method === "cash"
);

const ventasTarjeta = ventasSesion.filter(
  (venta) => venta.payment_method === "card"
);

const totalVentasEfectivo = ventasEfectivo.reduce(
  (suma, venta) => suma + Number(venta.total),
  0
);

const totalVentasTarjeta = ventasTarjeta.reduce(
  (suma, venta) => suma + Number(venta.total),
  0
);

  const idsVentasSesion = ventasSesion.map(
  (venta) => venta.id
);

const itemsSesion = items.filter((item) =>
  idsVentasSesion.includes(item.sale_id)
);

const costoProductos = itemsSesion.reduce(
  (suma, item) =>
    suma +
    Number(item.unit_cost) * Number(item.quantity),
  0
);

const utilidadBruta = ingresos - costoProductos;

const efectivoRecibido = ventasEfectivo.reduce(
  (suma, venta) => suma + Number(venta.paid_amount),
  0
);

const cambioEntregado = ventasEfectivo.reduce(
  (suma, venta) => suma + Number(venta.change_due),
  0
);

const efectivoNeto =
  efectivoRecibido - cambioEntregado;

    const movimientosSesion =
  obtenerMovimientosSesion(sesionSeleccionada.id);

const entradasCaja = movimientosSesion
  .filter(
    (movimiento) =>
      movimiento.movement_type === "income"
  )
  .reduce(
    (suma, movimiento) =>
      suma + Number(movimiento.amount),
    0
  );

const salidasCaja = movimientosSesion
  .filter(
    (movimiento) =>
      movimiento.movement_type === "expense"
  )
  .reduce(
    (suma, movimiento) =>
      suma + Number(movimiento.amount),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => setSesionSeleccionada(null)}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Detalle de caja
            </p>

<h2 className="mt-2 text-2xl font-bold text-slate-900">
  {formatoFecha(sesionSeleccionada.opened_at)}
</h2>

</div>

          <button
            onClick={() => setSesionSeleccionada(null)}
            className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* HORARIOS */}

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm text-slate-700">
              Apertura
            </p>

            <p className="mt-1 font-semibold">
              {formatoFecha(sesionSeleccionada.opened_at)}
            </p>

<p className="mt-2 text-xs text-slate-500">
  Abrió:{" "}
  {sesionSeleccionada.opened_by_name ? (
    <>
      {sesionSeleccionada.opened_by_name}
      {sesionSeleccionada.opened_by_role && (
        <>
          {" · "}
          {nombreRol(sesionSeleccionada.opened_by_role)}
        </>
      )}
    </>
  ) : (
    "Responsable no registrado"
  )}
</p>

          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm text-slate-700">
              Cierre
            </p>

            <p className="mt-1 font-semibold">
              {sesionSeleccionada.closed_at
                ? formatoFecha(sesionSeleccionada.closed_at)
                : "Caja abierta"}
            </p>

<p className="mt-2 text-xs text-slate-500">
  Cerró:{" "}
  {sesionSeleccionada.closed_by_name ? (
    <>
      {sesionSeleccionada.closed_by_name}
      {sesionSeleccionada.closed_by_role && (
        <>
          {" · "}
          {nombreRol(sesionSeleccionada.closed_by_role)}
        </>
      )}
    </>
  ) : sesionSeleccionada.status === "open" ? (
    "Caja todavía abierta"
  ) : (
    "Responsable no registrado"
  )}
</p>

          </div>
        </div>

{/* RESUMEN */}

<div className="mt-8">
  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
    Resumen
  </p>

  <div className="mt-4 space-y-3">

    <div className="flex justify-between">
      <span className="text-slate-700">
        Fondo inicial
      </span>

      <span className="font-semibold">
        {formatoDinero(
          Number(sesionSeleccionada.opening_amount)
        )}
      </span>
    </div>

    <div className="flex justify-between">
      <span className="text-slate-700">
        Ventas
      </span>

      <span className="font-semibold">
        {ventasSesion.length}
      </span>
    </div>

    <div className="flex justify-between">
      <span className="text-slate-700">
        Ingresos
      </span>

      <span className="font-semibold">
        {formatoDinero(ingresos)}
      </span>
    </div>

    <div className="flex justify-between">
  <span className="text-slate-700">
    Ventas en efectivo
  </span>

  <span className="font-semibold">
    {formatoDinero(totalVentasEfectivo)}
  </span>
</div>

<div className="flex justify-between">
  <span className="text-slate-700">
    Ventas con tarjeta
  </span>

  <span className="font-semibold text-indigo-600">
    {formatoDinero(totalVentasTarjeta)}
  </span>
</div>

{puedeAdministrar && (
  <>
    <div className="flex justify-between">
      <span className="text-slate-700">
        Costo de productos
      </span>

      <span className="font-semibold">
        {formatoDinero(costoProductos)}
      </span>
    </div>

    <div className="border-t pt-3">
      <div className="flex justify-between">
        <span className="font-bold text-slate-900">
          Utilidad bruta
        </span>

        <span
          className={`font-bold ${
            utilidadBruta >= 0
              ? "text-green-600"
              : "text-red-600"
          }`}
        >
          {formatoDinero(utilidadBruta)}
        </span>
      </div>
    </div>
  </>
)}

  </div>
</div>

        {/* EFECTIVO */}

        <div className="mt-8 rounded-2xl bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Efectivo
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex justify-between">
              <span>Efectivo recibido</span>
              <strong>
                {formatoDinero(efectivoRecibido)}
              </strong>
            </div>

            <div className="flex justify-between">
              <span>Cambio entregado</span>
              <strong>
                {formatoDinero(cambioEntregado)}
              </strong>
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between">
                <span className="font-semibold">
                  Efectivo neto
                </span>

                <strong>
                  {formatoDinero(efectivoNeto)}
                </strong>
              </div>
            </div>

            <div className="flex justify-between">
  <span>Entradas adicionales</span>

  <strong className="text-green-600">
    +{formatoDinero(entradasCaja)}
  </strong>
</div>

<div className="flex justify-between">
  <span>Salidas de efectivo</span>

  <strong className="text-red-600">
    -{formatoDinero(salidasCaja)}
  </strong>
</div>

            <div className="flex justify-between">
              <span>Efectivo esperado</span>

              <strong>
                {formatoDinero(
                  Number(
                    sesionSeleccionada.expected_amount ??
                    Number(sesionSeleccionada.opening_amount) +
  efectivoNeto +
  entradasCaja -
  salidasCaja
                  )
                )}
              </strong>
            </div>

            {sesionSeleccionada.status === "closed" && (
              <>
                <div className="flex justify-between">
                  <span>Efectivo contado</span>

                  <strong>
                    {formatoDinero(
                      Number(
                        sesionSeleccionada.closing_amount ?? 0
                      )
                    )}
                  </strong>
                </div>

                <div className="flex justify-between border-t pt-3">
                  <span className="font-bold">
                    Diferencia
                  </span>

                  <strong
                    className={
                      Number(sesionSeleccionada.difference) < 0
                        ? "text-red-600"
                        : Number(sesionSeleccionada.difference) > 0
                        ? "text-amber-600"
                        : "text-green-600"
                    }
                  >
                    {formatoDinero(
                      Number(
                        sesionSeleccionada.difference ?? 0
                      )
                    )}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>

{/* MOVIMIENTOS DE CAJA */}

<div className="mt-8">
  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
    Movimientos de caja
  </p>

  <div className="mt-4 overflow-hidden rounded-2xl border">
    {movimientosSesion.length === 0 ? (
      <div className="p-6 text-center text-sm text-slate-700">
        No hubo entradas o salidas adicionales.
      </div>
    ) : (
      movimientosSesion.map((movimiento) => (
        <div
          key={movimiento.id}
          className="flex items-center justify-between border-b px-5 py-4 last:border-b-0"
        >
          <div>
            <p className="font-semibold text-slate-900">
              {movimiento.concept}
            </p>

            <p className="mt-1 text-xs text-slate-700">
              {formatoFecha(movimiento.created_at)}
            </p>

{movimiento.user_name ? (
  <p className="mt-1 text-xs text-slate-500">
    {movimiento.user_name}
    {movimiento.user_role && (
      <>
        {" · "}
        {nombreRol(movimiento.user_role)}
      </>
    )}
  </p>
) : (
  <p className="mt-1 text-xs text-slate-400">
    Responsable no registrado
  </p>
)}

          </div>

          <p
            className={`font-bold ${
              movimiento.movement_type === "income"
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {movimiento.movement_type === "income"
              ? "+"
              : "−"}

            {formatoDinero(Number(movimiento.amount))}
          </p>
        </div>
      ))
    )}
  </div>
</div>

        {/* VENTAS */}

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Ventas de esta caja
          </p>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            {ventasSesion.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-700">
                No hay ventas vinculadas a esta sesión.
              </div>
            ) : (
              ventasSesion.map((venta) => (
              <div
  key={venta.id}
  onClick={() => setVentaSeleccionada(venta)}
  className="flex cursor-pointer items-center justify-between border-b px-5 py-4 transition hover:bg-slate-50 last:border-b-0"
>
                  <div>
                    <p className="font-semibold">
                      {venta.number}
                    </p>

                    <p className="mt-1 text-xs text-slate-700">
                      {formatoFecha(venta.created_at)}
                    </p>
                  </div>

                <div className="text-right">
  <p className="font-bold">
    {formatoDinero(Number(venta.total))}
  </p>

  <p className="mt-1 text-xs font-medium text-indigo-600">
    Ver venta →
  </p>
</div>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          onClick={() => setSesionSeleccionada(null)}
          className="mt-8 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
})()}

<DetalleVenta
  venta={ventaSeleccionada}
  items={items}
  onCerrar={() => setVentaSeleccionada(null)}
/>
      </div>
    </main>
  );
}