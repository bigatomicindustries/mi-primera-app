import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabaseUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function devEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;

  try {
    const url = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    );
    return url.protocol === "https:" &&
      url.hostname === "pablbrladwjuczhazsms.supabase.co";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!devEnabled()) {
    return reply(503, {
      error: "Conciliaciones disponibles solo en DEV.",
    });
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "Inicia sesión para continuar." });
  }

  const token = authorization.slice(7);

  if (!token || token.length > 8192 || token.trim() !== token) {
    return reply(401, { error: "Sesión inválida." });
  }

  try {
    const client = createSupabaseUserClient(token);
    const { data: auth, error: authError } =
      await client.auth.getUser(token);

    if (authError || !auth.user) {
      return reply(401, { error: "Sesión vencida." });
    }

    const { data: profile, error: profileError } =
      await client
        .from("profiles")
        .select("id, role, active, business_id")
        .eq("id", auth.user.id)
        .maybeSingle();

    if (profileError || !profile ||
        !profile.active ||
        profile.role !== "admin" ||
        !profile.business_id) {
      return reply(403, {
        error: "Solo el administrador puede consultar conciliaciones.",
      });
    }

    const { data: business, error: businessError } =
      await client
        .from("businesses")
        .select("id, active")
        .eq("id", profile.business_id)
        .maybeSingle();

    if (businessError || !business?.active) {
      return reply(403, {
        error: "El negocio no está disponible.",
      });
    }

    // El negocio se obtiene de la sesión autenticada.
    // No se acepta business_id en la URL.
    const { data, error } = await supabaseAdmin
      .from("pos_mobile_inventory_reconciliations")
      .select(
        "id, device_id, branch_id, product_id, local_product_id, local_change_id, movement_type, previous_stock, requested_stock, status, decision, reason, created_at, reviewed_at"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(
        "Error consultando conciliaciones:",
        error.code
      );
      return reply(503, {
        error: "La bandeja de conciliaciones aún no está disponible en DEV.",
      });
    }

    const requests = data ?? [];

    if (requests.length === 0) {
      return reply(200, {
        items: [],
        fetchedAt: new Date().toISOString(),
      });
    }

    // Consultar inventario real de las sucursales involucradas.
    // Una solicitud móvil nunca determina por sí misma el saldo.
    const productIds = [...new Set(
      requests.map((item) => item.product_id)
    )];

    const branchIds = [...new Set(
      requests.map((item) => item.branch_id)
    )];

    const { data: stockRows, error: stockError } =
      await supabaseAdmin
        .from("branch_inventory")
        .select("product_id, branch_id, stock")
        .eq("business_id", business.id)
        .in("product_id", productIds)
        .in("branch_id", branchIds);

    if (stockError) {
      return reply(503, {
        error: "No fue posible consultar las existencias actuales.",
      });
    }

    const stockByProductAndBranch = new Map(
      (stockRows ?? []).map((row) => [
        `${row.branch_id}:${row.product_id}`,
        Number(row.stock),
      ])
    );

    const items = requests.map((item) => {
      const stock = stockByProductAndBranch.get(
        `${item.branch_id}:${item.product_id}`
      );

      return {
        ...item,
        server_stock:
          stock !== undefined &&
          Number.isFinite(stock) &&
          stock >= 0
            ? stock
            : null,
      };
    });

    return reply(200, {
      items,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return reply(503, {
      error: "No fue posible consultar las conciliaciones.",
    });
  }
}
