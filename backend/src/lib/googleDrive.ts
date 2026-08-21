import type { Env } from "../types";
import { decryptSecret } from "./secretBox";

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

function buildMultipartBody(metadata: Record<string, unknown>, bytes: ArrayBuffer, mimeType: string, boundary: string): Uint8Array {
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
  return body;
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
  const body = buildMultipartBody(metadata, bytes, mimeType, boundary);

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

/**
 * Upload "anh minh hoa" cua Danh muc linh kien qua OAuth uy quyen 1 tai khoan Google THAT (xem
 * routes/settings.ts phan "Google Drive OAuth") - KHONG dung Service Account nhu uploadToDrive() o
 * tren. Ly do: Service Account khong co storage quota rieng, Google tra ve 403
 * "Service Accounts do not have storage quota" cho moi file no tao ra tru khi dich la 1 Shared
 * Drive (yeu cau Google Workspace tra phi) - da xac nhan truc tiep qua API 2026-08-17. Khi uy
 * quyen 1 tai khoan that, file thuoc quota cua chinh nguoi do nen khong bi chan.
 *
 * Sau khi upload, chia se cong khai "anyone with link" (Drive API permissions.create) roi tra ve
 * link thumbnail nhung truc tiep (drive.google.com/thumbnail?id=...) de nhung <img> thang tren
 * list/modal, khong can nguoi xem dang nhap Google (CHOT 2026-08-17: anh linh kien khong nhay
 * cam, uu tien don gian/nhanh hon la proxy qua Worker).
 */
async function getUserAccessToken(env: Env, db: D1Database): Promise<{ accessToken: string; folderId: string }> {
  const row = await db
    .prepare("SELECT refresh_token_enc, folder_id FROM google_drive_oauth WHERE id = 1")
    .first<{ refresh_token_enc: string; folder_id: string }>();
  if (!row) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED: chua ket noi tai khoan Google Drive - vao Cai dat de ket noi.");

  const refreshToken = await decryptSecret(env, row.refresh_token_enc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google Drive token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return { accessToken: json.access_token, folderId: row.folder_id };
}

export async function uploadPublicImage(
  env: Env,
  db: D1Database,
  bytes: ArrayBuffer,
  mimeType: string,
  filename: string,
): Promise<{ id: string; thumbnailUrl: string }> {
  const { accessToken, folderId } = await getUserAccessToken(env, db);
  const metadata = { name: filename, parents: [folderId] };
  const boundary = `dvbh-${crypto.randomUUID()}`;
  const body = buildMultipartBody(metadata, bytes, mimeType, boundary);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!uploadRes.ok) throw new Error(`Google Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const { id } = (await uploadRes.json()) as { id: string };

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) throw new Error(`Google Drive set-public failed: ${permRes.status} ${await permRes.text()}`);

  return { id, thumbnailUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w1000` };
}
