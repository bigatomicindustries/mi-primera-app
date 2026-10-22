import { NextResponse } from "next/server";
import {
  getDeviceEnvironment,
  isDeviceSyncEnabled,
} from "@/lib/deviceEnvironment";

export const dynamic = "force-dynamic";

export async function GET() {
  // Este diagnóstico no revela información comercial
  // ni habilita funciones de sincronización.
  if (
    !getDeviceEnvironment() || !isDeviceSyncEnabled()
  ) {
    return NextResponse.json(
      { ready: false },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.json(
    {
      ready: true,
      environment: getDeviceEnvironment(),
      service: "mobile-device-sync",
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
