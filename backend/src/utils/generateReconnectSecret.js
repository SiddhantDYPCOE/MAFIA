
import { createHash, randomBytes } from "node:crypto";

export function generateReconnectSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashReconnectSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}