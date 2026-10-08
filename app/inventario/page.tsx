"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "@/context/AuthContext";

type Producto = {
  id: string;
  name: string;
  barcode: string | null;
  cost_price: number;
  sale_price: number;
  sale_unit: "piece" | "kg";
  stock: number;
  minimum_stock: number;
  created_at: string;
  updated_at: string;
};

export default function InventarioPage() {
const {
  puedeAdministrar,
  sucursalActiva,
  cargandoSucursales,
} = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] =
  useState<Producto | null>(null);

const [cantidadAgregar, setCantidadAgregar] = useState("");
const [guardandoStock, setGuardandoStock] = useState(false);

const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false);
const [guardandoProducto, setGuardandoProducto] = useState(false);

const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
const [guardandoEdicion, setGuardandoEdicion] = useState(false);

const [productoEditado, setProductoEditado] = useState({
  name: "",
  barcode: "",
  cost_price: "",
  sale_price: "",
  sale_unit: "piece" as "piece" | "kg",
  minimum_stock: "",
});

const [nuevoProducto, setNuevoProducto] = useState({
  name: "",
  barcode: "",
  cost_price: "",
  sale_price: "",
  sale_unit: "piece" as "piece" | "kg",
  stock: "",
  minimum_stock: "",
});

const [productoAjustando, setProductoAjustando] =
  useState<Producto | null>(null);

const [cantidadAjuste, setCantidadAjuste] = useState("");
const [motivoAjuste, setMotivoAjuste] = useState("");
const [guardandoAjuste, setGuardandoAjuste] = useState(false);

useEffect(() => {
  if (cargandoSucursales) return;

  if (!sucursalActiva) {
    setProductos([]);
    setLoading(false);
    return;
  }

  cargarProductos();
}, [
  cargandoSucursales,
  sucursalActiva?.id,
]);

async function cargarProductos() {
  setLoading(true);
  setError("");

  try {
if (!sucursalActiva) {
  setProductos([]);
  setLoading(false);
  return;
}

const { data: inventarioData, error: inventarioError } =
  await supabase
    .from("branch_inventory")
    .select(`
      stock,
      minimum_stock,
product:products!inner (
  id,
  name,
  barcode,
  sale_price,
  sale_unit,
  created_at,
  updated_at
)
    `)
    .eq("branch_id", sucursalActiva.id)
    .order("product_id");

if (inventarioError) throw inventarioError;

const productosData = (inventarioData ?? []).map(
  (item: any) => ({
    id: item.product.id,
    name: item.product.name,
    barcode: item.product.barcode,
    sale_price: Number(item.product.sale_price),
    sale_unit: item.product.sale_unit ?? "piece",
    stock: Number(item.stock),
    minimum_stock: Number(item.minimum_stock),
    created_at: item.product.created_at,
    updated_at: item.product.updated_at,
  })
);

productosData.sort((a, b) =>
  a.name.localeCompare(b.name)
);

if (puedeAdministrar) {
  const {
    data: costosData,
    error: costosError,
  } = await supabase.rpc("get_product_costs");

  if (costosError) throw costosError;

  const costosPorProducto = new Map<string, number>(
    (costosData ?? []).map(
      (item: {
        id: string;
        cost_price: number;
      }): [string, number] => [
        item.id,
        Number(item.cost_price),
      ]
    )
  );

  const productosConCosto: Producto[] =
    (productosData ?? []).map((producto) => ({
      ...producto,
      cost_price:
        costosPorProducto.get(producto.id) ?? 0,
    }));

  setProductos(productosConCosto);
} else {
  const productosSinCosto: Producto[] =
    (productosData ?? []).map((producto) => ({
      ...producto,
      cost_price: 0,
    }));

  setProductos(productosSinCosto);
}

} catch (error: any) {
  console.error(
    "Error al cargar productos:",
    error
  );

  setError(
    error?.message ||
      "No se pudieron cargar los productos."
  );
} finally {
  setLoading(false);
}
}

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) return productos;

    return productos.filter((producto) => {
      return (
        producto.name.toLowerCase().includes(texto) ||
        producto.barcode?.toLowerCase().includes(texto)
      );
    });
  }, [productos, busqueda]);

  const totalProductos = productos.length;

