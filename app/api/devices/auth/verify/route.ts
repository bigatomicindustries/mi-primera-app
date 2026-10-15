import { isDeviceAuthEnabled } from "@/lib/deviceEnvironment";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  checkDeviceAuthGlobalRateLimit,
  checkDeviceAuthRateLimit,
} from "@/lib/deviceAuthRateLimit";
import {
  isValidDevicePublicKey,
  verifyDevicePairingSignature,
} from "@/lib/devicePairingCrypto";

import {
  createMobileSyncSession,
} from "@/lib/mobileSyncSession";

export const runtime = "nodejs";

function verificacionHabilitada(): boolean {
  return isDeviceAuthEnabled();
}


const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHALLENGE_REGEX = /^[0-9a-f]{64}$/;
const SIGNATURE_REGEX = /^[A-Za-z0-9_-]{86}$/;

const MAX_REQUEST_BYTES = 1024;

async function leerSolicitudSegura(request: Request) {
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

    if (!body || typeof body !== "object" || Array.isArray(body)) {
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
      challengeId: data.challengeId.toLowerCase(),
      challenge: data.challenge,
      signature: data.signature,
    };
  } catch {
    return null;
  }
}


export async function POST(request: Request) {
  if (!verificacionHabilitada()) {
    return NextResponse.json(
      {
        error: "La verificación de dispositivos aún no está habilitada.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const globalRateLimit = await checkDeviceAuthGlobalRateLimit();

  if (!globalRateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes de autenticación." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(globalRateLimit.retryAfterSeconds),
        },
      }
    );
  }

  const solicitud = await leerSolicitudSegura(request);

  if (!solicitud) {
    return NextResponse.json(
      { error: "Solicitud de autenticación inválida." },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const { data: storedChallenge, error: queryError } =
    await consultarDesafio(solicitud.challengeId);

  if (queryError) {
    console.error(
      "Error al consultar desafío de autenticación:",
      queryError.code
    );

    return NextResponse.json(
      { error: "No fue posible verificar el desafío." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  if (!storedChallenge) {
    return NextResponse.json(
      { error: "Desafío inválido o vencido." },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const deviceRateLimit = await checkDeviceAuthRateLimit(
    storedChallenge.device_id,
    "verification"
  );

  if (!deviceRateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos de autenticación." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(deviceRateLimit.retryAfterSeconds),
        },
      }
    );
  }

  // La relación puede llegar como objeto o arreglo,
  // dependiendo de la inferencia de PostgREST.
  const relation = storedChallenge.pos_devices;

  const device = Array.isArray(relation)
    ? relation.length === 1
      ? relation[0]
      : null
    : relation;

  if (!device || Array.isArray(device)) {
    return respuestaInvalida();
  }

  // Comprobar pertenencia y vigencia del desafío.
  if (
    device.id !== storedChallenge.device_id ||
    !desafioValido(storedChallenge, solicitud.challenge)
  ) {
    return respuestaInvalida();
  }

  // La clave pública procede exclusivamente de Supabase.
  const publicKey = obtenerClavePublica(device);

  if (!publicKey) {
    return respuestaInvalida();
  }

  // Verificar la firma ANTES de consumir el desafío.
  if (
    !firmaValida(
      publicKey,
      solicitud.challenge,
      solicitud.signature
    )
  ) {
    return respuestaInvalida();
  }

  // La RPC vuelve a comprobar vigencia, revocación,
  // pertenencia y uso único dentro de la base de datos.
  const challengeHash = createHash("sha256")
    .update(solicitud.challenge, "utf8")
    .digest("hex");

  try {
    const { data: deviceId, error: consumeError } =
      await supabaseAdmin.rpc(
        "consume_pos_device_auth_challenge",
        {
          p_challenge_id: solicitud.challengeId,
          p_challenge_hash: challengeHash,
        }
      );

    if (consumeError) {
      console.error(
        "Error al consumir desafío:",
        consumeError.code
      );
      return respuestaInvalida();
    }

    if (
      typeof deviceId !== "string" ||
      deviceId.toLowerCase() !==
        storedChallenge.device_id.toLowerCase()
    ) {
      return respuestaInvalida();
    }

    const syncSession =
      await createMobileSyncSession(deviceId);

    return NextResponse.json(
      {
        success: true,
        deviceId,
        syncToken: syncSession.syncToken,
        expiresInSeconds: syncSession.expiresInSeconds,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No fue posible verificar el dispositivo." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

async function consultarDesafio(challengeId: string) {
  return supabaseAdmin
    .from("pos_device_auth_challenges")
    .select(
      "id, device_id, challenge_hash, expires_at, used_at, pos_devices!inner(id, public_key, status, linked_at, revoked_at)"
    )
    .eq("id", challengeId)
    .maybeSingle();
}

function desafioValido(
  stored: {
    challenge_hash: string;
    expires_at: string;
    used_at: string | null;
  },
  challenge: string
): boolean {
  if (
    stored.used_at !== null ||
    !Number.isFinite(Date.parse(stored.expires_at)) ||
    Date.parse(stored.expires_at) <= Date.now() ||
    !/^[0-9a-f]{64}$/.test(stored.challenge_hash)
  ) {
    return false;
  }

  const receivedHash = createHash("sha256")
    .update(challenge, "utf8")
    .digest();

  const storedHash = Buffer.from(
    stored.challenge_hash,
    "hex"
  );

  return (
    storedHash.length === receivedHash.length &&
    timingSafeEqual(storedHash, receivedHash)
  );
}

function obtenerClavePublica(device: {
  public_key: string | null;
  status: string;
  linked_at: string | null;
  revoked_at: string | null;
}) {
  if (
    device.status !== "active" ||
    device.linked_at === null ||
    device.revoked_at !== null ||
    typeof device.public_key !== "string"
  ) {
    return null;
  }

  try {
    const publicKey: unknown = JSON.parse(device.public_key);

    return isValidDevicePublicKey(publicKey)
      ? publicKey
      : null;
  } catch {
    return null;
  }
}

function firmaValida(
  publicKey: NonNullable<ReturnType<typeof obtenerClavePublica>>,
  challenge: string,
  signature: string
): boolean {
  return verifyDevicePairingSignature(
    publicKey,
    challenge,
    signature
  );
}

function respuestaInvalida() {
  return NextResponse.json(
    { error: "Desafío o firma inválidos." },
    {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
