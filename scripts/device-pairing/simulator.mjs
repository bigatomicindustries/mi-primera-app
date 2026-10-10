import {
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const BASE_URL = "http://127.0.0.1:3000";
const TOKEN_REGEX = /^[0-9a-f]{64}$/;
const CHALLENGE_REGEX = /^[0-9a-f]{64}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function solicitarCodigo() {
  if (!stdin.isTTY) {
    throw new Error("Ejecuta el simulador en una terminal interactiva.");
  }

  const rl = createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
  });

  try {
    const codigo = (await rl.question(
      "Introduce el código temporal DEV: "
    )).trim();

    if (!TOKEN_REGEX.test(codigo)) {
      throw new Error("El código debe contener 64 caracteres hexadecimales.");
    }

    return codigo;
  } finally {
    rl.close();
  }
}

async function enviarSolicitud(ruta, body) {
  const response = await fetch(`${BASE_URL}${ruta}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Solicitud rechazada: HTTP ${response.status}`
    );
  }

  return data;
}

async function main() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  const publicKeyJwk = publicKey.export({ format: "jwk" });

  if (
    publicKeyJwk.kty !== "EC" ||
    publicKeyJwk.crv !== "P-256"
  ) {
    throw new Error("No se pudo generar una clave P-256.");
  }

  console.log("Simulador de vinculación DEV");
  console.log("Servidor:", BASE_URL);
  console.log("Las claves privadas no se guardarán en archivos.");

  const token = await solicitarCodigo();

  const challengeData = await enviarSolicitud(
    "/api/devices/pairing/challenge",
    {
      token,
      publicKey: {
        kty: publicKeyJwk.kty,
        crv: publicKeyJwk.crv,
        x: publicKeyJwk.x,
        y: publicKeyJwk.y,
      },
    }
  );

  if (
    !challengeData ||
    !UUID_REGEX.test(challengeData.challengeId) ||
    !CHALLENGE_REGEX.test(challengeData.challenge)
  ) {
    throw new Error("El servidor devolvió un desafío inválido.");
  }

  const signature = sign(
    "sha256",
    Buffer.from(challengeData.challenge, "utf8"),
    {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }
  );

  const signatureValid = verify(
    "sha256",
    Buffer.from(challengeData.challenge, "utf8"),
    {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    },
    signature
  );

  if (!signatureValid || signature.length !== 64) {
    throw new Error("No se pudo verificar la firma local.");
  }

  const confirmation = await enviarSolicitud(
    "/api/devices/pairing/confirm",
    {
      challengeId: challengeData.challengeId,
      challenge: challengeData.challenge,
      signature: signature.toString("base64url"),
    }
  );

  if (
    confirmation?.success !== true ||
    !UUID_REGEX.test(confirmation.deviceId)
  ) {
    throw new Error("La confirmación devolvió un resultado inválido.");
  }

  console.table({
    vinculacionExitosa: true,
    dispositivoId: confirmation.deviceId,
    firmaVerificadaLocalmente: signatureValid,
  });
}

main().catch((error) => {
  console.error(
    "Prueba detenida:",
    error instanceof Error ? error.message : "Error desconocido"
  );
  process.exitCode = 1;
});
