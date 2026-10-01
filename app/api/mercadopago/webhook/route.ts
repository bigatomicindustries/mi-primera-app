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
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (!secret) {
      console.error("Falta MERCADOPAGO_WEBHOOK_SECRET");

      return NextResponse.json(
        { error: "Configuración incompleta" },
        { status: 500 }
      );
    }

    const xSignature = request.headers.get("x-signature");
    const xRequestId = request.headers.get("x-request-id");

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

    const firmaValida = validarFirmaWebhook(
      xSignature,
      xRequestId,
      dataId,
      secret
    );

    if (!firmaValida) {
      console.error("Firma de Mercado Pago inválida");

      return NextResponse.json(
        { error: "Firma inválida" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);

    console.log("Webhook Mercado Pago VALIDADO:", {
      type: body?.type,
      action: body?.action,
      dataId,
      liveMode: body?.live_mode,
      notificationId: body?.id,
    });

    return NextResponse.json(
      { received: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error procesando webhook Mercado Pago:", error);

    return NextResponse.json(
      { error: "Error procesando webhook" },
      { status: 500 }
    );
  }
}