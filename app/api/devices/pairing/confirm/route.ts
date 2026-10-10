
import { createHash, type JsonWebKey } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isValidDevicePublicKey,
  verifyDevicePairingSignature,
} from "@/lib/devicePairingCrypto";
import { checkDevicePairingRateLimit } from "@/lib/devicePairingRateLimit";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHALLENGE_REGEX = /^[0-9a-f]{64}$/;
const SIGNATURE_REGEX = /^[A-Za-z0-9_-]{86}$/;

const MAX_REQUEST_BYTES = 8192;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

function invalidResponse() {
  return NextResponse.json(
    { error: "Confirmación inválida o vencida." },
    {
      status: 400,
      headers: RESPONSE_HEADERS,
    }
  );
}

// =====================================================
// 1. VERIFICAR ENTORNO DE PRUEBAS
// =====================================================

function confirmacionHabilitada(): boolean {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DEVICE_PAIRING_TEST_ENABLED !== "true"
  ) {
    return false;
  }

  try {
    const supabaseUrl = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    );

    return (
      supabaseUrl.protocol === "https:" &&
      supabaseUrl.hostname ===
        "pablbrladwjuczhazsms.supabase.co"
    );
  } catch {
    return false;
  }
}

// =====================================================
// 2. LEER SOLICITUD DE FORMA SEGURA
// =====================================================

async function leerSolicitudSegura(request: NextRequest) {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const longitud = Number(contentLength);

    if (
      !Number.isSafeInteger(longitud) ||
      longitud < 0 ||
      longitud > MAX_REQUEST_BYTES
    ) {
      return null;
    }
  }

  try {
    const reader = request.body?.getReader();

    if (!reader) {
      return null;
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);

    const texto = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(buffer);

    const body: unknown = JSON.parse(texto);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return null;
    }

    const data = body as Record<string, unknown>;

    if (
      typeof data.challengeId !== "string" ||
      !UUID_REGEX.test(data.challengeId) ||
      typeof data.challenge !== "string" ||
      !CHALLENGE_REGEX.test(data.challenge) ||
      typeof data.signature !== "string" ||
      !SIGNATURE_REGEX.test(data.signature)
    ) {
      return null;
    }

    return {
      challengeId: data.challengeId,
      challenge: data.challenge,
      signature: data.signature,
    };
  } catch {
    return null;
  }
}

// =====================================================
// 3. ENDPOINT POST
// =====================================================

