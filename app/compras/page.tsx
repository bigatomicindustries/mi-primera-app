"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "@/context/AuthContext";

type Compra = {
  id: string;
  number: string;
  supplier_id: string | null;
  subtotal: number;
  total: number;
  status: "completed" | "cancelled";
  notes: string | null;
  created_at: string;
};

type Producto = {
  id: string;
  name: string;
  barcode: string | null;
  stock: number;
  cost_price: number;
  sale_price: number;
};

type ItemCompra = {
  product_id: string;
  name: string;
  quantity: number;
  unit_cost: number;
};

type ItemDevolucion = {
  purchase_item_id: string;
  product_id: string | null;
  name: string;
  quantity_purchased: number;
  quantity_returned: number;
  quantity_available: number;
  quantity_to_return: number;
  unit_cost: number;
};

type ItemCompraGuardado = {
  id: string;
  purchase_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
};

type Proveedor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

type SesionCaja = {
  id: string;
  status: "open" | "closed";
  opening_amount: number;
  opened_at: string;
};

export default function ComprasPage() {
const {
  puedeAdministrar,
  cargando,
  sucursalActiva,
  cargandoSucursales,
} = useAuth();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
const [mostrarNuevaCompra, setMostrarNuevaCompra] = useState(false);

const [busqueda, setBusqueda] = useState("");
const [itemsCompra, setItemsCompra] = useState<ItemCompra[]>([]);
const [notas, setNotas] = useState("");

const [guardando, setGuardando] = useState(false);

const [proveedores, setProveedores] = useState<Proveedor[]>([]);
const [proveedorId, setProveedorId] = useState("");

const [mostrarNuevoProveedor, setMostrarNuevoProveedor] =
  useState(false);

const [nombreProveedor, setNombreProveedor] = useState("");
const [telefonoProveedor, setTelefonoProveedor] = useState("");
const [emailProveedor, setEmailProveedor] = useState("");
const [guardandoProveedor, setGuardandoProveedor] =
  useState(false);
  const [compraSeleccionada, setCompraSeleccionada] =
  useState<Compra | null>(null);

  const [itemsDetalle, setItemsDetalle] =
  useState<ItemCompraGuardado[]>([]);

const [cargandoDetalle, setCargandoDetalle] =
  useState(false);

const [sesionCaja, setSesionCaja] =
  useState<SesionCaja | null>(null);

const [pagarDesdeCaja, setPagarDesdeCaja] =
  useState(false);

  const [mostrarNuevoProducto, setMostrarNuevoProducto] =
  useState(false);

const [nombreNuevoProducto, setNombreNuevoProducto] =
  useState("");

const [codigoNuevoProducto, setCodigoNuevoProducto] =
  useState("");

const [costoNuevoProducto, setCostoNuevoProducto] =
  useState("");

const [precioNuevoProducto, setPrecioNuevoProducto] =
  useState("");

const [guardandoProducto, setGuardandoProducto] =
  useState(false);

  const [mostrarCancelarCompra, setMostrarCancelarCompra] =
  useState(false);

const [cancelandoCompra, setCancelandoCompra] =
  useState(false);

  const [mostrarDevolucion, setMostrarDevolucion] =
  useState(false);

const [itemsDevolucion, setItemsDevolucion] =
  useState<ItemDevolucion[]>([]);

  const [confirmandoDevolucion, setConfirmandoDevolucion] =
  useState(false);

const [cargandoDevolucion, setCargandoDevolucion] =
  useState(false);

const [registrandoDevolucion, setRegistrandoDevolucion] =
  useState(false);

const [reembolsoACaja, setReembolsoACaja] =
  useState(false);

const [notasDevolucion, setNotasDevolucion] =
  useState("");

useEffect(() => {
  if (cargando || !puedeAdministrar) return;
  if (cargandoSucursales) return;

  if (!sucursalActiva) {
    setCompras([]);
    setProductos([]);
    setSesionCaja(null);
    setLoading(false);
    return;
  }

  const branchId = sucursalActiva.id;

  async function cargarCompras() {
    try {
      setLoading(true);
      setError("");

      // =========================
      // CARGAR COMPRAS
      // =========================

      const { data: comprasData, error: comprasError } =
        await supabase
          .from("purchases")
          .select(
            `
            id,
            number,
            supplier_id,
            subtotal,
            total,
            status,
            notes,
            created_at
            `
          )
          .eq("branch_id", branchId)
          .order("created_at", { ascending: false });

      if (comprasError) throw comprasError;

      setCompras(comprasData ?? []);

      // =========================
      // CARGAR PRODUCTOS
      // =========================

      const {
        data: inventarioData,
        error: productosError,
      } = await supabase
        .from("branch_inventory")
        .select(`
          stock,
          product:products!inner (
            id,
            name,
            barcode,
            sale_price
          )
        `)
        .eq("branch_id", branchId);

      if (productosError) throw productosError;

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
        (inventarioData ?? [])
          .map((item: any) => ({
            id: item.product.id,
            name: item.product.name,
            barcode: item.product.barcode,
            stock: Number(item.stock),
            sale_price: Number(item.product.sale_price),
            cost_price:
              costosPorProducto.get(item.product.id) ?? 0,
          }))
          .sort((a, b) =>
            a.name.localeCompare(b.name, "es")
          );

      setProductos(productosConCosto);

      // =========================
      // CARGAR PROVEEDORES
      // =========================

      const {
        data: proveedoresData,
        error: proveedoresError,
      } = await supabase
        .from("suppliers")
        .select("id, name, phone, email, notes")
        .order("name");

      if (proveedoresError) throw proveedoresError;

      setProveedores(proveedoresData ?? []);

      // =========================
      // CARGAR CAJA ABIERTA
      // =========================

      const {
        data: sesionCajaData,
        error: sesionCajaError,
      } = await supabase
        .from("cash_sessions")
        .select(
          "id, status, opening_amount, opened_at"
        )
        .eq("status", "open")
        .eq("branch_id", branchId)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sesionCajaError) throw sesionCajaError;

      setSesionCaja(sesionCajaData ?? null);

    } catch (error: any) {
      console.log("ERROR COMPLETO:", error);
      console.log("MENSAJE:", error?.message);
      console.log("CODIGO:", error?.code);
      console.log("DETALLES:", error?.details);
      console.log("HINT:", error?.hint);

      setError(
        error?.message ||
          "No se pudieron cargar los datos."
      );
    } finally {
      setLoading(false);
    }
  }

  cargarCompras();
}, [
  cargando,
  puedeAdministrar,
  cargandoSucursales,
  sucursalActiva?.id,
]);

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

    function nombreProveedorDeCompra(
  supplierId: string | null
) {
  if (!supplierId) return "Sin proveedor";

  const proveedor = proveedores.find(
    (proveedor) => proveedor.id === supplierId
  );

  return proveedor?.name ?? "Proveedor no encontrado";
}

