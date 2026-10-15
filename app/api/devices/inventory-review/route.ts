import { isDeviceAuthEnabled } from "@/lib/deviceEnvironment";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMobileSyncDeviceId } from "@/lib/mobileSyncSession";

export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };
const TOKEN_REGEX = /^[0-9a-f]{64}$/;

function reply(status: number, data: Record<string, unknown>) {
  return NextResponse.json(data, {
    status,
    headers: HEADERS,
  });
}

function devEnabled(): boolean {
  return isDeviceAuthEnabled();
}

export async function GET(request: Request) {
  if (!devEnabled()) {
    return reply(503, {
      error: "Consulta de inventario no habilitada.",
    });
  }

  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "Autenticación requerida." });
  }

  const token = authorization.slice(7);

  if (!TOKEN_REGEX.test(token)) {
    return reply(401, { error: "Sesión inválida." });
  }

  const localProductId = new URL(request.url)
    .searchParams.get("localProductId");

  if (
    !localProductId ||
    localProductId.trim() !== localProductId ||
    localProductId.length > 128
  ) {
    return reply(400, {
      error: "Identificador local inválido.",
    });
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
      device.linked_at === null ||
      device.revoked_at !== null
    ) {
      return reply(403, {
        error: "Dispositivo no autorizado.",
      });
    }

    const { data: business, error: businessError } =
      await supabaseAdmin
        .from("businesses")
        .select("id, active")
        .eq("id", device.business_id)
        .maybeSingle();

    if (businessError) {
      return reply(503, {
        error: "No se pudo verificar el negocio.",
      });
    }

    if (!business?.active) {
      return reply(403, {
        error: "Negocio no disponible.",
      });
    }

    const { data: branch, error: branchError } =
      await supabaseAdmin
        .from("branches")
        .select("id, active")
        .eq("id", device.branch_id)
        .eq("business_id", device.business_id)
        .maybeSingle();

    if (branchError) {
      return reply(503, {
        error: "No se pudo verificar la sucursal.",
      });
    }

    if (!branch?.active) {
      return reply(403, {
        error: "Sucursal no disponible.",
      });
    }

    // Resolver el producto mediante la vinculación del
    // dispositivo. No aceptar product_id remoto del móvil.
    const { data: link, error: linkError } =
      await supabaseAdmin
        .from("pos_mobile_product_links")
        .select("product_id")
        .eq("device_id", deviceId)
        .eq("business_id", device.business_id)
        .eq("local_product_id", localProductId)
        .maybeSingle();

    if (linkError) {
      return reply(503, {
        error: "No se pudo consultar la vinculación del producto.",
      });
    }

    if (!link?.product_id) {
      return reply(404, {
        error: "El producto local no está vinculado a Supabase.",
      });
    }

    const { data: product, error: productError } =
      await supabaseAdmin
        .from("products")
        .select("id, name, barcode, sale_unit")
        .eq("id", link.product_id)
        .eq("business_id", device.business_id)
        .maybeSingle();

    if (productError) {
      return reply(503, {
        error: "No se pudo consultar el producto.",
      });
    }

    if (!product) {
      return reply(404, {
        error: "Producto remoto no disponible.",
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
      return reply(503, {
        error: "No se pudo consultar la existencia remota.",
      });
    }

    if (
      !inventory ||
      typeof inventory.stock !== "number" ||
      !Number.isFinite(inventory.stock) ||
      inventory.stock < 0
    ) {
      return reply(409, {
        error: "Inventario remoto no disponible o inválido.",
      });
    }

    return reply(200, {
      localProductId,
      productId: product.id,
      productName: product.name,
      barcode: product.barcode,
      saleUnit: product.sale_unit,
      serverStock: inventory.stock,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return reply(503, {
      error: "No fue posible consultar el inventario.",
    });
  }
}
