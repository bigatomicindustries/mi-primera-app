"use client";

import { useAuth } from "@/context/AuthContext";
import { nombreRol } from "@/lib/roles";

type Venta = {
  id: string;
  number: string;
  total: number;
  paid_amount: number;
  change_due: number;
  payment_method: "cash" | "card" | "transfer";
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

type Props = {
  venta: Venta | null;
  items: ItemVenta[];
  onCerrar: () => void;
};

export default function DetalleVenta({
  venta,
  items,
  onCerrar,
}: Props) {
  const { puedeAdministrar } = useAuth();
  
  if (!venta) return null;

  const itemsVenta = items.filter(
    (item) => item.sale_id === venta.id
  );

  const costoVenta = itemsVenta.reduce(
    (suma, item) =>
      suma +
      Number(item.unit_cost) * Number(item.quantity),
    0
  );

  const utilidadVenta =
    Number(venta.total) - costoVenta;

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

    function reimprimirTicket() {
  if (!venta) return;

const metodoPago =
  venta.payment_method === "card"
    ? "Tarjeta"
    : venta.payment_method === "transfer"
    ? "Transferencia"
    : "Efectivo";

const rolUsuario = venta.user_role
  ? nombreRol(venta.user_role)
  : "";

const atendio = venta.user_name
  ? rolUsuario
    ? `${venta.user_name} · ${rolUsuario}`
    : venta.user_name
  : "—";

  const ventana = window.open(
    "",
    "_blank",
    "width=420,height=700"
  );

  if (!ventana) {
    alert(
      "El navegador bloqueó la ventana del ticket. Permite ventanas emergentes e inténtalo de nuevo."
    );
    return;
  }

  const productosHTML = itemsVenta
    .map((item) => {
      const subtotal =
        Number(item.unit_price) *
        Number(item.quantity);

      return `
        <div class="producto">
          <div class="fila">
            <span>${item.name}</span>
            <span>${formatoDinero(subtotal)}</span>
          </div>

          <div class="detalle">
            ${item.quantity} × ${formatoDinero(
              Number(item.unit_price)
            )}
          </div>
        </div>
      `;
    })
    .join("");

  ventana.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />

        <title>Ticket ${venta.number}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, sans-serif;
            color: #111;
            background: white;
          }

          .ticket {
            width: 100%;
            max-width: 360px;
            margin: 0 auto;
          }

          .centrado {
            text-align: center;
          }

          h1 {
            margin: 0;
            font-size: 22px;
          }

          .subtitulo {
            margin-top: 5px;
            font-size: 12px;
            color: #555;
          }

          .separador {
            border-top: 1px dashed #999;
            margin: 18px 0;
          }

          .fila {
            display: flex;
            justify-content: space-between;
            gap: 16px;
          }

          .producto {
            margin-bottom: 14px;
          }

          .detalle {
            margin-top: 3px;
            font-size: 12px;
            color: #555;
          }

          .total {
            font-size: 18px;
            font-weight: bold;
          }

          .linea {
            margin-bottom: 8px;
          }

          .gracias {
            margin-top: 24px;
            text-align: center;
            font-size: 12px;
          }

          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>

      <body>
        <div class="ticket">

          <div class="centrado">
            <h1>MI NEGOCIO</h1>

            <div class="subtitulo">
              Ticket de venta
            </div>

            <div class="subtitulo">
              ${venta.number}
            </div>

            <div class="subtitulo">
              ${formatoFecha(venta.created_at)}
            </div>

            <div class="subtitulo">
  Método: ${metodoPago}
</div>

<div class="subtitulo">
  Atendió: ${atendio}
</div>

          </div>

          <div class="separador"></div>

          ${productosHTML}

          <div class="separador"></div>

          <div class="fila linea total">
            <span>TOTAL</span>
            <span>
              ${formatoDinero(Number(venta.total))}
            </span>
          </div>

${
  venta.payment_method === "cash"
    ? `
      <div class="fila linea">
        <span>Efectivo recibido</span>
        <span>
          ${formatoDinero(Number(venta.paid_amount))}
        </span>
      </div>

      <div class="fila linea">
        <span>Cambio</span>
        <span>
          ${formatoDinero(Number(venta.change_due))}
        </span>
      </div>
    `
    : venta.payment_method === "transfer"
    ? `
      <div class="fila linea">
        <span>Pago por transferencia</span>
        <span>
          ${formatoDinero(Number(venta.total))}
        </span>
      </div>
    `
    : `
      <div class="fila linea">
        <span>Pago con tarjeta</span>
        <span>
          ${formatoDinero(Number(venta.total))}
        </span>
      </div>
    `
}

          <div class="gracias">
            ¡Gracias por su compra!
          </div>

        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  ventana.document.close();
}

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ENCABEZADO */}

        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Detalle de venta
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              {venta.number}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {formatoFecha(venta.created_at)}
            </p>
          </div>

          <button
            onClick={onCerrar}
            className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

