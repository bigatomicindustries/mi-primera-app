import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabaseUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Este endpoint permanece limitado al entorno DEV.
const DEV_SUPABASE_HOST = "pablbrladwjuczhazsms.supabase.co";

const NO_STORE = {
  "Cache-Control": "no-store",
};

function respuestaError(mensaje: string, status: number) {
  return NextResponse.json(
    { error: mensaje },
    {
      status,
      headers: NO_STORE,
    }
  );
}

function esEntornoDev() {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  try {
    const url = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    );

    return url.hostname === DEV_SUPABASE_HOST;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  // 1. Impedir que este endpoint opere en producción.
  if (!esEntornoDev()) {
    return respuestaError(
      "La consulta de dispositivos todavía no está habilitada.",
      503
    );
  }

  // 2. Obtener el token de la sesión.
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respuestaError("No autorizado.", 401);
  }

  const accessToken = authorization.slice(7);

  if (!accessToken || accessToken.trim() !== accessToken) {
    return respuestaError("Token de acceso inválido.", 401);
  }

  try {
    // 3. Crear un cliente con los permisos del usuario.
    const supabaseUser = createSupabaseUserClient(accessToken);

    // 4. Verificar la sesión con Supabase Auth.
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser(accessToken);

    if (userError || !user) {
      return respuestaError("Sesión inválida.", 401);
    }

    // 5. Verificar el perfil y los permisos del administrador.
    const { data: perfil, error: perfilError } = await supabaseUser
      .from("profiles")
      .select("id, role, active, business_id")
      .eq("id", user.id)
      .single();

    if (perfilError || !perfil) {
      return respuestaError(
        "No se pudo verificar tu perfil.",
        403
      );
    }

    if (!perfil.active || perfil.role !== "admin") {
      return respuestaError(
        "Solo un administrador activo puede consultar dispositivos.",
        403
      );
    }

    if (!perfil.business_id) {
      return respuestaError(
        "Tu usuario no tiene un negocio asignado.",
        403
      );
    }

    // 6. Verificar que el negocio esté activo.
    const { data: negocio, error: negocioError } =
      await supabaseUser
        .from("businesses")
        .select("id, active")
        .eq("id", perfil.business_id)
        .single();

    if (negocioError || !negocio || !negocio.active) {
      return respuestaError(
        "El negocio está suspendido o no está disponible.",
        403
      );
    }

    // 7. Consultar dispositivos usando service_role.
    // La clave administrativa permanece exclusivamente en el servidor.
    //
    // IMPORTANTE:
    // Filtrar siempre por el negocio del administrador autenticado.
    const { data: dispositivos, error: dispositivosError } =
      await supabaseAdmin
        .from("pos_devices")
        .select(
          "id, name, platform, status, branch_id, created_at, linked_at, last_sync_at, revoked_at"
        )
        .eq("business_id", perfil.business_id)
        .order("created_at", { ascending: false })
        .limit(100);

    if (dispositivosError) {
      console.error(
        "Error consultando dispositivos:",
        dispositivosError
      );

      return respuestaError(
        "No se pudieron consultar los dispositivos.",
        500
      );
    }

    // 8. Devolver únicamente los datos necesarios para el listado.
    // Nunca devolver claves públicas, tokens ni información sensible.
    return NextResponse.json(
      {
        dispositivos: dispositivos ?? [],
      },
      {
        status: 200,
        headers: NO_STORE,
      }
    );
  } catch (error) {
    console.error(
      "Error inesperado consultando dispositivos:",
      error
    );

    return respuestaError(
      "Ocurrió un error al consultar los dispositivos.",
      500
    );
  }
}