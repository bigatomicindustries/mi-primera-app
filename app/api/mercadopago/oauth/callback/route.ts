import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type MercadoPagoTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: number | string;
  refresh_token?: string;
};

function redirectToPlan(
  request: NextRequest,
  params: Record<string, string>
) {
  const url = new URL("/plan", request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(url);

  // Los datos temporales de OAuth ya no deben permanecer.
  response.cookies.delete("mp_oauth_state");
  response.cookies.delete("mp_oauth_code_verifier");
  response.cookies.delete("mp_oauth_business_id");
  response.cookies.delete("mp_oauth_user_id");

  return response;
}

export async function GET(request: NextRequest) {
  try {
    // =====================================================
    // 1. CONFIGURACIÓN
    // =====================================================

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const clientId =
      process.env.MERCADOPAGO_CLIENT_ID;

    const clientSecret =
      process.env.MERCADOPAGO_CLIENT_SECRET;

    const redirectUri =
      process.env.MERCADOPAGO_OAUTH_REDIRECT_URI;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !clientId ||
      !clientSecret ||
      !redirectUri
    ) {
      console.error(
        "Falta configuración para callback OAuth de Mercado Pago."
      );

      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "configuration",
      });
    }

    // =====================================================
    // 2. LEER RESPUESTA DE MERCADO PAGO
    // =====================================================

    const code =
      request.nextUrl.searchParams.get("code");

    const receivedState =
      request.nextUrl.searchParams.get("state");

    const oauthError =
      request.nextUrl.searchParams.get("error");

    if (oauthError) {
      console.error(
        "Mercado Pago devolvió error OAuth:",
        oauthError
      );

      return redirectToPlan(request, {
        mp_connection: "cancelled",
      });
    }

    if (!code || !receivedState) {
      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "missing_parameters",
      });
    }

    // =====================================================
    // 3. RECUPERAR DATOS TEMPORALES
    // =====================================================

    const expectedState =
      request.cookies.get("mp_oauth_state")?.value;

    const codeVerifier =
      request.cookies.get(
        "mp_oauth_code_verifier"
      )?.value;

    const businessId =
      request.cookies.get(
        "mp_oauth_business_id"
      )?.value;

    const userId =
      request.cookies.get(
        "mp_oauth_user_id"
      )?.value;

    if (
      !expectedState ||
      !codeVerifier ||
      !businessId ||
      !userId
    ) {
      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "oauth_session_expired",
      });
    }

    // =====================================================
    // 4. VALIDAR STATE
    // =====================================================

    if (receivedState !== expectedState) {
      console.error(
        "State OAuth inválido en Mercado Pago."
      );

      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "invalid_state",
      });
    }

    // =====================================================
    // 5. CREAR CLIENTE ADMIN DE SUPABASE
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

    // Volvemos a comprobar que el usuario pertenece
    // al mismo negocio y sigue siendo administrador.

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, business_id, role, active")
      .eq("id", userId)
      .single();

    if (
      profileError ||
      !profile ||
      !profile.active ||
      profile.role !== "admin" ||
      profile.business_id !== businessId
    ) {
      console.error(
        "Perfil inválido durante callback OAuth:",
        profileError
      );

      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "unauthorized",
      });
    }

    // =====================================================
    // 6. INTERCAMBIAR CODE POR TOKENS
    // =====================================================

    const tokenResponse = await fetch(
      "https://api.mercadopago.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
        cache: "no-store",
      }
    );

    const tokenData =
      (await tokenResponse.json()) as
        MercadoPagoTokenResponse & {
          message?: string;
          error?: string;
        };

    if (
      !tokenResponse.ok ||
      !tokenData.access_token ||
      !tokenData.user_id
    ) {
      console.error(
        "Mercado Pago rechazó intercambio OAuth:",
        {
          status: tokenResponse.status,
          error: tokenData.error,
          message: tokenData.message,
        }
      );

      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "token_exchange",
      });
    }

    // =====================================================
    // 7. CALCULAR EXPIRACIÓN
    // =====================================================

    const expiresIn =
      typeof tokenData.expires_in === "number"
        ? tokenData.expires_in
        : null;

    const expiresAt =
      expiresIn !== null
        ? new Date(
            Date.now() + expiresIn * 1000
          ).toISOString()
        : null;

    // =====================================================
    // 8. GUARDAR CONEXIÓN DEL NEGOCIO
    // =====================================================

    const {
      error: connectionError,
    } = await supabaseAdmin
      .from("mercadopago_connections")
      .upsert(
        {
          business_id: businessId,

          mercadopago_user_id:
            String(tokenData.user_id),

          access_token:
            tokenData.access_token,

          refresh_token:
            tokenData.refresh_token ?? null,

          token_type:
            tokenData.token_type ?? null,

          scope:
            tokenData.scope ?? null,

          expires_at: expiresAt,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: "business_id",
        }
      );

    if (connectionError) {
      console.error(
        "Error guardando conexión Mercado Pago:",
        connectionError
      );

      return redirectToPlan(request, {
        mp_connection: "error",
        reason: "database",
      });
    }

    // =====================================================
    // 9. CONEXIÓN COMPLETADA
    // =====================================================

    return redirectToPlan(request, {
      mp_connection: "success",
    });
  } catch (error) {
    console.error(
      "Error procesando callback OAuth:",
      error
    );

    return redirectToPlan(request, {
      mp_connection: "error",
      reason: "unexpected",
    });
  }
}