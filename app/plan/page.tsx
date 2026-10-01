"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

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

        {/* FUTURO UPGRADE */}

        <div className="mt-6 rounded-3xl border bg-white p-7">
          <h2 className="text-xl font-bold text-slate-900">
            ¿Necesitas más capacidad?
          </h2>

          <p className="mt-2 text-slate-500">
            Próximamente podrás cambiar de plan
            desde aquí.
          </p>

          <button
            type="button"
            disabled
            className="mt-5 rounded-xl bg-slate-200 px-5 py-3 font-semibold text-slate-500"
          >
            Mejorar plan
          </button>

        </div>
      </div>
    </main>
  );
}