const piezasInventario = productos
  .filter((producto) => producto.sale_unit !== "kg")
  .reduce(
    (total, producto) => total + Number(producto.stock),
    0
  );

const kilosInventario = productos
  .filter((producto) => producto.sale_unit === "kg")
  .reduce(
    (total, producto) => total + Number(producto.stock),
    0
  );

const formatoCantidadKg = (cantidad: number) =>
  new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(cantidad);

  const valorInventario = productos.reduce(
    (total, producto) =>
      total + Number(producto.stock) * Number(producto.cost_price),
    0
  );

  const productosStockBajo = productos.filter(
    (producto) =>
      producto.stock <= producto.minimum_stock
  ).length;

async function crearProducto() {
  const nombre = nuevoProducto.name.trim();
  const costo = Number(nuevoProducto.cost_price);
  const precio = Number(nuevoProducto.sale_price);
  const stock = Number(nuevoProducto.stock);
  const stockMinimo = Number(nuevoProducto.minimum_stock);

  if (!sucursalActiva) {
  setError("No hay una sucursal activa seleccionada.");
  return;
}

  if (!nombre) {
    setError("Escribe el nombre del producto.");
    return;
  }

  if (
    Number.isNaN(costo) ||
    costo < 0 ||
    Number.isNaN(precio) ||
    precio < 0
  ) {
    setError("Revisa el costo y el precio de venta.");
    return;
  }

if (
  !Number.isFinite(stock) ||
  stock < 0 ||
  !Number.isFinite(stockMinimo) ||
  stockMinimo < 0
) {
  setError("Revisa el stock y el stock mínimo.");
  return;
}

if (
  nuevoProducto.sale_unit === "piece" &&
  (!Number.isInteger(stock) || !Number.isInteger(stockMinimo))
) {
  setError("Los productos por pieza deben usar cantidades enteras.");
  return;
}

  try {
    setGuardandoProducto(true);
    setError("");

const { error } = await supabase.rpc("create_product", {
  p_name: nombre,
  p_barcode: nuevoProducto.barcode.trim() || null,
  p_cost_price: costo,
  p_sale_price: precio,
  p_initial_stock: stock,
  p_minimum_stock: stockMinimo,
  p_branch_id: sucursalActiva.id,
  p_sale_unit: nuevoProducto.sale_unit,
});

if (error) throw error;

// Recargar desde branch_inventory para usar la fuente real
await cargarProductos();

setNuevoProducto({
  name: "",
  barcode: "",
  cost_price: "",
  sale_price: "",
  sale_unit: "piece",
  stock: "",
  minimum_stock: "",
});

    setMostrarNuevoProducto(false);
} catch (error: any) {
  console.error("Error al crear producto:", error);

  if (error?.code === "23505") {
    setError(
      "Ese código de barras ya está registrado en otro producto."
    );
  } else {
    setError(
      error?.message ||
      "No se pudo crear el producto."
    );
  }
} finally {
  setGuardandoProducto(false);
}
}

function abrirEditor(producto: Producto) {
  setError("");

  setProductoEditando(producto);

setProductoEditado({
  name: producto.name,
  barcode: producto.barcode ?? "",
  cost_price: String(producto.cost_price),
  sale_price: String(producto.sale_price),
  sale_unit: producto.sale_unit,
  minimum_stock: String(producto.minimum_stock),
});
}

async function guardarEdicion() {
  if (!productoEditando) return;
  if (!sucursalActiva) {
  setError("No hay una sucursal activa seleccionada.");
  return;
}

  const nombre = productoEditado.name.trim();
  const costo = Number(productoEditado.cost_price);
  const precio = Number(productoEditado.sale_price);
  const stockMinimo = Number(productoEditado.minimum_stock);

  if (!nombre) {
    setError("Escribe el nombre del producto.");
    return;
  }

  if (
    Number.isNaN(costo) ||
    costo < 0 ||
    Number.isNaN(precio) ||
    precio < 0
  ) {
    setError("Revisa el costo y el precio de venta.");
    return;
  }

if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
  setError("El stock mínimo debe ser un número válido.");
  return;
}

