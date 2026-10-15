import {
  isDeviceAuthEnabled,
  isDeviceSyncEnabled,
} from "@/lib/deviceEnvironment";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMobileSyncDeviceId } from "@/lib/mobileSyncSession";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const TOKEN_REGEX = /^[0-9a-f]{64}$/;

function respond(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE,
  });
}

function devEnabled(): boolean {
  return (
    isDeviceAuthEnabled() &&
    isDeviceSyncEnabled()
  );
}

function validStock(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < 1_000_000_000 &&
    Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length >= 1 &&
    value.length <= 128;
}

export async function POST(request: Request) {
  if (!devEnabled()) {
    return respond(503, {
      error: "Conciliación disponible solo en DEV.",
    });
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, { error: "Autenticación requerida." });
  }

  const token = authorization.slice(7);

  if (!TOKEN_REGEX.test(token)) {
    return respond(401, { error: "Sesión inválida." });
  }

  const contentLength = request.headers.get("content-length");

  if (
    contentLength !== null &&
    (!Number.isSafeInteger(Number(contentLength)) ||
      Number(contentLength) > 2048 ||
      Number(contentLength) < 0)
  ) {
    return respond(413, { error: "Solicitud demasiado grande." });
  }

  let input: Record<string, unknown>;

  try {
    const raw = await request.text();

    if (Buffer.byteLength(raw, "utf8") > 2048) {
      return respond(413, { error: "Solicitud demasiado grande." });
    }

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" ||
        Array.isArray(parsed)) {
      return respond(400, { error: "Solicitud inválida." });
    }

    input = parsed as Record<string, unknown>;
  } catch {
    return respond(400, { error: "Solicitud inválida." });
  }

  if (
    Object.keys(input).length !== 5 ||
    !validId(input.localProductId) ||
    !validId(input.localChangeId) ||
    !["count", "legacy"].includes(String(input.movementType)) ||
    !validStock(input.previousStock) ||
    !validStock(input.requestedStock)
  ) {
    return respond(400, {
      error: "Datos de conciliación inválidos.",
    });
  }

  const localProductId = input.localProductId as string;
  const localChangeId = input.localChangeId as string;
  const movementType = input.movementType as string;
  const previousStock = input.previousStock as number;
  const requestedStock = input.requestedStock as number;

  try {
    const deviceId = await getMobileSyncDeviceId(token);

    if (!deviceId) {
      return respond(401, {
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
      return respond(503, {
        error: "No se pudo verificar el dispositivo.",
      });
    }

    if (
      !device?.business_id ||
      !device.branch_id ||
      device.status !== "active" ||
      device.linked_at === null ||
      device.revoked_at !== null
    ) {
      return respond(403, {
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

    if (businessResult.error || branchResult.error) {
      return respond(503, {
        error: "No se pudo verificar el negocio y la sucursal.",
      });
    }

    if (!businessResult.data?.active ||
        !branchResult.data?.active) {
      return respond(403, {
        error: "Negocio o sucursal no disponible.",
      });
    }

    const { data: link, error: linkError } =
      await supabaseAdmin
        .from("pos_mobile_product_links")
        .select("product_id")
        .eq("device_id", deviceId)
        .eq("business_id", device.business_id)
        .eq("local_product_id", localProductId)
        .maybeSingle();

    if (linkError) {
      return respond(503, {
        error: "No se pudo verificar el producto vinculado.",
      });
    }

    if (!link?.product_id) {
      return respond(409, {
        error: "El producto aún no está vinculado al POS web.",
      });
    }

    const { data: product, error: productError } =
      await supabaseAdmin
        .from("products")
        .select("id, sale_unit")
        .eq("id", link.product_id)
        .eq("business_id", device.business_id)
        .maybeSingle();

    if (productError) {
      return respond(503, {
        error: "No se pudo verificar el producto.",
      });
    }

    if (!product) {
      return respond(409, {
        error: "Producto remoto no disponible.",
      });
    }

    if (
      product.sale_unit === "piece" &&
      (!Number.isInteger(previousStock) ||
        !Number.isInteger(requestedStock))
    ) {
      return respond(400, {
        error: "Los productos por pieza requieren unidades enteras.",
      });
    }

    const { data: inventory, error: inventoryError } =
      await supabaseAdmin
        .from("branch_inventory")
        .select("stock")
        .eq("business_id", device.business_id)
        .eq("branch_id", device.branch_id)
        .eq("product_id", product.id)
        .maybeSingle();

    if (inventoryError) {
      return respond(503, {
        error: "No se pudo verificar el inventario.",
      });
    }

    if (!inventory || !validStock(inventory.stock)) {
      return respond(409, {
        error: "El inventario remoto no está disponible.",
      });
    }

    const table = "pos_mobile_inventory_reconciliations";

    // El movimiento local es único dentro de cada dispositivo.
    // Un reintento idéntico devuelve la solicitud existente.
    const { data: existing, error: existingError } =
      await supabaseAdmin
        .from(table)
        .select(
          "id, product_id, local_product_id, movement_type, previous_stock, requested_stock, status, business_id, branch_id"
        )
        .eq("device_id", deviceId)
        .eq("local_change_id", localChangeId)
        .maybeSingle();

    if (existingError) {
      return respond(503, {
        error: "El registro de conciliaciones aún no está disponible.",
      });
    }

    // Capturar identificadores ya validados para que
    // TypeScript mantenga sus tipos dentro de matches().
    const verifiedProductId = product.id;
    const verifiedBusinessId = device.business_id;
    const verifiedBranchId = device.branch_id;

    function matches(row: {
      product_id: string;
      local_product_id: string;
      movement_type: string;
      previous_stock: number;
      requested_stock: number;
      business_id: string;
      branch_id: string;
    }) {
      return row.product_id === verifiedProductId &&
        row.local_product_id === localProductId &&
        row.movement_type === movementType &&
        Number(row.previous_stock) === previousStock &&
        Number(row.requested_stock) === requestedStock &&
        row.business_id === verifiedBusinessId &&
        row.branch_id === verifiedBranchId;
    }

    if (existing) {
      return matches(existing)
        ? respond(200, {
            requestId: existing.id,
            status: existing.status,
            alreadyRegistered: true,
          })
        : respond(409, {
            error: "El movimiento ya tiene una solicitud diferente.",
          });
    }

    const { data: inserted, error: insertError } =
      await supabaseAdmin
        .from(table)
        .insert({
          business_id: device.business_id,
          branch_id: device.branch_id,
          device_id: deviceId,
          product_id: product.id,
          local_product_id: localProductId,
          local_change_id: localChangeId,
          movement_type: movementType,
          previous_stock: previousStock,
          requested_stock: requestedStock,
          status: "pending",
        })
        .select("id, status")
        .single();

    if (insertError) {
      // Resolver la carrera entre dos intentos simultáneos.
      if (insertError.code === "23505") {
        const { data: retry } = await supabaseAdmin
          .from(table)
          .select(
            "id, status, product_id, local_product_id, movement_type, previous_stock, requested_stock, business_id, branch_id"
          )
          .eq("device_id", deviceId)
          .eq("local_change_id", localChangeId)
          .maybeSingle();

        if (retry && matches(retry)) {
          return respond(200, {
            requestId: retry.id,
            status: retry.status,
            alreadyRegistered: true,
          });
        }

        return respond(409, {
          error: "Movimiento duplicado con información distinta.",
        });
      }

      return respond(503, {
        error: "No se pudo registrar la solicitud.",
      });
    }

    return respond(201, {
      requestId: inserted.id,
      status: inserted.status,
      alreadyRegistered: false,
    });
  } catch {
    return respond(503, {
      error: "No fue posible registrar la conciliación.",
    });
  }
}
