"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import AuthGuard from "./AuthGuard";
import {
  AuthProvider,
  useAuth,
} from "@/context/AuthContext";

function ContenidoPrivado({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const {
    puedeOperar,
    negocioSuspendido,
    esPlatformAdmin,
    cargando,
  } = useAuth();

  const esRutaSuperAdmin =
    pathname.startsWith("/superadmin");

  const esRutaPlan =
    pathname === "/plan";

  // El Platform Admin puede administrar la
  // plataforma aunque su tenant esté suspendido.
  if (
    esRutaSuperAdmin &&
    esPlatformAdmin
  ) {
    return (
      <>
        <Navbar />
        {children}
      </>
    );
  }

  // No mostramos bloqueos falsos mientras
  // AuthContext está revalidando.
  if (!cargando && negocioSuspendido) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-slate-50 px-6 py-12">
          <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              Tu negocio está suspendido
            </h1>

            <p className="mt-3 text-slate-600">
              Las funciones del POS están temporalmente
              bloqueadas.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (
    !cargando &&
    !puedeOperar &&
    !esRutaPlan
  ) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-slate-50 px-6 py-12">
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              Tu suscripción no permite operar
            </h1>

            <p className="mt-3 text-slate-600">
              Tu cuenta sigue disponible, pero las
              funciones operativas del POS están
              temporalmente bloqueadas.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const esRutaPublica =
    pathname === "/login" ||
    pathname === "/registro";

  return (
    <AuthProvider>
      {esRutaPublica ? (
        children
      ) : (
<AuthGuard>
  <ContenidoPrivado>
    {children}
  </ContenidoPrivado>
</AuthGuard>
      )}
    </AuthProvider>
  );
}