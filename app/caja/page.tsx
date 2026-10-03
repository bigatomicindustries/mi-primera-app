"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
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
};

type Venta = {
  id: string;
  total: number;
  paid_amount: number;
  change_due: number;
  payment_method: "cash" | "card";
  created_at: string;
};

type MovimientoCaja = {
  id: string;
  cash_session_id: string;
  movement_type: "income" | "expense";
  amount: number;
  concept: string;
  reference_id: string | null;
  created_at: string;

  user_id: string | null;
  user_name: string | null;
  user_role: "admin" | "manager" | "cashier" | null;
};

 type ItemVenta = {
  quantity: number;
  unit_cost: number;
};

export default function CajaPage() {
const {
  puedeAdministrar,
  sucursalActiva,
  cargando: cargandoAuth,
  cargandoSucursales,
} = useAuth();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sesionCaja, setSesionCaja] = useState<SesionCaja | null>(null);
const [fondoInicial, setFondoInicial] = useState("");
const [abriendoCaja, setAbriendoCaja] = useState(false);
const [mostrarCierre, setMostrarCierre] = useState(false);
const [efectivoContado, setEfectivoContado] = useState("");
const [cerrandoCaja, setCerrandoCaja] = useState(false);
const [movimientosCaja, setMovimientosCaja] =
  useState<MovimientoCaja[]>([]);

const [mostrarMovimiento, setMostrarMovimiento] = useState(false);

const [tipoMovimiento, setTipoMovimiento] =
  useState<"income" | "expense">("income");

const [montoMovimiento, setMontoMovimiento] = useState("");
const [conceptoMovimiento, setConceptoMovimiento] = useState("");
const [guardandoMovimiento, setGuardandoMovimiento] = useState(false);

useEffect(() => {
  if (cargandoAuth || cargandoSucursales) return;

  if (!sucursalActiva) {
    setSesionCaja(null);
    setVentas([]);
    setItems([]);
    setMovimientosCaja([]);
    setLoading(false);
    return;
  }

  const branchId = sucursalActiva.id;

  async function cargarCaja() {
      setLoading(true);
      setError("");
const { data: sesionData, error: sesionError } = await supabase
  .from("cash_sessions")
  .select("*")
.eq("branch_id", branchId)
  .eq("status", "open")
  .maybeSingle();

if (sesionError) {
  console.error(sesionError);
  setError(sesionError.message);
  setLoading(false);
  return;
}

setSesionCaja(sesionData);

let movimientosData: MovimientoCaja[] = [];

if (sesionData) {
  const { data, error: movimientosError } =
    await supabase.rpc("get_cash_movements", {
      p_cash_session_id: sesionData.id,
    });

  if (movimientosError) {
    console.error(movimientosError);
    setError(movimientosError.message);
    setLoading(false);
    return;
  }

  movimientosData =
    (data as MovimientoCaja[]) ?? [];
}

setMovimientosCaja(movimientosData);

      // Inicio del día actual
// Ventas pertenecientes a la sesión de caja actual
let ventasData: Venta[] = [];
let ventasError = null;

if (sesionData) {
  const resultado = await supabase
    .from("sales")
    .select(
  "id, total, paid_amount, change_due, payment_method, created_at"
)
    .eq("cash_session_id", sesionData.id)
    .order("created_at", { ascending: false });

  ventasData = resultado.data ?? [];
  ventasError = resultado.error;
}

      if (ventasError) {
        console.error(ventasError);
        setError(ventasError.message);
        setLoading(false);
        return;
      }

      const ventasHoy = ventasData ?? [];
      setVentas(ventasHoy);

      // Obtener costos solamente de las ventas de hoy
if (ventasHoy.length > 0 && puedeAdministrar) {
  const idsVentas = ventasHoy.map((venta) => venta.id);

  const { data: itemsData, error: itemsError } =
    await supabase.rpc("get_sale_item_costs", {
      p_sale_ids: idsVentas,
    });

  if (itemsError) {
    console.error(itemsError);
    setError(itemsError.message);
    setLoading(false);
    return;
  }

setItems(
  (itemsData ?? []).map(
    (item: { quantity: number; unit_cost: number }) => ({
      quantity: Number(item.quantity),
      unit_cost: Number(item.unit_cost),
    })
  )
);
} else {
  setItems([]);
}

      setLoading(false);
    }

cargarCaja();
}, [
  cargandoAuth,
  cargandoSucursales,
  puedeAdministrar,
  sucursalActiva?.id,
]);

