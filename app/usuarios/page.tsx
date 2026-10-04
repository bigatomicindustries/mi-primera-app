"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { nombreRol } from "@/lib/roles";

type Rol = "admin" | "manager" | "cashier";

type Empleado = {
  id: string;
  full_name: string;
  role: Rol;
  active: boolean;
  created_at: string;
  updated_at: string;
  branch_ids: string[];
};

export default function UsuariosPage() {
const {
  user,
  sucursales,
  sucursalActiva,
  perfil,
} = useAuth();
const router = useRouter();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
const [mostrarNuevoEmpleado, setMostrarNuevoEmpleado] =
  useState(false);

const [nuevoNombre, setNuevoNombre] = useState("");
const [nuevoEmail, setNuevoEmail] = useState("");
const [nuevaPassword, setNuevaPassword] = useState("");
const [nuevasSucursales, setNuevasSucursales] =
  useState<string[]>([]);
const [nuevoRol, setNuevoRol] = useState<Rol>("cashier");

const [creandoEmpleado, setCreandoEmpleado] =
  useState(false);

const [empleadoSucursales, setEmpleadoSucursales] =
  useState<Empleado | null>(null);

const [sucursalesEditadas, setSucursalesEditadas] =
  useState<string[]>([]);

const [guardandoSucursales, setGuardandoSucursales] =
  useState(false);

useEffect(() => {
  if (!perfil) return;

  if (perfil.role !== "admin") {
    router.replace("/");
    return;
  }

  cargarEmpleados();
}, [perfil, router]);

  async function cargarEmpleados() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("get_employees");

    if (error) {
      console.error("Error al cargar empleados:", error);
      setError(error.message);
      setLoading(false);
      return;
    }

    setEmpleados((data as Empleado[]) ?? []);
    setLoading(false);
  }

  async function crearEmpleado() {
  const nombre = nuevoNombre.trim();
  const email = nuevoEmail.trim().toLowerCase();

  if (!nombre) {
    setError("Escribe el nombre del empleado.");
    return;
  }

  if (!email) {
    setError("Escribe el correo del empleado.");
    return;
  }

  if (!email.includes("@")) {
    setError("Ingresa un correo válido.");
    return;
  }

  if (nuevaPassword.length < 8) {
    setError("La contraseña debe tener al menos 8 caracteres.");
    return;
  }

  try {
    setCreandoEmpleado(true);
    setError("");
    setMensaje("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("No se encontró una sesión válida.");
      return;
    }

const respuesta = await fetch("/api/employees", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({
    full_name: nombre,
    email,
    password: nuevaPassword,
    role: nuevoRol,
    branch_ids: nuevasSucursales,
  }),
});

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        resultado?.error || "No se pudo crear el empleado."
      );
    }

    setNuevoNombre("");
    setNuevoEmail("");
    setNuevaPassword("");
    setNuevoRol("cashier");
    setMostrarNuevoEmpleado(false);

    setMensaje(
      `${nombre} fue creado correctamente como ${nombreRol(
        nuevoRol
      )}.`
    );

    await cargarEmpleados();
  } catch (error: any) {
    console.error("Error al crear empleado:", error);

    setError(
      error?.message || "No se pudo crear el empleado."
    );
  } finally {
    setCreandoEmpleado(false);
  }
}

  async function cambiarRol(
    empleado: Empleado,
    nuevoRol: Rol
  ) {
    if (empleado.id === user?.id) {
      setError("No puedes cambiar tu propio rol.");
      return;
    }

    const confirmar = window.confirm(
      `¿Cambiar el rol de ${empleado.full_name} a ${nombreRol(
        nuevoRol
      )}?`
    );

    if (!confirmar) return;

    setProcesandoId(empleado.id);
    setError("");
    setMensaje("");

    const { error } = await supabase.rpc(
      "update_employee_role",
      {
        p_employee_id: empleado.id,
        p_role: nuevoRol,
      }
    );

    if (error) {
      console.error("Error al cambiar rol:", error);
      setError(error.message);
      setProcesandoId(null);
      return;
    }

    setMensaje(
      `El rol de ${empleado.full_name} se actualizó correctamente.`
    );

    await cargarEmpleados();
    setProcesandoId(null);
  }

  async function cambiarEstado(empleado: Empleado) {
    const nuevoEstado = !empleado.active;

    if (empleado.id === user?.id && !nuevoEstado) {
      setError("No puedes desactivar tu propia cuenta.");
      return;
    }

    const confirmar = window.confirm(
      nuevoEstado
        ? `¿Activar la cuenta de ${empleado.full_name}?`
        : `¿Desactivar la cuenta de ${empleado.full_name}?`
    );

    if (!confirmar) return;

    setProcesandoId(empleado.id);
    setError("");
    setMensaje("");

    const { error } = await supabase.rpc(
      "set_employee_active",
      {
        p_employee_id: empleado.id,
        p_active: nuevoEstado,
      }
    );

    if (error) {
      console.error("Error al cambiar estado:", error);
      setError(error.message);
      setProcesandoId(null);
      return;
    }

    setMensaje(
      nuevoEstado
        ? `${empleado.full_name} fue activado correctamente.`
        : `${empleado.full_name} fue desactivado correctamente.`
    );

    await cargarEmpleados();
    setProcesandoId(null);
  }

