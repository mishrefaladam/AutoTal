import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { env } from "./env";

/**
 * AES-256-GCM für ruhende Integrations-Tokens (z. B. Instagram Access Token).
 *
 * Format des Ciphertexts: `v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>`
 * Das Präfix erlaubt später einen Schlüsselwechsel ohne Ratespiel.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM-Standard
const KEY_LENGTH = 32; // AES-256
const VERSION = "v1";

function getKey(): Buffer {
  const raw = env().ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY ist nicht gesetzt. Ohne diesen Schlüssel können keine " +
        "Integrations-Tokens gespeichert werden. Erzeugen mit: openssl rand -base64 32",
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY muss base64-kodiert genau ${KEY_LENGTH} Byte ergeben, ` +
        `hat aber ${key.length} Byte.`,
    );
  }

  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Ungültiges Ciphertext-Format.");
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKey();

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Vergleicht zwei Secrets in konstanter Zeit – für Shared-Secret-Header
 * wie den Cron-Trigger.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  // timingSafeEqual wirft bei ungleicher Länge. Damit die Länge selbst kein
  // Orakel wird, wird gegen einen gleich langen Puffer verglichen.
  if (bufferA.length !== bufferB.length) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

/** Maskiert ein Secret für die Anzeige im Admin: "EAAG…x7Qz" */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
