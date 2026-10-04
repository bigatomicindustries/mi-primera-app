import { NextResponse } from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

const registerRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    5,
    "10 m"
  ),
  prefix: "ratelimit:register-business",
});

export async function POST(request: Request) {
let nuevoUsuarioId: string | null = null;
let nuevoNegocioId: string | null = null;
let nuevaSucursalId: string | null = null;
let supabaseAdmin: SupabaseClient | null = null;
let usuarioCreadoEnEsteRegistro = false;
const ip =
  request.headers.get("x-vercel-forwarded-for") ||
  request.headers.get("x-forwarded-for") ||
  request.headers.get("x-real-ip");

const rateLimitIdentifier =
  ip || `local:${request.headers.get("user-agent") || "unknown"}`;

const { success, reset } =
  await registerRatelimit.limit(
    rateLimitIdentifier
  );

if (!success) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((reset - Date.now()) / 1000)
  );

  return NextResponse.json(
    {
      error:
        "Demasiados intentos de registro. Intenta nuevamente en unos minutos.",
    },
    {
      status: 429,
      headers: {
        "Retry-After":
          retryAfterSeconds.toString(),
      },
    }
  );
}

  const rollbackRegistro = async () => {
  if (!supabaseAdmin) {
    return;
  }

  // 0. Limpiar datos de sucursal creados durante el registro.

// Eliminar primero la asignación del administrador
// a la sucursal principal.
if (nuevaSucursalId && nuevoUsuarioId) {
  const { error: asignacionRollbackError } =
    await supabaseAdmin
      .from("profile_branches")
      .delete()
      .eq("profile_id", nuevoUsuarioId)
      .eq("branch_id", nuevaSucursalId);

  if (asignacionRollbackError) {
    console.error(
      "Error eliminando asignación de sucursal durante rollback:",
      asignacionRollbackError
    );
  }
}

// Después eliminar la sucursal principal.
if (nuevaSucursalId) {
  const { error: sucursalRollbackError } =
    await supabaseAdmin
      .from("branches")
      .delete()
      .eq("id", nuevaSucursalId);

  if (sucursalRollbackError) {
    console.error(
      "Error eliminando sucursal durante rollback:",
      sucursalRollbackError
    );
  }
}

  // 1. Eliminar la suscripción primero.
  // subscriptions.business_id → businesses.id es RESTRICT.
  if (nuevoNegocioId) {
    const { error: suscripcionRollbackError } =
      await supabaseAdmin
        .from("subscriptions")
        .delete()
        .eq("business_id", nuevoNegocioId);

    if (suscripcionRollbackError) {
      console.error(
        "Error eliminando suscripción durante rollback:",
        suscripcionRollbackError
      );
    }
  }

  // 2. Eliminar el usuario de Auth.
  // En nuestra estructura esto también puede eliminar
  // o liberar el perfil asociado.
if (
  nuevoUsuarioId &&
  usuarioCreadoEnEsteRegistro
) {
    const { error: usuarioRollbackError } =
      await supabaseAdmin.auth.admin.deleteUser(
        nuevoUsuarioId
      );

    if (usuarioRollbackError) {
      console.error(
        "Error eliminando usuario durante rollback:",
        usuarioRollbackError
      );
    }
  }

  // 3. Eliminamos explícitamente cualquier perfil
  // que pudiera seguir existiendo.
if (
  nuevoUsuarioId &&
  usuarioCreadoEnEsteRegistro
) {
    const { error: perfilRollbackError } =
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", nuevoUsuarioId);

    if (perfilRollbackError) {
      console.error(
        "Error eliminando perfil durante rollback:",
        perfilRollbackError
      );
    }
  }

  // 4. Finalmente podemos eliminar el negocio.
  if (nuevoNegocioId) {
    const { error: negocioRollbackError } =
      await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", nuevoNegocioId);

    if (negocioRollbackError) {
      console.error(
        "Error eliminando negocio durante rollback:",
        negocioRollbackError
      );
    }
  }

nuevoUsuarioId = null;
nuevoNegocioId = null;
nuevaSucursalId = null;
};

  try {
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  return NextResponse.json(
    {
      error:
        "Falta configuración de Supabase en el servidor.",
    },
    { status: 500 }
  );
}

    // =====================================================
    // 1. LEER DATOS
    // =====================================================

    const body = await request.json();

    const businessName =
      typeof body.business_name === "string"
        ? body.business_name.trim()
        : "";

    const fullName =
      typeof body.full_name === "string"
        ? body.full_name.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    // =====================================================
    // 2. VALIDACIONES
    // =====================================================

    const turnstileToken =
  typeof body.turnstile_token === "string"
    ? body.turnstile_token
    : "";

    if (!turnstileToken) {
  return NextResponse.json(
    {
      error:
        "No se pudo verificar la solicitud. Completa la verificación de seguridad.",
    },
    { status: 400 }
  );
}

