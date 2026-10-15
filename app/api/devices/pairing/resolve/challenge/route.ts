import {
  isDevicePairingEnabled,
  isDeviceAuthEnabled,
} from "@/lib/deviceEnvironment";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  checkDevicePairingRateLimit,
} from "@/lib/devicePairingRateLimit";

import {
  createResolutionChallenge,
} from "@/lib/devicePairingResolutionChallenge";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEADERS = {
  "Cache-Control": "no-store",
};

function enabled(): boolean {
  return (
    isDevicePairingEnabled() &&
    isDeviceAuthEnabled()
  );
}

function unavailable() {
  return NextResponse.json(
    { error: "Resolución temporalmente no disponible." },
    { status: 503, headers: HEADERS }
  );
}

function invalid() {
  return NextResponse.json(
    { error: "No fue posible iniciar la resolución." },
    { status: 400, headers: HEADERS }
  );
}

async function readBody(
  request: Request
): Promise<{ pairingChallengeId: string } | null> {
  const contentLength =
    request.headers.get("content-length");

  if (contentLength !== null) {
    const length = Number(contentLength);

    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > 512
    ) {
      return null;
    }
  }

  try {
    const reader = request.body?.getReader();

    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let bytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      bytes += value.byteLength;

      if (bytes > 512) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", {
        fatal: true,
      }).decode(Buffer.concat(chunks))
    );

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const data = parsed as Record<string, unknown>;

    if (
      typeof data.pairingChallengeId !== "string" ||
      !UUID_REGEX.test(data.pairingChallengeId)
    ) {
      return null;
    }

    return {
      pairingChallengeId:
        data.pairingChallengeId.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!enabled()) {
    return unavailable();
  }

  const input = await readBody(request);

  if (!input) {
    return invalid();
  }

  const limit = await checkDevicePairingRateLimit(
    `pairing-resolution:${input.pairingChallengeId}`,
    "challenge"
  );

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes." },
      {
        status: 429,
        headers: {
          ...HEADERS,
          "Retry-After": String(
            limit.retryAfterSeconds
          ),
        },
      }
    );
  }

  try {
    // La RPC coordina esta consulta con la
    // confirmación original mediante bloqueos.
    const { data: state, error } =
      await supabaseAdmin.rpc(
        "resolve_pos_device_pairing_state",
        {
          p_challenge_id: input.pairingChallengeId,
        }
      );

    if (error) {
      return unavailable();
    }

    // Si el intento aún no fue finalizado,
    // solo aceptar el estado no vinculado.
    //
    // Si ya fue finalizado, comprobar el registro
    // persistente y el estado actual del dispositivo.
    if (state !== "not_linked") {
      const { data: resolutionRecord, error: recordError } =
        await supabaseAdmin
          .from("pos_device_pairing_resolutions")
          .select("device_id")
          .eq(
            "pairing_challenge_id",
            input.pairingChallengeId
          )
          .maybeSingle();

      if (recordError) {
        return unavailable();
      }

      if (!resolutionRecord) {
        return invalid();
      }

      const { data: pairing, error: pairingError } =
        await supabaseAdmin
          .from("pos_device_pairing_challenges")
          .select("pairing_token_id")
          .eq("id", input.pairingChallengeId)
          .maybeSingle();

      if (pairingError) return unavailable();
      if (!pairing) return invalid();

      const { data: token, error: tokenError } =
        await supabaseAdmin
          .from("pos_device_pairing_tokens")
          .select("device_id, business_id, used_at")
          .eq("id", pairing.pairing_token_id)
          .maybeSingle();

      if (tokenError) return unavailable();

      if (
        !token ||
        !token.used_at ||
        token.device_id !== resolutionRecord.device_id
      ) {
        return invalid();
      }

      const { data: device, error: deviceError } =
        await supabaseAdmin
          .from("pos_devices")
          .select("status, revoked_at, linked_at, public_key")
          .eq("id", token.device_id)
          .eq("business_id", token.business_id)
          .maybeSingle();

      if (deviceError) return unavailable();

      if (
        !device ||
        device.status !== "active" ||
        device.revoked_at !== null ||
        device.linked_at !== null ||
        device.public_key !== null
      ) {
        return invalid();
      }
    }

    // Emitir solamente una nueva prueba temporal.
    // Conocer el identificador original no autoriza
    // a limpiar SecureStore.
    const resolution =
      await createResolutionChallenge(
        input.pairingChallengeId
      );

    return NextResponse.json(
      resolution,
      {
        status: 200,
        headers: HEADERS,
      }
    );
  } catch {
    return unavailable();
  }
}