async function guardarSucursalesEmpleado() {
  if (!empleadoSucursales) return;

  if (sucursalesEditadas.length === 0) {
    setError("Selecciona al menos una sucursal para el empleado.");
    return;
  }

  try {
    setGuardandoSucursales(true);
    setError("");
    setMensaje("");

    const { error } = await supabase.rpc(
      "set_employee_branches",
      {
        p_employee_id: empleadoSucursales.id,
        p_branch_ids: sucursalesEditadas,
      }
    );

    if (error) {
      throw error;
    }

    const nombreEmpleado =
      empleadoSucursales.full_name;

    await cargarEmpleados();

    setEmpleadoSucursales(null);
    setSucursalesEditadas([]);

    setMensaje(
      `Las sucursales de ${nombreEmpleado} se actualizaron correctamente.`
    );
  } catch (error: any) {
    console.error(
      "Error actualizando sucursales del empleado:",
      error
    );

    setError(
      error?.message ||
        "No se pudieron actualizar las sucursales."
    );
  } finally {
    setGuardandoSucursales(false);
  }
}

  if (!perfil || perfil.role !== "admin") {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-slate-500">
          Verificando permisos...
        </p>
      </div>
    </main>
  );
}

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-500">
            Cargando empleados...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">

{/* ENCABEZADO */}

<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div>
    <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">
      Mi Negocio POS
    </p>

    <h1 className="mt-2 text-3xl font-bold text-slate-900">
      Empleados
    </h1>

    <p className="mt-2 text-slate-500">
      Administra los roles y el acceso de los empleados.
    </p>
  </div>

  <button
    type="button"
onClick={() => {
  setError("");
  setMensaje("");

  setNuevasSucursales(
    sucursalActiva ? [sucursalActiva.id] : []
  );

  setMostrarNuevoEmpleado(true);
}}
    className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700"
  >
    + Nuevo empleado
  </button>
