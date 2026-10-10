import { createHash, type JsonWebKey } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyDevicePairingSignature } from "@/lib/devicePairingCrypto";

import { checkDevicePairingRateLimit } from "@/lib/devicePairingRateLimit";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHALLENGE_REGEX = /^[0-9a-f]{64}$/;

function invalidResponse() {
  return NextResponse.json(
    { error: "Confirmación inválida o vencida." },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  try {
        const rateLimit = await checkDevicePairingRateLimit(
      "device-pairing-confirm:global"
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Demasiados intentos. Inténtalo más tarde.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }
    const contentLength = Number(
      request.headers.get("content-length") ?? 0
    );

    if (
      !Number.isFinite(contentLength) ||
      contentLength > 8192
    ) {
      return invalidResponse();
    }

    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, "utf8") > 8192) {
      return invalidResponse();
    }

    const body: unknown = JSON.parse(rawBody);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return invalidResponse();
    }

    const data = body as Record<string, unknown>;

    const challengeId = data.challengeId;
    const challenge = data.challenge;
    const signature = data.signature;

    if (
      typeof challengeId !== "string" ||
      !UUID_REGEX.test(challengeId) ||
      typeof challenge !== "string" ||
      !CHALLENGE_REGEX.test(challenge) ||
      typeof signature !== "string" ||
      !/^[A-Za-z0-9_-]{86}$/.test(signature)
    ) {
      return invalidResponse();
    }

    const challengeHash = createHash("sha256")
      .update(challenge, "utf8")
      .digest("hex");

const challengeRateLimit = await checkDevicePairingRateLimit(
  `device-pairing-confirm:challenge:${challengeId.toLowerCase()}`
);

if (!challengeRateLimit.allowed) {
  return NextResponse.json(
    {
      error: "Demasiados intentos de confirmación. Inténtalo más tarde.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(challengeRateLimit.retryAfterSeconds),
      },
    }
  );
}

    const { data: storedChallenge, error } =
      await supabaseAdmin
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
        { error: "No fue posible verificar la confirmación." },
        { status: 503 }
      );
    }

    if (
      !storedChallenge ||
      storedChallenge.used_at !== null ||
      Date.parse(storedChallenge.expires_at) <= Date.now() ||
      storedChallenge.challenge_hash !== challengeHash
    ) {
      return invalidResponse();
    }

    let publicKey: unknown;

    try {
      publicKey = JSON.parse(storedChallenge.public_key);
    } catch {
      return invalidResponse();
    }

if (
  !publicKey ||
  typeof publicKey !== "object" ||
  Array.isArray(publicKey) ||
  !verifyDevicePairingSignature(
    publicKey as JsonWebKey,
    challenge,
    signature
  )
) {
  return invalidResponse();
}

// Mantener deshabilitada la confirmación hasta completar
// las pruebas criptográficas y de concurrencia.
// La confirmación solo puede habilitarse explícitamente
// en desarrollo local y contra Supabase DEV.
const ENABLE_PAIRING_CONFIRMATION =
  process.env.NODE_ENV === "development" &&
  process.env.DEVICE_PAIRING_TEST_ENABLED === "true" &&
  (() => {
    try {
      return (
        new URL(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
        ).hostname === "pablbrladwjuczhazsms.supabase.co"
      );
    } catch {
      return false;
    }
  })();

if (!ENABLE_PAIRING_CONFIRMATION) {
  return NextResponse.json(
    {
      error: "La vinculación aún no está habilitada.",
    },
    { status: 503 }
  );
}

// Permitir únicamente el desafío autorizado para esta prueba.
// No habilita la confirmación general de dispositivos.
const allowedTestChallengeId =
  process.env.DEVICE_PAIRING_TEST_CHALLENGE_ID;

if (
  !allowedTestChallengeId ||
  !UUID_REGEX.test(allowedTestChallengeId) ||
  challengeId.toLowerCase() !==
    allowedTestChallengeId.toLowerCase()
) {
  return NextResponse.json(
    { error: "Confirmación no autorizada para esta prueba." },
    { status: 403 }
  );
}

const { data: deviceId, error: confirmError } =
  await supabaseAdmin.rpc("confirm_pos_device_pairing", {
    p_challenge_id: challengeId,
    p_challenge_hash: challengeHash,
  });

if (confirmError) {
  console.error(
    "Error al confirmar dispositivo:",
    confirmError.code
  );

  return NextResponse.json(
    { error: "No fue posible confirmar el dispositivo." },
    { status: 503 }
  );
}

if (!deviceId) {
  return invalidResponse();
}

return NextResponse.json({
  success: true,
  deviceId,
});
  } catch {
    return invalidResponse();
  }
}
