import { isDeviceSyncEnabled } from "@/lib/deviceEnvironment";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getMobileSyncDeviceId,
} from "@/lib/mobileSyncSession";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 65536;
const TOKEN_REGEX = /^[0-9a-f]{64}$/;

const HEADERS = {
  "Cache-Control": "no-store",
};

const RPC_NAMES = {
  product: "sync_mobile_product",
  product_change: "sync_mobile_product_change",
  inventory_movement: "sync_mobile_inventory_movement",
  cash_open: "sync_mobile_cash_open",
  cash_open_historical: "sync_mobile_cash_open_historical",
  sale: "sync_mobile_sale",
  cash_movement: "sync_mobile_cash_movement",
  cash_close: "sync_mobile_cash_close",
} as const;

type OperationType = keyof typeof RPC_NAMES;

// Compara estructuras JSON sin depender del orden de sus claves.
function sameJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameJsonValue(value, b[index]))
    );
  }

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);

  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        sameJsonValue(left[key], right[key])
    )
  );
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isOperationType(
  value: unknown
): value is OperationType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      RPC_NAMES,
      value
    )
  );
}

async function readBody(request: Request) {
  const contentLength =
    request.headers.get("content-length");

  if (contentLength !== null) {
    const declared = Number(contentLength);

    if (
      !Number.isSafeInteger(declared) ||
      declared < 0 ||
      declared > MAX_BODY_BYTES
    ) {
      return null;
    }
  }

  try {
    const reader = request.body?.getReader();

    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let length = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      length += value.byteLength;

      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", {
        fatal: true,
      }).decode(Buffer.concat(chunks))
    );

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildRpcArguments(
  type: OperationType,
  payload: Record<string, unknown>,
  deviceId: string
): Record<string, unknown> | null {
  const fields: Record<
    OperationType,
    readonly string[]
  > = {
    product: [
      "p_local_product_id",
      "p_name",
      "p_barcode",
      "p_cost_price",
      "p_sale_price",
      "p_stock",
      "p_minimum_stock",
      "p_sale_unit",
    ],
    product_change: [
      "p_local_change_id",
      "p_local_product_id",
      "p_previous_stock",
      "p_previous_data",
      "p_new_stock",
      "p_name",
      "p_barcode",
      "p_cost_price",
      "p_sale_price",
      "p_minimum_stock",
      "p_sale_unit",
    ],
    inventory_movement: [
      "p_local_change_id",
      "p_local_product_id",
      "p_movement_type",
      "p_quantity",
      "p_previous_stock",
      "p_new_stock",
      "p_previous_data",
    ],
    cash_open: [
      "p_local_session_id",
      "p_opening_amount",
      "p_opened_at",
    ],
    cash_open_historical: [
      "p_local_session_id",
      "p_opening_amount",
      "p_opened_at",
      "p_closed_at",
    ],
    sale: [
      "p_local_sale_id",
      "p_local_session_id",
      "p_items",
      "p_subtotal",
      "p_discount",
      "p_total",
      "p_paid_amount",
      "p_payment_method",
      "p_created_at",
    ],
    cash_movement: [
      "p_local_movement_id",
      "p_local_session_id",
      "p_movement_type",
      "p_amount",
      "p_concept",
      "p_created_at",
    ],
    cash_close: [
      "p_local_session_id",
      "p_closing_amount",
      "p_closed_at",
    ],
  };

  const allowed = fields[type];

  if (
    Object.keys(payload).length !== allowed.length ||
    !allowed.every((field) =>
      Object.prototype.hasOwnProperty.call(
        payload,
        field
      )
    )
  ) {
    return null;
  }

  const args: Record<string, unknown> = {
    p_device_id: deviceId,
  };

  for (const field of allowed) {
    args[field] = payload[field];
  }

  return args;
}

function respond(
  status: number,
  data: Record<string, unknown>
) {
  return NextResponse.json(data, {
    status,
    headers: HEADERS,
  });
}

