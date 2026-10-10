import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabaseUser";
import { checkDevicePairingRateLimit } from "@/lib/devicePairingRateLimit";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
    const isDevEnvironment =
    process.env.NODE_ENV === "development" &&
    (() => {
      try {
        return (
          new URL(
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
          ).hostname === "pablbrladwjuczhazsms.supabase.co"
        );
      } catch {
        return false;
      }
    })();

  if (!isDevEnvironment) {
    return NextResponse.json(
      { error: "La generación de códigos aún no está habilitada." },
      { status: 503 }
    );
  }
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 401 }
      );
    }

    const accessToken = authorization.slice(7).trim();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Sesión inválida." },
        { status: 401 }
      );
    }

    const supabase = createSupabaseUserClient(accessToken);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sesión inválida." },
        { status: 401 }
      );
    }

    const rateLimit = await checkDevicePairingRateLimit(
  `device-pairing-token:user:${user.id}`
);

if (!rateLimit.allowed) {
  return NextResponse.json(
    { error: "Demasiadas solicitudes. Intenta más tarde." },
    {
      status: 429,
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    }
  );
}

    const body = await request.json().catch(() => null);

    const deviceId =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof body.deviceId === "string"
        ? body.deviceId.trim()
        : "";

    if (!UUID_REGEX.test(deviceId)) {
      return NextResponse.json(
        { error: "Identificador de dispositivo inválido." },
        { status: 400 }
      );
    }

    // La función SQL valida el administrador, negocio,
    // sucursal, suscripción y estado del dispositivo.
    // Se ejecuta con el JWT del usuario, nunca con service_role.
    const { data: token, error: tokenError } = await supabase.rpc(
      "create_pos_device_pairing_token",
      {
        p_device_id: deviceId,
      }
    );

    if (tokenError || typeof token !== "string" || !token) {
      console.error(
        "Error generando token de vinculación:",
        tokenError?.code ?? "SIN_TOKEN"
      );

      return NextResponse.json(
        { error: "No se pudo generar el código de vinculación." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { token, expiresInSeconds: 600 },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Error en vinculación:",
      error instanceof Error ? error.message : "Error desconocido"
    );

    return NextResponse.json(
      { error: "No se pudo procesar la solicitud." },
      { status: 500 }
    );
  }
}
