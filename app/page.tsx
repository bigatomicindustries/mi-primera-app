"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import DetalleVenta from "./components/DetalleVenta";
import { useAuth } from "@/context/AuthContext";

type Venta = {
  id: string;
  number: string;
  total: number;
  paid_amount: number;
  change_due: number;
  payment_method: "cash" | "card";
  created_at: string;
  cash_session_id: string | null;

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

type Producto = {
  id: string;
  name: string;
  stock: number;
  minimum_stock: number;
  branch_id: string;
};

type SesionCaja = {
  id: string;
  opening_amount: number;
  opened_at: string;
  status: "open" | "closed";
};

type MovimientoCaja = {
  id: string;
  cash_session_id: string;
  movement_type: "income" | "expense";
  amount: number;
  concept: string;
  reference_id: string | null;
  created_at: string;
};

export default function Home() {
const {
  negocio,
  puedeAdministrar,
  cargando: cargandoAuth,
  sucursales,
  sucursalActiva,
  cargandoSucursales,
} = useAuth();
const [vistaDashboard, setVistaDashboard] =
  useState<"branch" | "all">("branch");
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [caja, setCaja] = useState<SesionCaja | null>(null);
  const [cajasSucursales, setCajasSucursales] = useState<
  Array<{
    branch_id: string;
    session: SesionCaja | null;
  }>
>([]);
const [ventaSeleccionada, setVentaSeleccionada] =
  useState<Venta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
const [ventasCaja, setVentasCaja] = useState<Venta[]>([]);

const [movimientosCaja, setMovimientosCaja] =
  useState<MovimientoCaja[]>([]);

const cajasAbiertas = cajasSucursales.filter(
  (item) => item.session !== null
).length;

const cajasCerradas =
  cajasSucursales.length - cajasAbiertas;

useEffect(() => {
  if (cargandoAuth || cargandoSucursales) return;

if (!sucursalActiva?.id) {
  setVentas([]);
  setItems([]);
  setProductos([]);
  setCaja(null);
  setVentasCaja([]);
  setMovimientosCaja([]);
  setLoading(false);
  return;
}

const branchId = sucursalActiva.id;

async function cargarDashboard() {
    try {
      setLoading(true);
      setError("");

      // HOY

        const ahora = new Date();

        const inicioDia = new Date(
          ahora.getFullYear(),
          ahora.getMonth(),
          ahora.getDate()
        );

        const finDia = new Date(
          ahora.getFullYear(),
          ahora.getMonth(),
          ahora.getDate() + 1
        );

// VENTAS DE HOY

let ventasTodas: Venta[] = [];

if (vistaDashboard === "all" && puedeAdministrar) {
  const resultados = await Promise.all(
    sucursales.map((sucursal) =>
      supabase.rpc("get_sales_history", {
        p_branch_id: sucursal.id,
      })
    )
  );

  const errorVentas = resultados.find(
    (resultado) => resultado.error
  )?.error;

  if (errorVentas) throw errorVentas;

  ventasTodas = resultados.flatMap(
    (resultado) => (resultado.data as Venta[]) ?? []
  );
} else {
  const { data, error } = await supabase.rpc(
    "get_sales_history",
    {
      p_branch_id: branchId,
    }
  );

  if (error) throw error;

  ventasTodas = (data as Venta[]) ?? [];
}

const ventasHoy = ((ventasTodas as Venta[]) ?? []).filter(
  (venta) => {
    const fechaVenta = new Date(venta.created_at);

    return (
      fechaVenta >= inicioDia &&
      fechaVenta < finDia
    );
  }
);

setVentas(ventasHoy);

        // ITEMS DE LAS VENTAS DE HOY

if (ventasHoy.length > 0) {
  const idsVentas = ventasHoy.map(
    (venta) => venta.id
  );

  const { data: itemsData, error: itemsError } =
    await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, name, quantity, unit_price"
      )
      .in("sale_id", idsVentas);

  if (itemsError) throw itemsError;

  if (puedeAdministrar) {
    const {
      data: costosData,
      error: costosError,
    } = await supabase.rpc("get_sale_item_costs", {
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

    const itemsConCosto: ItemVenta[] =
      (itemsData ?? []).map((item) => ({
        ...item,
        unit_cost:
          costosPorVentaProducto.get(
            `${item.sale_id}:${item.product_id ?? "null"}`
          ) ?? 0,
      }));

    setItems(itemsConCosto);
  } else {
    const itemsSinCosto: ItemVenta[] =
      (itemsData ?? []).map((item) => ({
        ...item,
        unit_cost: 0,
      }));

    setItems(itemsSinCosto);
  }
} else {
  setItems([]);
}

// INVENTARIO

let consultaInventario = supabase
  .from("branch_inventory")
  .select(`
    branch_id,
    stock,
    minimum_stock,
    products!inner (
      id,
      name
    )
  `);

if (!(vistaDashboard === "all" && puedeAdministrar)) {
  consultaInventario = consultaInventario.eq(
    "branch_id",
    branchId
  );
}

const { data: inventarioData, error: productosError } =
  await consultaInventario;

if (productosError) throw productosError;

const productosData: Producto[] = (inventarioData ?? []).map(
  (item) => {
    const producto = Array.isArray(item.products)
      ? item.products[0]
      : item.products;

    return {
      id: producto.id,
      name: producto.name,
      stock: Number(item.stock),
      minimum_stock: Number(item.minimum_stock),
      branch_id: item.branch_id,
    };
  }
);

setProductos(productosData);

// CAJA ABIERTA

let cajaData: SesionCaja | null = null;

if (vistaDashboard === "all" && puedeAdministrar) {
  const resultadosCajas = await Promise.all(
    sucursales.map(async (sucursal) => {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select(
          "id, opening_amount, opened_at, status"
        )
        .eq("branch_id", sucursal.id)
        .eq("status", "open")
        .maybeSingle();

      if (error) throw error;

      return {
        branch_id: sucursal.id,
        session: data as SesionCaja | null,
      };
    })
  );

  setCajasSucursales(resultadosCajas);
  setCaja(null);
} else {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select(
      "id, opening_amount, opened_at, status"
    )
    .eq("branch_id", branchId)
    .eq("status", "open")
    .maybeSingle();

  if (error) throw error;

  cajaData = data as SesionCaja | null;

  setCaja(cajaData);
  setCajasSucursales([]);
}

        if (cajaData) {
  // Ventas pertenecientes a la caja actualmente abierta
  const { data: ventasCajaData, error: ventasCajaError } =
    await supabase
      .from("sales")
      .select(
        "id, number, total, paid_amount, change_due, payment_method, created_at, cash_session_id"
      )
      .eq("cash_session_id", cajaData.id)
      .order("created_at", { ascending: false });

  if (ventasCajaError) throw ventasCajaError;

  setVentasCaja(
    ((ventasCajaData as Venta[]) ?? [])
  );

  // Entradas y salidas pertenecientes a esta caja
  const {
    data: movimientosData,
    error: movimientosError,
  } = await supabase.rpc("get_cash_movements", {
    p_cash_session_id: cajaData.id,
  });

  if (movimientosError) throw movimientosError;

  setMovimientosCaja(
    (movimientosData as MovimientoCaja[]) ?? []
  );
} else {
  setVentasCaja([]);
  setMovimientosCaja([]);
}

      } catch (error: any) {
        console.error(
          "Error al cargar dashboard:",
          error
        );

        setError(
          error?.message ||
            "No se pudo cargar el dashboard."
        );
      } finally {
        setLoading(false);
      }
    }

cargarDashboard();

}, [
  cargandoAuth,
  cargandoSucursales,
  sucursalActiva?.id,
  puedeAdministrar,
  vistaDashboard,
]);

  // -----------------------------
  // CÁLCULOS
  // -----------------------------

  const ingresos = ventas.reduce(
    (suma, venta) =>
      suma + Number(venta.total),
    0
  );

  const costoProductos = items.reduce(
    (suma, item) =>
      suma +
      Number(item.unit_cost) *
        Number(item.quantity),
    0
  );

  const utilidadBruta =
    ingresos - costoProductos;

  const ticketPromedio =
    ventas.length > 0
      ? ingresos / ventas.length
      : 0;

     const ventasEfectivoCaja = ventasCaja.filter(
  (venta) => venta.payment_method === "cash"
);

const efectivoRecibidoCaja = ventasEfectivoCaja.reduce(
  (suma, venta) =>
    suma + Number(venta.paid_amount),
  0
);

const cambioEntregadoCaja = ventasEfectivoCaja.reduce(
  (suma, venta) =>
    suma + Number(venta.change_due),
  0
);

const efectivoNetoCaja =
  efectivoRecibidoCaja - cambioEntregadoCaja;

const entradasCaja = movimientosCaja
  .filter(
    (movimiento) =>
      movimiento.movement_type === "income"
  )
  .reduce(
    (suma, movimiento) =>
      suma + Number(movimiento.amount),
    0
  );

const salidasCaja = movimientosCaja
  .filter(
    (movimiento) =>
      movimiento.movement_type === "expense"
  )
  .reduce(
    (suma, movimiento) =>
      suma + Number(movimiento.amount),
    0
  );

const efectivoEsperadoCaja =
  Number(caja?.opening_amount ?? 0) +
  efectivoNetoCaja +
  entradasCaja -
  salidasCaja;

  const productosStockBajo =
    productos.filter(
      (producto) =>
        Number(producto.stock) <=
        Number(producto.minimum_stock)
    );

    const alertasPorSucursal = sucursales.map((sucursal) => ({
  id: sucursal.id,
  name: sucursal.name,
  cantidad: productosStockBajo.filter(
    (producto) => producto.branch_id === sucursal.id
  ).length,
}));

  const formatoDinero = (cantidad: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(cantidad);

  const formatoHora = (fecha: string) =>
    new Date(fecha).toLocaleTimeString(
      "es-MX",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-500">
            Cargando dashboard...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">

        {/* ENCABEZADO */}

        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">

          <div>
<p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
  {negocio?.name
    ? `${negocio.name} POS`
    : "MI NEGOCIO POS"}
</p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Dashboard
            </h1>

            <p className="mt-2 text-slate-500">
              Resumen de la operación de hoy.
            </p>

            {puedeAdministrar && (
  <div className="mt-4 flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={() => setVistaDashboard("all")}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        vistaDashboard === "all"
          ? "bg-slate-900 text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      Todas las sucursales
    </button>

    <button
      type="button"
      onClick={() => setVistaDashboard("branch")}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        vistaDashboard === "branch"
          ? "bg-slate-900 text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {sucursalActiva?.name ?? "Sucursal actual"}
    </button>
  </div>
)}

          </div>

          <Link
            href="/ventas"
            className="rounded-xl bg-indigo-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-indigo-700"
          >
            + Nueva venta
          </Link>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            {error}
          </div>
        )}

        {/* MÉTRICAS */}

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ventas de hoy
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {ventas.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ingresos
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatoDinero(ingresos)}
            </p>
          </div>

{puedeAdministrar && (
          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Utilidad bruta
            </p>

            <p
              className={`mt-2 text-3xl font-bold ${
                utilidadBruta >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {formatoDinero(utilidadBruta)}
            </p>
  </div>
)}

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ticket promedio
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatoDinero(ticketPromedio)}
            </p>
          </div>

        </div>

{/* ACCIONES RÁPIDAS */}

<div className="mt-6">
  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
    Acciones rápidas
  </p>

  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

    <Link
      href="/ventas"
      className="group rounded-2xl border bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl">
          🛒
        </div>

        <div>
          <p className="font-bold text-slate-900">
            Nueva venta
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Registrar una venta
          </p>
        </div>
      </div>
    </Link>

{puedeAdministrar && (
  <Link
    href="/inventario"
    className="group rounded-2xl border bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
  >
    <div className="flex items-center gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl">
        📦
      </div>

      <div>
        <p className="font-bold text-slate-900">
          Agregar existencias
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Entrada de mercancía
        </p>
      </div>
    </div>
  </Link>
)}

    <Link
  href="/historial"
  className="group rounded-2xl border bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
>
  <div className="flex items-center gap-4">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl">
      🧾
    </div>

    <div>
      <p className="font-bold text-slate-900">
        Historial
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Consultar ventas
      </p>
    </div>
  </div>
</Link>

    <Link
      href="/caja"
      className="group rounded-2xl border bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${
            caja
              ? "bg-green-50"
              : "bg-slate-100"
          }`}
        >
          💵
        </div>

        <div>
          <p className="font-bold text-slate-900">
            {caja ? "Ver caja" : "Abrir caja"}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {caja
              ? "Caja actualmente abierta"
              : "Iniciar turno de caja"}
          </p>
        </div>
      </div>
    </Link>

  </div>
</div>

        {/* CAJA + INVENTARIO */}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">

{/* CAJA */}

<div className="rounded-2xl border bg-white p-6">
  {vistaDashboard === "all" && puedeAdministrar ? (
    // VISTA GLOBAL
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            Estado de cajas
          </p>

          <p className="mt-3 text-2xl font-bold text-slate-900">
            {cajasAbiertas}{" "}
            {cajasAbiertas === 1 ? "abierta" : "abiertas"}
            {" · "}
            {cajasCerradas}{" "}
            {cajasCerradas === 1 ? "cerrada" : "cerradas"}
          </p>
        </div>

        <Link
          href="/historial-cajas"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Ver historial →
        </Link>
      </div>

      <div className="mt-5 divide-y">
        {sucursales.map((sucursal) => {
          const estadoSucursal = cajasSucursales.find(
            (item) => item.branch_id === sucursal.id
          );

          const abierta = Boolean(
            estadoSucursal?.session
          );

          return (
            <div
              key={sucursal.id}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    abierta
                      ? "bg-green-500"
                      : "bg-slate-300"
                  }`}
                />

                <span className="font-medium text-slate-700">
                  {sucursal.name}
                </span>
              </div>

              <span
                className={`text-sm font-semibold ${
                  abierta
                    ? "text-green-600"
                    : "text-slate-500"
                }`}
              >
                {abierta ? "Abierta" : "Cerrada"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    // VISTA DE UNA SUCURSAL
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-slate-500">
          Estado de caja
        </p>

        <div className="mt-3 flex items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${
              caja
                ? "bg-green-500"
                : "bg-slate-300"
            }`}
          />

          <p className="text-2xl font-bold">
            {caja ? "Caja abierta" : "Caja cerrada"}
          </p>
        </div>

        {caja && (
          <div className="mt-3">
            <p className="text-sm text-slate-500">
              Fondo inicial:{" "}
              {formatoDinero(
                Number(caja.opening_amount)
              )}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Ventas en esta caja: {ventasCaja.length}
            </p>

            <p className="mt-3 text-sm text-slate-500">
              Efectivo esperado
            </p>

            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatoDinero(efectivoEsperadoCaja)}
            </p>
          </div>
        )}
      </div>

      <Link
        href="/caja"
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Ver caja →
      </Link>
    </div>
  )}
</div>
          {/* STOCK BAJO */}

          <div className="rounded-2xl border bg-white p-6">

            <div className="flex items-start justify-between gap-4">

<div>
  <p className="text-sm text-slate-500">
    {vistaDashboard === "all"
      ? "Alertas de inventario"
      : "Productos con stock bajo"}
  </p>

  <p
    className={`mt-2 text-3xl font-bold ${
      productosStockBajo.length > 0
        ? "text-red-600"
        : "text-green-600"
    }`}
  >
    {productosStockBajo.length}
  </p>

  {vistaDashboard === "all" ? (
    <div className="mt-3 space-y-1">
      {alertasPorSucursal.map((sucursal) => (
        <div
          key={sucursal.id}
          className="flex items-center justify-between gap-6 text-sm"
        >
          <span className="text-slate-500">
            {sucursal.name}
          </span>

          <span
            className={
              sucursal.cantidad > 0
                ? "font-semibold text-red-600"
                : "font-semibold text-green-600"
            }
          >
            {sucursal.cantidad}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <p className="mt-1 text-sm text-slate-400">
      de {productos.length} productos
    </p>
  )}
</div>

              <Link
                href="/inventario"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Ver inventario →
              </Link>

            </div>

          </div>

        </div>

        {/* PARTE INFERIOR */}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* ÚLTIMAS VENTAS */}

          <div className="overflow-hidden rounded-2xl border bg-white">

            <div className="border-b px-6 py-5">
              <h2 className="font-bold text-slate-900">
                Últimas ventas
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Ventas realizadas hoy.
              </p>
            </div>

            {ventas.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-slate-500">
                  Aún no hay ventas hoy.
                </p>
              </div>
            ) : (
              ventas.slice(0, 5).map((venta) => (
  <button
    key={venta.id}
    type="button"
    onClick={() => setVentaSeleccionada(venta)}
    className="flex w-full items-center justify-between border-b px-6 py-4 text-left transition hover:bg-slate-50 last:border-b-0"
  >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {venta.number}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {formatoHora(
                        venta.created_at
                      )}
                    </p>
                  </div>

                  <div className="text-right">
  <p className="font-bold">
    {formatoDinero(
      Number(venta.total)
    )}
  </p>

  <p className="mt-1 text-xs font-medium text-indigo-600">
    Ver detalle →
  </p>
</div>
                </button>
              ))
            )}

          </div>

          {/* ALERTAS DE INVENTARIO */}

          <div className="overflow-hidden rounded-2xl border bg-white">

            <div className="border-b px-6 py-5">
              <h2 className="font-bold text-slate-900">
                Inventario
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Productos que requieren atención.
              </p>
            </div>

            {productosStockBajo.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="font-medium text-green-600">
                  Inventario saludable
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  No hay productos con stock bajo.
                </p>
              </div>
            ) : (
              productosStockBajo
                .slice(0, 5)
                .map((producto) => (
                  <div
                    key={producto.id}
                    className="flex items-center justify-between border-b px-6 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {producto.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Mínimo:{" "}
                        {producto.minimum_stock}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-red-600">
                        {producto.stock}
                      </p>

                      <p className="text-xs text-slate-400">
                        unidades
                      </p>
                    </div>
                  </div>
                ))
            )}

          </div>

                </div>

      </div>

      <DetalleVenta
        venta={ventaSeleccionada}
        items={items}
        onCerrar={() => setVentaSeleccionada(null)}
      />

    </main>
  );
}