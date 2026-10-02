"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  stock: number;
  sale_price: number;
  minimum_stock: number;
};

type CartItem = Product & {
  quantity: number;
};

export default function VentasPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
const [mostrarPago, setMostrarPago] = useState(false);

const [mostrarCarritoMovil, setMostrarCarritoMovil] = useState(false);

const [metodoPago, setMetodoPago] =
  useState<"cash" | "card">("cash");

const [efectivoRecibido, setEfectivoRecibido] = useState("");

const [ventaCompletada, setVentaCompletada] =
  useState<any>(null);
  // =========================
  // CARGAR PRODUCTOS
  // =========================

  useEffect(() => {
    async function cargarProductos() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("products")
.select(
  "id, name, stock, sale_price, minimum_stock"
)
        .order("name");

      if (error) {
        console.error(error);
        setError(error.message);
        setLoading(false);
        return;
      }

      setProducts(data ?? []);
      setLoading(false);
    }

    cargarProductos();
  }, []);

  // =========================
  // BUSCADOR
  // =========================

  const productosFiltrados = useMemo(() => {
    return products.filter((product) =>
      product.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  // =========================
  // AGREGAR AL CARRITO
  // =========================

  function agregarProducto(product: Product) {
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.id === product.id
      );

      if (existing) {
        if (existing.quantity >= product.stock) {
          return currentCart;
        }

        return currentCart.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      if (product.stock <= 0) {
        return currentCart;
      }

      return [
        ...currentCart,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  }

  // =========================
  // AUMENTAR CANTIDAD
  // =========================

  function aumentarCantidad(id: string) {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (item.quantity >= item.stock) {
          return item;
        }

        return {
          ...item,
          quantity: item.quantity + 1,
        };
      })
    );
  }

  // =========================
  // DISMINUIR CANTIDAD
  // =========================

  function disminuirCantidad(id: string) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  // =========================
  // ELIMINAR PRODUCTO
  // =========================

  function eliminarProducto(id: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== id)
    );
  }

  // =========================
  // VACIAR CARRITO
  // =========================

  function vaciarCarrito() {
    setCart([]);
  }

  // =========================
  // TOTALES
  // =========================

  const total = useMemo(() => {
    return cart.reduce(
      (sum, item) =>
        sum + Number(item.sale_price) * item.quantity,
      0
    );
  }, [cart]);

  const totalProductos = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
  }, [cart]);

  const efectivo = Number(efectivoRecibido) || 0;
const cambio = Math.max(0, efectivo - total);
const efectivoInsuficiente = efectivo < total;
  
// =========================
// COBRAR VENTA
// =========================

