"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

type ProductoTransferencia = {
  id: string;
  name: string;
  barcode: string | null;
  sale_unit: "piece" | "kg";
  stock: number;
};

type ItemTransferencia = ProductoTransferencia & {
  quantity: number;
};

type TransferenciaEntrante = {
  id: string;
  source_branch_id: string;
  destination_branch_id: string;
  status: "in_transit" | "received" | "cancelled";
  note: string | null;
  sent_at: string;
  source_branch: {
    name: string;
  } | null;
  items: {
    product_id: string;
    product_name: string;
    sale_unit: "piece" | "kg";
    quantity: number;
  }[];
};

type TransferenciaHistorial = {
  id: string;
  source_branch_id: string;
  destination_branch_id: string;
  status: "in_transit" | "received" | "cancelled";
  note: string | null;
  sent_at: string;
  received_at: string | null;

  source_branch: {
    name: string;
  } | null;

  destination_branch: {
    name: string;
  } | null;

  items: {
    product_id: string;
    product_name: string;
    sale_unit: "piece" | "kg";
    quantity: number;
  }[];
};

export default function TransferenciasPage() {
const {
  perfil,
  sucursales,
  sucursalActiva,
  cargandoSucursales,
} = useAuth();

  const [productos, setProductos] = useState<
    ProductoTransferencia[]
  >([]);

  const [destinoId, setDestinoId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [items, setItems] = useState<ItemTransferencia[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

const [enviando, setEnviando] = useState(false);

const [cancelandoId, setCancelandoId] = useState<string | null>(null);

const [mensajeExito, setMensajeExito] = useState("");

const [
  transferenciasEntrantes,
  setTransferenciasEntrantes,
] = useState<TransferenciaEntrante[]>([]);

const [
  cargandoTransferencias,
  setCargandoTransferencias,
] = useState(false);

const [
  recibiendoId,
  setRecibiendoId,
] = useState<string | null>(null);

const [
  historialTransferencias,
  setHistorialTransferencias,
] = useState<TransferenciaHistorial[]>([]);

const [
  cargandoHistorial,
  setCargandoHistorial,
] = useState(false);

  const sucursalesDestino = useMemo(
    () =>
      sucursales.filter(
        (sucursal) =>
          sucursal.id !== sucursalActiva?.id
      ),
    [sucursales, sucursalActiva?.id]
  );

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) return productos;

    return productos.filter(
      (producto) =>
        producto.name
          .toLowerCase()
          .includes(texto) ||
        producto.barcode
          ?.toLowerCase()
          .includes(texto)
    );
  }, [productos, busqueda]);

  useEffect(() => {
    if (cargandoSucursales) return;

    setDestinoId("");
    setItems([]);

    if (!sucursalActiva) {
      setProductos([]);
      setLoading(false);
      return;
    }

cargarInventarioOrigen();
cargarTransferenciasEntrantes();
cargarHistorialTransferencias();

  }, [
    cargandoSucursales,
    sucursalActiva?.id,
  ]);

async function recibirTransferencia(
  transferId: string
) {
  if (recibiendoId) {
    return;
  }

  setRecibiendoId(transferId);
  setError("");
  setMensajeExito("");

  try {
    const {
      data,
      error: recepcionError,
    } = await supabase.rpc(
      "receive_inventory_transfer",
      {
        p_transfer_id: transferId,
      }
    );

    if (recepcionError) {
      throw recepcionError;
    }

    if (!data) {
      throw new Error(
        "No se recibió el identificador de la transferencia."
      );
    }

await Promise.all([
  cargarInventarioOrigen(),
  cargarTransferenciasEntrantes(),
  cargarHistorialTransferencias(),
]);

    setMensajeExito(
      "Transferencia recibida correctamente. El inventario de la sucursal fue actualizado."
    );
  } catch (error: any) {
    console.error(
      "Error recibiendo transferencia:",
      error
    );

    setError(
      error?.message ||
        "No se pudo recibir la transferencia."
    );
  } finally {
    setRecibiendoId(null);
  }
}

