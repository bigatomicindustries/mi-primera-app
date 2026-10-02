import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function validarFirmaWebhook(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string
) {
  let ts = "";
  let v1 = "";

  for (const parte of xSignature.split(",")) {
    const [clave, valor] = parte.split("=", 2);

    if (clave?.trim() === "ts") {
      ts = valor?.trim() ?? "";
    }

    if (clave?.trim() === "v1") {
      v1 = valor?.trim() ?? "";
    }
  }

  if (!ts || !v1) {
    return false;
  }

  const manifest =
    `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const firmaEsperada = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(firmaEsperada, "hex"),
      Buffer.from(v1, "hex")
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const secret =
      process.env.MERCADOPAGO_WEBHOOK_SECRET;

    const accessToken =
      process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!secret || !accessToken) {
      console.error(
        "Falta configuración de Mercado Pago"
      );

      return NextResponse.json(
        { error: "Configuración incompleta" },
        { status: 500 }
      );
    }

    const xSignature =
      request.headers.get("x-signature");

    const xRequestId =
      request.headers.get("x-request-id");

    const dataId =
      request.nextUrl.searchParams.get("data.id") ??
      request.nextUrl.searchParams.get("id");

    if (!xSignature || !xRequestId || !dataId) {
      console.error("Webhook incompleto", {
        tieneFirma: Boolean(xSignature),
        tieneRequestId: Boolean(xRequestId),
        dataId,
      });

      return NextResponse.json(
        { error: "Notificación incompleta" },
        { status: 400 }
      );
    }

    // 1. Validar firma de Mercado Pago

    const firmaValida =
      validarFirmaWebhook(
        xSignature,
        xRequestId,
        dataId,
        secret
      );

    if (!firmaValida) {
      console.error(
        "Firma de Mercado Pago inválida"
      );

      return NextResponse.json(
        { error: "Firma inválida" },
        { status: 401 }
      );
    }

    // 2. Leer notificación

    const body =
      await request.json().catch(() => null);

    console.log(
      "Webhook Mercado Pago VALIDADO:",
      {
        type: body?.type,
        action: body?.action,
        dataId,
        liveMode: body?.live_mode,
        notificationId: body?.id,
      }
    );

    // 3. Por ahora solamente nos interesan
    // las suscripciones.
    //
    // Otros eventos se reconocen y se ignoran.

    if (body?.type !== "subscription_preapproval") {
      console.log(
        "Webhook ignorado: no es subscription_preapproval"
      );

      return NextResponse.json(
        {
          received: true,
          ignored: true,
        },
        { status: 200 }
      );
    }

    // 4. Consultar directamente a Mercado Pago.
    //
    // IMPORTANTE:
    // No confiamos en el body del webhook para
    // determinar el estado real de la suscripción.

    const mpResponse = await fetch(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(
        dataId
      )}`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!mpResponse.ok) {
      const errorText =
        await mpResponse.text();

      console.error(
        "No se pudo consultar el preapproval:",
        {
          status: mpResponse.status,
          dataId,
          response:
            errorText.slice(0, 500),
        }
      );

      // Devolvemos 200 porque la firma sí era válida.
      // Estamos en fase de diagnóstico y no queremos
      // provocar reintentos innecesarios por este caso.

      return NextResponse.json(
        {
          received: true,
          diagnostic_lookup_failed: true,
        },
        { status: 200 }
      );
    }

    const preapproval =
      await mpResponse.json();

    // 5. DIAGNÓSTICO TEMPORAL
    //
    // Mostramos únicamente campos útiles.
    // No mostramos tokens ni datos de tarjeta.
    // NO escribimos nada en Supabase.

    console.log(
      "PREAPPROVAL REAL DE MERCADO PAGO:",
      {
        id:
          preapproval?.id,

        status:
          preapproval?.status,

        preapproval_plan_id:
          preapproval?.preapproval_plan_id,

        external_reference:
          preapproval?.external_reference,

        collector_id:
          preapproval?.collector_id,

        application_id:
          preapproval?.application_id,

        payer_id:
          preapproval?.payer_id,

        reason:
          preapproval?.reason,

        date_created:
          preapproval?.date_created,

        last_modified:
          preapproval?.last_modified,

        next_payment_date:
          preapproval?.next_payment_date,

        back_url:
          preapproval?.back_url,
      }
    );

    // TODAVÍA NO:
    //
    // - actualizamos subscription_checkouts
    // - actualizamos subscriptions
    // - cambiamos plan_id
    // - activamos Pro/Business
    //
    // Primero observaremos una suscripción sandbox real.

    return NextResponse.json(
      {
        received: true,
        diagnostic: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "Error procesando webhook Mercado Pago:",
      error
    );

    return NextResponse.json(
      { error: "Error procesando webhook" },
      { status: 500 }
    );
  }
}