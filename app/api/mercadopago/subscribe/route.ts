import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Configuración del servidor incompleta" },
        { status: 500 }
      );
    }

    // 1. Obtener token del usuario autenticado

    const authorization =
      request.headers.get("authorization");

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    const userAccessToken =
      authorization.replace("Bearer ", "").trim();

    if (!userAccessToken) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    // 2. Verificar sesión con Supabase

    const supabaseAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(
      userAccessToken
    );

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sesión inválida o expirada" },
        { status: 401 }
      );
    }

    // 3. Leer plan solicitado

    const body = await request.json();

    const planSlug = body?.plan;

    if (
      typeof planSlug !== "string" ||
      !["pro", "business"].includes(planSlug)
    ) {
      return NextResponse.json(
        { error: "Plan inválido" },
        { status: 400 }
      );
    }

    // 4. Obtener perfil real desde Supabase

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active, business_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Perfil no encontrado" },
        { status: 404 }
      );
    }

    if (!profile.active) {
      return NextResponse.json(
        { error: "Usuario inactivo" },
        { status: 403 }
      );
    }

    if (profile.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Solo un administrador puede cambiar el plan del negocio",
        },
        { status: 403 }
      );
    }

    // 5. Obtener negocio real del usuario

    const {
      data: business,
      error: businessError,
    } = await supabaseAdmin
      .from("businesses")
      .select("id, name, active")
      .eq("id", profile.business_id)
      .single();

    if (businessError || !business) {
      return NextResponse.json(
        { error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    if (!business.active) {
      return NextResponse.json(
        { error: "El negocio está suspendido" },
        { status: 403 }
      );
    }

    // 6. Obtener el plan desde la base de datos.
    // No confiamos en precio ni IDs enviados por el navegador.

    const {
      data: plan,
      error: planError,
    } = await supabaseAdmin
      .from("plans")
      .select(
        "id, name, slug, active, price_monthly, currency, mercadopago_plan_id"
      )
      .eq("slug", planSlug)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Plan no encontrado" },
        { status: 404 }
      );
    }

    if (!plan.active) {
      return NextResponse.json(
        { error: "El plan seleccionado está inactivo" },
        { status: 400 }
      );
    }

    if (!plan.mercadopago_plan_id) {
      return NextResponse.json(
        {
          error:
            "El plan todavía no está configurado en Mercado Pago",
        },
        { status: 500 }
      );
    }

    // 7. Revisar suscripción actual del negocio

    const {
      data: currentSubscription,
      error: subscriptionError,
    } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, plan_id, status, mercadopago_subscription_id"
      )
      .eq("business_id", business.id)
      .single();

    if (subscriptionError || !currentSubscription) {
      return NextResponse.json(
        {
          error:
            "No se encontró la suscripción actual del negocio",
        },
        { status: 404 }
      );
    }

    if (currentSubscription.plan_id === plan.id) {
      return NextResponse.json(
        {
          error:
            "Tu negocio ya tiene seleccionado este plan",
        },
        { status: 409 }
      );
    }

    if (
      currentSubscription.mercadopago_subscription_id
    ) {
      return NextResponse.json(
        {
          error:
            "El negocio ya tiene una suscripción de Mercado Pago asociada",
        },
        { status: 409 }
      );
    }

    // 8. Crear intento local.
    //
    // IMPORTANTE:
    // Esto NO activa ni cambia todavía la suscripción
    // real del negocio.

    const {
      data: checkout,
      error: checkoutError,
    } = await supabaseAdmin
      .from("subscription_checkouts")
      .insert({
        business_id: business.id,
        plan_id: plan.id,
        requested_by: user.id,
        mercadopago_status: "pending",
        payer_email: user.email ?? null,
      })
      .select("id")
      .single();

    if (checkoutError || !checkout) {
      console.error(
        "Error creando checkout local:",
        checkoutError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo iniciar el proceso de suscripción",
        },
        { status: 500 }
      );
    }

    // 9. Construir checkout alojado por Mercado Pago.
    //
    // Mercado Pago se encargará de:
    // - inicio de sesión del pagador
    // - tarjeta
    // - tokenización
    // - autorización
    // - creación del preapproval individual

    const checkoutUrl =
      "https://www.mercadopago.com.mx/subscriptions/checkout" +
      `?preapproval_plan_id=${encodeURIComponent(
        plan.mercadopago_plan_id
      )}`;

    // 10. Devolver URL al frontend.
    //
    // NO modificamos subscriptions.
    // NO consideramos el pago confirmado.
    // NO activamos Pro/Business aquí.

    return NextResponse.json({
      success: true,

      checkout_id: checkout.id,

      checkout_url: checkoutUrl,

      plan: {
        name: plan.name,
        slug: plan.slug,
        price_monthly: Number(
          plan.price_monthly
        ),
        currency: plan.currency,
      },
    });
  } catch (error) {
    console.error(
      "Error iniciando checkout de suscripción:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}