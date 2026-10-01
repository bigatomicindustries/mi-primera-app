"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

type DetalleNegocio = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  timezone: string;
  created_at: string;
  users_count: number;
  products_count: number;
  sales_count: number;
  total_sales: number;
};

type UsuarioNegocio = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at: string;
};

type ActividadNegocio = {
  last_sale_at: string | null;
  sales_today: number;
  total_today: number;
  sales_last_30_days: number;
  total_last_30_days: number;
};

type SuscripcionNegocio = {
  subscription_id: string;
  plan_id: string;
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

type Plan = {
  id: string;
  name: string;
  slug: string;
  max_users: number;
  max_products: number;
};

export default function DetalleNegocioPage() {
  const params = useParams();
  const router = useRouter();

  const {
    cargando: cargandoAuth,
    esPlatformAdmin,
  } = useAuth();

  const [negocio, setNegocio] =
    useState<DetalleNegocio | null>(null);

    const [usuarios, setUsuarios] =
  useState<UsuarioNegocio[]>([]);

  const [actividad, setActividad] =
  useState<ActividadNegocio | null>(null);

  const [suscripcion, setSuscripcion] =
  useState<SuscripcionNegocio | null>(null);

  const [planes, setPlanes] = useState<Plan[]>([]);

const [planSeleccionado, setPlanSeleccionado] =
  useState("");

const [guardandoPlan, setGuardandoPlan] =
  useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState("");

const [timezoneSeleccionado, setTimezoneSeleccionado] =
  useState("");

  const [guardandoTimezone, setGuardandoTimezone] =
  useState(false);

  const id = params.id as string;

  async function guardarTimezone() {
  if (!timezoneSeleccionado) return;

  try {
    setGuardandoTimezone(true);

    const { error } = await supabase.rpc(
      "set_business_timezone",
      {
        target_business_id: id,
        new_timezone: timezoneSeleccionado,
      }
    );

    if (error) {
      throw error;
    }

    setNegocio((actual) =>
      actual
        ? {
            ...actual,
            timezone: timezoneSeleccionado,
          }
        : actual
    );

    const { data: actividadActualizada, error: actividadError } =
      await supabase.rpc(
        "get_platform_business_activity",
        {
          target_business_id: id,
        }
      );

    if (actividadError) {
      throw actividadError;
    }

    setActividad(
      actividadActualizada?.[0]
        ? (actividadActualizada[0] as ActividadNegocio)
        : null
    );

    alert("Zona horaria actualizada correctamente");
  } catch (error: any) {
    console.error(
      "Error actualizando zona horaria:",
      error
    );

    alert(
      error?.message ||
        "No se pudo actualizar la zona horaria."
    );
  } finally {
    setGuardandoTimezone(false);
  }
}

async function guardarPlan() {
  if (
    !suscripcion ||
    !planSeleccionado ||
    planSeleccionado === suscripcion.plan_id
  ) {
    return;
  }

  const nuevoPlan = planes.find(
    (plan) => plan.id === planSeleccionado
  );

  if (!nuevoPlan) {
    alert("No se encontró el plan seleccionado.");
    return;
  }

  const confirmar = window.confirm(
    `¿Cambiar el plan de ${negocio?.name ?? "este negocio"} de ${suscripcion.plan_name} a ${nuevoPlan.name}?`
  );

  if (!confirmar) return;

  try {
    setGuardandoPlan(true);

    const { error } = await supabase.rpc(
      "set_business_plan",
      {
        target_business_id: id,
        target_plan_id: planSeleccionado,
      }
    );

    if (error) {
      throw error;
    }

    const {
      data: suscripcionActualizada,
      error: suscripcionError,
    } = await supabase.rpc(
      "get_platform_business_subscription",
      {
        target_business_id: id,
      }
    );

    if (suscripcionError) {
      throw suscripcionError;
    }

    const actualizada =
      suscripcionActualizada?.[0]
        ? (suscripcionActualizada[0] as SuscripcionNegocio)
        : null;

    setSuscripcion(actualizada);

    if (actualizada) {
      setPlanSeleccionado(actualizada.plan_id);
    }

    alert(
      `Plan actualizado a ${nuevoPlan.name} correctamente.`
    );
  } catch (error: any) {
    console.error(
      "Error actualizando plan:",
      error
    );

    alert(
      error?.message ||
        "No se pudo actualizar el plan."
    );
  } finally {
    setGuardandoPlan(false);
  }
}

  useEffect(() => {
    if (cargandoAuth) return;

    if (!esPlatformAdmin) {
      router.replace("/");
      return;
    }

    async function cargarDetalle() {
      try {
        setCargando(true);
        setError("");

const [
  detalleResult,
  usuariosResult,
  actividadResult,
  suscripcionResult,
  planesResult,
] = await Promise.all([
  supabase.rpc(
    "get_platform_business_detail",
    {
      target_business_id: id,
    }
  ),

  supabase.rpc(
    "get_platform_business_users",
    {
      target_business_id: id,
    }
  ),

  supabase.rpc(
    "get_platform_business_activity",
    {
      target_business_id: id,
    }
  ),

  supabase.rpc(
    "get_platform_business_subscription",
    {
      target_business_id: id,
    }
  ),

  supabase.rpc("get_platform_plans"),
]);

if (detalleResult.error) {
  throw detalleResult.error;
}

if (usuariosResult.error) {
  throw usuariosResult.error;
}

if (actividadResult.error) {
  throw actividadResult.error;
}

if (suscripcionResult.error) {
  throw suscripcionResult.error;
}

if (planesResult.error) {
  throw planesResult.error;
}

if (
  !detalleResult.data ||
  detalleResult.data.length === 0
) {
  throw new Error(
    "Negocio no encontrado."
  );
}

setNegocio(
  detalleResult.data[0] as DetalleNegocio
);

setTimezoneSeleccionado(
  (detalleResult.data[0] as DetalleNegocio).timezone
);

setUsuarios(
  (usuariosResult.data as UsuarioNegocio[]) ??
    []
);

setActividad(
  actividadResult.data?.[0]
    ? (actividadResult.data[0] as ActividadNegocio)
    : null
);

const suscripcionActual =
  suscripcionResult.data?.[0]
    ? (suscripcionResult.data[0] as SuscripcionNegocio)
    : null;

setSuscripcion(suscripcionActual);

setPlanSeleccionado(
  suscripcionActual?.plan_id || ""
);

setPlanes(
  (planesResult.data as Plan[]) ?? []
);

      } catch (error: any) {
        console.error(
          "Error cargando negocio:",
          error
        );

        setError(
          error?.message ||
            "No se pudo cargar el negocio."
        );
      } finally {
        setCargando(false);
      }
    }

    void cargarDetalle();
  }, [
    id,
    cargandoAuth,
    esPlatformAdmin,
    router,
  ]);

  if (cargandoAuth || cargando) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-500">
            Cargando negocio...
          </p>
        </div>
      </main>
    );
  }

  if (error || !negocio) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/superadmin"
            className="text-sm font-semibold text-indigo-600"
          >
            ← Volver a negocios
          </Link>

          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">
              No se pudo cargar
            </p>

            <p className="mt-1 text-sm text-red-600">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/superadmin"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Volver a negocios
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">
              Administración SaaS
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              {negocio.name}
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {negocio.slug}
            </p>
          </div>

          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              negocio.active
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {negocio.active
              ? "Activo"
              : "Suspendido"}
          </span>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Usuarios
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {negocio.users_count}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Productos
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {negocio.products_count}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Ventas
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {negocio.sales_count}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Total vendido
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {Number(
                negocio.total_sales
              ).toLocaleString("es-MX", {
                style: "currency",
                currency: "MXN",
              })}
            </p>
          </div>
        </div>