export async function POST(request: Request) {
  if (!isDeviceSyncEnabled()) {
    return NextResponse.json(
      { error: "La sincronización no está habilitada." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const authorization =
    request.headers.get("authorization");

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return respond(401, {
      error: "Sesión de sincronización requerida.",
    });
  }

  const token = authorization.slice(7);

  if (!TOKEN_REGEX.test(token)) {
    return respond(401, {
      error: "Sesión de sincronización inválida.",
    });
  }

  let deviceId: string | null;

  try {
    deviceId = await getMobileSyncDeviceId(token);
  } catch {
    return respond(503, {
      error: "No fue posible validar la sesión.",
    });
  }

  if (!deviceId) {
    return respond(401, {
      error: "Sesión vencida o no autorizada.",
    });
  }

  const input = await readBody(request);

  if (
    !input ||
    !isOperationType(input.type) ||
    !isRecord(input.payload)
  ) {
    return respond(400, {
      error: "Operación de sincronización inválida.",
    });
  }

  const args = buildRpcArguments(
    input.type,
    input.payload,
    deviceId
  );

  if (!args) {
    return respond(400, {
      error: "Datos de operación incompletos.",
    });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc(
      RPC_NAMES[input.type],
      args
    );

    if (error) {
      console.error(
        "Error sincronizando operación móvil: " +
          JSON.stringify({
            operationType: input.type,
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          })
      );

      return respond(409, {
        error: "La operación no pudo confirmarse.",
        operationType: input.type,
      });
    }

    if (
      typeof data !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(data)
    ) {
      return respond(503, {
        error: "Confirmación del servidor inválida.",
      });
    }

    if (input.type === "inventory_movement") {
      // Obtener negocio y sucursal desde el dispositivo
      // autenticado, nunca desde el payload del cliente.
      const { data: device, error: deviceError } =
        await supabaseAdmin
          .from("pos_devices")
          .select("business_id, branch_id")
          .eq("id", deviceId)
          .eq("status", "active")
          .is("revoked_at", null)
          .single();

      if (deviceError || !device) {
        return respond(503, {
          error: "No fue posible verificar el dispositivo.",
        });
      }

      // Verificar que el UUID pertenece a la operación
      // exacta confirmada para este dispositivo.
      const localChangeId = args.p_local_change_id;

      if (typeof localChangeId !== "string") {
        return respond(503, {
          error: "Identificador de movimiento inválido.",
        });
      }

      const { data: confirmation, error: confirmationError } =
        await supabaseAdmin
          .from("pos_mobile_sync_operations")
          .select("id, server_record_id, request_payload")
          .eq("device_id", deviceId)
          .eq("business_id", device.business_id)
          .eq("branch_id", device.branch_id)
          .eq("local_operation_id", "inventory_movement:" + localChangeId)
          .eq("operation_type", "inventory")
          .eq("status", "completed")
          .eq("server_record_id", data)
          .single();

      const expectedPayload = {
        local_product_id: args.p_local_product_id,
        movement_type: args.p_movement_type,
        quantity: args.p_quantity,
        previous_stock: args.p_previous_stock,
        new_stock: args.p_new_stock,
        previous_data: args.p_previous_data,
      };

      const numericFields = [
        "quantity",
        "previous_stock",
        "new_stock",
      ] as const;

      const storedPayload = confirmation?.request_payload;

      const numericFieldsMatch =
        isRecord(storedPayload) &&
        numericFields.every((field) => {
          const stored = storedPayload[field];
          const expected = expectedPayload[field];

          if (
            !(
              (typeof stored === "number" ||
                typeof stored === "string") &&
              (typeof expected === "number" ||
                typeof expected === "string")
            )
          ) {
            return false;
          }

          const a = Number(stored);
          const b = Number(expected);

          return (
            Number.isFinite(a) &&
            Number.isFinite(b) &&
            Math.abs(a - b) < 0.000000001
          );
        });

      const otherFieldsMatch =
        isRecord(storedPayload) &&
        Object.keys(storedPayload).length === 6 &&
        storedPayload.local_product_id ===
          expectedPayload.local_product_id &&
        storedPayload.movement_type ===
          expectedPayload.movement_type &&
        sameJsonValue(
          storedPayload.previous_data,
          expectedPayload.previous_data
        );

      if (
        confirmationError ||
        !confirmation ||
        !numericFieldsMatch ||
        !otherFieldsMatch
      ) {
        return respond(503, {
          error: "No fue posible verificar la operación confirmada.",
        });
      }

      const { data: movement, error: movementError } =
        await supabaseAdmin
          .from("inventory_movements")
          .select("stock_after, reference_id")
          .eq("id", data)
          .eq("reference_id", confirmation.id)
          .eq("business_id", device.business_id)
          .eq("branch_id", device.branch_id)
          .single();

      if (
        movementError ||
        !movement ||
        typeof movement.stock_after !== "number" ||
        !Number.isFinite(movement.stock_after) ||
        movement.stock_after < 0 ||
        movement.stock_after >= 1_000_000_000
      ) {
        return respond(503, {
          error: "No fue posible recuperar el inventario confirmado.",
        });
      }

      return respond(200, {
        success: true,
        operationType: input.type,
        serverRecordId: data,
        serverStock: movement.stock_after,
      });
    }

    return respond(200, {
      success: true,
      operationType: input.type,
      serverRecordId: data,
    });
  } catch {
    return respond(503, {
      error: "No fue posible completar la sincronización.",
    });
  }
}
