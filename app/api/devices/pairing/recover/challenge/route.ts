import {
  isDevicePairingEnabled,
  isDeviceAuthEnabled,
} from "@/lib/deviceEnvironment";
import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  isValidDevicePublicKey,
} from "@/lib/devicePairingCrypto";

import {
  checkDeviceAuthGlobalRateLimit,
  checkDeviceAuthRateLimit,
} from "@/lib/deviceAuthRateLimit";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HASH_REGEX = /^[0-9a-f]{64}$/;

const HEADERS = {
  "Cache-Control": "no-store",
};

function enabled(): boolean {
  return (
    isDevicePairingEnabled() &&
    isDeviceAuthEnabled()
  );
}

function invalid() {
  return NextResponse.json(
    { error: "No fue posible recuperar esta vinculación." },
    { status: 400, headers: HEADERS }
  );
}

function unavailable() {
  return NextResponse.json(
    { error: "Recuperación temporalmente no disponible." },
    { status: 503, headers: HEADERS }
  );
}

async function readBody(request: Request) {
  const declaredLength = request.headers.get("content-length");

  if (
    declaredLength !== null &&
    (!Number.isSafeInteger(Number(declaredLength)) ||
      Number(declaredLength) > 1024 ||
      Number(declaredLength) < 0)
  ) {
    return null;
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let size = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;

      if (size > 1024) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    const body: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks)
      )
    );

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
      typeof data.publicKeySha256 !== "string" ||
      !HASH_REGEX.test(data.publicKeySha256)
    ) {
      return null;
    }

    return {
      challengeId: data.challengeId.toLowerCase(),
      publicKeySha256: data.publicKeySha256,
    };
  } catch {
    return null;
  }
}

function readPublicKey(value: unknown) {
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

function fingerprint(key: {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}): string {
  const canonical = JSON.stringify({
    kty: key.kty,
    crv: key.crv,
    x: key.x,
    y: key.y,
  });

  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex");
}

export async function POST(request: Request) {
  if (!enabled()) return unavailable();

  const globalLimit =
    await checkDeviceAuthGlobalRateLimit();

  if (!globalLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes." },
      {
        status: 429,
        headers: {
          ...HEADERS,
          "Retry-After": String(
            globalLimit.retryAfterSeconds
          ),
        },
      }
    );
  }

  const input = await readBody(request);
  if (!input) return invalid();

  try {
    // 1. Localizar el desafío original.
    const { data: pairing, error: pairingError } =
      await supabaseAdmin
        .from("pos_device_pairing_challenges")
        .select("pairing_token_id, public_key")
        .eq("id", input.challengeId)
        .maybeSingle();

    if (pairingError) return unavailable();
    if (!pairing) return invalid();

    // 2. Identificar el dispositivo registrado.
    const { data: token, error: tokenError } =
      await supabaseAdmin
        .from("pos_device_pairing_tokens")
        .select("device_id, business_id")
        .eq("id", pairing.pairing_token_id)
        .maybeSingle();

    if (tokenError) return unavailable();
    if (!token) return invalid();

    const { data: device, error: deviceError } =
      await supabaseAdmin
        .from("pos_devices")
        .select(
          "id, business_id, status, linked_at, revoked_at, public_key"
        )
        .eq("id", token.device_id)
        .eq("business_id", token.business_id)
        .maybeSingle();

    if (deviceError) return unavailable();
    if (!device) return invalid();

    const rateLimit = await checkDeviceAuthRateLimit(
      device.id,
      "challenge"
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos de recuperación." },
        {
          status: 429,
          headers: {
            ...HEADERS,
            "Retry-After": String(
              rateLimit.retryAfterSeconds
            ),
          },
        }
      );
    }

    // 3. Exigir dispositivo activo y ya vinculado.
    if (
      device.status !== "active" ||
      !device.linked_at ||
      device.revoked_at !== null
    ) {
      return invalid();
    }

    // 4. Comparar la clave original con la registrada.
    const originalKey = readPublicKey(
      pairing.public_key
    );

    const registeredKey = readPublicKey(
      device.public_key
    );

    if (!originalKey || !registeredKey) {
      return invalid();
    }

    const originalFingerprint = fingerprint(originalKey);
    const registeredFingerprint = fingerprint(registeredKey);

    const expected = Buffer.from(
      input.publicKeySha256,
      "hex"
    );

    const original = Buffer.from(
      originalFingerprint,
      "hex"
    );

    const registered = Buffer.from(
      registeredFingerprint,
      "hex"
    );

    if (
      !timingSafeEqual(expected, original) ||
      !timingSafeEqual(original, registered)
    ) {
      return invalid();
    }

    // 5. Nuevo desafío de autenticación:
    // todavía NO se devuelve la identidad.
    const challenge = randomBytes(32).toString("hex");

    const challengeHash = createHash("sha256")
      .update(challenge, "utf8")
      .digest("hex");

    const { data: challengeId, error: createError } =
      await supabaseAdmin.rpc(
        "create_pos_device_auth_challenge",
        {
          p_device_id: device.id,
          p_challenge_hash: challengeHash,
        }
      );

    if (createError) return unavailable();

    if (
      typeof challengeId !== "string" ||
      !UUID_REGEX.test(challengeId)
    ) {
      return unavailable();
    }

    return NextResponse.json(
      {
        challengeId,
        challenge,
        expiresInSeconds: 120,
      },
      {
        status: 200,
        headers: HEADERS,
      }
    );
  } catch {
    return unavailable();
  }
}
