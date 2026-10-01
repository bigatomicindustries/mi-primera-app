"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  loadMercadoPago,
} from "@mercadopago/sdk-js";
declare global {
  interface Window {
    MercadoPago: any;
  }
}

type Suscripcion = {
  plan_name: string;
  plan_slug: string;
  status: string;
  max_users: number;
  max_products: number;
  current_users: number;
  current_products: number;
  starts_at: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
};

export default function PlanPage() {
  const router = useRouter();

  const {
    perfil,
    negocio,
  } = useAuth();

const [suscripcion, setSuscripcion] =
  useState<Suscripcion | null>(null);

const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

const [procesandoPlan, setProcesandoPlan] =
  useState<string | null>(null);

const [
  mercadoPagoListo,
  setMercadoPagoListo,
] = useState(false);

const [
  planParaPagar,
  setPlanParaPagar,
] = useState<"pro" | "business" | null>(
  null
);

useEffect(() => {
  async function prepararMercadoPago() {
    try {
      const publicKey =
        process.env
          .NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;

      if (!publicKey) {
        console.error(
          "Falta NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"
        );
        return;
      }

      await loadMercadoPago();

      setMercadoPagoListo(true);
    } catch (error) {
      console.error(
        "No se pudo cargar Mercado Pago:",
        error
      );
    }
  }

  void prepararMercadoPago();
}, []);

useEffect(() => {
  if (!planParaPagar || !mercadoPagoListo) {
    return;
  }

  const publicKey =
    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;

  if (!publicKey || !window.MercadoPago) {
    console.error(
      "Mercado Pago todavía no está disponible."
    );
    return;
  }

  const amount =
    planParaPagar === "pro"
      ? "299"
      : "699";

  const mp = new window.MercadoPago(publicKey);

  const cardForm = mp.cardForm({
    amount,
    iframe: true,

    form: {
      id: "form-checkout",

      cardNumber: {
        id: "form-checkout__cardNumber",
        placeholder: "Número de tarjeta",
      },

      expirationDate: {
        id: "form-checkout__expirationDate",
        placeholder: "MM/AA",
      },

      securityCode: {
        id: "form-checkout__securityCode",
        placeholder: "CVV",
      },

      cardholderName: {
        id: "form-checkout__cardholderName",
        placeholder: "Nombre del titular",
      },

      issuer: {
        id: "form-checkout__issuer",
        placeholder: "Banco emisor",
      },

      installments: {
        id: "form-checkout__installments",
        placeholder: "Cuotas",
      },

      cardholderEmail: {
        id: "form-checkout__cardholderEmail",
        placeholder: "Correo electrónico",
      },
    },

    callbacks: {
      onFormMounted: (error: any) => {
        if (error) {
          console.error(
            "Error montando CardForm:",
            error
          );
          return;
        }

        console.log(
          "CardForm de Mercado Pago listo"
        );
      },

onSubmit: async (event: Event) => {
  event.preventDefault();

  try {
    const data =
      cardForm.getCardFormData();

    if (!data.token) {
      throw new Error(
        "Mercado Pago no pudo generar el token de la tarjeta."
      );
    }

    await contratarPlan(
      planParaPagar,
      data.token
    );
  } catch (error) {
    console.error(
      "Error procesando tarjeta:",
      error
    );
  }
},

      onFetching: (resource: string) => {
        console.log(
          "Mercado Pago consultando:",
          resource
        );
      },
    },
  });

  return () => {
    try {
      cardForm.unmount();
    } catch {
      // El formulario ya pudo haberse desmontado.
    }
  };
}, [
  planParaPagar,
  mercadoPagoListo,
]);

  useEffect(() => {
    if (!perfil) return;

    if (perfil.role !== "admin") {
      router.replace("/");
      return;
    }

    cargarSuscripcion();
  }, [perfil, router]);

  async function cargarSuscripcion() {
    try {
      setLoading(true);
      setError("");

      const {
        data,
        error: suscripcionError,
      } = await supabase.rpc(
        "get_my_subscription"
      );

      if (suscripcionError) {
        throw suscripcionError;
      }

if (!data || data.length === 0) {
  throw new Error(
    "No encontramos una suscripción para este negocio."
  );
}

setSuscripcion(data[0]);

} catch (error: any) {
  console.error(
    "Error cargando suscripción:",
    error
  );

  setError(
    error?.message ||
      "No se pudo cargar la información del plan."
  );
} finally {
  setLoading(false);
}
  }

  async function probarLecturaCompraAjena() {
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, number, status, total, business_id"
    )
    .eq(
      "id",
      "15cb598f-889d-4140-b970-2896ab9facc6"
    );

  console.log("PRUEBA COMPRA AJENA:", {
    data,
    error,
  });

  alert(
    JSON.stringify(
      {
        data,
        error: error?.message || null,
      },
      null,
      2
    )
  );

}

