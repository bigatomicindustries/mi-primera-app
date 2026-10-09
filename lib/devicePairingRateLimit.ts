import "server-only";

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

const pairingRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 m"),
  prefix: "ratelimit:device-pairing:v1",
  analytics: false,
});

export async function checkDevicePairingRateLimit(
  identifier: string
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  if (!identifier || identifier.length > 256) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }

  try {
    const { success, reset } =
      await pairingRateLimit.limit(identifier);

    return {
      allowed: success,
      retryAfterSeconds: success
        ? 0
        : Math.max(
            1,
            Math.ceil((reset - Date.now()) / 1000)
          ),
    };
  } catch (error) {
    console.error(
      "No se pudo verificar el límite de vinculación:",
      error
    );

    // Ante un fallo de Redis, no permitir vinculación.
    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }
}