const turnstileSecretKey =
  process.env.TURNSTILE_SECRET_KEY;

if (!turnstileSecretKey) {
  console.error(
    "Falta TURNSTILE_SECRET_KEY en el servidor."
  );

  return NextResponse.json(
    {
      error:
        "La verificación de seguridad no está disponible.",
    },
    { status: 500 }
  );
}

const turnstileResponse = await fetch(
  "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  {
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: turnstileSecretKey,
      response: turnstileToken,
    }),
  }
);

const turnstileResult =
  await turnstileResponse.json();

if (!turnstileResult.success) {
  console.error(
    "Turnstile rechazó la solicitud:",
    turnstileResult["error-codes"]
  );

  return NextResponse.json(
    {
      error:
        "No se pudo verificar la solicitud. Completa nuevamente la verificación de seguridad.",
    },
    { status: 400 }
  );
}

if (turnstileResult.action !== "register-business") {
  console.error(
    "Turnstile devolvió una action inesperada:",
    turnstileResult.action
  );

  return NextResponse.json(
    {
      error:
        "No se pudo verificar la solicitud. Completa nuevamente la verificación de seguridad.",
    },
    { status: 400 }
  );
}

const allowedTurnstileHostnames = [
  "localhost",
  "mi-primera-app-drab.vercel.app",
  "pos.mybusiness.mx",
];