async function probarCancelarCompraAjena() {
  const { data, error } = await supabase.rpc(
    "cancel_purchase",
    {
      p_purchase_id:
        "15cb598f-889d-4140-b970-2896ab9facc6",
    }
  );

  console.log(
    "PRUEBA CANCELAR COMPRA AJENA:",
    {
      data,
      error,
    }
  );

  alert(
    JSON.stringify(
      {
        data,
        error: error?.message || null,
      },
      null,
      2
    )
  );
}

async function contratarPlan(
  plan: "pro" | "business",
  cardTokenId: string
) {
  try {
    setProcesandoPlan(plan);
    setError("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (
      sessionError ||
      !session?.access_token
    ) {
      throw new Error(
        "Tu sesión ha expirado. Inicia sesión nuevamente."
      );
    }

    const response = await fetch(
      "/api/mercadopago/subscribe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${session.access_token}`,
        },
body: JSON.stringify({
  plan,
  card_token_id: cardTokenId,
}),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
          "No se pudo iniciar la suscripción."
      );
    }

if (!data.success) {
  throw new Error(
    "No se pudo crear la suscripción."
  );
}

setPlanParaPagar(null);

alert(
  data.status === "authorized"
    ? "La suscripción fue autorizada correctamente."
    : `La suscripción fue creada con estado: ${data.status}`
);
  } catch (error: any) {
    console.error(
      "Error contratando plan:",
      error
    );

    setError(
      error?.message ||
        "No se pudo iniciar la suscripción."
    );
  } finally {
    setProcesandoPlan(null);
  }
}

  function porcentaje(
    actual: number,
    maximo: number
  ) {
    if (maximo <= 0) return 0;

    return Math.min(
      100,
      Math.round((actual / maximo) * 100)
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-slate-500">
            Cargando plan...
          </p>
        </div>
      </main>
    );
  }

  if (error || !suscripcion) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {error ||
              "No se pudo cargar el plan."}
          </div>
        </div>
      </main>
    );
  }

  const porcentajeUsuarios = porcentaje(
    Number(suscripcion.current_users),
    Number(suscripcion.max_users)
  );

  const porcentajeProductos = porcentaje(
    Number(suscripcion.current_products),
    Number(suscripcion.max_products)
  );

  const usuariosAlLimite =
    Number(suscripcion.current_users) >=
    Number(suscripcion.max_users);

  const productosAlLimite =
    Number(suscripcion.current_products) >=
    Number(suscripcion.max_products);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        {/* ENCABEZADO */}

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {negocio?.name || "Mi negocio"}
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Plan y uso
          </h1>

          <p className="mt-2 text-slate-500">
            Consulta tu plan actual y el uso de
            los recursos incluidos.
          </p>
        </div>

        {/* PLAN ACTUAL */}

        <div className="mt-10 rounded-3xl border bg-white p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Plan actual
              </p>

              <h2 className="mt-2 text-3xl font-bold text-slate-900">
                {suscripcion.plan_name}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Tu negocio está utilizando el plan{" "}
                {suscripcion.plan_name}.
              </p>
            </div>

            <span className="w-fit rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
              {suscripcion.status === "active"
                ? "Activo"
                : suscripcion.status}
            </span>
          </div>
        </div>

        {/* USO */}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* USUARIOS */}

          <div className="rounded-3xl border bg-white p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Usuarios
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {suscripcion.current_users}
                  <span className="text-lg font-medium text-slate-400">
                    {" "}
                    / {suscripcion.max_users}
                  </span>
                </p>
              </div>

              <p className="text-sm font-semibold text-slate-500">
                {porcentajeUsuarios}%
              </p>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={
                  usuariosAlLimite
                    ? "h-full rounded-full bg-amber-500 transition-all"
                    : "h-full rounded-full bg-indigo-600 transition-all"
                }
                style={{
                  width: `${porcentajeUsuarios}%`,
                }}
              />
            </div>

            <p
              className={`mt-4 text-sm ${
                usuariosAlLimite
                  ? "font-medium text-amber-700"
                  : "text-slate-500"
              }`}
            >
              {usuariosAlLimite
                ? "Has alcanzado el límite de usuarios de tu plan."
                : `Puedes agregar ${
                    Number(
                      suscripcion.max_users
                    ) -
                    Number(
                      suscripcion.current_users
                    )
                  } usuario(s) más.`}
            </p>
          </div>

          {/* PRODUCTOS */}

          <div className="rounded-3xl border bg-white p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Productos
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {suscripcion.current_products}
                  <span className="text-lg font-medium text-slate-400">
                    {" "}
                    / {suscripcion.max_products}
                  </span>
                </p>
              </div>

              <p className="text-sm font-semibold text-slate-500">
                {porcentajeProductos}%
              </p>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={
                  productosAlLimite
                    ? "h-full rounded-full bg-amber-500 transition-all"
                    : "h-full rounded-full bg-indigo-600 transition-all"
                }
                style={{
                  width: `${porcentajeProductos}%`,
                }}
              />
            </div>

            <p
              className={`mt-4 text-sm ${
                productosAlLimite
                  ? "font-medium text-amber-700"
                  : "text-slate-500"
              }`}
            >
              {productosAlLimite
                ? "Has alcanzado el límite de productos de tu plan."
                : `Puedes agregar ${
                    Number(
                      suscripcion.max_products
                    ) -
                    Number(
                      suscripcion.current_products
                    )
                  } producto(s) más.`}
            </p>
          </div>
        </div>

        {/* CAMBIAR DE PLAN */}