if (
  productoEditado.sale_unit === "piece" &&
  !Number.isInteger(stockMinimo)
) {
  setError("El stock mínimo de un producto por pieza debe ser entero.");
  return;
}

  try {
    setGuardandoEdicion(true);
    setError("");

const { error } = await supabase.rpc("update_product", {
  p_product_id: productoEditando.id,
  p_name: nombre,
  p_barcode: productoEditado.barcode.trim() || null,
  p_cost_price: costo,
  p_sale_price: precio,
  p_minimum_stock: stockMinimo,
  p_branch_id: sucursalActiva.id,
  p_sale_unit: productoEditado.sale_unit,
});

if (error) throw error;

// Recargar para obtener los datos globales del producto
// y el inventario específico de la sucursal activa.
await cargarProductos();

    setProductoEditando(null);

  } catch (error: any) {
    console.error("Error al editar producto:", error);

    if (error?.code === "23505") {
      setError(
        "Ese código de barras ya está registrado en otro producto."
      );
    } else {
      setError(
        error?.message ||
        "No se pudo actualizar el producto."
      );
    }
  } finally {
    setGuardandoEdicion(false);
  }
}

async function ajustarStock() {
  if (!productoAjustando) return;
  if (!sucursalActiva) {
  setError("No hay una sucursal activa seleccionada.");
  return;
}

  const cantidad = Number(cantidadAjuste);

if (!Number.isFinite(cantidad) || cantidad === 0) {
  setError(
    "Ingresa un ajuste válido. Usa números positivos o negativos."
  );
  return;
}

if (
  productoAjustando.sale_unit === "piece" &&
  !Number.isInteger(cantidad)
) {
  setError(
    "Los productos por pieza deben ajustarse con cantidades enteras."
  );
  return;
}

  if (
    productoAjustando.stock + cantidad < 0
  ) {
    setError(
      "El ajuste dejaría el inventario en negativo."
    );
    return;
  }

  if (!motivoAjuste.trim()) {
    setError("Escribe el motivo del ajuste.");
    return;
  }

  try {
    setGuardandoAjuste(true);
    setError("");

const { data, error } = await supabase.rpc(
  "adjust_inventory_stock",
  {
    p_product_id: productoAjustando.id,
    p_quantity: cantidad,
    p_note: motivoAjuste.trim(),
    p_branch_id: sucursalActiva.id,
  }
);

    if (error) throw error;

    const nuevoStock = Number(data.stock_after);

    setProductos((actuales) =>
      actuales.map((producto) =>
        producto.id === productoAjustando.id
          ? {
              ...producto,
              stock: nuevoStock,
              updated_at: new Date().toISOString(),
            }
          : producto
      )
    );

    setProductoAjustando(null);
    setCantidadAjuste("");
    setMotivoAjuste("");

  } catch (error: any) {
    console.error("Error al ajustar inventario:", error);

    setError(
      error?.message ||
      "No se pudo ajustar el inventario."
    );
  } finally {
    setGuardandoAjuste(false);
  }
}

async function agregarExistencias() {
  if (!productoSeleccionado) return;
if (!sucursalActiva) {
  setError("No hay una sucursal activa seleccionada.");
  return;
}

  const cantidad = Number(cantidadAgregar);

if (!Number.isFinite(cantidad) || cantidad <= 0) {
  setError("Ingresa una cantidad válida.");
  return;
}

if (
  productoSeleccionado.sale_unit === "piece" &&
  !Number.isInteger(cantidad)
) {
  setError(
    "Los productos por pieza deben agregarse con cantidades enteras."
  );
  return;
}

  try {
    setGuardandoStock(true);
    setError("");

const { data, error } = await supabase.rpc(
  "add_inventory_stock",
  {
    p_product_id: productoSeleccionado.id,
    p_quantity: cantidad,
    p_note: "Entrada de mercancía desde inventario",
    p_branch_id: sucursalActiva.id,
  }
);

    if (error) {
      throw error;
    }

    const nuevoStock = Number(data.stock_after);

    setProductos((productosActuales) =>
      productosActuales.map((producto) =>
        producto.id === productoSeleccionado.id
          ? {
              ...producto,
              stock: nuevoStock,
              updated_at: new Date().toISOString(),
            }
          : producto
      )
    );

    setProductoSeleccionado(null);
    setCantidadAgregar("");

  } catch (error: any) {
    console.error("Error al agregar existencias:", error);

    setError(
      error?.message ||
      "No se pudo actualizar el inventario."
    );
  } finally {
    setGuardandoStock(false);
  }
}

  function formatoDinero(valor: number) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(valor);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-slate-500">Cargando inventario...</p>
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
    <p className="text-sm font-medium uppercase tracking-wide text-green-600">
      Mi Negocio POS
    </p>

    <h1 className="mt-2 text-3xl font-bold text-slate-900">
      Inventario
    </h1>

    <p className="mt-2 text-slate-500">
      Administra tus productos y existencias
    </p>
  </div>

