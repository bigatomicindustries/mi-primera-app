import { getDeviceEnvironment, isDeviceAuthEnabled } from "@/lib/deviceEnvironment";
import "server-only";

import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const DEV_PREFIX =
  "mybusiness:dev:mobile-sync-session:v1:";

const PROD_PREFIX =
  "mybusiness:prod:mobile-sync-session:v1:";

function getSessionPrefix(): string | null {
  const environment = getDeviceEnvironment();

  if (!isDeviceAuthEnabled()) {
    return null;
  }

  if (environment === "development") {
    return DEV_PREFIX;
  }

  if (environment === "production") {
    return PROD_PREFIX;
  }

  return null;
}
const TTL_SECONDS = 900;

const TOKEN_REGEX = /^[0-9a-f]{64}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;



export async function createMobileSyncSession(
  deviceId: string
): Promise<{
  syncToken: string;
  expiresInSeconds: number;
}> {
  const prefix = getSessionPrefix();

  if (!prefix || !UUID_REGEX.test(deviceId)) {
    throw new Error("Sesión DEV no autorizada.");
  }

  const syncToken = randomBytes(32).toString("hex");

  const result = await redis.set(
    prefix + syncToken,
    deviceId.toLowerCase(),
    {
      ex: TTL_SECONDS,
      nx: true,
    }
  );

  if (result !== "OK") {
    throw new Error(
      "No fue posible crear la sesión de sincronización."
    );
  }

  return {
    syncToken,
    expiresInSeconds: TTL_SECONDS,
  };
}

export async function getMobileSyncDeviceId(
  syncToken: string
): Promise<string | null> {
  const prefix = getSessionPrefix();

  if (!prefix || !TOKEN_REGEX.test(syncToken)) {
    return null;
  }

  const deviceId = await redis.get<string>(
    prefix + syncToken
  );

  if (
    typeof deviceId !== "string" ||
    !UUID_REGEX.test(deviceId)
  ) {
    return null;
  }

  return deviceId.toLowerCase();
}
