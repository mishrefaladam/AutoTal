import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  describeBlobUploadError,
  getBlobCredentialFormat,
} from "@/integrations/storage/vercel-blob";
import { MAX_UPLOAD_REQUEST_BYTES } from "@/integrations/storage/types";

describe("Vercel-Blob-Diagnose", () => {
  it("erkennt den konkreten Konflikt zwischen privatem Store und öffentlichem Upload", () => {
    const result = describeBlobUploadError(
      new Error(
        "Vercel Blob: Cannot use public access on a private store. " +
          "The store is configured with private access.",
      ),
      "vercel_blob_rw_store123_secret456",
    );

    assert.equal(result.category, "access-mode-mismatch");
    assert.equal(result.credentialPresent, true);
    assert.equal(result.credentialFormat, "read-write");
  });

  it("protokolliert niemals den Read/Write-Token", () => {
    const secret = "vercel_blob_rw_store123_supersecret";
    const result = describeBlobUploadError(
      new Error(`Request failed with token ${secret}`),
      secret,
    );

    assert.doesNotMatch(JSON.stringify(result), /supersecret/);
    assert.match(result.errorMessage, /\[redacted\]/);
  });

  it("unterscheidet fehlende, gültige und unerwartete Credential-Formate", () => {
    assert.equal(getBlobCredentialFormat(undefined), "missing");
    assert.equal(
      getBlobCredentialFormat("vercel_blob_rw_store123_secret456"),
      "read-write",
    );
    assert.equal(getBlobCredentialFormat("not-a-write-token"), "unexpected");
  });
});

describe("Upload-Grenzen und Production-Sicherheit", () => {
  const route = readFileSync(
    "src/app/api/admin/vehicles/[id]/images/route.ts",
    "utf8",
  );
  const storageFactory = readFileSync("src/integrations/storage/index.ts", "utf8");
  const client = readFileSync(
    "src/components/admin/vehicle-image-manager.tsx",
    "utf8",
  );

  it("bleibt mit 4 MB unter Vercels 4,5-MB-Requestlimit", () => {
    assert.equal(MAX_UPLOAD_REQUEST_BYTES, 4 * 1024 * 1024);
    assert.match(route, /content-length/);
    assert.match(route, /totalBytes > MAX_UPLOAD_REQUEST_BYTES/);
    assert.match(client, /totalBytes > MAX_UPLOAD_REQUEST_BYTES/);
  });

  it("verwendet weiterhin Node.js und schützt den Upload per Admin-Session", () => {
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /const session = await getAdminSession\(\)/);
    assert.match(route, /if \(!session\)/);
  });

  it("fällt in Production ohne Blob-Credential nicht auf lokale Dateien zurück", () => {
    assert.match(storageFactory, /env\(\)\.NODE_ENV === "production"/);
    assert.match(storageFactory, /throw new UserFacingError/);
  });

  it("loggt Storage-Wahl und Konfigurationsstatus ohne Credential-Wert", () => {
    assert.match(route, /storage: storage\.kind/);
    assert.match(route, /storageConfigured: storage\.isConfigured\(\)/);
    assert.doesNotMatch(route, /BLOB_READ_WRITE_TOKEN[^\n]*logger/);
  });
});
