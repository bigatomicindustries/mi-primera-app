import {
  isDevicePairingEnabled,
  isDeviceAuthEnabled,
} from "@/lib/deviceEnvironment";
import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  isValidDevicePublicKey,
  verifyDevicePairingSignature,
} from "@/lib/devicePairingCrypto";

import {
  checkDeviceAuthGlobalRateLimit,
  checkDeviceAuthRateLimit,
} from "@/lib/deviceAuthRateLimit";

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

function responseError(status: number) {
  return NextResponse.json(
    {
      error:
        status === 503
          ? "Recuperación temporalmente no disponible."
          : status === 429
            ? "Demasiados intentos de recuperación."
            : "No fue posible verificar la recuperación.",
    },
    { status, headers: HEADERS }
  );
}

async function readBody(request: Request) {
  const contentLength =
    request.headers.get("content-length");

  if (contentLength !== null) {
    const length = Number(contentLength);

    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > 2048
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

      if (bytes > 2048) {
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
      typeof data.authChallengeId !== "string" ||
      !UUID.test(data.authChallengeId) ||
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
      authChallengeId:
        data.authChallengeId.toLowerCase(),
      challenge: data.challenge,
      signature: data.signature,
      publicKeySha256: data.publicKeySha256,
    };
  } catch {
    return null;
  }
}

function parseKey(value: unknown) {
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

function equalHash(a: string, b: string): boolean {
  if (!HEX.test(a) || !HEX.test(b)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(a, "hex"),
    Buffer.from(b, "hex")
  );
}

export async function POST(request: Request) {
  if (!enabled()) {
    return responseError(503);
  }

  const globalLimit =
    await checkDeviceAuthGlobalRateLimit();

  if (!globalLimit.allowed) {
    return responseError(429);
  }

  const input = await readBody(request);

  if (!input) {
    return responseError(400);
  }

  try {
    // 1. Recuperar el desafío de vinculación original.
    const { data: pairing, error: pairingError } =
      await supabaseAdmin
        .from("pos_device_pairing_challenges")
        .select("pairing_token_id, public_key")
        .eq("id", input.pairingChallengeId)
        .maybeSingle();

    if (pairingError) return responseError(503);
    if (!pairing) return responseError(400);

    // 2. Resolver el dispositivo registrado.
    const { data: token, error: tokenError } =
      await supabaseAdmin
        .from("pos_device_pairing_tokens")
        .select("device_id, business_id")
        .eq("id", pairing.pairing_token_id)
        .maybeSingle();

    if (tokenError) return responseError(503);
    if (!token) return responseError(400);

    // 3. Consultar el desafío nuevo.
    const { data: auth, error: authError } =
      await supabaseAdmin
        .from("pos_device_auth_challenges")
        .select(
          "device_id, challenge_hash, expires_at, used_at"
        )
        .eq("id", input.authChallengeId)
        .maybeSingle();

    if (authError) return responseError(503);
    if (!auth) return responseError(400);

    if (
      auth.device_id !== token.device_id ||
      auth.used_at !== null ||
      !Number.isFinite(
        Date.parse(auth.expires_at)
      ) ||
      Date.parse(auth.expires_at) <= Date.now()
    ) {
      return responseError(400);
    }

    const rateLimit = await checkDeviceAuthRateLimit(
      token.device_id,
      "verification"
    );

    if (!rateLimit.allowed) {
      return responseError(429);
    }

    const receivedHash = createHash("sha256")
      .update(input.challenge, "utf8")
      .digest("hex");

    if (
      !equalHash(
        receivedHash,
        auth.challenge_hash
      )
    ) {
      return responseError(400);
    }

    // 4. Consultar la identidad autorizada.
    const { data: device, error: deviceError } =
      await supabaseAdmin
        .from("pos_devices")
        .select(
          "id, business_id, branch_id, status, linked_at, revoked_at, public_key"
        )
        .eq("id", token.device_id)
        .eq("business_id", token.business_id)
        .maybeSingle();

    if (deviceError) return responseError(503);

    if (
      !device ||
      device.status !== "active" ||
      device.revoked_at !== null ||
      !device.linked_at ||
      !device.branch_id
    ) {
      return responseError(400);
    }

    // 5. Exigir exactamente la clave original registrada.
    const originalKey = parseKey(
      pairing.public_key
    );

    const registeredKey = parseKey(
      device.public_key
    );

    if (!originalKey || !registeredKey) {
      return responseError(400);
    }

    if (
      !equalHash(
        fingerprint(originalKey),
        fingerprint(registeredKey)
      ) ||
      !equalHash(
        fingerprint(registeredKey),
        input.publicKeySha256
      )
    ) {
      return responseError(400);
    }

    // 6. Verificar la posesión de la clave privada.
    if (
      !verifyDevicePairingSignature(
        registeredKey,
        input.challenge,
        input.signature
      )
    ) {
      return responseError(400);
    }

    // 7. Consumir atómicamente el desafío.
    const { data: verifiedDeviceId, error: consumeError } =
      await supabaseAdmin.rpc(
        "consume_pos_device_auth_challenge",
        {
          p_challenge_id: input.authChallengeId,
          p_challenge_hash: receivedHash,
        }
      );

    if (consumeError) {
      return responseError(400);
    }

    if (
      verifiedDeviceId !== device.id ||
      verifiedDeviceId !== auth.device_id
    ) {
      return responseError(400);
    }

    // 8. Revalidar revocación después del consumo.
    const { data: finalDevice, error: finalError } =
      await supabaseAdmin
        .from("pos_devices")
        .select(
          "id, business_id, branch_id, status, linked_at, revoked_at, public_key"
        )
        .eq("id", verifiedDeviceId)
        .eq("business_id", token.business_id)
        .maybeSingle();

    if (finalError) return responseError(503);

    const finalKey = parseKey(
      finalDevice?.public_key
    );

    if (
      !finalDevice ||
      finalDevice.status !== "active" ||
      finalDevice.revoked_at !== null ||
      !finalDevice.linked_at ||
      !finalDevice.branch_id ||
      !finalKey ||
      !equalHash(
        fingerprint(finalKey),
        input.publicKeySha256
      )
    ) {
      return responseError(400);
    }

    // 9. Solo ahora devolver la identidad.
    return NextResponse.json(
      {
        success: true,
        deviceId: finalDevice.id,
        businessId: finalDevice.business_id,
        branchId: finalDevice.branch_id,
        linkedAt: finalDevice.linked_at,
      },
      {
        status: 200,
        headers: HEADERS,
      }
    );
  } catch {
    return responseError(503);
  }
}