{suscripcion && (
  <div className="mt-6 rounded-2xl border bg-white p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-slate-500">
          Plan actual
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          {suscripcion.plan_name}
        </h2>
      </div>

      <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
        {suscripcion.status === "active"
          ? "Activo"
          : suscripcion.status}
      </span>
    </div>

    <div className="mt-6 border-t pt-6">
  <p className="text-sm font-semibold text-slate-700">
    Cambiar plan
  </p>

  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
    <select
      value={planSeleccionado}
      onChange={(e) =>
        setPlanSeleccionado(e.target.value)
      }
      disabled={guardandoPlan}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-indigo-500 sm:max-w-xs"
    >
      {planes.map((plan) => (
        <option
          key={plan.id}
          value={plan.id}
        >
          {plan.name} — {plan.max_users} usuarios /{" "}
          {plan.max_products} productos
        </option>
      ))}
    </select>

    <button
      type="button"
      onClick={guardarPlan}
      disabled={
        guardandoPlan ||
        !suscripcion ||
        !planSeleccionado ||
        planSeleccionado === suscripcion.plan_id
      }
      className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {guardandoPlan
        ? "Guardando..."
        : "Guardar plan"}
    </button>
  </div>
</div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-500">
          Usuarios
        </p>

        <p className="mt-1 text-xl font-bold text-slate-900">
          {suscripcion.current_users} /{" "}
          {suscripcion.max_users}
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-500">
          Productos
        </p>

        <p className="mt-1 text-xl font-bold text-slate-900">
          {suscripcion.current_products} /{" "}
          {suscripcion.max_products}
        </p>
      </div>
    </div>
  </div>
)}

