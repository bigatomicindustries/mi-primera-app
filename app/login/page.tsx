"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
  user,
  negocio,
  negocioSuspendido,
  cargando: cargandoAuth,
} = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
const [reenviando, setReenviando] = useState(false);
const [mensaje, setMensaje] = useState("");

  useEffect(() => {
  if (cargandoAuth) return;

  if (user && negocio) {
    router.replace("/");
  }
}, [user, negocio, cargandoAuth, router]);

useEffect(() => {
  const confirmationError =
    searchParams.get("error");

  if (
    confirmationError === "invalid_confirmation" ||
    confirmationError === "confirmation_failed"
  ) {
    setError(
      "El enlace de confirmación no es válido o ha vencido. Solicita un nuevo correo de confirmación."
    );
  }
}, [searchParams]);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();

    try {
      setCargando(true);
      setError("");

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("Correo o contraseña incorrectos.");
        return;
      }

    } catch (error) {
      console.error(error);
      setError("No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  }

  async function reenviarConfirmacion() {
  if (!email.trim()) {
    setError(
      "Escribe tu correo electrónico para reenviar la confirmación."
    );
    return;
  }

  try {
    setReenviando(true);
    setError("");
    setMensaje("");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
      },
    });

    if (error) {
      console.error(
        "Error reenviando confirmación:",
        error
      );

      setError(
        "No pudimos enviar el correo de confirmación. Intenta nuevamente en unos minutos."
      );
      return;
    }

    setMensaje(
      "Si el correo corresponde a una cuenta pendiente de confirmación, recibirás un nuevo enlace en unos minutos."
    );
  } catch (error) {
    console.error(
      "Error inesperado reenviando confirmación:",
      error
    );

    setError(
      "No pudimos enviar el correo de confirmación. Intenta nuevamente en unos minutos."
    );
  } finally {
    setReenviando(false);
  }
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-600">
            MI NEGOCIO
          </p>

          <h1 className="mt-2 text-4xl font-bold text-slate-900">
            POS
          </h1>

          <p className="mt-3 text-slate-500">
            Inicia sesión para continuar
          </p>
        </div>

        {negocioSuspendido && (
  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
    <p className="font-semibold text-amber-800">
      Negocio suspendido
    </p>

    <p className="mt-1 text-sm text-amber-700">
      El acceso a este negocio se encuentra temporalmente
      suspendido. Contacta al administrador de la plataforma
      para obtener más información.
    </p>
  </div>
)}

        <form
          onSubmit={iniciarSesion}
          className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">
              Correo electrónico
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@negocio.com"
              required
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-slate-700">
              Contraseña
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

{mensaje && (
  <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
    {mensaje}
  </div>
)}

          <button
            type="submit"
            disabled={cargando}
            className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-4 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando
              ? "Iniciando sesión..."
              : "Iniciar sesión"}
          </button>
        </form>

        <button
  type="button"
  onClick={reenviarConfirmacion}
  disabled={reenviando}
  className="mt-4 w-full text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  {reenviando
    ? "Enviando correo..."
    : "Reenviar correo de confirmación"}
</button>

<div className="mt-6 text-center">
  <p className="text-sm text-slate-500">
    ¿Aún no tienes un negocio?{" "}
    <Link
      href="/registro"
      className="font-semibold text-indigo-600 hover:text-indigo-700"
    >
      Crear cuenta
    </Link>
  </p>

  <p className="mt-3 text-xs text-slate-400">
    Acceso exclusivo para personal autorizado
  </p>
</div>

      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-500">
            Cargando...
          </p>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}