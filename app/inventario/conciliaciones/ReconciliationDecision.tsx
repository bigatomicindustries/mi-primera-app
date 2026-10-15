"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export const RECONCILIATION_APPROVAL_ENABLED = false;

type Decision =
  | "keep_server"
  | "accept_count"
  | "corrected_count"
  | "reject";

type Props = {
  reconciliationId: string;
  serverStock: number | null;
  requestedStock: number;
  onResolved: () => Promise<void>;
};

export default function ReconciliationDecision({
  reconciliationId,
  serverStock,
  requestedStock,
  onResolved,
}: Props) {
  const [decision, setDecision] = useState<Decision>("keep_server");
  const [corrected, setCorrected] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const isCorrected = decision === "corrected_count";
  const correctedNumber = Number(corrected);

  const correctedValid =
    !isCorrected ||
    (corrected.trim().length > 0 &&
      Number.isFinite(correctedNumber) &&
      correctedNumber >= 0 &&
      correctedNumber < 1000000000 &&
      Math.abs(
        correctedNumber * 1000 -
        Math.round(correctedNumber * 1000)
      ) < 0.000001);

  const canSubmit =
    RECONCILIATION_APPROVAL_ENABLED &&
    !working &&
    serverStock !== null &&
    Number.isFinite(serverStock) &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 1000 &&
    correctedValid;

  async function submitDecision() {
    if (!canSubmit || serverStock === null) return;

    const descriptions: Record<Decision, string> = {
      keep_server: `Conservar ${serverStock} unidades en el servidor`,
      accept_count: `Establecer ${requestedStock} unidades`,
      corrected_count: `Establecer ${correctedNumber} unidades`,
      reject: "Rechazar la solicitud sin modificar inventario",
    };

    if (!window.confirm(
      `¿Confirmar esta decisión?\n\n${descriptions[decision]}\n\n` +
      "La operación quedará registrada."
    )) {
      return;
    }

    setWorking(true);
    setError("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "resolve_mobile_inventory_reconciliation",
        {
          p_reconciliation_id: reconciliationId,
          p_expected_server_stock: serverStock,
          p_decision: decision,
          p_reason: reason.trim(),
          p_corrected_stock: isCorrected ? correctedNumber : null,
        }
      );

      if (rpcError) throw rpcError;

      await onResolved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo completar la resolución."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="font-bold text-slate-900">
        Decisión administrativa
      </h3>

      {!RECONCILIATION_APPROVAL_ENABLED && (
        <p className="mt-2 text-sm font-medium text-amber-800">
          Aprobaciones deshabilitadas hasta completar
          la validación transaccional y la confirmación en Android.
        </p>
      )}

      <fieldset
        disabled={!RECONCILIATION_APPROVAL_ENABLED || working}
        className="mt-4 space-y-3"
      >
        {([
          ["keep_server", "Conservar existencia del servidor"],
          ["accept_count", "Aceptar conteo físico"],
          ["corrected_count", "Introducir existencia corregida"],
          ["reject", "Rechazar solicitud"],
        ] as const).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-3 text-sm text-slate-800"
          >
            <input
              type="radio"
              name={`decision-${reconciliationId}`}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="h-4 w-4 accent-green-600"
            />
            {label}
          </label>
        ))}

        {isCorrected && (
          <div>
            <label className="block text-sm font-semibold">
              Existencia definitiva
            </label>
            <input
              type="number"
              min="0"
              max="999999999"
              step="0.001"
              value={corrected}
              onChange={(e) => setCorrected(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold">
            Motivo obligatorio
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Explica la revisión física y la razón de la decisión..."
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          />
          <p className="mt-1 text-xs text-slate-500">
            Entre 10 y 1000 caracteres.
          </p>
        </div>
      </fieldset>

      {serverStock === null && (
        <p className="mt-3 text-sm text-red-700">
          No hay existencia remota verificable.
          No se puede autorizar esta solicitud.
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void submitDecision()}
        className="mt-4 rounded-xl bg-green-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {working ? "Procesando..." : "Confirmar decisión"}
      </button>
    </section>
  );
}
