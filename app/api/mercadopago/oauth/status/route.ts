import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      return NextResponse.json(
        {
          error:
            "Falta configuración de Supabase.",
        },
        { status: 500 }
      );
    }

    const authorization =
      request.headers.get("authorization");

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 401 }
      );
    }

    const accessToken =
      authorization.slice("Bearer ".length).trim();

    // Cliente normal: únicamente para autenticar
    // al usuario que hace la solicitud.
    const supabase = createClient(
      supabaseUrl,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(
      accessToken
    );

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "Tu sesión ha expirado. Inicia sesión nuevamente.",
        },
        { status: 401 }
      );
    }

    // Cliente administrativo: la tabla de conexiones
    // nunca se expone directamente al navegador.
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("business_id, role, active")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !profile.active
    ) {
      return NextResponse.json(
        {
          error:
            "No pudimos identificar tu negocio.",
        },
        { status: 403 }
      );
    }

    if (profile.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Solo un administrador puede consultar esta integración.",
        },
        { status: 403 }
      );
    }

    const {
      data: connection,
      error: connectionError,
    } = await supabaseAdmin
      .from("mercadopago_connections")
      .select(
        `
          mercadopago_user_id,
          expires_at,
          connected_at
        `
      )
      .eq(
        "business_id",
        profile.business_id
      )
      .maybeSingle();

    if (connectionError) {
      console.error(
        "Error consultando conexión Mercado Pago:",
        connectionError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo consultar Mercado Pago.",
        },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json({
        connected: false,
      });
    }

    return NextResponse.json({
      connected: true,
      mercadopago_user_id:
        connection.mercadopago_user_id,
      expires_at:
        connection.expires_at,
      connected_at:
        connection.connected_at,
    });
  } catch (error) {
    console.error(
      "Error consultando estado de Mercado Pago:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo consultar la integración con Mercado Pago.",
      },
      { status: 500 }
    );
  }
}