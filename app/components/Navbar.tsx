"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { nombreRol } from "@/lib/roles";

const opciones = [
  {
    nombre: "Inicio",
    href: "/",
  },
  {
    nombre: "Ventas",
    href: "/ventas",
  },
  {
    nombre: "Inventario",
    href: "/inventario",
  },
  {
    nombre: "Caja",
    href: "/caja",
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

const {
  perfil,
  negocio,
  sucursales,
  sucursalActiva,
  cambiarSucursal,
  cargandoSucursales,
  cerrarSesion,
  puedeAdministrar,
  esPlatformAdmin,
} = useAuth();

  const [mostrarMas, setMostrarMas] = useState(false);
  const [mostrarUsuario, setMostrarUsuario] = useState(false);

const menuMasRef = useRef<HTMLDivElement>(null);
const menuUsuarioRef = useRef<HTMLDivElement>(null);

const menuMasMovilRef = useRef<HTMLDivElement>(null);
const menuUsuarioMovilRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function cerrarMenu(event: MouseEvent) {
    const target = event.target as Node;

    const dentroMenuMasDesktop =
      menuMasRef.current?.contains(target);

    const dentroMenuMasMovil =
      menuMasMovilRef.current?.contains(target);

    if (
      !dentroMenuMasDesktop &&
      !dentroMenuMasMovil
    ) {
      setMostrarMas(false);
    }

    const dentroUsuarioDesktop =
      menuUsuarioRef.current?.contains(target);

    const dentroUsuarioMovil =
      menuUsuarioMovilRef.current?.contains(target);

    if (
      !dentroUsuarioDesktop &&
      !dentroUsuarioMovil
    ) {
      setMostrarUsuario(false);
    }
  }

  document.addEventListener(
    "mousedown",
    cerrarMenu
  );

  return () => {
    document.removeEventListener(
      "mousedown",
      cerrarMenu
    );
  };
}, []);

  async function manejarCerrarSesion() {
    setMostrarUsuario(false);

    await cerrarSesion();

    router.push("/login");
    router.refresh();
  }

  const primerNombre =
  perfil?.full_name?.trim().split(/\s+/)[0] || "Cuenta";

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">

{/* ========================= */}
{/* NAVEGACIÓN MÓVIL */}
{/* ========================= */}