export async function POST(request: NextRequest) {
  // ---------------------------------------------------
  // SEGURIDAD 1: BLOQUEO INMEDIATO
  // ---------------------------------------------------

  if (!confirmacionHabilitada()) {
    return NextResponse.json(
      {
        error: "La vinculación aún no está habilitada.",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      }
    );
  }

  // ---------------------------------------------------
  // SEGURIDAD 2: EXIGIR DESAFÍO DE PRUEBA AUTORIZADO
  // ---------------------------------------------------

  const allowedTestChallengeId =
    process.env.DEVICE_PAIRING_TEST_CHALLENGE_ID;

  if (
    !allowedTestChallengeId ||
    !UUID_REGEX.test(allowedTestChallengeId)
  ) {
    return NextResponse.json(
      {
        error: "Confirmación de prueba no configurada.",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      }
    );
  }

  try {
    // -------------------------------------------------
    // SEGURIDAD 3: LÍMITE GLOBAL
    // -------------------------------------------------

const rateLimit = await checkDevicePairingRateLimit(
  "device-pairing-confirm:global",
  "confirmation"
);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Demasiados intentos. Inténtalo más tarde.",
        },
        {
          status: 429,
          headers: {
            ...RESPONSE_HEADERS,
            "Retry-After": String(
              rateLimit.retryAfterSeconds
            ),
          },
        }
      );
    }

    // -------------------------------------------------
    // SEGURIDAD 4: VALIDAR SOLICITUD
    // -------------------------------------------------

    const solicitud = await leerSolicitudSegura(request);

    if (!solicitud) {
      return invalidResponse();
    }

    const {
      challengeId,
      challenge,
      signature,
    } = solicitud;

    // -------------------------------------------------
    // SEGURIDAD 5: PERMITIR SOLO EL DESAFÍO AUTORIZADO
    // -------------------------------------------------

    if (
      challengeId.toLowerCase() !==
      allowedTestChallengeId.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "Confirmación no autorizada para esta prueba.",
        },
        {
          status: 403,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    // -------------------------------------------------
    // SEGURIDAD 6: LÍMITE POR DESAFÍO
    // -------------------------------------------------

const challengeRateLimit =
  await checkDevicePairingRateLimit(
    `device-pairing-confirm:challenge:${challengeId.toLowerCase()}`,
    "confirmation"
  );

    if (!challengeRateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos de confirmación. Inténtalo más tarde.",
        },
        {
          status: 429,
          headers: {
            ...RESPONSE_HEADERS,
            "Retry-After": String(
              challengeRateLimit.retryAfterSeconds
            ),
          },
        }
      );
    }

    // -------------------------------------------------
    // 7. CALCULAR HASH DEL DESAFÍO
    // -------------------------------------------------

    const challengeHash = createHash("sha256")
      .update(challenge, "utf8")
      .digest("hex");

    // -------------------------------------------------
    // 8. CONSULTAR DESAFÍO EN SUPABASE DEV
    // -------------------------------------------------

    const {
      data: storedChallenge,
      error,
    } = await supabaseAdmin
      .from("pos_device_pairing_challenges")
      .select(
        "id, challenge_hash, public_key, expires_at, used_at"
      )
      .eq("id", challengeId)
      .maybeSingle();

    if (error) {
      console.error(
        "Error al consultar desafío de vinculación:",
        error.code
      );

      return NextResponse.json(
        {
          error:
            "No fue posible verificar la confirmación.",
        },
        {
          status: 503,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    // -------------------------------------------------
    // 9. VALIDAR EXISTENCIA Y VIGENCIA
    // -------------------------------------------------

    if (
      !storedChallenge ||
      storedChallenge.used_at !== null ||
      !Number.isFinite(
        Date.parse(storedChallenge.expires_at)
      ) ||
      Date.parse(storedChallenge.expires_at) <=
        Date.now() ||
      storedChallenge.challenge_hash !== challengeHash
    ) {
      return invalidResponse();
    }

    // -------------------------------------------------
    // 10. VALIDAR CLAVE PÚBLICA
    // -------------------------------------------------

    let publicKey: unknown;

    try {
      publicKey = JSON.parse(storedChallenge.public_key);
    } catch {
      return invalidResponse();
    }

    if (!isValidDevicePublicKey(publicKey)) {
      return invalidResponse();
    }

    // -------------------------------------------------
    // 11. VERIFICAR FIRMA CRIPTOGRÁFICA
    // -------------------------------------------------

    if (
      !verifyDevicePairingSignature(
        publicKey as JsonWebKey,
        challenge,
        signature
      )
    ) {
      return invalidResponse();
    }

    // -------------------------------------------------
    // 12. CONFIRMAR VINCULACIÓN EN SUPABASE DEV
    // -------------------------------------------------

    const {
      data: deviceId,
      error: confirmError,
    } = await supabaseAdmin.rpc(
      "confirm_pos_device_pairing",
      {
        p_challenge_id: challengeId,
        p_challenge_hash: challengeHash,
      }
    );

    if (confirmError) {
      console.error(
        "Error al confirmar dispositivo:",
        confirmError.code
      );

      return NextResponse.json(
        {
          error:
            "No fue posible confirmar el dispositivo.",
        },
        {
          status: 503,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    if (
      typeof deviceId !== "string" ||
      !UUID_REGEX.test(deviceId)
    ) {
      return invalidResponse();
    }

    // -------------------------------------------------
    // 13. RESPUESTA EXITOSA
    // -------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        deviceId,
      },
      {
        status: 200,
        headers: RESPONSE_HEADERS,
      }
    );
  } catch (error) {
    console.error(
      "Error en confirmación de dispositivo:",
      error instanceof Error
        ? error.name
        : "Error desconocido"
    );

    return NextResponse.json(
      {
        error:
          "No fue posible procesar la confirmación.",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      }
    );
  }
}
