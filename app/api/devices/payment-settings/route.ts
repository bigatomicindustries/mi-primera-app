import { isDeviceAuthEnabled } from "@/lib/deviceEnvironment";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMobileSyncDeviceId } from "@/lib/mobileSyncSession";

export const runtime = "nodejs";

const TOKEN_REGEX = /^[0-9a-f]{64}$/;

const HEADERS = {
  "Cache-Control": "no-store",
};

function respond(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: HEADERS,
  });
}

function devEnabled(): boolean {
  return isDeviceAuthEnabled();
}

export async function GET(request: Request) {
  if (!devEnabled()) {
    return respond(503, {
      error: "Consulta bancaria no habilitada.",
    });
  }

  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, {
      error: "Autenticación requerida.",
    });
  }

  const token = authorization.slice(7);

  if (!TOKEN_REGEX.test(token)) {
    return respond(401, {
      error: "Token inválido.",
    });
  }

  try {
    // El dispositivo se obtiene de una sesión validada.
    // Nunca se recibe business_id del cliente.
    const deviceId = await getMobileSyncDeviceId(token);

    if (!deviceId) {
      return respond(401, {
        error: "Sesión vencida o no autorizada.",
      });
    }

    const { data: device, error: deviceError } =
      await supabaseAdmin
        .from("pos_devices")
        .select("business_id, status, linked_at, revoked_at")
        .eq("id", deviceId)
        .maybeSingle();

    if (deviceError) {
      return respond(503, {
        error: "No se pudo verificar el dispositivo.",
      });
    }

    if (
      !device?.business_id ||
      device.status !== "active" ||
      device.linked_at === null ||
      device.revoked_at !== null
    ) {
      return respond(403, {
        error: "Dispositivo revocado o sin autorización.",
      });
    }

    const { data: business, error: businessError } =
      await supabaseAdmin
        .from("businesses")
        .select("id, active")
        .eq("id", device.business_id)
        .maybeSingle();

    if (businessError) {
      return respond(503, {
        error: "No se pudo verificar el negocio.",
      });
    }

    if (!business?.active) {
      return respond(403, {
        error: "Negocio no disponible.",
      });
    }

    const { data: settings, error: settingsError } =
      await supabaseAdmin
        .from("business_payment_settings")
        .select(
          "bank_name, account_holder, clabe, account_number, transfer_enabled"
        )
        .eq("business_id", business.id)
        .maybeSingle();

    if (settingsError) {
      return respond(503, {
        error: "No se pudo consultar la configuración bancaria.",
      });
    }

    const enabled = settings?.transfer_enabled === true;

    // No entregar datos bancarios cuando el negocio
    // tiene deshabilitadas las transferencias.
    return respond(200, {
      businessId: business.id,
      transferEnabled: enabled,
      bankName: enabled ? settings?.bank_name ?? "" : "",
      accountHolder: enabled
        ? settings?.account_holder ?? ""
        : "",
      clabe: enabled ? settings?.clabe ?? "" : "",
      accountNumber: enabled
        ? settings?.account_number ?? ""
        : "",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "No se pudo consultar la configuración bancaria del dispositivo:",
      error instanceof Error ? error.name : "unknown"
    );

    return respond(503, {
      error: "Servicio temporalmente no disponible.",
    });
  }
}