async function cobrarVenta() {
  if (cart.length === 0) {
    alert("El carrito está vacío");
    return;
  }

  try {
    const items = cart.map((item) => ({
      product_id: item.id,
      quantity: item.quantity,
    }));

const { data, error } = await supabase.rpc("create_sale", {
  p_items: items,

  p_paid_amount:
    metodoPago === "cash"
      ? efectivo
      : total,

  p_payment_method: metodoPago,
});

    if (error) {
      console.error("Error al cobrar:", error);
      alert(`No se pudo completar la venta: ${error.message}`);
      return;
    }

setVentaCompletada({
  number: data?.number,

  total: Number(
    data?.total ?? total
  ),

  paid_amount: Number(
    data?.paid_amount ??
      (metodoPago === "cash"
        ? efectivo
        : total)
  ),

  change_due: Number(
    data?.change_due ??
      (metodoPago === "cash"
        ? cambio
        : 0)
  ),

  payment_method:
    data?.payment_method ?? metodoPago,

  items: [...cart],
});

setMostrarPago(false);

    setCart([]);

    // Actualizar inventario en pantalla
    const { data: productosActualizados, error: errorProductos } =
      await supabase
        .from("products")
.select(
  "id, name, stock, sale_price, minimum_stock"
)
        .order("name");

    if (!errorProductos) {
      setProducts(productosActualizados ?? []);
    }
  } catch (error) {
    console.error("Error inesperado:", error);
    alert("Ocurrió un error inesperado al procesar la venta");
  }
}

  // =========================
  // FORMATO MXN
  // =========================

  const formatoDinero = (cantidad: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(cantidad);

  // =========================
  // INTERFAZ
  // =========================

  return (
    <>
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* ENCABEZADO */}

        <div>
          <p className="text-sm font-medium text-indigo-600">
            MI NEGOCIO POS
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Nueva venta
          </h1>

          <p className="mt-2 text-slate-500">
            Selecciona los productos de esta venta
          </p>
        </div>

        {/* CONTENIDO */}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_420px]">

          {/* ===================== */}
          {/* PRODUCTOS */}
          {/* ===================== */}

          <section>

            {/* BUSCADOR */}

            <input
              type="text"
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-500"
            />

            {/* ERROR */}

            {error && (
              <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
                Error de Supabase: {error}
              </div>
            )}

            {/* CARGANDO */}

            {loading && (
              <p className="mt-8 text-slate-500">
                Cargando productos...
              </p>
            )}

            {!loading && !error && (
              <>
                <div className="mb-4 mt-8 flex items-center justify-between">
                  <h2 className="text-lg font-bold">
                    Productos
                  </h2>

                  <span className="text-sm text-slate-500">
                    {productosFiltrados.length} productos
                  </span>
                </div>

                {productosFiltrados.length === 0 ? (
                  <div className="rounded-2xl bg-white p-8 shadow-sm">
                    <p className="text-slate-500">
                      No se encontraron productos.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">

                    {productosFiltrados.map((product) => {
                      const cartItem = cart.find(
                        (item) => item.id === product.id
                      );

                      const cantidadEnCarrito =
                        cartItem?.quantity ?? 0;

                      const sinStockDisponible =
                        cantidadEnCarrito >= product.stock;

                      return (
                        <div
                          key={product.id}
                          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">

                            <div>
                              <h3 className="font-bold">
                                {product.name}
                              </h3>

                              <p className="mt-1 text-sm text-slate-500">
                                Stock: {product.stock}
                              </p>
                            </div>

                            <p className="font-bold">
                              {formatoDinero(
                                Number(product.sale_price)
                              )}
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              agregarProducto(product)
                            }
                            disabled={
                              product.stock <= 0 ||
                              sinStockDisponible
                            }
                            className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {product.stock <= 0
                              ? "Sin existencias"
                              : sinStockDisponible
                              ? "Stock máximo"
                              : cantidadEnCarrito > 0
                              ? `Agregar otro (${cantidadEnCarrito})`
                              : "Agregar"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ===================== */}
          {/* CARRITO */}
          {/* ===================== */}

          <aside className="hidden lg:block">
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm lg:sticky lg:top-8">

              {/* HEADER CARRITO */}

              <div className="flex items-center justify-between border-b border-slate-100 p-6">

                <div>
                  <h2 className="text-xl font-bold">
                    Carrito
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {totalProductos === 1
                      ? "1 producto"
                      : `${totalProductos} productos`}
                  </p>
                </div>

                {cart.length > 0 && (
                  <button
                    onClick={vaciarCarrito}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Vaciar
                  </button>
                )}
              </div>

              {/* CARRITO VACÍO */}

              {cart.length === 0 ? (
                <div className="p-10 text-center">

                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                    🛒
                  </div>

                  <p className="mt-4 font-medium">
                    Tu carrito está vacío
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Agrega productos para comenzar
                  </p>
                </div>
              ) : (
                <>

                  {/* ITEMS */}

                  <div className="divide-y divide-slate-100">

                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="p-5"
                      >
                        <div className="flex justify-between gap-4">

                          <div>
                            <h3 className="font-semibold">
                              {item.name}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                              {formatoDinero(
                                Number(item.sale_price)
                              )}{" "}
                              c/u
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              eliminarProducto(item.id)
                            }
                            className="h-fit text-sm text-red-500 hover:text-red-700"
                          >
                            Eliminar
                          </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between">

                          {/* CONTADOR */}

                          <div className="flex items-center rounded-lg border border-slate-200">

                            <button
                              onClick={() =>
                                disminuirCantidad(item.id)
                              }
                              className="px-3 py-2 text-lg hover:bg-slate-50"
                            >
                              −
                            </button>

                            <span className="min-w-10 text-center font-medium">
                              {item.quantity}
                            </span>

                            <button
                              onClick={() =>
                                aumentarCantidad(item.id)
                              }
                              disabled={
                                item.quantity >= item.stock
                              }
                              className="px-3 py-2 text-lg hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              +
                            </button>
                          </div>

                          {/* SUBTOTAL */}

                          <p className="font-bold">
                            {formatoDinero(
                              Number(item.sale_price) *
                                item.quantity
                            )}
                          </p>
                        </div>

                        {item.quantity >= item.stock && (
                          <p className="mt-2 text-xs text-amber-600">
                            Máximo disponible en inventario
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* TOTAL */}

                  <div className="border-t border-slate-100 p-6">

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        Productos
                      </span>

                      <span>
                        {totalProductos}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-lg font-bold">
                        Total
                      </span>

                      <span className="text-2xl font-bold">
                        {formatoDinero(total)}
                      </span>
                    </div>

                    {/* COBRAR */}

<button
  onClick={() => {
  setMetodoPago("cash");
  setEfectivoRecibido("");
  setMostrarPago(true);
}}
  className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-4 text-lg font-semibold text-white"
>
  Cobrar {formatoDinero(total)}
</button>

<p className="mt-3 text-center text-xs text-slate-400">
  La venta se registrará y actualizará el inventario
</p>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>

    {/* BARRA CARRITO MÓVIL */}
{cart.length > 0 && (
  <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
    <button
      type="button"
      onClick={() => setMostrarCarritoMovil(true)}
      className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">🛒</span>

        <div className="text-left">
          <p className="font-semibold">
            {totalProductos === 1
              ? "1 producto"
              : `${totalProductos} productos`}
          </p>

          <p className="text-xs text-slate-300">
            Ver carrito
          </p>
        </div>
      </div>

      <span className="text-lg font-bold">
        {formatoDinero(total)}
      </span>
    </button>
  </div>
)}

{/* CARRITO MÓVIL */}
{mostrarCarritoMovil && (
  <div
    className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden"
    onClick={() => setMostrarCarritoMovil(false)}
  >
    <div
      className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* HEADER */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Carrito
          </h2>

          <p className="text-sm text-slate-500">
            {totalProductos === 1
              ? "1 producto"
              : `${totalProductos} productos`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarCarritoMovil(false)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600"
        >
          ×
        </button>
      </div>

      {/* PRODUCTOS */}
      <div className="divide-y divide-slate-100">
        {cart.map((item) => (
          <div key={item.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {item.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {formatoDinero(Number(item.sale_price))} c/u
                </p>
              </div>

              <button
                type="button"
                onClick={() => eliminarProducto(item.id)}
                className="text-sm font-medium text-red-500"
              >
                Eliminar
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => disminuirCantidad(item.id)}
                  className="px-4 py-2 text-lg"
                >
                  −
                </button>

                <span className="min-w-10 text-center font-semibold">
                  {item.quantity}
                </span>

                <button
                  type="button"
                  onClick={() => aumentarCantidad(item.id)}
                  disabled={item.quantity >= item.stock}
                  className="px-4 py-2 text-lg disabled:text-slate-300"
                >
                  +
                </button>
              </div>

              <p className="font-bold text-slate-900">
                {formatoDinero(
                  Number(item.sale_price) * item.quantity
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* TOTAL Y COBRO */}
      <div className="sticky bottom-0 border-t border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">
            Total
          </span>

          <span className="text-2xl font-bold text-slate-900">
            {formatoDinero(total)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setMostrarCarritoMovil(false);
            setMetodoPago("cash");
            setEfectivoRecibido("");
            setMostrarPago(true);
          }}
          className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-4 text-lg font-semibold text-white"
        >
          Cobrar {formatoDinero(total)}
        </button>

        <button
          type="button"
          onClick={() => {
  vaciarCarrito();
  setMostrarCarritoMovil(false);
}}
          className="mt-3 w-full py-2 text-sm font-medium text-red-600"
        >
          Vaciar carrito
        </button>
      </div>
    </div>
  </div>
)}

{mostrarPago && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">

      <div className="mb-6">
        <p className="text-sm font-medium text-indigo-600">
          FINALIZAR VENTA
        </p>

        <h2 className="mt-1 text-2xl font-bold">
          Cobrar {formatoDinero(total)}
        </h2>

<p className="mt-2 text-sm text-slate-500">
  Selecciona cómo pagará el cliente
</p>
      </div>

      {/* MÉTODO DE PAGO */}

<div className="mb-6">
  <p className="mb-3 text-sm font-medium text-slate-700">
    Método de pago
  </p>

  <div className="grid grid-cols-2 gap-3">
    <button
      type="button"
      onClick={() => {
        setMetodoPago("cash");
      }}
      className={`rounded-xl border p-4 text-left transition ${
        metodoPago === "cash"
          ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="text-xl">💵</div>

      <p className="mt-2 font-semibold text-slate-900">
        Efectivo
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Pago en caja
      </p>
    </button>

    <button
      type="button"
      onClick={() => {
        setMetodoPago("card");
        setEfectivoRecibido("");
      }}
      className={`rounded-xl border p-4 text-left transition ${
        metodoPago === "card"
          ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="text-xl">💳</div>

      <p className="mt-2 font-semibold text-slate-900">
        Tarjeta
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Pago con terminal
      </p>
    </button>
  </div>
</div>

  {metodoPago === "cash" && (
  <>
      <label className="text-sm font-medium text-slate-700">
        Efectivo recibido
      </label>

<input
  type="text"
  inputMode="decimal"
  autoFocus
  value={efectivoRecibido}
  onChange={(e) => {
    const valor = e.target.value;

    if (/^\d*\.?\d{0,2}$/.test(valor)) {
      setEfectivoRecibido(valor);
    }
  }}
  placeholder="0.00"
  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-4 text-2xl font-bold outline-none focus:border-indigo-500"
/>

      <div className="mt-4">
  <p className="mb-2 text-sm font-medium text-slate-500">
    Pago rápido
  </p>

  <div className="grid grid-cols-3 gap-2">
    {[20, 50, 100, 200, 500].map((billete) => (
      <button
        key={billete}
        type="button"
        onClick={() => {
          const actual = Number(efectivoRecibido) || 0;
          setEfectivoRecibido(String(actual + billete));
        }}
        className="rounded-xl border border-slate-200 bg-white px-3 py-3 font-semibold text-slate-700 transition hover:border-indigo-500 hover:bg-indigo-50 active:scale-95"
      >
        ${billete}
      </button>
    ))}

    <button
      type="button"
      onClick={() => setEfectivoRecibido("")}
      className="rounded-xl border border-slate-200 px-3 py-3 font-medium text-slate-500 transition hover:bg-slate-50"
    >
      Limpiar
    </button>
  </div>
</div>

      <div className="mt-6 rounded-xl bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold">
            {formatoDinero(total)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-slate-500">Cambio</span>
          <span className="text-xl font-bold">
            {formatoDinero(cambio)}
          </span>
        </div>
      </div>

      {efectivoInsuficiente && (
        <p className="mt-3 text-sm font-medium text-red-600">
          El efectivo recibido es insuficiente.
        </p>
      )}
        </>
)}

      <button
        onClick={async () => {
          await cobrarVenta();
          setMostrarPago(false);
          setEfectivoRecibido("");
        }}
        disabled={
  metodoPago === "cash" &&
  (efectivoInsuficiente || efectivo <= 0)
}
        className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {metodoPago === "cash"
  ? "Confirmar cobro"
  : `Confirmar pago ${formatoDinero(total)}`}
      </button>

      <button
        onClick={() => {
          setMostrarPago(false);
          setEfectivoRecibido("");
        }}
        className="mt-3 w-full rounded-xl px-5 py-3 font-medium text-slate-500 hover:bg-slate-50"
      >
        Cancelar
      </button>

    </div>
  </div>
)}
{/* ========================= */}
{/* TICKET VENTA COMPLETADA */}
{/* ========================= */}

{ventaCompletada && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">

      {/* ÉXITO */}
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
          ✓
        </div>

        <h2 className="mt-4 text-2xl font-bold text-slate-900">
          Venta completada
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {ventaCompletada.number}
        </p>
      </div>

      {/* PRODUCTOS */}
      <div className="mt-6 border-y border-slate-200 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Productos
        </p>

        <div className="space-y-3">
          {ventaCompletada.items.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {item.name}
                </p>

                <p className="text-sm text-slate-500">
                  {item.quantity} × {formatoDinero(Number(item.sale_price))}
                </p>
              </div>

              <p className="font-semibold text-slate-900">
                {formatoDinero(
                  Number(item.sale_price) * item.quantity
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* TOTALES */}
      <div className="mt-5 space-y-3">
        <div className="flex justify-between text-slate-600">
          <span>Total</span>
          <span className="font-semibold text-slate-900">
            {formatoDinero(ventaCompletada.total)}
          </span>
        </div>

        <div className="flex justify-between text-slate-600">
          <span>Efectivo</span>
          <span>
            {formatoDinero(ventaCompletada.paid_amount)}
          </span>
        </div>

        <div className="flex justify-between border-t border-slate-200 pt-3">
          <span className="font-semibold text-slate-900">
            Cambio
          </span>

          <span className="text-xl font-bold text-green-600">
            {formatoDinero(ventaCompletada.change_due)}
          </span>
        </div>
      </div>

      {/* BOTONES */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => {
            setVentaCompletada(null);
            setEfectivoRecibido("");
          }}
          className="w-full rounded-xl bg-indigo-600 px-5 py-4 text-lg font-semibold text-white transition hover:bg-indigo-700"
        >
          Nueva venta
        </button>

        <button
          onClick={() => window.print()}
          className="w-full rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-200"
        >
          Imprimir ticket
        </button>
      </div>

    </div>
  </div>
)}
    </>
  );
}