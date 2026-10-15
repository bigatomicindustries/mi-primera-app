import "server-only";

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

type DeviceAuthPolicy = "challenge" | "verification";

const policies: Record<
  DeviceAuthPolicy,
  { requests: number; window: "10 m" }
> = {
  challenge: { requests: 10, window: "10 m" },
  verification: { requests: 10, window: "10 m" },
};

const limiters = Object.fromEntries(
  Object.entries(policies).map(([policy, config]) => [
    policy,
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        config.requests,
        config.window
      ),
      prefix: `ratelimit:device-auth:v1:${policy}`,
      analytics: false,
    }),
  ])
) as Record<DeviceAuthPolicy, Ratelimit>;

const globalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, "10 m"),
  prefix: "ratelimit:device-auth:v1:global",
  analytics: false,
});

export async function checkDeviceAuthGlobalRateLimit(): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  try {
    const { success, reset } = await globalLimiter.limit(
      "all-devices"
    );

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
      "Error al verificar límite global de autenticación:",
      error instanceof Error
        ? error.name
        : "Error desconocido"
    );

    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }
}

export async function checkDeviceAuthRateLimit(
  deviceId: string,
  policy: DeviceAuthPolicy
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deviceId
    ) ||
    !Object.prototype.hasOwnProperty.call(limiters, policy)
  ) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }

  try {
    const { success, reset } = await limiters[policy].limit(
      deviceId.toLowerCase()
    );

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
      "Error al verificar límite de autenticación:",
      error instanceof Error
        ? error.name
        : "Error desconocido"
    );

    return {
      allowed: false,
      retryAfterSeconds: 60,
    };
  }
}
