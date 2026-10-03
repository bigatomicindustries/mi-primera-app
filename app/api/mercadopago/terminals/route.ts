import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type MercadoPagoTerminal = {
  id: string;
  pos_id?: number | string | null;
  store_id?: string | null;
  external_pos_id?: string | null;
  operating_mode?: string | null;
};

type MercadoPagoTerminalsResponse = {
  data?: {
    terminals?: MercadoPagoTerminal[];
  };
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
  message?: string;
  error?: string;
};

export async function GET(request: Request) {
  try {
    // =====================================================
    // 1. CONFIGURACIÓN
    // =====================================================

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

    // =====================================================
    // 2. AUTENTICAR USUARIO
    // =====================================================

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

    const sessionToken =
      authorization.slice("Bearer ".length).trim();

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
      sessionToken
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

    // =====================================================
    // 3. CLIENTE ADMINISTRATIVO
    // =====================================================

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

    // =====================================================
    // 4. IDENTIFICAR NEGOCIO
    // =====================================================

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
            "Solo un administrador puede consultar las terminales.",
        },
        { status: 403 }
      );
    }

    // =====================================================
    // 5. OBTENER CONEXIÓN MERCADO PAGO
    // =====================================================

    const {
      data: connection,
      error: connectionError,
    } = await supabaseAdmin
      .from("mercadopago_connections")
      .select(
        "access_token, expires_at"
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
            "No se pudo consultar la conexión con Mercado Pago.",
        },
        { status: 500 }
      );
    }

    if (!connection?.access_token) {
      return NextResponse.json(
        {
          error:
            "Este negocio todavía no ha conectado Mercado Pago.",
        },
        { status: 409 }
      );
    }

    // =====================================================
    // 6. CONSULTAR TERMINALES EN MERCADO PAGO
    // =====================================================

    const mercadoPagoResponse = await fetch(
      "https://api.mercadopago.com/terminals/v1/list?limit=50&offset=0",
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${connection.access_token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const mercadoPagoData =
      (await mercadoPagoResponse.json()) as
        MercadoPagoTerminalsResponse;

    if (!mercadoPagoResponse.ok) {
      console.error(
        "Mercado Pago rechazó consulta de terminales:",
        {
          status: mercadoPagoResponse.status,
          error: mercadoPagoData.error,
          message: mercadoPagoData.message,
        }
      );

      return NextResponse.json(
        {
          error:
            mercadoPagoResponse.status === 401
              ? "La autorización de Mercado Pago necesita renovarse."
              : "No se pudieron consultar las terminales de Mercado Pago.",
        },
        {
          status:
            mercadoPagoResponse.status === 401
              ? 401
              : 502,
        }
      );
    }

    // =====================================================
    // 7. DEVOLVER SOLO INFORMACIÓN SEGURA
    // =====================================================

    const terminals =
      mercadoPagoData.data?.terminals ?? [];

    return NextResponse.json({
      terminals: terminals.map(
        (terminal) => ({
          id: terminal.id,
          pos_id:
            terminal.pos_id ?? null,
          store_id:
            terminal.store_id ?? null,
          external_pos_id:
            terminal.external_pos_id ?? null,
          operating_mode:
            terminal.operating_mode ?? null,
        })
      ),
      total:
        mercadoPagoData.paging?.total ??
        terminals.length,
    });
  } catch (error) {
    console.error(
      "Error consultando terminales Mercado Pago:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron consultar las terminales de Mercado Pago.",
      },
      { status: 500 }
    );
  }
}