const productosFiltrados = productos.filter((producto) => {
  const texto = busqueda.toLowerCase().trim();

  if (!texto) return false;

  return (
    producto.name.toLowerCase().includes(texto) ||
    producto.barcode?.toLowerCase().includes(texto)
  );
});

async function abrirDevolucion() {
  if (!compraSeleccionada) return;

  try {
    setCargandoDevolucion(true);
    setError("");

    // Items originales de esta compra
    const { data: itemsOriginales, error: itemsError } =
      await supabase
        .from("purchase_items")
        .select(
          "id, product_id, name, quantity, unit_cost"
        )
        .eq(
          "purchase_id",
          compraSeleccionada.id
        );

    if (itemsError) throw itemsError;

    // Devoluciones que ya existen para esta compra
    const { data: devoluciones, error: devolucionesError } =
      await supabase
        .from("purchase_returns")
        .select("id")
        .eq(
          "purchase_id",
          compraSeleccionada.id
        );

    if (devolucionesError) throw devolucionesError;

    let itemsYaDevueltos: {
      purchase_item_id: string;
      quantity: number;
    }[] = [];

    if (devoluciones && devoluciones.length > 0) {
      const idsDevoluciones =
        devoluciones.map((d) => d.id);

      const { data, error } = await supabase
        .from("purchase_return_items")
        .select("purchase_item_id, quantity")
        .in(
          "purchase_return_id",
          idsDevoluciones
        );

      if (error) throw error;

      itemsYaDevueltos = data ?? [];
    }

    const preparados: ItemDevolucion[] =
      (itemsOriginales ?? []).map((item) => {
        const cantidadDevuelta =
          itemsYaDevueltos
            .filter(
              (devuelto) =>
                devuelto.purchase_item_id === item.id
            )
            .reduce(
              (total, devuelto) =>
                total + Number(devuelto.quantity),
              0
            );

        const disponible =
          Number(item.quantity) - cantidadDevuelta;

        return {
          purchase_item_id: item.id,
          product_id: item.product_id,
          name: item.name,
          quantity_purchased: Number(item.quantity),
          quantity_returned: cantidadDevuelta,
          quantity_available: disponible,
          quantity_to_return: 0,
          unit_cost: Number(item.unit_cost),
        };
      });

    setItemsDevolucion(preparados);
setNotasDevolucion("");
setReembolsoACaja(false);
setConfirmandoDevolucion(false);
setMostrarDevolucion(true);
  } catch (error: any) {
    console.error(
      "Error preparando devolución:",
      error
    );

    setError(
      error?.message ||
        "No se pudo preparar la devolución."
    );
  } finally {
    setCargandoDevolucion(false);
  }
}

