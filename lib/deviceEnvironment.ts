const DEV_SUPABASE_HOST =
  "pablbrladwjuczhazsms.supabase.co";

type DeviceEnvironment = "development" | "production";

function getSupabaseHost(): string | null {
  try {
    const url = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    );

    if (url.protocol !== "https:") {
      return null;
    }

    if (
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/"
    ) {
      return null;
    }

    return url.hostname;
  } catch {
    return null;
  }
}

export function getDeviceEnvironment():
  DeviceEnvironment | null {
  const host = getSupabaseHost();

  if (!host) return null;

  if (
    process.env.NODE_ENV === "development" &&
    host === DEV_SUPABASE_HOST
  ) {
    return "development";
  }

  const productionHost =
    process.env.DEVICE_PRODUCTION_SUPABASE_HOST;

  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEVICE_PRODUCTION_ENABLED === "true" &&
    productionHost &&
    productionHost.endsWith(".supabase.co") &&
    productionHost !== DEV_SUPABASE_HOST &&
    host === productionHost
  ) {
    return "production";
  }

  return null;
}

export function isDevicePairingEnabled(): boolean {
  const environment = getDeviceEnvironment();

  if (environment === "development") {
    return process.env.DEVICE_PAIRING_TEST_ENABLED === "true";
  }

  if (environment === "production") {
    return process.env.DEVICE_PAIRING_ENABLED === "true";
  }

  return false;
}

export function isDeviceAuthEnabled(): boolean {
  const environment = getDeviceEnvironment();

  if (environment === "development") {
    return process.env.DEVICE_AUTH_TEST_ENABLED === "true";
  }

  if (environment === "production") {
    return process.env.DEVICE_AUTH_ENABLED === "true";
  }

  return false;
}

export function isDeviceSyncEnabled(): boolean {
  const environment = getDeviceEnvironment();

  if (environment === "development") {
    return process.env.DEVICE_AUTH_TEST_ENABLED === "true";
  }

  if (environment === "production") {
    return process.env.DEVICE_SYNC_ENABLED === "true";
  }

  return false;
}