async function cancelarTransferencia(
  transferId: string
) {
  if (cancelandoId) {
    return;
  }

  const confirmar = window.confirm(
    "¿Cancelar esta transferencia? El inventario enviado regresará a la sucursal de origen."
  );

  if (!confirmar) {
    return;
  }

  setCancelandoId(transferId);
  setError("");
  setMensajeExito("");

  try {
    const {
      data,
      error: cancelacionError,
    } = await supabase.rpc(
      "cancel_inventory_transfer",
      {
        p_transfer_id: transferId,
      }
    );

    if (cancelacionError) {
      throw cancelacionError;
    }

    if (!data) {
      throw new Error(
        "No se recibió el identificador de la transferencia."
      );
    }

    await Promise.all([
      cargarInventarioOrigen(),
      cargarTransferenciasEntrantes(),
      cargarHistorialTransferencias(),
    ]);

    setMensajeExito(
      "Transferencia cancelada correctamente. El inventario regresó a la sucursal de origen."
    );
  } catch (error: any) {
    console.error(
      "Error cancelando transferencia:",
      error
    );

    setError(
      error?.message ||
        "No se pudo cancelar la transferencia."
    );
  } finally {
    setCancelandoId(null);
  }
}

  async function cargarTransferenciasEntrantes() {
  if (!sucursalActiva) {
    setTransferenciasEntrantes([]);
    return;
  }

  setCargandoTransferencias(true);

  try {
    const {
      data,
      error: transferenciasError,
    } = await supabase
      .from("inventory_transfers")
      .select(`
        id,
        source_branch_id,
        destination_branch_id,
        status,
        note,
        sent_at,
        source_branch:branches!inventory_transfers_source_branch_id_fkey (
          name
        ),
        items:inventory_transfer_items (
          product_id,
          product_name,
          sale_unit,
          quantity
        )
      `)
      .eq(
        "destination_branch_id",
        sucursalActiva.id
      )
      .eq("status", "in_transit")
      .order("sent_at", {
        ascending: false,
      });

    if (transferenciasError) {
      throw transferenciasError;
    }

    const normalizadas: TransferenciaEntrante[] =
      (data ?? []).map((transferencia: any) => ({
        ...transferencia,
        items: (transferencia.items ?? []).map(
          (item: any) => ({
            ...item,
            quantity: Number(item.quantity),
          })
        ),
      }));

    setTransferenciasEntrantes(normalizadas);
  } catch (error: any) {
    console.error(
      "Error cargando transferencias entrantes:",
      error
    );

    setError(
      error?.message ||
        "No se pudieron cargar las transferencias pendientes."
    );

    setTransferenciasEntrantes([]);
  } finally {
    setCargandoTransferencias(false);
  }
}

async function cargarHistorialTransferencias() {
  if (!sucursalActiva) {
    setHistorialTransferencias([]);
    return;
  }

  setCargandoHistorial(true);

  try {
    const {
      data,
      error: historialError,
    } = await supabase
      .from("inventory_transfers")
      .select(`
        id,
        source_branch_id,
        destination_branch_id,
        status,
        note,
        sent_at,
        received_at,
        source_branch:branches!inventory_transfers_source_branch_id_fkey (
          name
        ),
        destination_branch:branches!inventory_transfers_destination_branch_id_fkey (
          name
        ),
        items:inventory_transfer_items (
          product_id,
          product_name,
          sale_unit,
          quantity
        )
      `)
      .or(
        `source_branch_id.eq.${sucursalActiva.id},destination_branch_id.eq.${sucursalActiva.id}`
      )
      .order("sent_at", {
        ascending: false,
      })
      .limit(50);

    if (historialError) {
      throw historialError;
    }

    const normalizadas: TransferenciaHistorial[] =
      (data ?? []).map((transferencia: any) => ({
        ...transferencia,

        items: (transferencia.items ?? []).map(
          (item: any) => ({
            ...item,
            quantity: Number(item.quantity),
          })
        ),
      }));

    setHistorialTransferencias(normalizadas);
  } catch (error: any) {
    console.error(
      "Error cargando historial de transferencias:",
      error
    );

    setError(
      error?.message ||
        "No se pudo cargar el historial de transferencias."
    );

    setHistorialTransferencias([]);
  } finally {
    setCargandoHistorial(false);
  }
}

  async function cargarInventarioOrigen() {
    if (!sucursalActiva) return;

    setLoading(true);
    setError("");

    try {
      const {
        data,
        error: inventarioError,
      } = await supabase
        .from("branch_inventory")
        .select(`
          stock,
          product:products!inner (
            id,
            name,
            barcode,
            sale_unit
          )
        `)
        .eq("branch_id", sucursalActiva.id);

      if (inventarioError) {
        throw inventarioError;
      }

      const inventario =
        (data ?? [])
          .map((item: any) => ({
            id: item.product.id,
            name: item.product.name,
            barcode: item.product.barcode,
            sale_unit:
              item.product.sale_unit ?? "piece",
            stock: Number(item.stock),
          }))
          .filter(
            (producto) => producto.stock > 0
          )
          .sort((a, b) =>
            a.name.localeCompare(b.name)
          );

      setProductos(inventario);
    } catch (error: any) {
      console.error(
        "Error cargando inventario para transferencia:",
        error
      );

      setError(
        error?.message ||
          "No se pudo cargar el inventario."
      );

      setProductos([]);
    } finally {
      setLoading(false);
    }
  }

  function agregarProducto(
  producto: ProductoTransferencia
) {
  setError("");

  setItems((actuales) => {
    const yaExiste = actuales.some(
      (item) => item.id === producto.id
    );

    if (yaExiste) {
      return actuales;
    }

    return [
      ...actuales,
      {
        ...producto,
        quantity:
          producto.sale_unit === "kg"
            ? Math.min(1, producto.stock)
            : 1,
      },
    ];
  });
}