async function registrarDevolucion() {
  if (!compraSeleccionada) return;

  const itemsSeleccionados = itemsDevolucion.filter(
    (item) => item.quantity_to_return > 0
  );

  if (itemsSeleccionados.length === 0) {
    setError("Selecciona al menos un producto para devolver.");
    return;
  }

  if (reembolsoACaja && !sesionCaja) {
    setError(
      "No hay una sesión de caja abierta para registrar el reembolso."
    );
    return;
  }

  try {
    setRegistrandoDevolucion(true);
    setError("");

    // =========================
    // GENERAR FOLIO LOCAL
    // =========================

    const ahora = new Date();

    const yyyy = ahora.getFullYear();

    const mm = String(
      ahora.getMonth() + 1
    ).padStart(2, "0");

    const dd = String(
      ahora.getDate()
    ).padStart(2, "0");

    const hh = String(
      ahora.getHours()
    ).padStart(2, "0");

    const mi = String(
      ahora.getMinutes()
    ).padStart(2, "0");

    const ss = String(
      ahora.getSeconds()
    ).padStart(2, "0");

    const aleatorio = Math.floor(
      100 + Math.random() * 900
    );

    const numeroDevolucion =
      `D-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${aleatorio}`;

    // =========================
    // PREPARAR ITEMS PARA RPC
    // =========================

    const itemsRPC = itemsSeleccionados.map(
      (item) => ({
        purchase_item_id: item.purchase_item_id,
        quantity: Number(item.quantity_to_return),
      })
    );

    // =========================
    // REGISTRAR DEVOLUCIÓN
    // =========================

    const { data: returnId, error: rpcError } =
      await supabase.rpc(
        "register_purchase_return",
        {
          p_number: numeroDevolucion,
          p_purchase_id: compraSeleccionada.id,
          p_notes:
            notasDevolucion.trim() || null,
          p_items: itemsRPC,
          p_cash_session_id:
            reembolsoACaja && sesionCaja
              ? sesionCaja.id
              : null,
        }
      );

    if (rpcError) throw rpcError;

    console.log(
      "Devolución registrada:",
      returnId
    );

    // =========================
    // ACTUALIZAR PRODUCTOS
    // =========================

// =========================
// ACTUALIZAR PRODUCTOS
// =========================

if (!sucursalActiva) {
  throw new Error(
    "No hay una sucursal activa seleccionada."
  );
}

const {
  data: inventarioActualizado,
  error: productosError,
} = await supabase
  .from("branch_inventory")
  .select(`
    stock,
    product:products!inner (
      id,
      name,
      barcode,
      sale_price
    )
  `)
  .eq("branch_id", sucursalActiva.id);

if (productosError) {
  throw productosError;
}

const {
  data: costosData,
  error: costosError,
} = await supabase.rpc("get_product_costs");

if (costosError) {
  throw costosError;
}

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
  (inventarioActualizado ?? [])
    .map((item: any) => ({
      id: item.product.id,
      name: item.product.name,
      barcode: item.product.barcode,
      stock: Number(item.stock),
      sale_price: Number(item.product.sale_price),
      cost_price:
        costosPorProducto.get(item.product.id) ?? 0,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );

setProductos(productosConCosto);

    // =========================
    // LIMPIAR Y CERRAR
    // =========================

    setMostrarDevolucion(false);
    setConfirmandoDevolucion(false);
    setItemsDevolucion([]);
    setNotasDevolucion("");
    setReembolsoACaja(false);

  } catch (error: any) {
    console.error(
      "Error registrando devolución:",
      error
    );

    setError(
      error?.message ||
        error?.details ||
        "No se pudo registrar la devolución."
    );
  } finally {
    setRegistrandoDevolucion(false);
  }
}

async function abrirCompra(compra: Compra) {
  try {
    setCompraSeleccionada(compra);
    setItemsDetalle([]);
    setCargandoDetalle(true);
    setError("");

    const { data, error } = await supabase
      .from("purchase_items")
      .select(
        `
        id,
        purchase_id,
        product_id,
        name,
        quantity,
        unit_cost,
        subtotal
        `
      )
      .eq("purchase_id", compra.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    setItemsDetalle(data ?? []);
  } catch (error: any) {
    console.error("Error cargando detalle de compra:", error);

    setError(
      error?.message ||
        "No se pudo cargar el detalle de la compra."
    );
  } finally {
    setCargandoDetalle(false);
  }
}

function agregarProducto(producto: Producto) {
  const yaExiste = itemsCompra.some(
    (item) => item.product_id === producto.id
  );

  if (yaExiste) {
    setItemsCompra((actuales) =>
      actuales.map((item) =>
        item.product_id === producto.id
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      )
    );
  } else {
    setItemsCompra((actuales) => [
      ...actuales,
      {
        product_id: producto.id,
        name: producto.name,
        quantity: 1,
        unit_cost: Number(producto.cost_price),
      },
    ]);
  }

  setBusqueda("");
}

function cambiarCantidad(
  productId: string,
  cantidad: number
) {
  setItemsCompra((actuales) =>
    actuales.map((item) =>
      item.product_id === productId
        ? {
            ...item,
            quantity: Math.max(1, cantidad),
          }
        : item
    )
  );
}

function cambiarCosto(
  productId: string,
  costo: number
) {
  setItemsCompra((actuales) =>
    actuales.map((item) =>
      item.product_id === productId
        ? {
            ...item,
            unit_cost: Math.max(0, costo),
          }
        : item
    )
  );
}

function eliminarProducto(productId: string) {
  setItemsCompra((actuales) =>
    actuales.filter(
      (item) => item.product_id !== productId
    )
  );
}

function abrirNuevaCompra() {
  setBusqueda("");
  setItemsCompra([]);
  setNotas("");
  setProveedorId("");
  setPagarDesdeCaja(false);
  setError("");
  setMostrarNuevaCompra(true);
}

const totalCompra = itemsCompra.reduce(
  (total, item) =>
    total +
    Number(item.quantity) * Number(item.unit_cost),
  0
);

async function cancelarCompra() {
  if (!compraSeleccionada) return;

  try {
    setCancelandoCompra(true);
    setError("");

    const { error } = await supabase.rpc(
      "cancel_purchase",
      {
        p_purchase_id: compraSeleccionada.id,
      }
    );

    if (error) throw error;

    // Actualizamos el historial sin recargar la página
    setCompras((actuales) =>
      actuales.map((compra) =>
        compra.id === compraSeleccionada.id
          ? {
              ...compra,
              status: "cancelled",
            }
          : compra
      )
    );

    // Actualizamos también la compra abierta
    setCompraSeleccionada((actual) =>
      actual
        ? {
            ...actual,
            status: "cancelled",
          }
        : null
    );

    setMostrarCancelarCompra(false);
  } catch (error: any) {
    console.log("Error cancelando compra:", error);

    setError(
      error?.message ||
        "No se pudo cancelar la compra."
    );
  } finally {
    setCancelandoCompra(false);
  }
}

async function crearProveedor() {
  const nombre = nombreProveedor.trim();

  if (!nombre) {
    setError("Escribe el nombre del proveedor.");
    return;
  }

  try {
    setGuardandoProveedor(true);
    setError("");

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name: nombre,
        phone: telefonoProveedor.trim() || null,
        email: emailProveedor.trim() || null,
      })
      .select("id, name, phone, email, notes")
      .single();

    if (error) throw error;

    // Lo agregamos al catálogo sin recargar la página
    setProveedores((actuales) =>
      [...actuales, data].sort((a, b) =>
        a.name.localeCompare(b.name, "es")
      )
    );

    // Y queda seleccionado automáticamente
    setProveedorId(data.id);

    setNombreProveedor("");
    setTelefonoProveedor("");
    setEmailProveedor("");
    setMostrarNuevoProveedor(false);

  } catch (error: any) {
    console.log("Error creando proveedor:", error);

    setError(
      error?.message ||
        "No se pudo crear el proveedor."
    );
  } finally {
    setGuardandoProveedor(false);
  }
}

async function crearProducto() {
  const nombre = nombreNuevoProducto.trim();

  if (!nombre) {
    setError("Escribe el nombre del producto.");
    return;
  }

  if (cargandoSucursales) return;

  if (!sucursalActiva) {
    setError("No hay una sucursal activa seleccionada.");
    return;
  }

  const costo = Number(costoNuevoProducto || 0);
  const precio = Number(precioNuevoProducto || 0);

  if (costo < 0 || precio < 0) {
    setError("El costo y el precio no pueden ser negativos.");
    return;
  }

  try {
    setGuardandoProducto(true);
    setError("");

    // =========================
    // CREAR PRODUCTO
    // =========================

const { data: resultadoProducto, error } = await supabase.rpc(
  "create_product",
  {
    p_name: nombre,
    p_barcode: codigoNuevoProducto.trim() || null,
    p_cost_price: costo,
    p_sale_price: precio,
    p_initial_stock: 0,
    p_minimum_stock: 0,
    p_branch_id: sucursalActiva.id,
  }
);

if (error) throw error;

const productoId = resultadoProducto?.product_id;

if (!productoId) {
  throw new Error(
    "No se pudo obtener el identificador del producto creado."
  );
}

    // =========================
    // OBTENER PRODUCTO CREADO
    // =========================

    const {
      data: inventarioCreado,
      error: inventarioError,
    } = await supabase
      .from("branch_inventory")
      .select(`
        stock,
        product:products!inner (
          id,
          name,
          barcode,
          sale_price
        )
      `)
      .eq("branch_id", sucursalActiva.id)
      .eq("product_id", productoId)
      .single();

    if (inventarioError) throw inventarioError;

    const producto = (inventarioCreado as any).product;

    const productoCreado: Producto = {
      id: producto.id,
      name: producto.name,
      barcode: producto.barcode,
      stock: Number(inventarioCreado.stock),
      cost_price: costo,
      sale_price: Number(producto.sale_price),
    };

    // =========================
    // AGREGAR AL CATÁLOGO LOCAL
    // =========================

    setProductos((actuales) =>
      [...actuales, productoCreado].sort((a, b) =>
        a.name.localeCompare(b.name, "es")
      )
    );

    // =========================
    // AGREGAR A LA COMPRA
    // =========================

    setItemsCompra((actuales) => [
      ...actuales,
      {
        product_id: productoCreado.id,
        name: productoCreado.name,
        quantity: 1,
        unit_cost: costo,
      },
    ]);

    // =========================
    // LIMPIAR
    // =========================

    setNombreNuevoProducto("");
    setCodigoNuevoProducto("");
    setCostoNuevoProducto("");
    setPrecioNuevoProducto("");
    setBusqueda("");
    setMostrarNuevoProducto(false);

  } catch (error: any) {
    console.error("Error creando producto:", error);

    if (error?.code === "23505") {
      setError(
        "Ya existe un producto con ese código de barras."
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

async function registrarCompra() {
if (cargandoSucursales) return;

if (!sucursalActiva) {
  setError("No hay una sucursal activa seleccionada.");
  return;
}
  if (itemsCompra.length === 0) {
    setError("Agrega al menos un producto.");
    return;
  }

  if (pagarDesdeCaja && !sesionCaja) {
  setError(
    "No hay una sesión de caja abierta para pagar esta compra."
  );
  return;
}

  try {
    setGuardando(true);
    setError("");

// Generamos el folio usando fecha y hora local
const ahora = new Date();

const yyyy = ahora.getFullYear();

const mm = String(
  ahora.getMonth() + 1
).padStart(2, "0");

const dd = String(
  ahora.getDate()
).padStart(2, "0");

const hh = String(
  ahora.getHours()
).padStart(2, "0");

const mi = String(
  ahora.getMinutes()
).padStart(2, "0");

const ss = String(
  ahora.getSeconds()
).padStart(2, "0");

const aleatorio = Math.floor(
  100 + Math.random() * 900
);

const numeroCompra =
  `C-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${aleatorio}`;

    // Preparamos los productos para PostgreSQL
    const itemsRPC = itemsCompra.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      unit_cost: Number(item.unit_cost),
    }));

const { data: purchaseId, error: rpcError } =
  await supabase.rpc("register_purchase", {
    p_number: numeroCompra,
    p_supplier_id: proveedorId || null,
    p_notes: notas.trim(),
    p_items: itemsRPC,
    p_cash_session_id:
      pagarDesdeCaja && sesionCaja
        ? sesionCaja.id
        : null,
    p_branch_id: sucursalActiva.id,
  });

    if (rpcError) throw rpcError;

    // Recuperamos la compra recién creada
    const { data: nuevaCompra, error: compraError } =
      await supabase
        .from("purchases")
        .select(
          `
          id,
          number,
          supplier_id,
          subtotal,
          total,
          status,
          notes,
          created_at
          `
        )
        .eq("id", purchaseId)
        .single();

    if (compraError) throw compraError;

    // La agregamos inmediatamente al historial
    setCompras((actuales) => [
      nuevaCompra,
      ...actuales,
    ]);

// Actualizamos productos de la sucursal activa
// porque cambió stock y costo

const {
  data: inventarioActualizado,
  error: productosError,
} = await supabase
  .from("branch_inventory")
  .select(`
    stock,
    product:products!inner (
      id,
      name,
      barcode,
      sale_price
    )
  `)
  .eq("branch_id", sucursalActiva.id);

if (productosError) throw productosError;

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
  (inventarioActualizado ?? [])
    .map((item: any) => ({
      id: item.product.id,
      name: item.product.name,
      barcode: item.product.barcode,
      stock: Number(item.stock),
      sale_price: Number(item.product.sale_price),
      cost_price:
        costosPorProducto.get(item.product.id) ?? 0,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );

setProductos(productosConCosto);

    // Limpiamos el formulario
    setItemsCompra([]);
    setBusqueda("");
    setNotas("");
    setMostrarNuevaCompra(false);

} catch (error: any) {
  console.log("ERROR COMPLETO:", error);
  console.log("MESSAGE:", error?.message);
  console.log("DETAILS:", error?.details);
  console.log("HINT:", error?.hint);
  console.log("CODE:", error?.code);

  setError(
    error?.message ||
      error?.details ||
      "No se pudo registrar la compra."
  );
} finally {
  setGuardando(false);
}
}
const totalDevolucion = itemsDevolucion.reduce(
  (total, item) =>
    total +
    item.quantity_to_return * item.unit_cost,
  0
);

if (cargando) {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <p className="text-slate-500">
        Verificando permisos...
      </p>
    </main>
  );
}

if (!puedeAdministrar) {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Acceso restringido
        </h1>

        <p className="mt-2 text-slate-500">
          No tienes permisos para administrar compras.
        </p>

      </div>
    </main>
  );
}

return (
  <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-6xl">

        {/* ENCABEZADO */}

        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              MI NEGOCIO POS
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Compras
            </h1>

            <p className="mt-2 text-slate-500">
              Registra compras de mercancía y entradas de inventario.
            </p>
          </div>

          <button
  type="button"
  onClick={abrirNuevaCompra}
  className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700"
>
  + Nueva compra
</button>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
            {error}
          </div>
        )}

        {/* CONTENIDO */}

        <div className="mt-10 overflow-hidden rounded-2xl border bg-white">

<div className="grid grid-cols-5 gap-4 border-b bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
  <div>Compra</div>
  <div>Proveedor</div>
  <div>Fecha</div>
  <div>Estado</div>
  <div className="text-right">
    Total
  </div>
</div>

          {loading ? (
            <div className="px-6 py-16 text-center text-slate-500">
              Cargando compras...
            </div>
          ) : compras.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-semibold text-slate-600">
                Todavía no hay compras
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Registra tu primera compra de mercancía.
              </p>
            </div>
          ) : (
            compras.map((compra) => (
  <button
    key={compra.id}
    type="button"
    onClick={() => abrirCompra(compra)}
    className="grid w-full grid-cols-5 items-center gap-4 border-b px-6 py-5 text-left transition hover:bg-slate-50 last:border-b-0"
  >
    <div>
      <p className="font-semibold">
        {compra.number}
      </p>

      {compra.notes && (
        <p className="mt-1 truncate text-xs text-slate-400">
          {compra.notes}
        </p>
      )}
    </div>

    <div>
      <p className="text-sm font-medium text-slate-700">
        {nombreProveedorDeCompra(compra.supplier_id)}
      </p>
    </div>

    <div className="text-sm text-slate-600">
      {formatoFecha(compra.created_at)}
    </div>

    <div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          compra.status === "completed"
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        }`}
      >
        {compra.status === "completed"
          ? "Completada"
          : "Cancelada"}
      </span>
    </div>

    <div className="text-right text-lg font-bold">
      {formatoDinero(Number(compra.total))}
    </div>
  </button>
))
          )}
        </div>

      </div>

      {mostrarNuevaCompra && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onClick={() => setMostrarNuevaCompra(false)}
  >
    <div
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ENCABEZADO */}

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Compra de mercancía
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            Nueva compra
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Agrega los productos recibidos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarNuevaCompra(false)}
          className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      {/* PROVEEDOR */}

<div className="mt-7">
  <div className="flex items-center justify-between gap-4">
    <label className="text-sm font-medium text-slate-700">
      Proveedor
    </label>

    <button
      type="button"
      onClick={() => {
        setNombreProveedor("");
        setTelefonoProveedor("");
        setEmailProveedor("");
        setMostrarNuevoProveedor(true);
      }}
      className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
    >
      + Nuevo proveedor
    </button>
  </div>

  <select
    value={proveedorId}
    onChange={(e) => setProveedorId(e.target.value)}
    className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-indigo-500"
  >
    <option value="">
      Sin proveedor
    </option>

    {proveedores.map((proveedor) => (
      <option
        key={proveedor.id}
        value={proveedor.id}
      >
        {proveedor.name}
      </option>
    ))}
  </select>
</div>

      {/* BUSCADOR */}

      <div className="relative mt-7">
        <label className="text-sm font-medium text-slate-700">
          Buscar producto
        </label>

        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o código de barras"
          autoFocus
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />

        {busqueda.trim() !== "" && (
          <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">
            {productosFiltrados.length === 0 ? (
              <div className="p-4">
  <p className="text-sm text-slate-500">
    No encontramos ese producto.
  </p>

  <button
    type="button"
    onClick={() => {
      setNombreNuevoProducto(busqueda.trim());
      setCodigoNuevoProducto("");
      setCostoNuevoProducto("");
      setPrecioNuevoProducto("");
      setMostrarNuevoProducto(true);
    }}
    className="mt-3 w-full rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
  >
    + Crear nuevo producto
  </button>
</div>
            ) : (
              productosFiltrados.slice(0, 8).map((producto) => (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => agregarProducto(producto)}
                  className="flex w-full items-center justify-between border-b px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0"
                >
                  <div>
                    <p className="font-semibold">
                      {producto.name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Stock actual: {producto.stock}
                      {producto.barcode
                        ? ` · ${producto.barcode}`
                        : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatoDinero(
                        Number(producto.cost_price)
                      )}
                    </p>

                    <p className="text-xs text-slate-400">
                      costo actual
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* PRODUCTOS */}

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Productos
        </p>

        {itemsCompra.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
            Busca un producto arriba para agregarlo.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {itemsCompra.map((item) => (
              <div
                key={item.product_id}
                className="rounded-2xl border p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="font-semibold">
                    {item.name}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      eliminarProducto(item.product_id)
                    }
                    className="text-sm font-semibold text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500">
                      Cantidad
                    </label>

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) =>
                        cambiarCantidad(
                          item.product_id,
                          Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">
                      Costo unitario
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_cost}
                      onChange={(e) =>
                        cambiarCosto(
                          item.product_id,
                          Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Subtotal
                    </p>

                    <p className="mt-2 text-lg font-bold">
                      {formatoDinero(
                        item.quantity * item.unit_cost
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NOTAS */}

      <div className="mt-7">
        <label className="text-sm font-medium text-slate-700">
          Notas
        </label>

        <input
          type="text"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej. Compra semanal"
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      {/* FORMA DE PAGO */}

<div className="mt-7">
  <p className="text-sm font-medium text-slate-700">
    Forma de pago
  </p>

  <div className="mt-3 space-y-3">
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition hover:bg-slate-50">
      <input
        type="radio"
        name="formaPagoCompra"
        checked={!pagarDesdeCaja}
        onChange={() => setPagarDesdeCaja(false)}
        className="mt-1"
      />

      <div>
        <p className="font-semibold">
          No afectar caja
        </p>

        <p className="mt-1 text-sm text-slate-500">
          La compra se registra en inventario, pero no genera
          una salida de efectivo.
        </p>
      </div>
    </label>

    <label
      className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
        sesionCaja
          ? "cursor-pointer hover:bg-slate-50"
          : "cursor-not-allowed bg-slate-50 opacity-60"
      }`}
    >
      <input
        type="radio"
        name="formaPagoCompra"
        checked={pagarDesdeCaja}
        disabled={!sesionCaja}
        onChange={() => setPagarDesdeCaja(true)}
        className="mt-1"
      />

      <div>
        <p className="font-semibold">
          Efectivo de caja
        </p>

        {sesionCaja ? (
          <p className="mt-1 text-sm text-green-600">
            Caja abierta · se registrará una salida de{" "}
            {formatoDinero(totalCompra)}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            No hay una caja abierta.
          </p>
        )}
      </div>
    </label>
  </div>
</div>

      {/* TOTAL */}

      <div className="mt-7 flex items-center justify-between border-t pt-5">
        <div>
          <p className="text-sm text-slate-500">
            Total de la compra
          </p>

          <p className="text-xs text-slate-400">
            {itemsCompra.length} producto(s)
          </p>
        </div>

        <p className="text-3xl font-bold">
          {formatoDinero(totalCompra)}
        </p>
      </div>

      {/* BOTONES */}

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMostrarNuevaCompra(false)}
          className="rounded-xl border px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancelar
        </button>

        <button
  type="button"
  onClick={registrarCompra}
  disabled={itemsCompra.length === 0 || guardando}
  className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  {guardando
    ? "Registrando..."
    : "Registrar compra"}
</button>
      </div>
    </div>
  </div>
)}