<div className="md:hidden">
  <div className="flex w-full items-center justify-between gap-3 px-4 py-3">

    {/* MARCA */}

    <Link
      href="/"
      className="min-w-0 shrink"
      onClick={() => {
        setMostrarMas(false);
        setMostrarUsuario(false);
      }}
    >
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
        {negocio?.name || "Mi Negocio"}
      </p>

      <p className="text-lg font-bold leading-tight text-slate-900">
        POS
      </p>
    </Link>


    <div className="flex shrink-0 items-center gap-2">

      {/* MENÚ PRINCIPAL */}

      <div
        ref={menuMasMovilRef}
        className="relative"
      >
        <button
          type="button"
          onClick={() => {
            setMostrarMas((actual) => !actual);
            setMostrarUsuario(false);
          }}
          className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition active:bg-slate-100"
        >
          <span
            aria-hidden="true"
            className="text-lg leading-none"
          >
            ☰
          </span>

          <span className="text-sm">
            Más
          </span>

          <span
            className={`text-xs text-slate-400 transition-transform duration-200 ${
              mostrarMas ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>


        {mostrarMas && (
<div className="fixed left-4 right-4 top-[5.5rem] z-50 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            {/* NAVEGACIÓN PRINCIPAL */}

            {opciones.map((opcion) => {
              const activo =
                pathname === opcion.href;

              return (
                <Link
                  key={opcion.href}
                  href={opcion.href}
                  onClick={() =>
                    setMostrarMas(false)
                  }
                  className={`block rounded-xl px-4 py-3 transition ${
                    activo
                      ? "bg-slate-900 text-white"
                      : "text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {opcion.nombre}
                  </p>
                </Link>
              );
            })}


            <div className="my-2 border-t border-slate-100" />


            {/* SUPERADMIN */}

            {esPlatformAdmin && (
              <>
                <Link
                  href="/superadmin"
                  onClick={() =>
                    setMostrarMas(false)
                  }
                  className="block rounded-xl px-4 py-3 transition hover:bg-indigo-50"
                >
                  <p className="text-sm font-semibold text-indigo-700">
                    Administración SaaS
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Gestiona negocios de la plataforma
                  </p>
                </Link>

                <div className="my-2 border-t border-slate-100" />
              </>
            )}


            {/* COMPRAS */}

            {puedeAdministrar && (
              <Link
                href="/compras"
                onClick={() =>
                  setMostrarMas(false)
                }
                className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-900">
                  Compras
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Registra compras de mercancía
                </p>
              </Link>
            )}


            {/* EMPLEADOS */}

            {perfil?.role === "admin" && (
              <Link
                href="/usuarios"
                onClick={() =>
                  setMostrarMas(false)
                }
                className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-900">
                  Empleados
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Administra usuarios, roles y accesos
                </p>
              </Link>
            )}


            <Link
              href="/historial"
              onClick={() =>
                setMostrarMas(false)
              }
              className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
            >
              <p className="text-sm font-semibold text-slate-900">
                Historial de ventas
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Consulta ventas anteriores
              </p>
            </Link>


            <Link
              href="/movimientos"
              onClick={() =>
                setMostrarMas(false)
              }
              className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
            >
              <p className="text-sm font-semibold text-slate-900">
                Movimientos
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Entradas y ajustes de inventario
              </p>
            </Link>


            <Link
              href="/historial-cajas"
              onClick={() =>
                setMostrarMas(false)
              }
              className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
            >
              <p className="text-sm font-semibold text-slate-900">
                Historial de cajas
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Aperturas, cierres y arqueos
              </p>
            </Link>

          </div>
        )}
      </div>


      {/* MENÚ DEL USUARIO */}

      {perfil && (
        <div
          ref={menuUsuarioMovilRef}
          className="relative"
        >
          <button
            type="button"
            onClick={() => {
              setMostrarUsuario(
                (actual) => !actual
              );
              setMostrarMas(false);
            }}
            className="flex h-11 max-w-[135px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition active:bg-slate-100"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {perfil.full_name
                .charAt(0)
                .toUpperCase()}
            </div>

            <span className="max-w-[62px] truncate text-sm font-semibold text-slate-800">
              {primerNombre}
            </span>

            <span
              className={`text-xs text-slate-400 transition-transform duration-200 ${
                mostrarUsuario
                  ? "rotate-180"
                  : ""
              }`}
            >
              ▾
            </span>
          </button>


          {mostrarUsuario && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">

              <div className="border-b border-slate-100 px-4 py-3">
                <p className="font-semibold text-slate-900">
                  {perfil.full_name}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {nombreRol(perfil.role)}
                </p>
              </div>


              {perfil.role === "admin" && (
                <Link
                  href="/plan"
                  onClick={() =>
                    setMostrarUsuario(false)
                  }
                  className="mt-2 block rounded-xl px-4 py-3 transition hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    Plan y uso
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Consulta tu plan y límites
                  </p>
                </Link>
              )}


              <button
                type="button"
                onClick={manejarCerrarSesion}
                className="mt-2 w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                Cerrar sesión
              </button>

            </div>
          )}
        </div>
      )}

    </div>
  </div>
</div>
<div className="mx-auto hidden w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 md:flex">        {/* MARCA */}

        <Link
          href="/"
          className="shrink-0"
        >
<p className="max-w-[220px] truncate text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
  {negocio?.name || "Mi Negocio"}
</p>

<p className="text-lg font-bold text-slate-900">
  POS
</p>

{sucursalActiva && (
  <p className="max-w-[150px] truncate text-[11px] font-medium text-slate-500">
    {sucursalActiva.name}
  </p>
)}

        </Link>

{/* SUCURSAL ACTIVA */}