async function abrirCaja() {
  if (cargandoSucursales) {
  setError("Espera a que termine de cargar la sucursal");
  return;
}

if (!sucursalActiva) {
  setError("No hay una sucursal activa seleccionada");
  return;
}
  const monto = Number(fondoInicial);

  if (fondoInicial === "" || Number.isNaN(monto) || monto < 0) {
    setError("Ingresa un fondo inicial válido");
    return;
  }

  try {
    setAbriendoCaja(true);
    setError("");

const { data, error } = await supabase.rpc(
  "open_cash_session",
  {
    p_opening_amount: monto,
    p_branch_id: sucursalActiva.id,
  }
);

    if (error) {
      throw error;
    }

    setSesionCaja(data);
    setFondoInicial("");
    setVentas([]);
setItems([]);
  } catch (error: any) {
    console.error("ERROR AL ABRIR CAJA:", error);

    setError(
      error?.message ||
        error?.details ||
        error?.hint ||
        JSON.stringify(error)
    );
  } finally {
    setAbriendoCaja(false);
  }
}

async function registrarMovimiento() {
  if (!sesionCaja) return;

  const monto = Number(montoMovimiento);
  const concepto = conceptoMovimiento.trim();

  if (
    montoMovimiento === "" ||
    Number.isNaN(monto) ||
    monto <= 0
  ) {
    setError("Ingresa una cantidad válida.");
    return;
  }

  if (!concepto) {
    setError("Escribe el concepto del movimiento.");
    return;
  }

if (tipoMovimiento === "expense" && monto > efectivoEsperado) {
  setError(
    `No puedes retirar ${formatoDinero(monto)}. ` +
    `El efectivo disponible en caja es ${formatoDinero(efectivoEsperado)}.`
  );
  return;
}

  try {
    setGuardandoMovimiento(true);
    setError("");

const { data, error } = await supabase.rpc(
  "register_cash_movement",
  {
    p_cash_session_id: sesionCaja.id,
    p_movement_type: tipoMovimiento,
    p_amount: monto,
    p_concept: concepto,
    p_reference_id: null,
  }
);

    if (error) throw error;

const { data: movimientosActualizados, error: movimientosError } =
  await supabase.rpc("get_cash_movements", {
    p_cash_session_id: sesionCaja.id,
  });

if (movimientosError) {
  console.error(
    "Error actualizando movimientos de caja:",
    movimientosError
  );
} else {
  setMovimientosCaja(
    (movimientosActualizados as MovimientoCaja[]) ?? []
  );
}

    setMontoMovimiento("");
    setConceptoMovimiento("");
    setMostrarMovimiento(false);
  } catch (error: any) {
    console.error("Error al registrar movimiento:", error);

    setError(
      error?.message ||
        "No se pudo registrar el movimiento."
    );
  } finally {
    setGuardandoMovimiento(false);
  }
}

async function cerrarCaja() {
  if (!sesionCaja) return;

  if (
    efectivoContado === "" ||
    Number.isNaN(Number(efectivoContado)) ||
    Number(efectivoContado) < 0
  ) {
    setError(
      "Ingresa una cantidad válida de efectivo contado."
    );
    return;
  }

  const contadoFinal = Number(efectivoContado);

  try {
    setCerrandoCaja(true);
    setError("");

    const { error } = await supabase.rpc(
      "close_cash_session",
      {
        p_cash_session_id: sesionCaja.id,
        p_closing_amount: contadoFinal,
      }
    );

    if (error) {
      throw error;
    }

    setSesionCaja(null);
    setMostrarCierre(false);
    setEfectivoContado("");
    setVentas([]);
    setItems([]);
  } catch (error: any) {
    console.error(
      "Error al cerrar caja:",
      error
    );

    setError(
      error?.message ||
        "No se pudo cerrar la caja."
    );
  } finally {
    setCerrandoCaja(false);
  }

  }

const ingresos = ventas.reduce(
  (suma, venta) => suma + Number(venta.total),
  0
);

const ventasEfectivo = ventas.filter(
  (venta) => venta.payment_method === "cash"
);