{mostrarNuevoProveedor && (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    onClick={() => setMostrarNuevoProveedor(false)}
  >
    <div
      className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Proveedores
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            Nuevo proveedor
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setMostrarNuevoProveedor(false)}
          className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="mt-7">
        <label className="text-sm font-medium text-slate-700">
          Nombre *
        </label>

        <input
          type="text"
          autoFocus
          value={nombreProveedor}
          onChange={(e) =>
            setNombreProveedor(e.target.value)
          }
          placeholder="Ej. Abarrotes La Central"
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      <div className="mt-5">
        <label className="text-sm font-medium text-slate-700">
          Teléfono
        </label>

        <input
          type="tel"
          value={telefonoProveedor}
          onChange={(e) =>
            setTelefonoProveedor(e.target.value)
          }
          placeholder="Ej. 55 1234 5678"
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      <div className="mt-5">
        <label className="text-sm font-medium text-slate-700">
          Correo
        </label>

        <input
          type="email"
          value={emailProveedor}
          onChange={(e) =>
            setEmailProveedor(e.target.value)
          }
          placeholder="proveedor@ejemplo.com"
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMostrarNuevoProveedor(false)}
          disabled={guardandoProveedor}
          className="rounded-xl border px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={crearProveedor}
          disabled={
            guardandoProveedor ||
            nombreProveedor.trim() === ""
          }
          className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardandoProveedor
            ? "Guardando..."
            : "Crear proveedor"}
        </button>
      </div>
    </div>
  </div>
)}