</div>

        {/* MENSAJES */}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {mensaje && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
            {mensaje}
          </div>
        )}

        {/* RESUMEN */}

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Empleados
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {empleados.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Activos
            </p>

            <p className="mt-2 text-3xl font-bold text-green-600">
              {empleados.filter((e) => e.active).length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <p className="text-sm text-slate-500">
              Administradores
            </p>

            <p className="mt-2 text-3xl font-bold text-indigo-600">
              {
                empleados.filter(
                  (e) => e.role === "admin" && e.active
                ).length
              }
            </p>
          </div>
        </div>

        {/* TABLA */}

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4">
                    Empleado
                  </th>

                  <th className="px-6 py-4">
                    Rol
                  </th>

                  <th className="px-4 py-3 text-left">
  Sucursales
</th>

                  <th className="px-6 py-4">
                    Estado
                  </th>

                  <th className="px-6 py-4 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {empleados.map((empleado) => {
                  const esYo = empleado.id === user?.id;
                  const procesando =
                    procesandoId === empleado.id;

                  return (
                    <tr
                      key={empleado.id}
                      className={`transition ${
                        empleado.active
                          ? "hover:bg-slate-50"
                          : "bg-slate-50/60"
                      }`}
                    >
                      {/* EMPLEADO */}

                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                            {empleado.full_name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">
                                {empleado.full_name}
                              </p>

                              {esYo && (
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                  Tú
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-xs text-slate-400">
                              {empleado.id.slice(0, 8)}…
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* ROL */}

                      <td className="px-6 py-5">
                        <select
                          value={empleado.role}
                          disabled={esYo || procesando}
                          onChange={(e) =>
                            cambiarRol(
                              empleado,
                              e.target.value as Rol
                            )
                          }
                          className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="admin">
                            Administrador
                          </option>

                          <option value="manager">
                            Gerente
                          </option>

                          <option value="cashier">
                            Cajero
                          </option>
                        </select>
                      </td>

                      <td className="px-4 py-4">
  <div className="flex max-w-xs flex-wrap gap-2">
    {empleado.branch_ids?.length > 0 ? (
      empleado.branch_ids.map((branchId) => {
        const sucursal = sucursales.find(
          (item) => item.id === branchId
        );

        if (!sucursal) return null;

        return (
          <span
            key={branchId}
            className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
          >
            {sucursal.name}
          </span>
        );
      })
    ) : (
      <span className="text-sm text-slate-400">
        Sin sucursal
      </span>
    )}

</div>

{!esYo && (
  <button
    type="button"
    disabled={procesando}
    onClick={() => {
      setError("");
      setMensaje("");

      setEmpleadoSucursales(empleado);

      setSucursalesEditadas(
        empleado.branch_ids ?? []
      );
    }}
    className="mt-3 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
  >
    Editar sucursales
  </button>
)}
</td>

{/* ESTADO */}

                      <td className="px-6 py-5">
                        {empleado.active ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            Activo
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                            Inactivo
                          </span>
                        )}
                      </td>

                      {/* ACCIONES */}

                      <td className="px-6 py-5 text-right">
                        <button
                          type="button"
                          disabled={esYo || procesando}
                          onClick={() =>
                            cambiarEstado(empleado)
                          }
                          className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            empleado.active
                              ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
                              : "bg-green-600 text-white hover:bg-green-700"
                          }`}
                        >
                          {procesando
                            ? "Guardando..."
                            : empleado.active
                            ? "Desactivar"
                            : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {empleados.length === 0 && !error && (
            <div className="p-12 text-center text-slate-500">
              No hay empleados registrados.
            </div>
          )}
        </div>

        {/* SESIÓN */}

        {perfil && (
          <p className="mt-5 text-sm text-slate-400">
            Sesión actual: {perfil.full_name} ·{" "}
            {nombreRol(perfil.role)}
          </p>
        )}

        {/* MODAL NUEVO EMPLEADO */}

{mostrarNuevoEmpleado && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onClick={() => {
      if (!creandoEmpleado) {
        setMostrarNuevoEmpleado(false);
      }
    }}
  >
    <div
      className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Nuevo empleado
      </p>

      <h2 className="mt-1 text-2xl font-bold text-slate-900">
        Crear cuenta
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        El empleado podrá iniciar sesión en el POS con este correo
        y contraseña.
      </p>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Nombre
      </label>

      <input
        type="text"
        value={nuevoNombre}
        onChange={(e) => setNuevoNombre(e.target.value)}
        placeholder="Ej. Juan Pérez"
        autoFocus
        disabled={creandoEmpleado}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500 disabled:bg-slate-100"
      />

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Correo
      </label>

      <input
        type="email"
        value={nuevoEmail}
        onChange={(e) => setNuevoEmail(e.target.value)}
        placeholder="empleado@negocio.com"
        disabled={creandoEmpleado}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500 disabled:bg-slate-100"
      />

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Contraseña temporal
      </label>

      <input
        type="password"
        value={nuevaPassword}
        onChange={(e) => setNuevaPassword(e.target.value)}
        placeholder="Mínimo 8 caracteres"
        disabled={creandoEmpleado}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-indigo-500 disabled:bg-slate-100"
      />

      <p className="mt-2 text-xs text-slate-400">
        Deberás compartir esta contraseña con el empleado de forma
        privada.
      </p>

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Rol
      </label>

      <select
        value={nuevoRol}
        onChange={(e) => setNuevoRol(e.target.value as Rol)}
        disabled={creandoEmpleado}
        className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-indigo-500 disabled:bg-slate-100"
      >
        <option value="cashier">Cajero</option>
        <option value="manager">Gerente</option>
        <option value="admin">Administrador</option>
      </select>

<div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">
    Sucursales
  </label>

  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
    {sucursales.map((sucursal) => {
      const seleccionada =
        nuevasSucursales.includes(sucursal.id);

      return (
        <label
          key={sucursal.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={seleccionada}
            disabled={creandoEmpleado}
            onChange={() => {
              setNuevasSucursales(
                seleccionada
                  ? nuevasSucursales.filter(
                      (id) => id !== sucursal.id
                    )
                  : [
                      ...nuevasSucursales,
                      sucursal.id,
                    ]
              );
            }}
            className="h-4 w-4"
          />

          <div>
            <p className="text-sm font-semibold text-slate-800">
              {sucursal.name}
            </p>

            {sucursal.is_main && (
              <p className="text-xs text-slate-500">
                Sucursal principal
              </p>
            )}
          </div>
        </label>
      );
    })}
  </div>

  {nuevasSucursales.length === 0 && (
    <p className="mt-2 text-xs text-red-600">
      Selecciona al menos una sucursal.
    </p>
  )}
</div>

      <button
        type="button"
        onClick={crearEmpleado}
        disabled={creandoEmpleado}
        className="mt-7 w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {creandoEmpleado
          ? "Creando empleado..."
          : "Crear empleado"}
      </button>

      <button
        type="button"
        onClick={() => setMostrarNuevoEmpleado(false)}
        disabled={creandoEmpleado}
        className="mt-2 w-full rounded-xl px-5 py-3 font-medium text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  </div>
)}

{/* MODAL EDITAR SUCURSALES */}

{empleadoSucursales && (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    onClick={() => {
      if (!guardandoSucursales) {
        setEmpleadoSucursales(null);
        setSucursalesEditadas([]);
      }
    }}
  >
    <div
      className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-2xl font-bold text-slate-900">
        Editar sucursales
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        Selecciona las sucursales a las que tendrá acceso{" "}
        <span className="font-semibold text-slate-700">
          {empleadoSucursales.full_name}
        </span>
        .
      </p>

      <div className="mt-6 space-y-2">
        {sucursales.map((sucursal) => {
          const seleccionada =
            sucursalesEditadas.includes(sucursal.id);

          return (
            <label
              key={sucursal.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={seleccionada}
                disabled={guardandoSucursales}
                onChange={() => {
                  setSucursalesEditadas((actuales) =>
                    seleccionada
                      ? actuales.filter(
                          (id) => id !== sucursal.id
                        )
                      : [...actuales, sucursal.id]
                  );
                }}
                className="h-4 w-4"
              />

              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {sucursal.name}
                </p>

                {sucursal.is_main && (
                  <p className="text-xs text-slate-500">
                    Sucursal principal
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {sucursalesEditadas.length === 0 && (
        <p className="mt-3 text-sm text-red-600">
          El empleado debe tener al menos una sucursal.
        </p>
      )}

      <div className="mt-7 flex gap-3">
        <button
          type="button"
          disabled={guardandoSucursales}
          onClick={() => {
            setEmpleadoSucursales(null);
            setSucursalesEditadas([]);
          }}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>

        <button
          type="button"
          disabled={
            guardandoSucursales ||
            sucursalesEditadas.length === 0
          }
          onClick={() => void guardarSucursalesEmpleado()}
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardandoSucursales
            ? "Guardando..."
            : "Guardar cambios"}
        </button>
      </div>
    </div>
  </div>
)}

      </div>
    </main>
  );
}