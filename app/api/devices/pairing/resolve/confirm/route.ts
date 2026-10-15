import {
  isDevicePairingEnabled,
  isDeviceAuthEnabled,
} from "@/lib/deviceEnvironment";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isValidDevicePublicKey,
  verifyDevicePairingSignature,
} from "@/lib/devicePairingCrypto";
import {
  consumeResolutionChallenge,
} from "@/lib/devicePairingResolutionChallenge";
import {
  checkDevicePairingRateLimit,
} from "@/lib/devicePairingRateLimit";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEX = /^[0-9a-f]{64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

const HEADERS = {
  "Cache-Control": "no-store",
};

function enabled(): boolean {
  return (
    isDevicePairingEnabled() &&
    isDeviceAuthEnabled()
  );
}

function errorResponse(status: number) {
  return NextResponse.json(
    {
      error:
        status === 503
          ? "Verificación temporalmente no disponible."
          : status === 429
            ? "Demasiados intentos."
            : "No fue posible verificar la vinculación.",
    },
    { status, headers: HEADERS }
  );
}

async function readBody(request: Request) {
  const declared = request.headers.get("content-length");

  if (declared !== null) {
    const size = Number(declared);

    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 2048
    ) {
      return null;
    }
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > 2048) {
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
      !UUID.test(data.pairingChallengeId) ||
      typeof data.resolutionId !== "string" ||
      !HEX.test(data.resolutionId) ||
      typeof data.challenge !== "string" ||
      !HEX.test(data.challenge) ||
      typeof data.signature !== "string" ||
      !SIGNATURE.test(data.signature) ||
      typeof data.publicKeySha256 !== "string" ||
      !HEX.test(data.publicKeySha256)
    ) {
      return null;
    }

    return {
      pairingChallengeId:
        data.pairingChallengeId.toLowerCase(),
      resolutionId: data.resolutionId,
      challenge: data.challenge,
      signature: data.signature,
      publicKeySha256: data.publicKeySha256,
    };
  } catch {
    return null;
  }
}

function publicKeyFromString(value: unknown) {
  if (typeof value !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(value);

    return isValidDevicePublicKey(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function keyFingerprint(key: {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kty: key.kty,
        crv: key.crv,
        x: key.x,
        y: key.y,
      }),
      "utf8"
    )
    .digest("hex");
}

export async function POST(request: Request) {
  if (!enabled()) {
    return errorResponse(503);
  }

  const input = await readBody(request);

  if (!input) {
    return errorResponse(400);
  }

  const limit = await checkDevicePairingRateLimit(
    `pairing-resolution-confirm:${input.pairingChallengeId}`,
    "confirmation"
  );

  if (!limit.allowed) {
    return errorResponse(429);
  }

  try {
    // Obtener exclusivamente la clave del desafío original.
    const { data: pairing, error: pairingError } =
      await supabaseAdmin
        .from("pos_device_pairing_challenges")
        .select("public_key")
        .eq("id", input.pairingChallengeId)
        .maybeSingle();

    if (pairingError) return errorResponse(503);
    if (!pairing) return errorResponse(400);

    const publicKey = publicKeyFromString(
      pairing.public_key
    );

    if (!publicKey) {
      return errorResponse(400);
    }

    const expected = Buffer.from(
      input.publicKeySha256,
      "hex"
    );

    const actual = Buffer.from(
      keyFingerprint(publicKey),
      "hex"
    );

    if (!timingSafeEqual(expected, actual)) {
      return errorResponse(400);
    }

    // Demostrar posesión de la clave privada original.
    if (
      !verifyDevicePairingSignature(
        publicKey,
        input.challenge,
        input.signature
      )
    ) {
      return errorResponse(400);
    }

    // Consumir el desafío temporal una sola vez.
    const consumed = await consumeResolutionChallenge(
      input.resolutionId,
      input.pairingChallengeId,
      input.challenge
    );

    if (!consumed) {
      return errorResponse(400);
    }

    // Consultar el estado después de verificar la firma
    // y consumir el desafío temporal.
    const { data: state, error: stateError } =
      await supabaseAdmin.rpc(
        "resolve_pos_device_pairing_state",
        {
          p_challenge_id: input.pairingChallengeId,
        }
      );

    if (stateError) return errorResponse(503);

    if (state === "not_linked") {
      // Finalización nueva, protegida por bloqueos SQL.
      const { data: finalized, error: finalizeError } =
        await supabaseAdmin.rpc(
          "finalize_pos_device_pairing_resolution",
          {
            p_challenge_id: input.pairingChallengeId,
          }
        );

      if (finalizeError) return errorResponse(503);
      if (finalized !== true) return errorResponse(400);
    } else if (state === "blocked") {
      // Una respuesta anterior pudo haberse perdido.
      // La RPC comprueba bajo bloqueos que la
      // finalización existe y el dispositivo sigue
      // sin vincularse ni estar revocado.
      const { data: verified, error: verifyError } =
        await supabaseAdmin.rpc(
          "verify_pos_device_pairing_resolution",
          {
            p_challenge_id: input.pairingChallengeId,
          }
        );

      if (verifyError) {
        return errorResponse(503);
      }

      if (verified !== true) {
        return errorResponse(400);
      }
    } else {
      // No liberar intentos todavía pendientes
      // ni dispositivos ya vinculados.
      return errorResponse(400);
    }

    return NextResponse.json(
      {
        verified: true,
        state: "not_linked",
        finalized: true,
        canClearPending: true,
      },
      {
        status: 200,
        headers: HEADERS,
      }
    );
  } catch {
    return errorResponse(503);
  }
}
