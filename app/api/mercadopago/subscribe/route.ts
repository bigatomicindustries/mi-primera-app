import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
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

    // 2. Verificar el token directamente con Supabase Auth
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

    if (!user.email) {
      return NextResponse.json(
        {
          error:
            "El usuario autenticado no tiene un correo electrónico",
        },
        { status: 400 }
      );
    }

    // 3. Leer solamente el plan solicitado
const body = await request.json();

const {
  plan: planSlug,
  card_token_id: cardTokenId,
} = body;

if (
  typeof planSlug !== "string" ||
  !["pro", "business"].includes(planSlug)
) {
  return NextResponse.json(
    { error: "Plan inválido" },
    { status: 400 }
  );
}

if (
  typeof cardTokenId !== "string" ||
  !cardTokenId.trim()
) {
  return NextResponse.json(
    {
      error:
        "No se recibió un token de tarjeta válido",
    },
    { status: 400 }
  );
}

    // 4. Obtener perfil REAL desde la base de datos.
    // No confiamos en role/business_id enviados por el navegador.
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

    // 5. Comprobar que el negocio siga activo
    const {
      data: business,
      error: businessError,
    } = await supabaseAdmin
      .from("businesses")
      .select("id, name, active")
      .eq("id", profile.business_id)
      .single();

    if (
      businessError ||
      !business
    ) {
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

    // 6. Obtener el plan y su ID real de Mercado Pago
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

    // 7. Revisar la suscripción actual del negocio
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

    if (
      subscriptionError ||
      !currentSubscription
    ) {
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

// 8. Crear primero nuestro checkout local.
// Así tenemos un ID interno antes de hablar con Mercado Pago.
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
    payer_email: "test@testuser.com",
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

// 9. Usaremos nuestro checkout ID como referencia.
// Es más limpio y seguro que codificar business_id y plan_id.
const externalReference =
  `subscription_checkout:${checkout.id}`;

// 10. Crear suscripción individual en Mercado Pago
const mercadoPagoResponse = await fetch(
  "https://api.mercadopago.com/preapproval",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
body: JSON.stringify({
  preapproval_plan_id:
    plan.mercadopago_plan_id,

  payer_email: user.email,

  card_token_id:
    cardTokenId,

  status: "authorized",

  external_reference:
    externalReference,
}),
  }
);

const mercadoPagoRaw =
  await mercadoPagoResponse.text();

let mercadoPagoSubscription: any = null;

try {
  mercadoPagoSubscription =
    mercadoPagoRaw
      ? JSON.parse(mercadoPagoRaw)
      : null;
} catch {
  mercadoPagoSubscription =
    mercadoPagoRaw;
}

if (!mercadoPagoResponse.ok) {
  console.error(
    "Mercado Pago HTTP status:",
    mercadoPagoResponse.status
  );

  console.error(
    "Mercado Pago response:",
    mercadoPagoRaw
  );

  // Conservamos el registro para auditoría,
  // pero indicamos que Mercado Pago rechazó
  // la creación.
  await supabaseAdmin
    .from("subscription_checkouts")
    .update({
      mercadopago_status: "creation_failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", checkout.id);

  return NextResponse.json(
    {
      error:
        "Mercado Pago rechazó la creación de la suscripción",
      details: mercadoPagoSubscription,
    },
    { status: mercadoPagoResponse.status }
  );
}

// 11. Vincular nuestro checkout con la
// suscripción creada por Mercado Pago.
const {
  error: checkoutUpdateError,
} = await supabaseAdmin
  .from("subscription_checkouts")
  .update({
    mercadopago_subscription_id:
      mercadoPagoSubscription.id,

    mercadopago_status:
      mercadoPagoSubscription.status ||
      "pending",

    updated_at:
      new Date().toISOString(),
  })
  .eq("id", checkout.id);

if (checkoutUpdateError) {
  console.error(
    "Mercado Pago creó la suscripción, pero no pudimos vincularla:",
    checkoutUpdateError
  );

  return NextResponse.json(
    {
      error:
        "La suscripción fue creada en Mercado Pago, pero no pudo vincularse localmente",

      checkout_id:
        checkout.id,

      mercadopago_subscription_id:
        mercadoPagoSubscription.id,
    },
    { status: 500 }
  );
}

// IMPORTANTE:
// Todavía NO cambiamos subscriptions.plan_id.
//
// El plan vigente solo cambiará cuando
// confirmemos el estado correspondiente
// desde Mercado Pago.

return NextResponse.json({
  success: true,

  checkout_id:
    checkout.id,

  checkout_url:
    mercadoPagoSubscription.init_point,

  mercadopago_subscription_id:
    mercadoPagoSubscription.id,

  status:
    mercadoPagoSubscription.status,

  plan: {
    name: plan.name,
    slug: plan.slug,
    price_monthly:
      Number(plan.price_monthly),
    currency: plan.currency,
  },
});

  } catch (error) {
    console.error(
      "Error creando suscripción:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}