<div className="mt-6">
  <div className="mb-5">
    <h2 className="text-xl font-bold text-slate-900">
      ¿Necesitas más capacidad?
    </h2>

    <p className="mt-2 text-slate-500">
      Elige el plan que mejor se adapte a tu negocio.
    </p>
  </div>

  <div className="grid gap-5 md:grid-cols-2">
    {/* PLAN PRO */}
    <div className="rounded-3xl border border-slate-200 bg-white p-7">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pro
        </p>

        <div className="mt-3 flex items-end gap-1">
          <span className="text-4xl font-bold text-slate-900">
            $299
          </span>

          <span className="mb-1 text-slate-500">
            MXN / mes
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3 text-sm text-slate-600">
        <p>✓ Hasta 10 usuarios</p>
        <p>✓ Hasta 5,000 productos</p>
        <p>✓ Ventas e inventario</p>
        <p>✓ Historial y control de caja</p>
      </div>

      <button
        type="button"
        onClick={() => setPlanParaPagar("pro")}
        disabled={
          procesandoPlan !== null ||
          suscripcion?.plan_slug === "pro"
        }
        className="mt-7 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {suscripcion?.plan_slug === "pro"
          ? "Plan actual"
          : procesandoPlan === "pro"
          ? "Abriendo Mercado Pago..."
          : "Elegir Pro"}
      </button>
    </div>

    {/* PLAN BUSINESS */}
    <div className="rounded-3xl border border-slate-900 bg-white p-7 shadow-sm">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Business
          </p>

          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
            Mayor capacidad
          </span>
        </div>

        <div className="mt-3 flex items-end gap-1">
          <span className="text-4xl font-bold text-slate-900">
            $699
          </span>

          <span className="mb-1 text-slate-500">
            MXN / mes
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3 text-sm text-slate-600">
        <p>✓ Hasta 50 usuarios</p>
        <p>✓ Hasta 50,000 productos</p>
        <p>✓ Ventas e inventario</p>
        <p>✓ Historial y control de caja</p>
      </div>

      <button
        type="button"
        onClick={() =>
  setPlanParaPagar("business")
}
        disabled={
          procesandoPlan !== null ||
          suscripcion?.plan_slug === "business"
        }
        className="mt-7 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {suscripcion?.plan_slug === "business"
          ? "Plan actual"
          : procesandoPlan === "business"
          ? "Abriendo Mercado Pago..."
          : "Elegir Business"}
      </button>
    </div>
  </div>
