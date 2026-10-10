
import "server-only";

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

type PairingRateLimitPolicy =
  | "default"
  | "token"
  | "challenge"
  | "confirmation";

const policies: Record<
  PairingRateLimitPolicy,
  { requests: number; window: "10 m" }
> = {
  default: { requests: 10, window: "10 m" },
  token: { requests: 10, window: "10 m" },
  challenge: { requests: 10, window: "10 m" },
  confirmation: { requests: 10, window: "10 m" },
};

const limiters = Object.fromEntries(
  Object.entries(policies).map(
    ([policy, config]) => [
      policy,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          config.requests,
          config.window
        ),
        prefix: `ratelimit:device-pairing:v1:${policy}`,
        analytics: false,
      }),
    ]
  )
) as Record<PairingRateLimitPolicy, Ratelimit>;

export async function checkDevicePairingRateLimit(
  identifier: string,
  policy: PairingRateLimitPolicy = "default"
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  if (
    !identifier ||
    identifier.length > 256 ||
    !Object.prototype.hasOwnProperty.call(
      limiters,
      policy
    )
  ) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }

  try {
    const { success, reset } =
      await limiters[policy].limit(identifier);

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
      error instanceof Error
        ? error.name
        : "Error desconocido"
    );

    // Ante un fallo de Redis, bloquear la solicitud.
    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }
}