<div className="mt-6 rounded-2xl border bg-white p-6">
  <h2 className="font-bold text-slate-900">
    Información del negocio
  </h2>

  <div className="mt-6 grid gap-6 sm:grid-cols-2">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        ID
      </p>

      <p className="mt-1 break-all text-sm text-slate-700">
        {negocio.id}
      </p>
    </div>

    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Fecha de registro
      </p>

      <p className="mt-1 text-sm text-slate-700">
        {new Date(
          negocio.created_at
        ).toLocaleDateString("es-MX")}
      </p>
    </div>

    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Zona horaria
      </p>

      <select
        value={timezoneSeleccionado}
        onChange={(e) =>
          setTimezoneSeleccionado(e.target.value)
        }
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500"
      >
        <option value="America/Mexico_City">
          Ciudad de México
        </option>

        <option value="America/Cancun">
          Cancún
        </option>

        <option value="America/Monterrey">
          Monterrey
        </option>

        <option value="America/Tijuana">
          Tijuana
        </option>

        <option value="America/Chihuahua">
          Chihuahua
        </option>
      </select>

      <p className="mt-2 text-xs text-slate-400">
        {timezoneSeleccionado}
      </p>

      <button
  type="button"
  onClick={guardarTimezone}
  disabled={
    guardandoTimezone ||
    timezoneSeleccionado === negocio.timezone
  }
  className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
  {guardandoTimezone
    ? "Guardando..."
    : "Guardar zona horaria"}
</button>

    </div>
  </div>
</div>

        {actividad && (
  <div className="mt-6 rounded-2xl border bg-white p-6">
    <div>
      <h2 className="font-bold text-slate-900">
        Actividad
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Uso reciente de este negocio
      </p>
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">
          Última venta
        </p>

        <p className="mt-2 font-bold text-slate-900">
          {actividad.last_sale_at
            ? new Date(
  actividad.last_sale_at
).toLocaleString("es-MX", {
  timeZone: negocio.timezone,
})
            : "Sin ventas"}
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">
          Ventas hoy
        </p>

        <p className="mt-2 text-2xl font-bold text-slate-900">
          {actividad.sales_today}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {Number(
            actividad.total_today
          ).toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
          })}
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">
          Ventas últimos 30 días
        </p>

        <p className="mt-2 text-2xl font-bold text-slate-900">
          {actividad.sales_last_30_days}
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-5">
        <p className="text-sm text-slate-500">
          Vendido últimos 30 días
        </p>

        <p className="mt-2 text-2xl font-bold text-slate-900">
          {Number(
            actividad.total_last_30_days
          ).toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
          })}
        </p>
      </div>
    </div>
  </div>
)}

        <div className="mt-6 overflow-hidden rounded-2xl border bg-white">
  <div className="border-b px-6 py-5">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="font-bold text-slate-900">
          Usuarios del negocio
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Usuarios registrados en este tenant
        </p>
      </div>

      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
        {usuarios.length}
      </span>
    </div>
  </div>

  {usuarios.length === 0 ? (
    <div className="px-6 py-10 text-center text-slate-500">
      No hay usuarios registrados.
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-6 py-4">
              Usuario
            </th>

            <th className="px-6 py-4">
              Rol
            </th>

            <th className="px-6 py-4">
              Estado
            </th>

            <th className="px-6 py-4">
              Registro
            </th>
          </tr>
        </thead>

        <tbody>
          {usuarios.map((usuario) => (
            <tr
              key={usuario.id}
              className="border-t"
            >
              <td className="px-6 py-4">
                <p className="font-semibold text-slate-900">
                  {usuario.full_name}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {usuario.id}
                </p>
              </td>

              <td className="px-6 py-4">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  {usuario.role === "admin"
                    ? "Administrador"
                    : usuario.role === "manager"
                      ? "Gerente"
                      : usuario.role === "cashier"
                        ? "Cajero"
                        : usuario.role}
                </span>
              </td>

              <td className="px-6 py-4">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    usuario.active
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {usuario.active
                    ? "Activo"
                    : "Inactivo"}
                </span>
              </td>

              <td className="px-6 py-4 text-sm text-slate-500">
                {new Date(
                  usuario.created_at
                ).toLocaleDateString(
                  "es-MX"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>

      </div>
    </main>
  );
}