</div>

{/* MODAL DE PAGO */}

{planParaPagar && (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    onClick={() => setPlanParaPagar(null)}
  >
    <div
      className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Suscripción
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Plan{" "}
            {planParaPagar === "pro"
              ? "Pro"
              : "Business"}
          </h2>

          <p className="mt-2 text-slate-500">
            {planParaPagar === "pro"
              ? "$299 MXN al mes"
              : "$699 MXN al mes"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPlanParaPagar(null)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 transition hover:bg-slate-200"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

<form
  id="form-checkout"
  className="mt-7 space-y-4"
>
  {/* NÚMERO DE TARJETA */}

  <div>
    <label className="mb-2 block text-sm font-medium text-slate-700">
      Número de tarjeta
    </label>

    <div
      id="form-checkout__cardNumber"
      className="h-12 rounded-xl border border-slate-300 bg-white px-4 py-3"
    />
  </div>

  {/* VENCIMIENTO + CVV */}

  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Vencimiento
      </label>

      <div
        id="form-checkout__expirationDate"
        className="h-12 rounded-xl border border-slate-300 bg-white px-4 py-3"
      />
    </div>

    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Código de seguridad
      </label>

      <div
        id="form-checkout__securityCode"
        className="h-12 rounded-xl border border-slate-300 bg-white px-4 py-3"
      />
    </div>
  </div>

  {/* TITULAR */}

  <div>
    <label
      htmlFor="form-checkout__cardholderName"
      className="mb-2 block text-sm font-medium text-slate-700"
    >
      Nombre del titular
    </label>

    <input
      id="form-checkout__cardholderName"
      type="text"
      placeholder="Como aparece en la tarjeta"
      className="h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none focus:border-indigo-500"
    />
  </div>

  {/* EMAIL */}

  <div>
    <label
      htmlFor="form-checkout__cardholderEmail"
      className="mb-2 block text-sm font-medium text-slate-700"
    >
      Correo electrónico
    </label>

    <input
      id="form-checkout__cardholderEmail"
      type="email"
      placeholder="correo@ejemplo.com"
      className="h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none focus:border-indigo-500"
    />
  </div>

  {/* CAMPOS QUE MERCADO PAGO NECESITA */}

  <select
    id="form-checkout__issuer"
    className="hidden"
  />

  <select
    id="form-checkout__installments"
    className="hidden"
  />

  <button
    id="form-checkout__submit"
    type="submit"
    disabled={!mercadoPagoListo}
    className="mt-2 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
  >
    Continuar con el pago
  </button>

  <progress
    value="0"
    className="hidden"
  />
</form>

      {!mercadoPagoListo && (
        <p className="mt-4 text-sm text-amber-700">
          Preparando Mercado Pago...
        </p>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-400">
        Los datos de tu tarjeta serán procesados por
        Mercado Pago. Mi Negocio no almacenará el
        número de tarjeta ni el código de seguridad.
      </p>
    </div>
  </div>
)}

      </div>
    </main>
  );
}