<div className="min-w-[150px]">
  {cargandoSucursales ? (
    <p className="text-xs text-slate-400">
      Cargando sucursal...
    </p>
  ) : sucursalActiva ? (
    sucursales.length > 1 ? (
      <select
        value={sucursalActiva.id}
        onChange={(e) =>
          cambiarSucursal(e.target.value)
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400"
        aria-label="Sucursal activa"
      >
        {sucursales.map((sucursal) => (
          <option
            key={sucursal.id}
            value={sucursal.id}
          >
            {sucursal.name}
          </option>
        ))}
      </select>
    ) : (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Sucursal
        </p>

        <p className="max-w-[160px] truncate text-sm font-semibold text-slate-700">
          {sucursalActiva.name}
        </p>
      </div>
    )
  ) : null}
</div>

        {/* NAVEGACIÓN */}

<nav className="flex items-center gap-1">         {opciones.map((opcion) => {
            const activo = pathname === opcion.href;

            return (
              <Link
                key={opcion.href}
                href={opcion.href}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activo
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {opcion.nombre}
              </Link>
            );
          })}

          {/* MÁS */}

          <div
            ref={menuMasRef}
            className="relative"
          >
            <button
              onClick={() => setMostrarMas(!mostrarMas)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
pathname === "/compras" ||
pathname === "/historial" ||
pathname === "/movimientos" ||
pathname === "/historial-cajas" ||
pathname === "/usuarios" ||
pathname === "/superadmin"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Más

              <span
                className={`ml-2 inline-block text-xs transition-transform duration-200 ${
                  mostrarMas
                    ? "rotate-180"
                    : "rotate-0"
                }`}
              >
                ▾
              </span>
            </button>

{mostrarMas && (
  <div className="fixed left-4 right-4 top-[5.5rem] z-50 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            {esPlatformAdmin && (
  <>
    <Link
      href="/superadmin"
      onClick={() => setMostrarMas(false)}
      className="block rounded-xl px-4 py-3 transition hover:bg-indigo-50"
    >
      <p className="text-sm font-semibold text-indigo-700">
        Administración SaaS
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Gestiona negocios de la plataforma
      </p>
    </Link>

    <div className="my-2 border-t border-slate-100" />
  </>
)}

{puedeAdministrar && (
  <Link
    href="/compras"
    onClick={() => setMostrarMas(false)}
    className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
  >
    <p className="text-sm font-semibold text-slate-900">
      Compras
    </p>

    <p className="mt-1 text-xs text-slate-500">
      Registra compras de mercancía
    </p>
  </Link>
)}

{perfil?.role === "admin" && (
  <Link
    href="/usuarios"
    onClick={() => setMostrarMas(false)}
    className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
  >
    <p className="text-sm font-semibold text-slate-900">
      Empleados
    </p>

    <p className="mt-1 text-xs text-slate-500">
      Administra usuarios, roles y accesos
    </p>
  </Link>
)}

                <Link
                  href="/historial"
                  onClick={() => setMostrarMas(false)}
                  className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    Historial de ventas
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Consulta ventas anteriores
                  </p>
                </Link>

                <Link
                  href="/movimientos"
                  onClick={() => setMostrarMas(false)}
                  className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    Movimientos
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Entradas y ajustes de inventario
                  </p>
                </Link>

                <Link
                  href="/historial-cajas"
                  onClick={() => setMostrarMas(false)}
                  className="block rounded-xl px-4 py-3 transition hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    Historial de cajas
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Aperturas, cierres y arqueos
                  </p>
                </Link>

              </div>
            )}
          </div>

          {/* USUARIO */}

          {perfil && (
            <div
              ref={menuUsuarioRef}
              className="relative ml-2"
            >
              <button
                type="button"
                onClick={() =>
                  setMostrarUsuario(!mostrarUsuario)
                }
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-100"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                  {perfil.full_name
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="hidden lg:block">
                  <p className="text-sm font-semibold text-slate-900">
                    {perfil.full_name}
                  </p>

                  <p className="text-xs text-slate-500">
                    {nombreRol(perfil.role)}
                  </p>
                </div>

                <span className="text-xs text-slate-400">
                  ▾
                </span>
              </button>

              {mostrarUsuario && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border bg-white p-2 shadow-xl">

                  <div className="border-b px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {perfil.full_name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {nombreRol(perfil.role)}
                    </p>
                  </div>

                  {perfil.role === "admin" && (
  <Link
    href="/plan"
    onClick={() => setMostrarUsuario(false)}
    className="mt-2 block rounded-xl px-4 py-3 transition hover:bg-slate-50"
  >
    <p className="text-sm font-semibold text-slate-900">
      Plan y uso
    </p>

    <p className="mt-1 text-xs text-slate-500">
      Consulta tu plan y límites
    </p>
  </Link>
)}

                  <button
                    type="button"
                    onClick={manejarCerrarSesion}
                    className="mt-2 w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    Cerrar sesión
                  </button>

                </div>
              )}
            </div>
          )}

        </nav>
      </div>
    </header>
  );
}