const ventasTarjeta = ventas.filter(
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

const efectivoRecibido = ventasEfectivo.reduce(
  (suma, venta) => suma + Number(venta.paid_amount),
  0
);

const cambioEntregado = ventasEfectivo.reduce(
  (suma, venta) => suma + Number(venta.change_due),
  0
);

  const efectivoNeto = efectivoRecibido - cambioEntregado;

const entradasCaja = movimientosCaja
  .filter(
    (movimiento) => movimiento.movement_type === "income"
  )
  .reduce(
    (suma, movimiento) =>
      suma + Number(movimiento.amount),
    0
  );

const salidasCaja = movimientosCaja
  .filter(
    (movimiento) => movimiento.movement_type === "expense"
  )
  .reduce(
    (suma, movimiento) =>
      suma + Number(movimiento.amount),
    0
  );

const efectivoEsperado =
  Number(sesionCaja?.opening_amount ?? 0) +
  efectivoNeto +
  entradasCaja -
  salidasCaja;

const contado = Number(efectivoContado) || 0;

const diferencia = contado - efectivoEsperado;

  const costoProductos = items.reduce(
    (suma, item) =>
      suma + Number(item.unit_cost) * Number(item.quantity),
    0
  );

  const utilidadBruta = ingresos - costoProductos;

  const ticketPromedio =
    ventas.length > 0 ? ingresos / ventas.length : 0;

  const formatoDinero = (cantidad: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(cantidad);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-500">Cargando caja...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-10">
      <div className="mx-auto max-w-6xl">

        <p className="text-sm font-medium text-indigo-600">
          MI NEGOCIO POS
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Caja
        </h1>

        <p className="mt-2 text-slate-500">
          Resumen de ventas de hoy
        </p>

        {/* ESTADO DE CAJA */}
{!sesionCaja ? (
  <div className="mt-8 rounded-2xl border bg-white p-6">
    <div className="flex items-center gap-3">
      <span className="h-3 w-3 rounded-full bg-red-500"></span>

      <h2 className="text-lg font-bold">
        Caja cerrada
      </h2>
    </div>

    <p className="mt-2 text-sm text-slate-500">
      Ingresa el fondo inicial para comenzar el turno.
    </p>

    <div className="mt-6 max-w-sm">
      <label className="text-sm font-medium text-slate-700">
        Fondo inicial
      </label>

      <div className="relative mt-2">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
          $
        </span>

        <input
          type="number"
          min="0"
          step="0.01"
          value={fondoInicial}
          onChange={(e) => setFondoInicial(e.target.value)}
          placeholder="500.00"
          className="w-full rounded-xl border px-8 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      <button
        onClick={abrirCaja}
        disabled={abriendoCaja}
        className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
      >
        {abriendoCaja ? "Abriendo..." : "Abrir caja"}
      </button>
    </div>
  </div>
) : (
  <div className="mt-8 rounded-2xl border bg-white p-6">
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-green-500"></span>

          <h2 className="text-lg font-bold">
            Caja abierta
          </h2>
        </div>

        <p className="mt-2 text-sm text-slate-500">
          Abierta el{" "}
          {new Date(sesionCaja.opened_at).toLocaleString("es-MX")}
        </p>
      </div>

      <div className="text-right">
  <button
    onClick={() => {
      setEfectivoContado("");
      setMostrarCierre(true);
    }}
    className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
  >
    Cerrar caja
  </button>
</div>

    </div>
  </div>
)}

        {error && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="mt-10 grid gap-5 md:grid-cols-3">

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ventas realizadas
            </p>

            <p className="mt-2 text-3xl font-bold">
              {ventas.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ingresos
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatoDinero(ingresos)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ticket promedio
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatoDinero(ticketPromedio)}
            </p>
          </div>

{puedeAdministrar && (
  <>
    <div className="rounded-2xl border bg-white p-6">
      <p className="text-sm text-slate-500">
        Costo de productos
      </p>

      <p className="mt-2 text-3xl font-bold">
        {formatoDinero(costoProductos)}
      </p>
    </div>

    <div className="rounded-2xl border bg-white p-6">
      <p className="text-sm text-slate-500">
        Utilidad bruta
      </p>

      <p className="mt-2 text-3xl font-bold text-green-600">
        {formatoDinero(utilidadBruta)}
      </p>
    </div>
  </>
)}

        </div>

        {/* VENTAS POR MÉTODO DE PAGO */}

<div className="mt-8 rounded-2xl border bg-white p-6">
  <div>
    <h2 className="text-lg font-bold">
      Ventas por método de pago
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Distribución de las ventas de esta sesión.
    </p>
  </div>

  <div className="mt-6 grid gap-4 sm:grid-cols-2">

    {/* EFECTIVO */}
    <div className="rounded-2xl bg-slate-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Efectivo
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatoDinero(totalVentasEfectivo)}
          </p>
        </div>

        <div className="text-3xl">
          💵
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {ventasEfectivo.length}{" "}
        {ventasEfectivo.length === 1 ? "venta" : "ventas"}
      </p>
    </div>

    {/* TARJETA */}
    <div className="rounded-2xl bg-slate-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Tarjeta
          </p>

          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {formatoDinero(totalVentasTarjeta)}
          </p>
        </div>

        <div className="text-3xl">
          💳
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {ventasTarjeta.length}{" "}
        {ventasTarjeta.length === 1 ? "venta" : "ventas"}
      </p>
    </div>

  </div>
</div>

{/* MOVIMIENTO DE EFECTIVO */}

<div className="mt-8 rounded-2xl border bg-white p-6">
  <h2 className="text-lg font-bold">
    Movimiento de efectivo
  </h2>

  <div className="mt-6 space-y-4">
    <div className="flex justify-between">
      <span className="text-slate-500">
        Efectivo recibido
      </span>

      <span className="font-semibold">
        {formatoDinero(efectivoRecibido)}
      </span>
    </div>

    <div className="flex justify-between">
      <span className="text-slate-500">
        Cambio entregado
      </span>

      <span className="font-semibold">
        {formatoDinero(cambioEntregado)}
      </span>
    </div>

    <div className="flex justify-between border-t pt-4">
      <span className="font-bold">
        Efectivo neto de ventas
      </span>

      <span className="text-xl font-bold">
        {formatoDinero(efectivoNeto)}
      </span>
    </div>

    {sesionCaja && (
      <>
        <div className="flex justify-between border-t pt-4">
          <span className="text-slate-500">
            Entradas adicionales
          </span>

          <span className="font-semibold text-green-600">
            +{formatoDinero(entradasCaja)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">
            Salidas de efectivo
          </span>

          <span className="font-semibold text-red-600">
            -{formatoDinero(salidasCaja)}
          </span>
        </div>

        <div className="flex justify-between border-t pt-4">
          <span className="font-bold">
            Efectivo esperado
          </span>

          <span className="text-xl font-bold">
            {formatoDinero(efectivoEsperado)}
          </span>
        </div>

        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setTipoMovimiento("income");
              setMontoMovimiento("");
              setConceptoMovimiento("");
              setMostrarMovimiento(true);
            }}
            className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
          >
            + Registrar entrada
          </button>

          <button
            type="button"
            onClick={() => {
              setTipoMovimiento("expense");
              setMontoMovimiento("");
              setConceptoMovimiento("");
              setMostrarMovimiento(true);
            }}
            className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700"
          >
            − Registrar salida
          </button>
        </div>
      </>
    )}
  </div>
</div>


{/* HISTORIAL DE MOVIMIENTOS DE CAJA */}

{sesionCaja && (
  <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
    <div className="border-b px-6 py-5">
      <h2 className="text-lg font-bold">
        Movimientos de caja
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Entradas y salidas adicionales de esta sesión.
      </p>
    </div>

    {movimientosCaja.length === 0 ? (
      <div className="px-6 py-10 text-center text-sm text-slate-500">
        Todavía no hay movimientos adicionales.
      </div>
    ) : (
      movimientosCaja.map((movimiento) => (
        <div
          key={movimiento.id}
          className="flex items-center justify-between border-b px-6 py-4 last:border-b-0"
        >
          <div>
            <p className="font-semibold">
              {movimiento.concept}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {new Date(
                movimiento.created_at
              ).toLocaleString("es-MX")}
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
)}
      </div>

      {mostrarMovimiento && sesionCaja && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onClick={() => setMostrarMovimiento(false)}
  >
    <div
      className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p
        className={`text-sm font-semibold ${
          tipoMovimiento === "income"
            ? "text-green-600"
            : "text-red-600"
        }`}
      >
        {tipoMovimiento === "income"
          ? "ENTRADA DE EFECTIVO"
          : "SALIDA DE EFECTIVO"}
      </p>

      <h2 className="mt-1 text-2xl font-bold">
        {tipoMovimiento === "income"
          ? "Agregar dinero a caja"
          : "Retirar dinero de caja"}
      </h2>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Cantidad
      </label>

      <div className="relative mt-2">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
          $
        </span>

        <input
          type="number"
          min="0.01"
          step="0.01"
          autoFocus
          value={montoMovimiento}
          onChange={(e) =>
            setMontoMovimiento(e.target.value)
          }
          placeholder="0.00"
          className="w-full rounded-xl border px-8 py-3 text-lg font-semibold outline-none focus:border-indigo-500"
        />
      </div>

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Concepto
      </label>

      <input
        type="text"
        value={conceptoMovimiento}
        onChange={(e) =>
          setConceptoMovimiento(e.target.value)
        }
        placeholder={
          tipoMovimiento === "income"
            ? "Ej. Cambio agregado a caja"
            : "Ej. Pago a proveedor"
        }
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
      />

      <button
        type="button"
        onClick={registrarMovimiento}
        disabled={guardandoMovimiento}
        className={`mt-6 w-full rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50 ${
          tipoMovimiento === "income"
            ? "bg-green-600 hover:bg-green-700"
            : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {guardandoMovimiento
          ? "Guardando..."
          : tipoMovimiento === "income"
          ? "Registrar entrada"
          : "Registrar salida"}
      </button>

      <button
        type="button"
        onClick={() => setMostrarMovimiento(false)}
        disabled={guardandoMovimiento}
        className="mt-2 w-full rounded-xl px-5 py-3 font-medium text-slate-500 hover:bg-slate-50"
      >
        Cancelar
      </button>
    </div>
  </div>
)}

{mostrarCierre && sesionCaja && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">

      <p className="text-sm font-semibold text-indigo-600">
        CIERRE DE CAJA
      </p>

      <h2 className="mt-1 text-2xl font-bold">
        Contar efectivo
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        Ingresa cuánto dinero hay físicamente en caja.
      </p>

<div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-5">

  {/* FONDO INICIAL */}
  <div className="flex justify-between">
    <span className="text-slate-500">
      Fondo inicial
    </span>

    <span className="font-semibold">
      {formatoDinero(Number(sesionCaja.opening_amount))}
    </span>
  </div>

  {/* VENTAS EN EFECTIVO */}
  <div className="flex justify-between">
    <span className="text-slate-500">
      Ventas en efectivo
    </span>

    <span className="font-semibold">
      {formatoDinero(efectivoNeto)}
    </span>
  </div>

  {/* VENTAS CON TARJETA */}
  <div className="flex justify-between">
    <span className="text-slate-500">
      Ventas con tarjeta
    </span>

    <span className="font-semibold text-indigo-600">
      {formatoDinero(totalVentasTarjeta)}
    </span>
  </div>

  {/* VENTAS TOTALES */}
  <div className="flex justify-between border-t pt-3">
    <span className="font-medium text-slate-700">
      Ventas totales
    </span>

    <span className="font-semibold">
      {formatoDinero(ingresos)}
    </span>
  </div>

  {/* ENTRADAS */}
  <div className="flex justify-between">
    <span className="text-slate-500">
      Entradas
    </span>

    <span className="font-semibold text-green-600">
      +{formatoDinero(entradasCaja)}
    </span>
  </div>

  {/* SALIDAS */}
  <div className="flex justify-between">
    <span className="text-slate-500">
      Salidas
    </span>

    <span className="font-semibold text-red-600">
      -{formatoDinero(salidasCaja)}
    </span>
  </div>

  {/* EFECTIVO FÍSICO ESPERADO */}
  <div className="flex justify-between border-t pt-3">
    <span className="font-bold">
      Efectivo físico esperado
    </span>

    <span className="text-xl font-bold">
      {formatoDinero(efectivoEsperado)}
    </span>
  </div>

</div>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Efectivo contado
      </label>

      <div className="relative mt-2">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
          $
        </span>

        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={efectivoContado}
          onChange={(e) => {
            const valor = e.target.value;

            if (/^\d*\.?\d{0,2}$/.test(valor)) {
              setEfectivoContado(valor);
            }
          }}
          placeholder="0.00"
          className="w-full rounded-xl border px-8 py-4 text-2xl font-bold outline-none focus:border-indigo-500"
        />
      </div>

      {efectivoContado !== "" && (
        <div className="mt-5 rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Diferencia</span>

            <span
              className={`text-xl font-bold ${
                diferencia === 0
                  ? "text-green-600"
                  : diferencia < 0
                  ? "text-red-600"
                  : "text-amber-600"
              }`}
            >
              {diferencia > 0 ? "+" : ""}
              {formatoDinero(diferencia)}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {diferencia === 0
              ? "La caja está cuadrada."
              : diferencia < 0
              ? "Hay un faltante de efectivo."
              : "Hay un sobrante de efectivo."}
          </p>
        </div>
      )}

      <button
        onClick={cerrarCaja}
        disabled={cerrandoCaja || efectivoContado === ""}
        className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-4 font-semibold text-white disabled:opacity-40"
      >
        {cerrandoCaja ? "Cerrando..." : "Confirmar cierre"}
      </button>

      <button
        onClick={() => {
          setMostrarCierre(false);
          setEfectivoContado("");
        }}
        disabled={cerrandoCaja}
        className="mt-2 w-full rounded-xl px-5 py-3 font-medium text-slate-500 hover:bg-slate-50"
      >
        Cancelar
      </button>

    </div>
  </div>
)}

    </main>
  );
}