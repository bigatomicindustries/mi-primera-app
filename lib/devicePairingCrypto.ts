import "server-only";

import {
  createPublicKey,
  verify,
  type JsonWebKey,
} from "node:crypto";

export function verifyDevicePairingSignature(
  publicKeyJwk: JsonWebKey,
  challenge: string,
  signatureBase64Url: string
): boolean {
  try {
    if (
      publicKeyJwk.kty !== "EC" ||
      publicKeyJwk.crv !== "P-256" ||
      typeof publicKeyJwk.x !== "string" ||
      typeof publicKeyJwk.y !== "string" ||
      "d" in publicKeyJwk
    ) {
      return false;
    }

    if (
      !/^[0-9a-f]{64}$/.test(challenge) ||
      !/^[A-Za-z0-9_-]+$/.test(signatureBase64Url)
    ) {
      return false;
    }

    const publicKey = createPublicKey({
      key: publicKeyJwk,
      format: "jwk",
    });

    const signature = Buffer.from(
      signatureBase64Url,
      "base64url"
    );

    return verify(
      "sha256",
      Buffer.from(challenge, "utf8"),
      {
        key: publicKey,
        dsaEncoding: "ieee-p1363",
      },
      signature
    );
  } catch {
    return false;
  }
}