{mostrarNuevoProducto && (
  <div
    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
    onClick={() => setMostrarNuevoProducto(false)}
  >
    <div
      className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Inventario
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            Nuevo producto
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Se agregará automáticamente a esta compra.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarNuevoProducto(false)}
          className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      {/* NOMBRE */}

      <div className="mt-7">
        <label className="text-sm font-medium text-slate-700">
          Nombre *
        </label>

        <input
          type="text"
          autoFocus
          value={nombreNuevoProducto}
          onChange={(e) =>
            setNombreNuevoProducto(e.target.value)
          }
          placeholder="Ej. Doritos Nacho"
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      {/* CÓDIGO */}

      <div className="mt-5">
        <label className="text-sm font-medium text-slate-700">
          Código de barras
        </label>

        <input
          type="text"
          value={codigoNuevoProducto}
          onChange={(e) =>
            setCodigoNuevoProducto(e.target.value)
          }
          placeholder="Opcional"
          className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      {/* COSTO Y PRECIO */}

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-700">
            Costo
          </label>

          <input
            type="number"
            min="0"
            step="0.01"
            value={costoNuevoProducto}
            onChange={(e) =>
              setCostoNuevoProducto(e.target.value)
            }
            placeholder="0.00"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
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
            value={precioNuevoProducto}
            onChange={(e) =>
              setPrecioNuevoProducto(e.target.value)
            }
            placeholder="0.00"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
        El producto se creará con stock 0. La cantidad recibida
        se sumará al registrar esta compra.
      </div>

      {/* BOTONES */}

      <div className="mt-7 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMostrarNuevoProducto(false)}
          disabled={guardandoProducto}
          className="rounded-xl border px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={crearProducto}
          disabled={
            guardandoProducto ||
            nombreNuevoProducto.trim() === ""
          }
          className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardandoProducto
            ? "Creando..."
            : "Crear producto"}
        </button>
      </div>
    </div>
  </div>
)}

