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
  cerrarSesion,
  puedeAdministrar,
  esPlatformAdmin,
} = useAuth();

  const [mostrarMas, setMostrarMas] = useState(false);
  const [mostrarUsuario, setMostrarUsuario] = useState(false);

  const menuMasRef = useRef<HTMLDivElement>(null);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function cerrarMenu(event: MouseEvent) {
      const target = event.target as Node;

      if (
        menuMasRef.current &&
        !menuMasRef.current.contains(target)
      ) {
        setMostrarMas(false);
      }

      if (
        menuUsuarioRef.current &&
        !menuUsuarioRef.current.contains(target)
      ) {
        setMostrarUsuario(false);
      }
    }

    document.addEventListener("mousedown", cerrarMenu);

    return () => {
      document.removeEventListener("mousedown", cerrarMenu);
    };
  }, []);

  async function manejarCerrarSesion() {
    setMostrarUsuario(false);

    await cerrarSesion();

    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">

        {/* MARCA */}

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
        </Link>

        {/* NAVEGACIÓN */}

        <nav className="flex items-center gap-1">
          {opciones.map((opcion) => {
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
              <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border bg-white p-2 shadow-xl">

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