import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function POST(request: Request) {
  try {
    // =====================================================
    // 1. VARIABLES DE ENTORNO
    // =====================================================

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const clientId =
      process.env.MERCADOPAGO_CLIENT_ID;

    const redirectUri =
      process.env.MERCADOPAGO_OAUTH_REDIRECT_URI;

    if (
      !supabaseUrl ||
      !anonKey ||
      !clientId ||
      !redirectUri
    ) {
      console.error(
        "Falta configuración para OAuth de Mercado Pago."
      );

      return NextResponse.json(
        {
          error:
            "La integración con Mercado Pago no está configurada.",
        },
        { status: 500 }
      );
    }

    // =====================================================
    // 2. OBTENER JWT DEL USUARIO
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

    const accessToken =
      authorization.slice("Bearer ".length).trim();

    // =====================================================
    // 3. VALIDAR USUARIO CON SUPABASE
    // =====================================================

    const supabase = createClient(
      supabaseUrl,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

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
    // 4. OBTENER PERFIL Y BUSINESS_ID
    // =====================================================

    const {
      data: perfil,
      error: perfilError,
    } = await supabase
      .from("profiles")
      .select("business_id, role, active")
      .eq("id", user.id)
      .single();

    if (perfilError || !perfil) {
      console.error(
        "Error obteniendo perfil para OAuth:",
        perfilError
      );

      return NextResponse.json(
        {
          error:
            "No pudimos identificar tu negocio.",
        },
        { status: 403 }
      );
    }

    if (!perfil.active) {
      return NextResponse.json(
        {
          error:
            "Tu usuario se encuentra desactivado.",
        },
        { status: 403 }
      );
    }

    if (perfil.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Solo un administrador puede conectar Mercado Pago.",
        },
        { status: 403 }
      );
    }

    // =====================================================
    // 5. GENERAR STATE + PKCE
    // =====================================================

    const state = base64Url(
      crypto.randomBytes(32)
    );

    const codeVerifier = base64Url(
      crypto.randomBytes(64)
    );

    const codeChallenge = base64Url(
      crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest()
    );

    // =====================================================
    // 6. GUARDAR DATOS TEMPORALES EN COOKIES HTTPONLY
    // =====================================================

    const response = NextResponse.json({
      success: true,
      authorization_url: "",
    });

    const isProduction =
      process.env.NODE_ENV === "production";

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 10 * 60,
    };

    response.cookies.set(
      "mp_oauth_state",
      state,
      cookieOptions
    );

    response.cookies.set(
      "mp_oauth_code_verifier",
      codeVerifier,
      cookieOptions
    );

    response.cookies.set(
      "mp_oauth_business_id",
      perfil.business_id,
      cookieOptions
    );

    response.cookies.set(
      "mp_oauth_user_id",
      user.id,
      cookieOptions
    );

    // =====================================================
    // 7. CONSTRUIR URL DE AUTORIZACIÓN
    // =====================================================

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      platform_id: "mp",
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authorizationUrl =
      `https://auth.mercadopago.com.mx/authorization?${params.toString()}`;

    // Como ya creamos response para poder añadir cookies,
    // actualizamos su body creando la respuesta definitiva.

    const finalResponse = NextResponse.json({
      success: true,
      authorization_url: authorizationUrl,
    });

    finalResponse.cookies.set(
      "mp_oauth_state",
      state,
      cookieOptions
    );

    finalResponse.cookies.set(
      "mp_oauth_code_verifier",
      codeVerifier,
      cookieOptions
    );

    finalResponse.cookies.set(
      "mp_oauth_business_id",
      perfil.business_id,
      cookieOptions
    );

    finalResponse.cookies.set(
      "mp_oauth_user_id",
      user.id,
      cookieOptions
    );

    return finalResponse;
  } catch (error) {
    console.error(
      "Error iniciando OAuth de Mercado Pago:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo iniciar la conexión con Mercado Pago.",
      },
      { status: 500 }
    );
  }
}
