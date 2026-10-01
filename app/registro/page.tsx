"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          action: "register-business",
        }
      ) => string;

reset: (
  widget?: string | HTMLElement
) => void;
    };
  }
}

export default function RegistroPage() {

  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [registroExitoso, setRegistroExitoso] =
  useState(false);
  

  const [turnstileToken, setTurnstileToken] =
  useState("");

const turnstileRef =
  useRef<HTMLDivElement>(null);

const turnstileWidgetId =
  useRef<string | null>(null);

function resetTurnstile() {
  setTurnstileToken("");

  if (
    window.turnstile &&
    turnstileRef.current
  ) {
    window.turnstile.reset(
      turnstileRef.current
    );
  }
}

  useEffect(() => {
  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    console.error(
      "Falta NEXT_PUBLIC_TURNSTILE_SITE_KEY"
    );
    return;
  }

  const renderTurnstile = () => {
    if (
      !window.turnstile ||
      !turnstileRef.current ||
      turnstileWidgetId.current
    ) {
      return;
    }

    turnstileWidgetId.current =
window.turnstile.render(turnstileRef.current, {
  sitekey: siteKey,
  action: "register-business",
  callback: (token: string) => {
    setTurnstileToken(token);
          },

          "expired-callback": () => {
            setTurnstileToken("");
          },

          "error-callback": () => {
            setTurnstileToken("");
          },
        }
      );
  };

  const existingScript =
    document.querySelector(
      'script[src*="challenges.cloudflare.com/turnstile"]'
    );

  if (existingScript) {
    renderTurnstile();
    existingScript.addEventListener(
      "load",
      renderTurnstile
    );

    return () => {
      existingScript.removeEventListener(
        "load",
        renderTurnstile
      );
    };
  }

  const script = document.createElement("script");

  script.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

  script.async = true;
  script.defer = true;

  script.addEventListener(
    "load",
    renderTurnstile
  );

  document.head.appendChild(script);

  return () => {
    script.removeEventListener(
      "load",
      renderTurnstile
    );
  };
}, []);

  async function registrarNegocio(e: React.FormEvent) {
    e.preventDefault();

    if (!turnstileToken) {
  setError(
    "Completa la verificación de seguridad antes de continuar."
  );
  return;
}

    try {
      setCargando(true);
      setError("");

      // 1. Crear negocio + primer administrador
      const response = await fetch("/api/register-business", {
        method: "POST",
headers: {
  "Content-Type": "application/json",
},
body: JSON.stringify({
  business_name: businessName,
  full_name: fullName,
  email,
  password,
  turnstile_token: turnstileToken,
}),
      });

      const resultado = await response.json();

if (!response.ok) {
  setError(
    resultado?.error ||
      "No se pudo crear el negocio."
  );

  resetTurnstile();

  return;
}

setRegistroExitoso(true);

} catch (error) {
  console.error(error);

  setError(
    "Ocurrió un error al crear tu negocio."
  );

  resetTurnstile();
} finally {
      setCargando(false);
    }
  }

  if (registroExitoso) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✉️
          </div>

          <h1 className="mt-6 text-3xl font-bold text-slate-900">
            Revisa tu correo
          </h1>

          <p className="mt-4 text-slate-600">
            Creamos tu negocio correctamente. Te enviamos un correo de
            confirmación a:
          </p>

          <p className="mt-3 font-semibold text-slate-900">
            {email.trim().toLowerCase()}
          </p>

          <p className="mt-4 text-sm leading-6 text-slate-500">
            Abre el correo y confirma tu dirección para activar tu cuenta.
            Después podrás entrar a tu POS.
          </p>

          <Link
            href="/login"
            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-4 font-semibold text-white transition hover:bg-slate-800"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-600">
            MI NEGOCIO
          </p>

          <h1 className="mt-2 text-4xl font-bold text-slate-900">
            Crea tu POS
          </h1>

          <p className="mt-3 text-slate-500">
            Crea tu negocio y comienza a administrar tus ventas
          </p>
        </div>

        <form
          onSubmit={registrarNegocio}
          className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">
              Nombre del negocio
            </label>

            <input
              type="text"
              value={businessName}
              onChange={(e) =>
                setBusinessName(e.target.value)
              }
              placeholder="Abarrotes Los Pinos"
              required
              autoComplete="organization"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-slate-700">
              Tu nombre
            </label>

            <input
              type="text"
              value={fullName}
              onChange={(e) =>
                setFullName(e.target.value)
              }
              placeholder="Juan Pérez"
              required
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500"
            />
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-slate-700">
              Correo electrónico
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
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
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500"
            />

            <p className="mt-2 text-xs text-slate-400">
              Usa al menos 8 caracteres.
            </p>
          </div>

<div className="mt-5 flex justify-center">
  <div ref={turnstileRef} />
</div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando || !turnstileToken}
            className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-4 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando
              ? "Creando tu negocio..."
              : "Crear mi negocio"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes una cuenta?{" "}
          <Link
            href="/login"
            className="font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Iniciar sesión
          </Link>
        </p>

      </div>
    </main>
  );
}