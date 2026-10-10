
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidDevicePublicKey } from "@/lib/devicePairingCrypto";
import { checkDevicePairingRateLimit } from "@/lib/devicePairingRateLimit";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TOKEN_REGEX = /^[0-9a-f]{64}$/;

const MAX_REQUEST_BYTES = 4096;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

// =====================================================
// 1. VALIDAR LOS DATOS RECIBIDOS
// =====================================================

function validarSolicitud(body: unknown) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return null;
  }

  const data = body as Record<string, unknown>;

  if (
    typeof data.token !== "string" ||
    !TOKEN_REGEX.test(data.token) ||
    !isValidDevicePublicKey(data.publicKey)
  ) {
    return null;
  }

  return {
    token: data.token,
    publicKey: data.publicKey,
  };
}

// =====================================================
// 2. LEER LA SOLICITUD DE FORMA SEGURA
// =====================================================

async function leerSolicitudSegura(request: Request) {
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

    return validarSolicitud(body);
  } catch {
    return null;
  }
}

// =====================================================
// 3. VERIFICAR ENTORNO DEV
// =====================================================

function esEntornoDevAutorizado(): boolean {
  if (process.env.NODE_ENV !== "development") {
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
// 4. ENDPOINT POST
// =====================================================

export async function POST(request: Request) {
  // ---------------------------------------------------
  // SEGURIDAD 1: SOLO SUPABASE DEV
  // ---------------------------------------------------

  if (!esEntornoDevAutorizado()) {
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
  // SEGURIDAD 2: FUNCIÓN DESHABILITADA POR DEFECTO
  // ---------------------------------------------------

  // Esta validación se ejecuta antes de consultar
  // Redis, leer solicitudes o acceder a Supabase.

  if (
    process.env.DEVICE_PAIRING_TEST_ENABLED !== "true"
  ) {
    return NextResponse.json(
      {
        error:
          "La generación de desafíos aún no está habilitada.",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      }
    );
  }

  try {
    // -------------------------------------------------
    // SEGURIDAD 3: LÍMITE GLOBAL DE SOLICITUDES
    // -------------------------------------------------

const rateLimit = await checkDevicePairingRateLimit(
  "device-pairing-challenge:global",
  "global"
);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Demasiadas solicitudes. Inténtalo más tarde.",
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
      return NextResponse.json(
        {
          error: "Solicitud de vinculación inválida.",
        },
        {
          status: 400,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    // -------------------------------------------------
    // SEGURIDAD 5: CALCULAR HASH DEL CÓDIGO
    // -------------------------------------------------

    // Nunca almacenamos el código temporal original
    // como identificador del límite en Redis.

    const tokenHash = createHash("sha256")
      .update(solicitud.token, "utf8")
      .digest("hex");

    // -------------------------------------------------
    // SEGURIDAD 6: LÍMITE POR CÓDIGO DE VINCULACIÓN
    // -------------------------------------------------

    const tokenRateLimit =
      await checkDevicePairingRateLimit(
        `device-pairing-challenge:token:${tokenHash}`,
        "challenge"
      );

    if (!tokenRateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos con este código de vinculación.",
        },
        {
          status: 429,
          headers: {
            ...RESPONSE_HEADERS,
            "Retry-After": String(
              tokenRateLimit.retryAfterSeconds
            ),
          },
        }
      );
    }

    // -------------------------------------------------
    // 7. GENERAR DESAFÍO CRIPTOGRÁFICO
    // -------------------------------------------------

    // Solo generamos el desafío después de superar
    // las validaciones y los límites de solicitudes.

    const challenge = randomBytes(32).toString("hex");

    const challengeHash = createHash("sha256")
      .update(challenge, "utf8")
      .digest("hex");

    // -------------------------------------------------
    // 8. REGISTRAR DESAFÍO EN SUPABASE DEV
    // -------------------------------------------------

    const {
      data: challengeId,
      error,
    } = await supabaseAdmin.rpc(
      "request_pos_pairing_challenge",
      {
        p_token_hash: tokenHash,
        p_challenge_hash: challengeHash,
        p_public_key: JSON.stringify(
          solicitud.publicKey
        ),
      }
    );

    if (error) {
      console.error(
        "Error al registrar desafío:",
        error.code
      );

      return NextResponse.json(
        {
          error:
            "No se pudo procesar la solicitud de vinculación.",
        },
        {
          status: 503,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    // -------------------------------------------------
    // 9. VALIDAR RESULTADO DE SUPABASE
    // -------------------------------------------------

    if (
      typeof challengeId !== "string" ||
      !UUID_REGEX.test(challengeId)
    ) {
      return NextResponse.json(
        {
          error:
            "Código de vinculación inválido o vencido.",
        },
        {
          status: 400,
          headers: RESPONSE_HEADERS,
        }
      );
    }

    // -------------------------------------------------
    // 10. DEVOLVER DESAFÍO AL DISPOSITIVO
    // -------------------------------------------------

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
  } catch (error) {
    console.error(
      "Error en solicitud de desafío:",
      error instanceof Error
        ? error.name
        : "Error desconocido"
    );

    return NextResponse.json(
      {
        error:
          "No fue posible procesar la solicitud de vinculación.",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      }
    );
  }
}
