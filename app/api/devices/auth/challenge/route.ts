import { isDeviceAuthEnabled } from "@/lib/deviceEnvironment";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  checkDeviceAuthGlobalRateLimit,
  checkDeviceAuthRateLimit,
} from "@/lib/deviceAuthRateLimit";

export const runtime = "nodejs";


const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_REQUEST_BYTES = 1024;

async function leerSolicitudSegura(request: NextRequest) {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const length = Number(contentLength);

    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_REQUEST_BYTES
    ) {
      return null;
    }
  }

  try {
    const reader = request.body?.getReader();

    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    const text = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(Buffer.concat(chunks));

    const body: unknown = JSON.parse(text);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return null;
    }

    const data = body as Record<string, unknown>;

    if (
      typeof data.deviceId !== "string" ||
      !UUID_REGEX.test(data.deviceId)
    ) {
      return null;
    }

    return {
      deviceId: data.deviceId.toLowerCase(),
    };
  } catch {
    return null;
  }
}



const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

function autenticacionHabilitada(): boolean {
  return isDeviceAuthEnabled();
}

export async function POST(request: NextRequest) {
  if (!autenticacionHabilitada()) {
    return NextResponse.json(
      {
        error: "La autenticación de dispositivos no está habilitada.",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      }
    );
  }

  const solicitud = await leerSolicitudSegura(request);

  if (!solicitud) {
    return NextResponse.json(
      {
        error: "Solicitud de autenticación inválida.",
      },
      {
        status: 400,
        headers: RESPONSE_HEADERS,
      }
    );
  }

  const globalRateLimit =
    await checkDeviceAuthGlobalRateLimit();

  if (!globalRateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Demasiadas solicitudes de autenticación.",
      },
      {
        status: 429,
        headers: {
          ...RESPONSE_HEADERS,
          "Retry-After": String(
            globalRateLimit.retryAfterSeconds
          ),
        },
      }
    );
  }

  const rateLimit = await checkDeviceAuthRateLimit(
    solicitud.deviceId,
    "challenge"
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Demasiadas solicitudes de autenticación.",
      },
      {
        status: 429,
        headers: {
          ...RESPONSE_HEADERS,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  // Generar un desafío criptográficamente aleatorio.
  const challenge = randomBytes(32).toString("hex");

  // Guardar únicamente su hash SHA-256.
  const challengeHash = createHash("sha256")
    .update(challenge, "utf8")
    .digest("hex");

  try {
    const { data: challengeId, error } = await supabaseAdmin.rpc(
      "create_pos_device_auth_challenge",
      {
        p_device_id: solicitud.deviceId,
        p_challenge_hash: challengeHash,
      }
    );

    if (error || typeof challengeId !== "string") {
      return NextResponse.json(
        {
          error: "No fue posible generar el desafío.",
        },
        {
          status: 400,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    return NextResponse.json(
      {
        challengeId,
        challenge,
        expiresInSeconds: 120,
      },
      {
        status: 200,
        headers: RESPONSE_HEADERS,
      }
    );
  } catch {
    return NextResponse.json(
      {
        error: "No fue posible generar el desafío.",
      },
      {
        status: 500,
        headers: RESPONSE_HEADERS,
      }
    );
  }
}