function quitarProducto(productId: string) {
  setItems((actuales) =>
    actuales.filter(
      (item) => item.id !== productId
    )
  );
}

function cambiarCantidad(
  productId: string,
  valor: string
) {
  if (valor === "") {
    setItems((actuales) =>
      actuales.map((item) =>
        item.id === productId
          ? {
              ...item,
              quantity: 0,
            }
          : item
      )
    );

    return;
  }

  const cantidad = Number(valor);

  if (
    !Number.isFinite(cantidad) ||
    cantidad < 0
  ) {
    return;
  }

  setItems((actuales) =>
    actuales.map((item) => {
      if (item.id !== productId) {
        return item;
      }

      let nuevaCantidad = cantidad;

      if (item.sale_unit === "piece") {
        nuevaCantidad = Math.trunc(
          nuevaCantidad
        );
      }

      if (nuevaCantidad > item.stock) {
        nuevaCantidad = item.stock;
      }

      return {
        ...item,
        quantity: nuevaCantidad,
      };
    })
  );
}

async function enviarTransferencia() {
  if (
    !sucursalActiva ||
    !destinoId ||
    items.length === 0 ||
    enviando
  ) {
    return;
  }

  const itemsValidos = items.every(
    (item) =>
      item.quantity > 0 &&
      item.quantity <= item.stock &&
      (item.sale_unit !== "piece" ||
        Number.isInteger(item.quantity))
  );

  if (!itemsValidos) {
    setError(
      "Revisa las cantidades de los productos."
    );
    return;
  }

  setEnviando(true);
  setError("");
  setMensajeExito("");

  /*
   * Este UUID identifica esta solicitud.
   * La RPC lo utiliza como clave de idempotencia.
   */
  const transferId = crypto.randomUUID();

  try {
    const payload = items.map((item) => ({
      product_id: item.id,
      quantity: item.quantity,
    }));

    const {
      data,
      error: transferenciaError,
    } = await supabase.rpc(
      "send_inventory_transfer",
      {
        p_transfer_id: transferId,
        p_source_branch_id:
          sucursalActiva.id,
        p_destination_branch_id:
          destinoId,
        p_items: payload,
        p_note: null,
      }
    );

    if (transferenciaError) {
      throw transferenciaError;
    }

    if (!data) {
      throw new Error(
        "No se recibió el identificador de la transferencia."
      );
    }

    setItems([]);
    setDestinoId("");
    setBusqueda("");

await Promise.all([
  cargarInventarioOrigen(),
  cargarHistorialTransferencias(),
]);

    setMensajeExito(
      "Transferencia enviada correctamente. El inventario quedó en tránsito."
    );
  } catch (error: any) {
    console.error(
      "Error enviando transferencia:",
      error
    );

    setError(
      error?.message ||
        "No se pudo enviar la transferencia."
    );
  } finally {
    setEnviando(false);
  }
}

