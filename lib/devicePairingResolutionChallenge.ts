import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const PREFIX = "mybusiness:dev:pairing-resolution:v1:";
const TTL_SECONDS = 120;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEX_REGEX = /^[0-9a-f]{64}$/;

type StoredChallenge = {
  pairingChallengeId: string;
  challengeHash: string;
};

function hash(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

export async function createResolutionChallenge(
  pairingChallengeId: string
): Promise<{
  resolutionId: string;
  challenge: string;
  expiresInSeconds: number;
}> {
  if (!UUID_REGEX.test(pairingChallengeId)) {
    throw new Error("Identificador de vinculación inválido.");
  }

  const resolutionId = randomBytes(32).toString("hex");
  const challenge = randomBytes(32).toString("hex");

  const record: StoredChallenge = {
    pairingChallengeId: pairingChallengeId.toLowerCase(),
    challengeHash: hash(challenge),
  };

  const result = await redis.set(
    PREFIX + resolutionId,
    JSON.stringify(record),
    {
      ex: TTL_SECONDS,
      nx: true,
    }
  );

  if (result !== "OK") {
    throw new Error(
      "No fue posible guardar el desafío de recuperación."
    );
  }

  return {
    resolutionId,
    challenge,
    expiresInSeconds: TTL_SECONDS,
  };
}

export async function consumeResolutionChallenge(
  resolutionId: string,
  pairingChallengeId: string,
  challenge: string
): Promise<boolean> {
  if (
    !HEX_REGEX.test(resolutionId) ||
    !UUID_REGEX.test(pairingChallengeId) ||
    !HEX_REGEX.test(challenge)
  ) {
    return false;
  }

  // GETDEL retira la entrada de Redis de forma atómica.
  // Una segunda solicitud no puede consumirla otra vez.
  const raw = await redis.getdel<unknown>(
    PREFIX + resolutionId
  );

  if (raw === null || raw === undefined) {
    return false;
  }

  // Upstash puede devolver el JSON ya deserializado.
  let record: unknown = raw;

  if (typeof raw === "string") {
    try {
      record = JSON.parse(raw);
    } catch {
      return false;
    }
  }

  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    return false;
  }

  const stored = record as Partial<StoredChallenge>;

  if (
    stored.pairingChallengeId !==
      pairingChallengeId.toLowerCase() ||
    typeof stored.challengeHash !== "string" ||
    !HEX_REGEX.test(stored.challengeHash)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(stored.challengeHash, "hex"),
    Buffer.from(hash(challenge), "hex")
  );
}