{puedeAdministrar && (
  <button
    onClick={() => {
      setError("");
      setMostrarNuevoProducto(true);
    }}
    className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
  >
    + Nuevo producto
  </button>
)}

</div>

{/* ERROR */}
{error &&
  !mostrarNuevoProducto &&
  !productoSeleccionado &&
  !productoEditando &&
  !productoAjustando && (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
      {error}
    </div>
)}

        {/* RESUMEN */}
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Productos
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalProductos}
            </p>
          </div>

<div className="rounded-2xl border bg-white p-6">
  <p className="text-sm text-slate-500">
    Existencias en inventario
  </p>

  <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
    <div>
      <p className="text-2xl font-bold text-slate-900">
        {piezasInventario}
      </p>
      <p className="text-xs text-slate-500">
        Piezas
      </p>
    </div>

    <div>
      <p className="text-2xl font-bold text-slate-900">
        {formatoCantidadKg(kilosInventario)}
      </p>
      <p className="text-xs text-slate-500">
        Kilogramos
      </p>
    </div>
  </div>
</div>

{puedeAdministrar && (
  <div className="rounded-2xl border bg-white p-6">
    <p className="text-sm text-slate-500">
      Valor del inventario
    </p>

    <p className="mt-2 text-3xl font-bold text-slate-900">
      {formatoDinero(valorInventario)}
    </p>
  </div>
)}

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Stock bajo
            </p>

            <p
              className={`mt-2 text-3xl font-bold ${
                productosStockBajo > 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {productosStockBajo}
            </p>
          </div>

        </div>

        {/* BUSCADOR */}
        <div className="mt-8">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o código de barras..."
            className="w-full rounded-xl border bg-white px-5 py-4 outline-none transition focus:border-green-500"
          />
        </div>

        {/* TABLA */}
        <div className="mt-6 overflow-hidden rounded-2xl border bg-white">

          <div className="overflow-x-auto">
            <table className="w-full">

              <thead className="border-b bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">

                  <th className="px-6 py-4">
                    Producto
                  </th>

                  <th className="px-6 py-4">
                    Código
                  </th>

{puedeAdministrar && (
  <th className="px-6 py-4">
    Costo
  </th>
)}

                  <th className="px-6 py-4">
                    Precio
                  </th>

                  <th className="px-6 py-4">
                    Stock
                  </th>

                  <th className="px-6 py-4">
                    Estado
                  </th>

{puedeAdministrar && (
  <th className="px-6 py-4 text-right">
    Acciones
  </th>
)}

</tr>
</thead>

              <tbody className="divide-y">

                {productosFiltrados.map((producto) => {
                  const sinStock = producto.stock === 0;

                  const stockBajo =
                    producto.stock > 0 &&
                    producto.stock <= producto.minimum_stock;

                  return (
                    <tr
                      key={producto.id}
                      className="transition hover:bg-slate-50"
                    >

                      <td className="px-6 py-5">
                        <p className="font-semibold text-slate-900">
                          {producto.name}
                        </p>
                      </td>

                      <td className="px-6 py-5 text-sm text-slate-500">
                        {producto.barcode || "—"}
                      </td>

{puedeAdministrar && (
  <td className="px-6 py-5 text-slate-600">
    {formatoDinero(Number(producto.cost_price))}
  </td>
)}

                      <td className="px-6 py-5 font-semibold text-slate-900">
                        {formatoDinero(Number(producto.sale_price))}
                      </td>

<td className="px-6 py-5">
  <span className="text-lg font-bold text-slate-900">
    {producto.sale_unit === "kg"
      ? formatoCantidadKg(producto.stock)
      : producto.stock}
  </span>

  <span className="ml-1 text-sm font-medium text-slate-500">
    {producto.sale_unit === "kg" ? "kg" : "pzas"}
  </span>
</td>

                      <td className="px-6 py-5">

                        {sinStock ? (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                            Sin existencias
                          </span>
                        ) : stockBajo ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            Stock bajo
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            Disponible
                          </span>
                        )}

                      </td>

{puedeAdministrar && (
  <td className="px-6 py-5">
    <div className="flex justify-end gap-2">
      <button
        onClick={() => abrirEditor(producto)}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Editar
      </button>

      <button
        onClick={() => {
          setError("");
          setProductoAjustando(producto);
          setCantidadAjuste("");
          setMotivoAjuste("");
        }}
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
      >
        Ajustar
      </button>

      <button
        onClick={() => {
          setProductoSeleccionado(producto);
          setCantidadAgregar("");
          setError("");
        }}
        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
      >
        + Existencias
      </button>
    </div>
  </td>
)}

                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>

          {productosFiltrados.length === 0 && (
            <div className="p-12 text-center">
              <p className="font-medium text-slate-700">
                No encontramos productos
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Intenta con otra búsqueda.
              </p>
            </div>
          )}

        </div>

      </div>

      {mostrarNuevoProducto && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">

      <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
        Inventario
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        Nuevo producto
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Agrega un producto a tu catálogo.
      </p>

      <div className="mt-6 space-y-4">

        {/* NOMBRE */}
        <div>
          <label className="text-sm font-medium text-slate-700">
            Nombre
          </label>

          <input
            type="text"
            value={nuevoProducto.name}
            onChange={(e) =>
              setNuevoProducto({
                ...nuevoProducto,
                name: e.target.value,
              })
            }
            placeholder="Ej. Coca Cola 600 ml"
            autoFocus
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
          />
        </div>

        {/* CÓDIGO */}
        <div>
          <label className="text-sm font-medium text-slate-700">
            Código de barras
          </label>

          <input
            type="text"
            value={nuevoProducto.barcode}
            onChange={(e) =>
              setNuevoProducto({
                ...nuevoProducto,
                barcode: e.target.value,
              })
            }
            placeholder="Opcional"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
          />
        </div>

        {/* COSTO Y PRECIO */}
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="text-sm font-medium text-slate-700">
              Costo
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={nuevoProducto.cost_price}
              onChange={(e) =>
                setNuevoProducto({
                  ...nuevoProducto,
                  cost_price: e.target.value,
                })
              }
              placeholder="0.00"
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Precio de venta
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={nuevoProducto.sale_price}
              onChange={(e) =>
                setNuevoProducto({
                  ...nuevoProducto,
                  sale_price: e.target.value,
                })
              }
              placeholder="0.00"
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
            />
          </div>

        </div>

<div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">
    Unidad de venta
  </label>

  <select
    value={nuevoProducto.sale_unit}
    onChange={(e) =>
      setNuevoProducto({
        ...nuevoProducto,
        sale_unit: e.target.value as "piece" | "kg",
      })
    }
    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
  >
    <option value="piece">Pieza</option>
    <option value="kg">Kilogramo</option>
  </select>
</div>

        {/* STOCK */}
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="text-sm font-medium text-slate-700">
              Stock inicial
            </label>

            <input
              type="number"
              min="0"
              step={nuevoProducto.sale_unit === "kg" ? "0.001" : "1"}
              value={nuevoProducto.stock}
              onChange={(e) =>
                setNuevoProducto({
                  ...nuevoProducto,
                  stock: e.target.value,
                })
              }
              placeholder={nuevoProducto.sale_unit === "kg" ? "0.000" : "5"}
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Stock mínimo
            </label>

            <input
              type="number"
              min="0"
              step={nuevoProducto.sale_unit === "kg" ? "0.001" : "1"}
              value={nuevoProducto.minimum_stock}
              onChange={(e) =>
                setNuevoProducto({
                  ...nuevoProducto,
                  minimum_stock: e.target.value,
                })
              }
              placeholder={nuevoProducto.sale_unit === "kg" ? "0.000" : "5"}
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
            />
          </div>

       </div>

    </div>

    {/* ERROR DEL MODAL NUEVO PRODUCTO */}
    {error && (
      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        {error}
      </div>
    )}

    <button
      onClick={crearProducto}
        disabled={guardandoProducto}
        className="mt-7 w-full rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {guardandoProducto
          ? "Guardando..."
          : "Crear producto"}
      </button>

      <button
        onClick={() => {
  setError("");
  setMostrarNuevoProducto(false);
}}
        disabled={guardandoProducto}
        className="mt-3 w-full rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-200"
      >
        Cancelar
      </button>

    </div>
  </div>
)}

{productoEditando && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">

      <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
        Inventario
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        Editar producto
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Modifica la información del producto.
      </p>

      <div className="mt-6 space-y-4">

        <div>
          <label className="text-sm font-medium text-slate-700">
            Nombre
          </label>

          <input
            type="text"
            value={productoEditado.name}
            onChange={(e) =>
              setProductoEditado({
                ...productoEditado,
                name: e.target.value,
              })
            }
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Código de barras
          </label>

          <input
            type="text"
            value={productoEditado.barcode}
            onChange={(e) =>
              setProductoEditado({
                ...productoEditado,
                barcode: e.target.value,
              })
            }
            placeholder="Opcional"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="text-sm font-medium text-slate-700">
              Costo
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={productoEditado.cost_price}
              onChange={(e) =>
                setProductoEditado({
                  ...productoEditado,
                  cost_price: e.target.value,
                })
              }
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Precio de venta
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={productoEditado.sale_price}
              onChange={(e) =>
                setProductoEditado({
                  ...productoEditado,
                  sale_price: e.target.value,
                })
              }
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
            />
          </div>

        </div>

<div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">
    Unidad de venta
  </label>

  <select
    value={productoEditado.sale_unit}
    onChange={(e) =>
      setProductoEditado({
        ...productoEditado,
        sale_unit: e.target.value as "piece" | "kg",
      })
    }
    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
  >
    <option value="piece">Pieza</option>
    <option value="kg">Kilogramo</option>
  </select>
</div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Stock mínimo
          </label>

          <input
            type="number"
            min="0"
            step={productoEditado.sale_unit === "kg" ? "0.001" : "1"}
            value={productoEditado.minimum_stock}
            onChange={(e) =>
              setProductoEditado({
                ...productoEditado,
                minimum_stock: e.target.value,
              })
            }
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-green-500"
          />
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Existencias actuales
            </span>

            <span className="font-bold text-slate-900">
              {productoEditando.stock}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            Las existencias se modifican desde “+ Existencias”.
          </p>
        </div>

      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={guardarEdicion}
        disabled={guardandoEdicion}
        className="mt-6 w-full rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {guardandoEdicion
          ? "Guardando..."
          : "Guardar cambios"}
      </button>

      <button
        onClick={() => {
          setError("");
          setProductoEditando(null);
        }}
        disabled={guardandoEdicion}
        className="mt-3 w-full rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-200"
      >
        Cancelar
      </button>

    </div>
  </div>
)}

{productoAjustando && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

    <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">

      <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">
        Ajuste de inventario
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        {productoAjustando.name}
      </h2>

      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        <div className="flex justify-between">
          <span className="text-slate-500">
            Stock actual
          </span>

          <span className="font-bold text-slate-900">
            {productoAjustando.stock}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium text-slate-700">
          Ajuste
        </label>

        <input
          type="number"
          step={productoAjustando.sale_unit === "kg" ? "0.001" : "1"}
          value={cantidadAjuste}
          onChange={(e) =>
            setCantidadAjuste(e.target.value)
          }
          placeholder="Ej. -2 o 3"
          autoFocus
          className="mt-2 w-full rounded-xl border px-5 py-4 text-xl font-semibold outline-none focus:border-amber-500"
        />

        <p className="mt-2 text-xs text-slate-400">
          Usa - para quitar unidades y + para agregar.
        </p>
      </div>

      <div className="mt-5">
        <label className="text-sm font-medium text-slate-700">
          Motivo
        </label>

        <input
          type="text"
          value={motivoAjuste}
          onChange={(e) =>
            setMotivoAjuste(e.target.value)
          }
          placeholder="Ej. Merma, daño, conteo físico..."
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-amber-500"
        />
      </div>

{cantidadAjuste &&
  Number.isFinite(Number(cantidadAjuste)) &&
  Number(cantidadAjuste) !== 0 &&
  (productoAjustando.sale_unit === "kg" ||
    Number.isInteger(Number(cantidadAjuste))) && (

          <div className="mt-5 rounded-xl border bg-slate-50 p-4">

            <div className="flex justify-between text-sm text-slate-500">
              <span>Stock actual</span>
              <span>{productoAjustando.stock}</span>
            </div>

            <div className="mt-2 flex justify-between text-sm text-slate-500">
              <span>Ajuste</span>

              <span
                className={
                  Number(cantidadAjuste) > 0
                    ? "font-semibold text-green-600"
                    : "font-semibold text-red-600"
                }
              >
                {Number(cantidadAjuste) > 0 ? "+" : ""}
                {cantidadAjuste}
              </span>
            </div>

            <div className="mt-3 border-t pt-3">
              <div className="flex justify-between font-bold">
                <span>Stock resultante</span>

                <span>
                  {productoAjustando.stock +
                    Number(cantidadAjuste)}
                </span>
              </div>
            </div>

          </div>
        )}

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={ajustarStock}
        disabled={
          guardandoAjuste ||
          !cantidadAjuste ||
          !motivoAjuste.trim()
        }
        className="mt-6 w-full rounded-xl bg-amber-500 px-5 py-3 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
      >
        {guardandoAjuste
          ? "Guardando..."
          : "Confirmar ajuste"}
      </button>

      <button
        onClick={() => {
          setError("");
          setProductoAjustando(null);
          setCantidadAjuste("");
          setMotivoAjuste("");
        }}
        disabled={guardandoAjuste}
        className="mt-3 w-full rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-200"
      >
        Cancelar
      </button>

    </div>

  </div>
)}

{productoSeleccionado && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

    <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">

      <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
        Reponer inventario
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        {productoSeleccionado.name}
      </h2>

      <p className="mt-1 text-slate-500">
        Stock actual:{" "}
        <span className="font-semibold text-slate-900">
          {productoSeleccionado.stock}
        </span>
      </p>

      <div className="mt-6">
        <label className="text-sm font-medium text-slate-700">
          Cantidad que entra
        </label>

        <input
          type="number"
min={productoSeleccionado.sale_unit === "kg" ? "0.001" : "1"}
step={productoSeleccionado.sale_unit === "kg" ? "0.001" : "1"}
          value={cantidadAgregar}
          onChange={(e) => setCantidadAgregar(e.target.value)}
placeholder={
  productoSeleccionado.sale_unit === "kg"
    ? "Ej. 2.500"
    : "Ej. 24"
}
          autoFocus
          className="mt-2 w-full rounded-xl border px-5 py-4 text-xl font-semibold outline-none transition focus:border-green-500"
        />
      </div>

      {cantidadAgregar &&
        Number(cantidadAgregar) > 0 && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4">

            <div className="flex justify-between text-slate-500">
              <span>Stock actual</span>
              <span>
                {productoSeleccionado.stock}
              </span>
            </div>

            <div className="mt-2 flex justify-between text-slate-500">
              <span>Entrada</span>
              <span className="text-green-600">
                +{cantidadAgregar}
              </span>
            </div>

            <div className="mt-3 border-t pt-3">
              <div className="flex justify-between font-bold text-slate-900">
                <span>Nuevo stock</span>
                <span>
                  {productoSeleccionado.stock +
                    Number(cantidadAgregar)}
                </span>
              </div>
            </div>

          </div>
        )}

        {error && (
  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
    {error}
  </div>
)}

      <button
        onClick={agregarExistencias}
        disabled={
          guardandoStock ||
          !cantidadAgregar ||
          Number(cantidadAgregar) <= 0
        }
        className="mt-6 w-full rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {guardandoStock
          ? "Guardando..."
          : "Confirmar entrada"}
      </button>

      <button
        onClick={() => {
          setProductoSeleccionado(null);
          setCantidadAgregar("");
        }}
        disabled={guardandoStock}
        className="mt-3 w-full rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-200"
      >
        Cancelar
      </button>

    </div>

  </div>
)}

    </main>
  );
}