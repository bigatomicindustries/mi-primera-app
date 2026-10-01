"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function AuthGuard({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [verificando, setVerificando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    let activo = true;

    async function verificarSesion() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!activo) return;

      if (!session) {
        setAutenticado(false);

        if (pathname !== "/login") {
          router.replace("/login");
        }
      } else {
        setAutenticado(true);

        if (pathname === "/login") {
          router.replace("/");
        }
      }

      setVerificando(false);
    }

    verificarSesion();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!activo) return;

      if (!session) {
        setAutenticado(false);

        if (pathname !== "/login") {
          router.replace("/login");
        }
      } else {
        setAutenticado(true);
      }
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (verificando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            Verificando sesión...
          </p>
        </div>
      </div>
    );
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!autenticado) {
    return null;
  }

  return <>{children}</>;
}