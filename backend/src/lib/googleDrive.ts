import type { Env } from "../types";

/**
 * Upload "anh bien ban tiep nhan" (PXK, Dot 2 muc F) len Google Drive qua Service Account rieng -
 * KHONG dung OAuth nguoi dung (GOOGLE_CLIENT_ID/SECRET la cho dang nhap, khac muc dich). Tu ky JWT
 * RS256 bang Web Crypto (Workers ho tro san, khong can them npm package nao) roi doi lay access
 * token theo luong "JWT Bearer" chuan cua Google, mirror dung pattern fetch+URLSearchParams da dung
 * o routes/auth.ts (chi doi grant_type/assertion).
 */

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function signJwtAssertion(env: Env): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: env.GOOGLE_DRIVE_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(env.GOOGLE_DRIVE_SA_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(sig)}`;
}

async function getAccessToken(env: Env): Promise<string> {
  const assertion = await signJwtAssertion(env);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google Drive auth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function uploadToDrive(
  env: Env,
  bytes: ArrayBuffer,
  mimeType: string,
  filename: string,
): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getAccessToken(env);
  const metadata = { name: filename, parents: [env.GOOGLE_DRIVE_FOLDER_ID] };
  const boundary = `dvbh-${crypto.randomUUID()}`;

  // multipart/related thu cong (Drive KHONG chap nhan multipart/form-data cua FormData) - 2 phan:
  // JSON metadata roi den binary anh, ngan cach boundary theo dung chuan RFC 2387.
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.byteLength + bytes.byteLength + closing.byteLength);
  body.set(preamble, 0);
  body.set(new Uint8Array(bytes), preamble.byteLength);
  body.set(closing, preamble.byteLength + bytes.byteLength);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Google Drive upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; webViewLink: string };
}
