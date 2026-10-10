import "server-only";

import {
  createPublicKey,
  verify,
  type JsonWebKey,
} from "node:crypto";

function isValidP256Coordinate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value)
  ) {
    return false;
  }

  const decoded = Buffer.from(value, "base64url");

  return (
    decoded.length === 32 &&
    decoded.toString("base64url") === value
  );
}

export function verifyDevicePairingSignature(
  publicKeyJwk: JsonWebKey,
  challenge: string,
  signatureBase64Url: string
): boolean {
  try {
    if (
      !publicKeyJwk ||
      publicKeyJwk.kty !== "EC" ||
      publicKeyJwk.crv !== "P-256" ||
      !isValidP256Coordinate(publicKeyJwk.x) ||
      !isValidP256Coordinate(publicKeyJwk.y) ||
      "d" in publicKeyJwk
    ) {
      return false;
    }

    if (
      typeof challenge !== "string" ||
      !/^[0-9a-f]{64}$/.test(challenge) ||
      typeof signatureBase64Url !== "string" ||
      !/^[A-Za-z0-9_-]{86}$/.test(signatureBase64Url)
    ) {
      return false;
    }

    const signature = Buffer.from(
      signatureBase64Url,
      "base64url"
    );

    if (
      signature.length !== 64 ||
      signature.toString("base64url") !== signatureBase64Url
    ) {
      return false;
    }

    const publicKey = createPublicKey({
      key: publicKeyJwk,
      format: "jwk",
    });

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