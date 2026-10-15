import { isDeviceAuthEnabled } from "@/lib/deviceEnvironment";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMobileSyncDeviceId } from "@/lib/mobileSyncSession";

export const runtime = "nodejs";

const TOKEN_REGEX = /^[0-9a-f]{64}$/;

function reply(
  status: number,
  body: Record<string, unknown>
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function devEnabled(): boolean {
  return isDeviceAuthEnabled();
}

export async function GET(request: Request) {
  if (!devEnabled()) {
    return reply(503, {
      error: "Consulta disponible únicamente en DEV.",
    });
  }

  const url = new URL(request.url);
  const rawOffset = url.searchParams.get("offset") ?? "0";

  if (
    !/^(0|[1-9][0-9]{0,5})$/.test(rawOffset) ||
    Number(rawOffset) > 100000
  ) {
    return reply(400, { error: "Paginación inválida." });
  }

  const offset = Number(rawOffset);

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "Autenticación requerida." });
  }

  const token = authorization.slice(7);

  if (!TOKEN_REGEX.test(token)) {
    return reply(401, { error: "Sesión inválida." });
  }

  try {
    const deviceId = await getMobileSyncDeviceId(token);

    if (!deviceId) {
      return reply(401, {
        error: "Sesión vencida o no autorizada.",
      });
    }

    const { data: device, error: deviceError } =
      await supabaseAdmin
        .from("pos_devices")
        .select(
          "business_id, branch_id, status, linked_at, revoked_at"
        )
        .eq("id", deviceId)
        .maybeSingle();

    if (deviceError) {
      return reply(503, {
        error: "No se pudo verificar el dispositivo.",
      });
    }

    if (
      !device?.business_id ||
      !device.branch_id ||
      device.status !== "active" ||
      device.linked_at == null ||
      device.revoked_at != null
    ) {
      return reply(403, {
        error: "Dispositivo no autorizado.",
      });
    }

    const [businessResult, branchResult] = await Promise.all([
      supabaseAdmin
        .from("businesses")
        .select("id, active")
        .eq("id", device.business_id)
        .maybeSingle(),
      supabaseAdmin
        .from("branches")
        .select("id, active")
        .eq("id", device.branch_id)
        .eq("business_id", device.business_id)
        .maybeSingle(),
    ]);

    if (
      businessResult.error ||
      branchResult.error
    ) {
      return reply(503, {
        error: "No se pudo verificar el negocio.",
      });
    }

    if (
      !businessResult.data?.active ||
      !branchResult.data?.active
    ) {
      return reply(403, {
        error: "Negocio o sucursal inactivos.",
      });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("pos_mobile_inventory_reconciliations")
      .select(
        "id, business_id, branch_id, device_id, local_change_id, local_product_id, status, decision, requested_stock, corrected_stock, server_stock_at_review"
      )
      .eq("business_id", device.business_id)
      .eq("branch_id", device.branch_id)
      .eq("device_id", deviceId)
      .in("status", ["applied", "rejected"])
      .order("reviewed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 100);

    if (error) {
      return reply(503, {
        error: "Las resoluciones aún no están disponibles.",
      });
    }

    const page = rows ?? [];
    const hasMore = page.length > 100;

    const items = page.slice(0, 100).map((row) => {
      const serverStock =
        row.status === "applied" &&
        row.decision === "accept_count"
          ? row.requested_stock
          : row.status === "applied" &&
              row.decision === "corrected_count"
            ? row.corrected_stock
            : row.server_stock_at_review;

      return {
        reconciliationId: row.id,
        businessId: row.business_id,
        deviceId: row.device_id,
        localChangeId: row.local_change_id,
        productId: row.local_product_id,
        status: row.status,
        decision: row.decision,
        serverStock,
      };
    });

    return reply(200, {
      items,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return reply(503, {
      error: "No fue posible consultar las resoluciones.",
    });
  }
}