const transferenciaValida =
  Boolean(destinoId) &&
  items.length > 0 &&
  items.every(
    (item) =>
      item.quantity > 0 &&
      item.quantity <= item.stock &&
      (item.sale_unit !== "piece" ||
        Number.isInteger(item.quantity))
  );

  if (cargandoSucursales || loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm text-slate-500">
            Cargando transferencias...
          </p>
        </div>
      </main>
    );
  }

  if (perfil?.role !== "admin") {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl">
              🔒
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              Sin acceso a transferencias
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              No tienes permiso para gestionar transferencias de inventario
              entre sucursales.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600">
            Inventario
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Transferencias
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Envía mercancía entre las sucursales de tu negocio.
          </p>

        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

{mensajeExito && (
  <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
    {mensajeExito}
  </div>
)}

        {!sucursalActiva ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="font-semibold text-slate-900">
              No hay una sucursal activa
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Selecciona una sucursal para administrar sus transferencias.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sucursal origen
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {sucursalActiva.name}
                </h2>
              </div>

              <div className="mt-6">
                <label className="text-sm font-semibold text-slate-700">
                  Buscar producto
                </label>

                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) =>
                    setBusqueda(e.target.value)
                  }
                  placeholder="Nombre o código de barras"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                {productosFiltrados.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    No hay productos con existencias disponibles.
                  </div>
                ) : (
                  productosFiltrados.map(
                    (producto) => (
                      <div
                        key={producto.id}
                        className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {producto.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            Disponible:{" "}
                            {producto.stock}{" "}
                            {producto.sale_unit ===
                            "kg"
                              ? "kg"
                              : producto.stock === 1
                                ? "pieza"
                                : "piezas"}
                          </p>
                        </div>

<button
  type="button"
  onClick={() =>
    agregarProducto(producto)
  }
  disabled={items.some(
    (item) => item.id === producto.id
  )}
  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
    items.some(
      (item) => item.id === producto.id
    )
      ? "cursor-not-allowed bg-slate-100 text-slate-400"
      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
  }`}
>
  {items.some(
    (item) => item.id === producto.id
  )
    ? "Agregado"
    : "Agregar"}
</button>
                      </div>
                    )
                  )
                )}
              </div>
            </section>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">
                Nueva transferencia
              </h2>

              <div className="mt-5">
                <label className="text-sm font-semibold text-slate-700">
                  Sucursal destino
                </label>

                <select
                  value={destinoId}
                  onChange={(e) =>
                    setDestinoId(e.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  <option value="">
                    Selecciona una sucursal
                  </option>

                  {sucursalesDestino.map(
                    (sucursal) => (
                      <option
                        key={sucursal.id}
                        value={sucursal.id}
                      >
                        {sucursal.name}
                      </option>
                    )
                  )}
                </select>
              </div>

<div className="mt-6">
  <div className="flex items-center justify-between">
    <p className="text-sm font-semibold text-slate-700">
      Productos seleccionados
    </p>

    <span className="text-xs text-slate-400">
      {items.length}
    </span>
  </div>

  {items.length === 0 ? (
    <div className="mt-3 rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">
        Todavía no has agregado productos.
      </p>
    </div>
  ) : (
    <div className="mt-3 space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-slate-200 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {item.name}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Disponible: {item.stock}{" "}
                {item.sale_unit === "kg"
                  ? "kg"
                  : item.stock === 1
                    ? "pieza"
                    : "piezas"}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                quitarProducto(item.id)
              }
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Quitar
            </button>
          </div>

          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500">
              Cantidad a enviar
            </label>

            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={
                  item.sale_unit === "kg"
                    ? "0.001"
                    : "1"
                }
                max={item.stock}
                step={
                  item.sale_unit === "kg"
                    ? "0.001"
                    : "1"
                }
                value={
                  item.quantity === 0
                    ? ""
                    : item.quantity
                }
                onChange={(e) =>
                  cambiarCantidad(
                    item.id,
                    e.target.value
                  )
                }
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />

              <span className="w-14 text-xs text-slate-500">
                {item.sale_unit === "kg"
                  ? "kg"
                  : "pzas."}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>

<button
  type="button"
  onClick={enviarTransferencia}
  disabled={
    !transferenciaValida || enviando
  }
  className={`mt-5 w-full rounded-xl px-4 py-3 font-semibold transition ${
    transferenciaValida && !enviando
      ? "bg-indigo-600 text-white hover:bg-indigo-700"
      : "cursor-not-allowed bg-slate-200 text-slate-500"
  }`}
>
  {enviando
    ? "Enviando..."
    : "Enviar transferencia"}
</button>

          </aside>
        </div>
      )}

      {sucursalActiva && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

  <div>
    <p className="text-sm font-semibold text-indigo-600">
      Recepciones
    </p>

    <h2 className="mt-1 text-xl font-bold text-slate-900">
      Transferencias por recibir
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Mercancía enviada a {sucursalActiva.name}.
    </p>
  </div>

  {cargandoTransferencias ? (
    <p className="mt-6 text-sm text-slate-500">
      Cargando transferencias...
    </p>
  ) : transferenciasEntrantes.length === 0 ? (
    <div className="mt-6 rounded-xl bg-slate-50 p-5">
      <p className="text-sm text-slate-500">
        No hay transferencias pendientes de recepción.
      </p>
    </div>
  ) : (
    <div className="mt-6 space-y-4">
      {transferenciasEntrantes.map(
        (transferencia) => (
          <div
            key={transferencia.id}
            className="rounded-xl border border-slate-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">
                  Desde{" "}
                  {transferencia.source_branch?.name ??
                    "Sucursal"}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {new Date(
                    transferencia.sent_at
                  ).toLocaleString("es-MX")}
                </p>
              </div>

              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                En tránsito
              </span>
            </div>

            <div className="mt-4 divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
              {transferencia.items.map(
                (item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {item.product_name}
                    </span>

                    <span className="text-sm font-semibold text-slate-900">
                      {item.quantity}{" "}
                      {item.sale_unit === "kg"
                        ? "kg"
                        : item.quantity === 1
                          ? "pieza"
                          : "piezas"}
                    </span>
                  </div>
                )
              )}
            </div>
<button
  type="button"
  onClick={() =>
    recibirTransferencia(
      transferencia.id
    )
  }
  disabled={recibiendoId !== null}
  className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
    recibiendoId === null
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : "cursor-not-allowed bg-slate-200 text-slate-500"
  }`}
>
  {recibiendoId === transferencia.id
    ? "Recibiendo..."
    : "Recibir transferencia"}
</button>
          </div>
        )
      )}
    </div>
  )}
        </section>
      )}

