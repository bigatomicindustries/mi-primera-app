import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// 1. Exigir sesión autenticada
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

// 3. Solo administradores de la plataforma
const {
  data: platformAdmin,
  error: platformAdminError,
} = await supabaseAdmin
  .from("platform_admins")
  .select("user_id")
  .eq("user_id", user.id)
  .maybeSingle();

if (platformAdminError) {
  console.error(
    "Error verificando administrador de plataforma:",
    platformAdminError
  );

  return NextResponse.json(
    { error: "No se pudo verificar la autorización" },
    { status: 500 }
  );
}

if (!platformAdmin) {
  return NextResponse.json(
    { error: "No autorizado" },
    { status: 403 }
  );
}
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!accessToken) {
      return NextResponse.json(
        { error: "MERCADOPAGO_ACCESS_TOKEN no está configurado" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { slug } = body;

    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "Debes proporcionar un slug válido" },
        { status: 400 }
      );
    }

    // Buscar el plan directamente en Supabase.
    // El cliente ya no decide nombre, precio ni moneda.
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select(
        "id, name, slug, price_monthly, currency, active, mercadopago_plan_id"
      )
      .eq("slug", slug)
      .single();

    if (planError || !plan) {
      console.error("Error buscando plan:", planError);

      return NextResponse.json(
        { error: "Plan no encontrado" },
        { status: 404 }
      );
    }

    if (!plan.active) {
      return NextResponse.json(
        { error: "El plan está inactivo" },
        { status: 400 }
      );
    }

    const price = Number(plan.price_monthly);

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { error: "Este plan no requiere una suscripción de pago" },
        { status: 400 }
      );
    }

    // Evitar crear accidentalmente el mismo plan dos veces.
    if (plan.mercadopago_plan_id) {
      return NextResponse.json(
        {
          error: "Este plan ya está vinculado con Mercado Pago",
          mercadopago_plan_id: plan.mercadopago_plan_id,
        },
        { status: 409 }
      );
    }

    const response = await fetch(
      "https://api.mercadopago.com/preapproval_plan",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: `Mi Negocio ${plan.name}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: price,
            currency_id: plan.currency,
          },
          back_url: "https://pos.mybusiness.mx/suscripcion",
        }),
      }
    );

    const mercadoPagoPlan = await response.json();

    if (!response.ok) {
      console.error("Error Mercado Pago:", mercadoPagoPlan);

      return NextResponse.json(
        {
          error: "Mercado Pago rechazó la solicitud",
          details: mercadoPagoPlan,
        },
        { status: response.status }
      );
    }

    // Guardar automáticamente el ID devuelto por Mercado Pago.
    const { error: updateError } = await supabaseAdmin
      .from("plans")
      .update({
        mercadopago_plan_id: mercadoPagoPlan.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.id);

    if (updateError) {
      console.error(
        "El plan fue creado en Mercado Pago, pero no se pudo guardar en Supabase:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "El plan fue creado en Mercado Pago, pero no se pudo guardar en Supabase",
          mercadopago_plan_id: mercadoPagoPlan.id,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        price_monthly: price,
        currency: plan.currency,
        mercadopago_plan_id: mercadoPagoPlan.id,
        status: mercadoPagoPlan.status,
        init_point: mercadoPagoPlan.init_point,
      },
    });
  } catch (error) {
    console.error("Error creando plan Mercado Pago:", error);

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}