if (
  !turnstileResult.hostname ||
  !allowedTurnstileHostnames.includes(
    turnstileResult.hostname
  )
) {
  console.error(
    "Turnstile devolvió un hostname inesperado:",
    turnstileResult.hostname
  );

  return NextResponse.json(
    {
      error:
        "No se pudo verificar la solicitud. Completa nuevamente la verificación de seguridad.",
    },
    { status: 400 }
  );
}

    if (!businessName) {
      return NextResponse.json(
        { error: "El nombre del negocio es obligatorio." },
        { status: 400 }
      );
    }

    if (!fullName) {
      return NextResponse.json(
        { error: "Tu nombre es obligatorio." },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Ingresa un correo válido." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error:
            "La contraseña debe tener al menos 8 caracteres.",
        },
        { status: 400 }
      );
    }

    // =====================================================
    // 3. CLIENTE ADMINISTRATIVO
    // =====================================================

    // IMPORTANTE:
    // SUPABASE_SERVICE_ROLE_KEY nunca debe llegar al navegador.
    supabaseAdmin = createClient(
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
    // 4. CREAR USUARIO EN AUTH
    // =====================================================

const supabaseSignup = createClient(
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
  data: nuevoUsuario,
  error: usuarioError,
} = await supabaseSignup.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${new URL(request.url).origin}/login?confirmed=true`,
    data: {
      full_name: fullName,
    },
  },
});

if (usuarioError || !nuevoUsuario.user) {
  console.error(
    "Error creando usuario SaaS:",
    usuarioError
  );

  return NextResponse.json(
    {
      error:
        "No se pudo crear la cuenta. Intenta nuevamente en unos minutos.",
    },
    { status: 400 }
  );
}

const identities =
  nuevoUsuario.user.identities ?? [];

if (identities.length === 0) {
  return NextResponse.json(
    {
      error:
        "No se pudo completar el registro con este correo. Si ya tienes una cuenta, inicia sesión.",
    },
    { status: 409 }
  );
}

nuevoUsuarioId = nuevoUsuario.user.id;
usuarioCreadoEnEsteRegistro = true;

    // =====================================================
    // 5. GENERAR SLUG
    // =====================================================

    const slugBase = businessName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const slug =
      `${slugBase || "negocio"}-${crypto.randomUUID().slice(0, 8)}`;

    // =====================================================
    // 6. CREAR NEGOCIO
    // =====================================================

    const {
      data: nuevoNegocio,
      error: negocioError,
    } = await supabaseAdmin
      .from("businesses")
      .insert({
        name: businessName,
        slug,
        active: true,
      })
      .select("id, name, slug, active")
      .single();

if (negocioError || !nuevoNegocio) {
  console.error(
    "Error creando negocio:",
    negocioError
  );

  await rollbackRegistro();

  return NextResponse.json(
    {
      error: "No se pudo crear el negocio.",
    },
    { status: 500 }
  );
}

    nuevoNegocioId = nuevoNegocio.id;

    // =====================================================
    // 7. CREAR PERFIL DEL PRIMER ADMIN
    // =====================================================

    const { error: perfilError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: nuevoUsuarioId,
          full_name: fullName,
          role: "admin",
          active: true,

          // El business_id lo genera el servidor.
          // Nunca viene del navegador.
          business_id: nuevoNegocioId,

          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

if (perfilError) {
  console.error(
    "Error creando perfil administrador:",
    perfilError
  );

  await rollbackRegistro();

  return NextResponse.json(
    {
      error:
        "No se pudo crear el administrador del negocio.",
    },
    { status: 500 }
  );
}

// =====================================================
// 8. BUSCAR PLAN FREE
// =====================================================

const {
  data: planFree,
  error: planError,
} = await supabaseAdmin
  .from("plans")
  .select("id")
  .eq("slug", "free")
  .eq("active", true)
  .single();

if (planError || !planFree) {
  console.error(
    "Error buscando plan Free:",
    planError
  );

  await rollbackRegistro();

  return NextResponse.json(
    {
      error:
        "No se pudo asignar el plan inicial al negocio.",
    },
    { status: 500 }
  );
}

// =====================================================
// 9. CREAR SUSCRIPCIÓN FREE
// =====================================================

const {
  data: nuevaSuscripcion,
  error: suscripcionError,
} = await supabaseAdmin
  .from("subscriptions")
  .insert({
    business_id: nuevoNegocioId,
    plan_id: planFree.id,
    status: "active",
  })
  .select("id, status, plan_id")
  .single();

if (suscripcionError || !nuevaSuscripcion) {
  console.error(
    "Error creando suscripción:",
    suscripcionError
  );

  await rollbackRegistro();

  return NextResponse.json(
    {
      error:
        "No se pudo crear la suscripción inicial.",
    },
    { status: 500 }
  );
}

// =====================================================
// 10. CREAR SUCURSAL PRINCIPAL
// =====================================================

const {
  data: nuevaSucursal,
  error: sucursalError,
} = await supabaseAdmin
  .from("branches")
  .insert({
    business_id: nuevoNegocioId,
    name: "Sucursal principal",
    code: "MAIN",
    is_main: true,
    active: true,
  })
  .select("id, name, code, is_main, active")
  .single();

if (sucursalError || !nuevaSucursal) {
  console.error(
    "Error creando sucursal principal:",
    sucursalError
  );

  await rollbackRegistro();

  return NextResponse.json(
    {
      error:
        "No se pudo crear la sucursal principal del negocio.",
    },
    { status: 500 }
  );
}

nuevaSucursalId = nuevaSucursal.id;

// =====================================================
// 11. ASIGNAR ADMINISTRADOR A SUCURSAL PRINCIPAL
// =====================================================

const { error: asignacionSucursalError } =
  await supabaseAdmin
    .from("profile_branches")
    .insert({
      profile_id: nuevoUsuarioId,
      branch_id: nuevaSucursalId,
      business_id: nuevoNegocioId,
    });

if (asignacionSucursalError) {
  console.error(
    "Error asignando administrador a sucursal principal:",
    asignacionSucursalError
  );

  await rollbackRegistro();

  return NextResponse.json(
    {
      error:
        "No se pudo asignar la sucursal principal al administrador.",
    },
    { status: 500 }
  );
}

    // =====================================================
    // 12. RESPUESTA
    // =====================================================

    return NextResponse.json(
      {
        business: {
          id: nuevoNegocio.id,
          name: nuevoNegocio.name,
          slug: nuevoNegocio.slug,
          active: nuevoNegocio.active,
        },
        user: {
          id: nuevoUsuarioId,
          full_name: fullName,
          email,
          role: "admin",
        },
subscription: {
  id: nuevaSuscripcion.id,
  plan: "free",
  plan_id: nuevaSuscripcion.plan_id,
  status: nuevaSuscripcion.status,
},
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Error registrando negocio:",
      error
    );

    await rollbackRegistro();

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al registrar el negocio.",
      },
      { status: 500 }
    );
  }
}