{sucursalActiva && (
  <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <p className="text-sm font-semibold text-indigo-600">
        Historial
      </p>

      <h2 className="mt-1 text-xl font-bold text-slate-900">
        Historial de transferencias
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Últimas transferencias enviadas o recibidas por{" "}
        {sucursalActiva.name}.
      </p>
    </div>

    {cargandoHistorial ? (
      <p className="mt-6 text-sm text-slate-500">
        Cargando historial...
      </p>
    ) : historialTransferencias.length === 0 ? (
      <div className="mt-6 rounded-xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">
          Todavía no hay transferencias registradas para esta sucursal.
        </p>
      </div>
    ) : (
      <div className="mt-6 space-y-4">
        {historialTransferencias.map(
          (transferencia) => {
            const esSalida =
              transferencia.source_branch_id ===
              sucursalActiva.id;

            const sucursalContraria = esSalida
              ? transferencia.destination_branch?.name ??
                "Sucursal"
              : transferencia.source_branch?.name ??
                "Sucursal";

            return (
              <div
                key={transferencia.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          esSalida
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {esSalida ? "Salida" : "Entrada"}
                      </span>

                      <p className="font-semibold text-slate-900">
                        {esSalida ? "Hacia" : "Desde"}{" "}
                        {sucursalContraria}
                      </p>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      Enviada:{" "}
                      {new Date(
                        transferencia.sent_at
                      ).toLocaleString("es-MX")}
                    </p>

                    {transferencia.received_at && (
                      <p className="mt-1 text-xs text-slate-500">
                        Recibida:{" "}
                        {new Date(
                          transferencia.received_at
                        ).toLocaleString("es-MX")}
                      </p>
                    )}
                  </div>

<span
  className={`rounded-full px-3 py-1 text-xs font-semibold ${
    transferencia.status === "received"
      ? "bg-emerald-50 text-emerald-700"
      : transferencia.status === "cancelled"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700"
  }`}
>
  {transferencia.status === "received"
    ? "Recibida"
    : transferencia.status === "cancelled"
      ? "Cancelada"
      : "En tránsito"}
</span>
                </div>

                <div className="mt-4 divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
                  {transferencia.items.map((item) => (
                    <div
                      key={item.product_id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {item.product_name}
                      </span>

                      <span className="text-sm font-semibold text-slate-900">
                        {item.quantity}{" "}
                        {item.sale_unit === "kg"
                          ? "kg"
                          : item.quantity === 1
                            ? "pieza"
                            : "piezas"}
                      </span>
                    </div>
                  ))}
                </div>

                {transferencia.note && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">
                      Nota
                    </p>

                    <p className="mt-1 text-sm text-slate-700">
                      {transferencia.note}
                    </p>
                  </div>
                )}

{esSalida &&
  transferencia.status === "in_transit" && (
    <div className="mt-4 flex justify-end">
      <button
        type="button"
        onClick={() =>
          cancelarTransferencia(transferencia.id)
        }
        disabled={cancelandoId !== null}
        className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cancelandoId === transferencia.id
          ? "Cancelando..."
          : "Cancelar transferencia"}
      </button>
    </div>
  )}
  
              </div>
            );
          }
        )}
      </div>
    )}
  </section>
)}
      
    </div>
  </main>
  );
}