{/* INFORMACIÓN DE LA VENTA */}

<div className="mt-6 grid gap-3 sm:grid-cols-2">
  <div className="rounded-2xl bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
      Método de pago
    </p>

    <p className="mt-2 font-semibold text-slate-900">
      {venta.payment_method === "card"
        ? "Tarjeta"
        : "Efectivo"}
    </p>
  </div>

  <div className="rounded-2xl bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
      Atendió
    </p>

    {venta.user_name ? (
      <>
        <p className="mt-2 font-semibold text-slate-900">
          {venta.user_name}
        </p>

{venta.user_role && (
  <p className="mt-1 text-xs text-slate-500">
    {nombreRol(venta.user_role)}
  </p>
)}
      </>
    ) : (
      <p className="mt-2 text-slate-400">
        —
      </p>
    )}
  </div>
</div>

        {/* PRODUCTOS */}

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Productos
          </p>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            {itemsVenta.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No se encontraron productos para esta venta.
              </div>
            ) : (
              itemsVenta.map((item, index) => {
                const subtotal =
                  Number(item.unit_price) *
                  Number(item.quantity);

                return (
                  <div
                    key={`${item.product_id ?? "producto"}-${index}`}
                    className="border-b px-5 py-4 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.name}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {item.quantity} ×{" "}
                          {formatoDinero(
                            Number(item.unit_price)
                          )}
                        </p>
                      </div>

                      <p className="font-bold">
                        {formatoDinero(subtotal)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* TOTALES */}

        <div className="mt-8 rounded-2xl bg-slate-50 p-5">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">
                Total
              </span>

              <strong>
                {formatoDinero(Number(venta.total))}
              </strong>
            </div>

{venta.payment_method === "cash" ? (
  <>
    <div className="flex justify-between">
      <span className="text-slate-500">
        Efectivo recibido
      </span>

      <strong>
        {formatoDinero(Number(venta.paid_amount))}
      </strong>
    </div>

    <div className="flex justify-between">
      <span className="text-slate-500">
        Cambio
      </span>

      <strong>
        {formatoDinero(Number(venta.change_due))}
      </strong>
    </div>
  </>
) : (
  <div className="flex justify-between">
    <span className="text-slate-500">
      {venta.payment_method === "transfer"
        ? "Pago por transferencia"
        : "Pago con tarjeta"}
    </span>

    <strong>
      {formatoDinero(Number(venta.total))}
    </strong>
  </div>
)}

{puedeAdministrar && (
  <>
    <div className="border-t pt-3">
      <div className="flex justify-between">
        <span className="text-slate-500">
          Costo
        </span>

        <strong>
          {formatoDinero(costoVenta)}
        </strong>
      </div>
    </div>

    <div className="flex justify-between">
      <span className="font-bold">
        Utilidad bruta
      </span>

      <strong
        className={
          utilidadVenta >= 0
            ? "text-green-600"
            : "text-red-600"
        }
      >
        {formatoDinero(utilidadVenta)}
      </strong>
    </div>
  </>
)}
        </div>
      </div>

       <div className="mt-8 grid gap-3 sm:grid-cols-2">

  <button
    type="button"
    onClick={reimprimirTicket}
    className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
  >
    🖨️ Reimprimir ticket
  </button>

  <button
    type="button"
    onClick={onCerrar}
    className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
  >
    Cerrar
  </button>

</div>
      </div>
    </div>
  );
}