{compraSeleccionada && (
  <div
    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
    onClick={() => {
      setCompraSeleccionada(null);
      setItemsDetalle([]);
    }}
  >
    <div
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ENCABEZADO */}

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Detalle de compra
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            {compraSeleccionada.number}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {formatoFecha(compraSeleccionada.created_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCompraSeleccionada(null);
            setItemsDetalle([]);
          }}
          className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      {/* PROVEEDOR */}

      <div className="mt-7 rounded-2xl bg-slate-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Proveedor
        </p>

        <p className="mt-1 font-semibold">
          {nombreProveedorDeCompra(
            compraSeleccionada.supplier_id
          )}
        </p>
      </div>

      {/* PRODUCTOS */}

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Productos
        </p>

        {cargandoDetalle ? (
          <div className="mt-4 rounded-2xl border p-8 text-center text-sm text-slate-500">
            Cargando productos...
          </div>
        ) : itemsDetalle.length === 0 ? (
          <div className="mt-4 rounded-2xl border p-8 text-center text-sm text-slate-500">
            Esta compra no tiene productos.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border">
            {itemsDetalle.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-5 border-b px-5 py-4 last:border-b-0"
              >
                <div>
                  <p className="font-semibold">
                    {item.name}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {item.quantity} ×{" "}
                    {formatoDinero(Number(item.unit_cost))}
                  </p>
                </div>

                <p className="font-bold">
                  {formatoDinero(Number(item.subtotal))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOTAL */}

      <div className="mt-7 flex items-center justify-between border-t pt-5">
        <span className="text-lg font-bold">
          Total
        </span>

        <span className="text-3xl font-bold">
          {formatoDinero(
            Number(compraSeleccionada.total)
          )}
        </span>
      </div>

      {/* NOTAS */}

{compraSeleccionada.notes && (
  <div className="mt-6 rounded-2xl border p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
      Notas
    </p>

    <p className="mt-2 text-sm text-slate-700">
      {compraSeleccionada.notes}
    </p>
  </div>
)}

{/* ACCIONES */}

{compraSeleccionada.status === "completed" && (
  <div className="mt-6 border-t pt-6">
    <button
      type="button"
      onClick={abrirDevolucion}
      disabled={cargandoDevolucion}
      className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
    >
      {cargandoDevolucion
        ? "Preparando..."
        : "Devolver productos"}
    </button>

    <button
      type="button"
      onClick={() => setMostrarCancelarCompra(true)}
      className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-100"
    >
      Cancelar compra
    </button>

    <p className="mt-2 text-center text-xs text-slate-500">
      Se revertirá el inventario y, cuando corresponda,
      el movimiento de caja.
    </p>
  </div>
)}

{/* CERRAR */}

<button
  type="button"
  onClick={() => {
    setCompraSeleccionada(null);
    setItemsDetalle([]);
  }}
  className="mt-7 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
>
  Cerrar
</button>
    </div>
  </div>
)}

{/* MODAL DEVOLUCIÓN */}

{mostrarDevolucion && compraSeleccionada && (
  <div
    className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4"
    onClick={() => setMostrarDevolucion(false)}
  >
    <div
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ENCABEZADO */}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Devolución a proveedor
          </p>

          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Devolver productos
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Compra {compraSeleccionada.number}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarDevolucion(false)}
          className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      {/* PRODUCTOS */}

      <div className="mt-7 space-y-4">
        {itemsDevolucion.map((item) => (
          <div
            key={item.purchase_item_id}
            className="rounded-2xl border p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900">
                  {item.name}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Costo original:{" "}
                  {formatoDinero(item.unit_cost)}
                </p>
              </div>

              {item.quantity_available > 0 ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                  Disponible
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  Todo devuelto
                </span>
              )}
            </div>

            {/* RESUMEN DE CANTIDADES */}

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  Comprados
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {item.quantity_purchased}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  Ya devueltos
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {item.quantity_returned}
                </p>
              </div>

              <div className="rounded-xl bg-indigo-50 p-3">
                <p className="text-xs text-indigo-500">
                  Disponibles
                </p>

                <p className="mt-1 font-bold text-indigo-700">
                  {item.quantity_available}
                </p>
              </div>
            </div>

            {/* CANTIDAD A DEVOLVER */}

            <div className="mt-5">
              <label className="text-sm font-medium text-slate-700">
                Cantidad a devolver
              </label>

              <input
                type="number"
                min="0"
                max={item.quantity_available}
                step="1"
                value={item.quantity_to_return}
                disabled={item.quantity_available === 0}
                onChange={(e) => {
                  const valor = Number(e.target.value);

                  const cantidad = Math.max(
                    0,
                    Math.min(
                      valor,
                      item.quantity_available
                    )
                  );

                  setItemsDevolucion((actuales) =>
                    actuales.map((actual) =>
                      actual.purchase_item_id ===
                      item.purchase_item_id
                        ? {
                            ...actual,
                            quantity_to_return:
                              cantidad,
                          }
                        : actual
                    )
                  );
                }}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none transition focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {/* SUBTOTAL */}

            {item.quantity_to_return > 0 && (
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <span className="text-sm text-slate-500">
                  Subtotal devolución
                </span>

                <span className="font-semibold text-slate-900">
                  {formatoDinero(
                    item.quantity_to_return *
                      item.unit_cost
                  )}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

    {/* TOTAL DEVOLUCIÓN */}

<div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-900 p-5 text-white">
  <div>
    <p className="text-sm text-slate-300">
      Total devolución
    </p>

    <p className="mt-1 text-xs text-slate-400">
      Calculado con el costo original
    </p>
  </div>

  <p className="text-2xl font-bold">
    {formatoDinero(totalDevolucion)}
  </p>
</div>

{/* CONFIRMACIÓN */}

{confirmandoDevolucion && (
  <div className="mt-6 space-y-5">
    <div className="rounded-2xl border bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Resumen de devolución
      </p>

      <div className="mt-4 space-y-3">
        {itemsDevolucion
          .filter(
            (item) => item.quantity_to_return > 0
          )
          .map((item) => (
            <div
              key={item.purchase_item_id}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {item.name}
                </p>

                <p className="text-sm text-slate-500">
                  {item.quantity_to_return} ×{" "}
                  {formatoDinero(item.unit_cost)}
                </p>
              </div>

              <p className="font-bold text-slate-900">
                {formatoDinero(
                  item.quantity_to_return *
                    item.unit_cost
                )}
              </p>
            </div>
          ))}
      </div>
    </div>

    {/* NOTAS */}

    <div>
      <label className="text-sm font-medium text-slate-700">
        Notas
      </label>

      <textarea
        value={notasDevolucion}
        onChange={(e) =>
          setNotasDevolucion(e.target.value)
        }
        placeholder="Ej. Mercancía dañada, producto incorrecto..."
        rows={3}
        className="mt-2 w-full resize-none rounded-xl border px-4 py-3 outline-none transition focus:border-indigo-500"
      />
    </div>

    {/* REEMBOLSO */}

    <div>
      <p className="text-sm font-medium text-slate-700">
        Reembolso
      </p>

      <div className="mt-3 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition hover:bg-slate-50">
          <input
            type="radio"
            name="reembolsoDevolucion"
            checked={!reembolsoACaja}
            onChange={() =>
              setReembolsoACaja(false)
            }
            className="mt-1"
          />

          <div>
            <p className="font-semibold text-slate-900">
              No afectar caja
            </p>

            <p className="mt-1 text-sm text-slate-500">
              La devolución afectará inventario, pero no
              registrará entrada de efectivo.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
            sesionCaja
              ? "cursor-pointer hover:bg-slate-50"
              : "cursor-not-allowed bg-slate-50 opacity-60"
          }`}
        >
          <input
            type="radio"
            name="reembolsoDevolucion"
            checked={reembolsoACaja}
            disabled={!sesionCaja}
            onChange={() =>
              setReembolsoACaja(true)
            }
            className="mt-1"
          />

          <div>
            <p className="font-semibold text-slate-900">
              Ingresar reembolso a caja
            </p>

            {sesionCaja ? (
              <p className="mt-1 text-sm text-green-600">
                Caja abierta · se registrará una entrada de{" "}
                {formatoDinero(totalDevolucion)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                No hay una caja abierta.
              </p>
            )}
          </div>
        </label>
      </div>
    </div>
  </div>
)}

{/* BOTONES */}

{!confirmandoDevolucion ? (
  <div className="mt-6 grid grid-cols-2 gap-3">
    <button
      type="button"
      onClick={() => setMostrarDevolucion(false)}
      className="rounded-xl border px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      Cancelar
    </button>

    <button
      type="button"
      disabled={totalDevolucion <= 0}
      onClick={() =>
        setConfirmandoDevolucion(true)
      }
      className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Continuar
    </button>
  </div>
) : (
  <div className="mt-6 grid grid-cols-2 gap-3">
    <button
      type="button"
      disabled={registrandoDevolucion}
      onClick={() =>
        setConfirmandoDevolucion(false)
      }
      className="rounded-xl border px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
    >
      Volver
    </button>

    <button
      type="button"
      disabled={registrandoDevolucion}
      className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={registrarDevolucion}
    >
      {registrandoDevolucion
        ? "Registrando..."
        : "Registrar devolución"}
    </button>
  </div>
)}

    </div>
  </div>
)}

{/* MODAL CANCELAR COMPRA */}

{mostrarCancelarCompra && compraSeleccionada && (
  <div
    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
    onClick={() => {
      if (!cancelandoCompra) {
        setMostrarCancelarCompra(false);
      }
    }}
  >
    <div
      className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xl">
        ⚠️
      </div>

      <h2 className="mt-5 text-2xl font-bold text-slate-900">
        ¿Cancelar esta compra?
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        Estás por cancelar{" "}
        <span className="font-semibold text-slate-700">
          {compraSeleccionada.number}
        </span>
        .
      </p>

      <div className="mt-5 rounded-2xl bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">
          Esta operación revertirá:
        </p>

        <div className="mt-2 space-y-1 text-sm text-red-600">
          <p>• Las unidades agregadas al inventario</p>
          <p>• El estado de la compra</p>
          <p>• El movimiento de caja, cuando corresponda</p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        La compra no será eliminada. Permanecerá en el
        historial como cancelada.
      </p>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={cancelandoCompra}
          onClick={() =>
            setMostrarCancelarCompra(false)
          }
          className="rounded-xl border px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Volver
        </button>

        <button
          type="button"
          disabled={cancelandoCompra}
          onClick={cancelarCompra}
          className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelandoCompra
            ? "Cancelando..."
            : "Sí, cancelar"}
        </button>
      </div>
    </div>
  </div>
)}
    </main>
  );
}
