import { createSign } from "node:crypto";

/**
 * Minimal Google Drive v3 client for student question photos.
 *
 * Bytes are streamed from the request straight into a Drive resumable upload.
 * Nothing is written to Railway disk or Postgres; the app keeps only Drive IDs.
 *
 * Auth (first one configured wins):
 *   A. GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON  (raw JSON or base64 of the key file)
 *      optional GOOGLE_DRIVE_IMPERSONATE_SUBJECT (domain-wide delegation, e.g.
 *      admin@acceptedadmissions.org). Without impersonation the folder must be in
 *      a Shared Drive, because service accounts have no Drive storage of their own.
 *   B. GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN for admin@acceptedadmissions.org, with
 *      GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
 *      (falls back to GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET).
 *
 * GOOGLE_DRIVE_UPLOAD_FOLDER_ID is optional. When unset, the app finds or
 * creates its own root folder, which works with the narrow drive.file scope.
 * When set to a folder someone made by hand, the credential needs full drive
 * scope (drive.file cannot see folders the app did not create).
 */

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FULL_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_ROOT_APP_PROPERTY = { key: "aaPurpose", value: "math-video-questions-root" } as const;
export const DRIVE_ROOT_FOLDER_NAME = "Accepted Admissions · SAT Math video questions";

export class DriveNotConfiguredError extends Error {
  constructor() {
    super("Google Drive uploads are not configured.");
    this.name = "DriveNotConfiguredError";
  }
}

export class DriveRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveRequestError";
    this.status = status;
  }
}

type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string };

export type DriveConfig =
  | {
      kind: "service_account";
      key: ServiceAccountKey;
      subject: string | null;
      folderId: string | null;
      scope: string;
    }
  | {
      kind: "oauth_refresh_token";
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      folderId: string | null;
    };

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function parseServiceAccount(raw: string): ServiceAccountKey | null {
  const candidates = [raw];
  if (!raw.startsWith("{")) {
    try {
      candidates.push(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      // not base64
    }
  }
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as Partial<ServiceAccountKey>;
      if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : undefined,
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

/** Null means "not configured": callers must degrade gracefully. */
export function driveConfigFromEnv(env: Record<string, string | undefined> = process.env): DriveConfig | null {
  const folderId = clean(env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID) || null;
  const serviceAccount = clean(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
  if (serviceAccount) {
    const key = parseServiceAccount(serviceAccount);
    if (key) {
      return {
        kind: "service_account",
        key,
        subject: clean(env.GOOGLE_DRIVE_IMPERSONATE_SUBJECT) || null,
        folderId,
        scope: folderId ? DRIVE_FULL_SCOPE : DRIVE_FILE_SCOPE,
      };
    }
  }
  const refreshToken = clean(env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN);
  const clientId = clean(env.GOOGLE_DRIVE_OAUTH_CLIENT_ID) || clean(env.GOOGLE_CALENDAR_CLIENT_ID);
  const clientSecret = clean(env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET) || clean(env.GOOGLE_CALENDAR_CLIENT_SECRET);
  if (refreshToken && clientId && clientSecret) {
    return { kind: "oauth_refresh_token", clientId, clientSecret, refreshToken, folderId };
  }
  return null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function serviceAccountAssertion(args: {
  key: ServiceAccountKey;
  scope: string;
  subject: string | null;
  nowSeconds: number;
}): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims: Record<string, unknown> = {
    iss: args.key.client_email,
    scope: args.scope,
    aud: args.key.token_uri || TOKEN_URL,
    iat: args.nowSeconds,
    exp: args.nowSeconds + 3600,
  };
  if (args.subject) claims.sub = args.subject;
  const body = base64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${base64url(signer.sign(args.key.private_key))}`;
}

export type DriveUploadInput = {
  name: string;
  parentId: string;
  mimeType: string;
  bytes: number;
  body: ReadableStream<Uint8Array>;
  appProperties?: Record<string, string>;
};

export interface DriveClient {
  ensureRootFolder(): Promise<string>;
  createFolder(name: string, parentId: string, appProperties?: Record<string, string>): Promise<{ id: string; webViewLink: string | null }>;
  uploadStream(input: DriveUploadInput): Promise<{ id: string; webViewLink: string | null }>;
  /** Streams file bytes. Caller pipes the body to the HTTP response. */
  download(fileId: string): Promise<Response>;
  trash(fileId: string): Promise<void>;
}

type FetchLike = (input: string, init?: RequestInit & { duplex?: "half" }) => Promise<Response>;

async function driveError(response: Response, action: string): Promise<DriveRequestError> {
  let reason = "";
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; error_description?: string };
    reason =
      typeof body.error === "object" ? body.error?.message ?? "" : body.error_description || body.error || "";
  } catch {
    // ignore
  }
  return new DriveRequestError(response.status, `Google Drive ${action} failed (${response.status})${reason ? `: ${reason}` : ""}`);
}

/** Counts bytes and fails if the stream is larger than declared. */
export function byteLimitStream(limit: number): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  return new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > limit) {
        controller.error(new DriveRequestError(413, "Upload is larger than its declared size."));
        return;
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (seen !== limit) {
        controller.error(new DriveRequestError(400, "Upload ended before its declared size."));
      }
    },
  });
}

export function createDriveClient(config: DriveConfig, fetchImpl: FetchLike = fetch as FetchLike): DriveClient {
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let rootFolderId: string | null = config.folderId;

  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
    const params = new URLSearchParams();
    let tokenUrl = TOKEN_URL;
    if (config.kind === "service_account") {
      tokenUrl = config.key.token_uri || TOKEN_URL;
      params.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
      params.set(
        "assertion",
        serviceAccountAssertion({
          key: config.key,
          scope: config.scope,
          subject: config.subject,
          nowSeconds: Math.floor(Date.now() / 1000),
        }),
      );
    } else {
      params.set("grant_type", "refresh_token");
      params.set("refresh_token", config.refreshToken);
      params.set("client_id", config.clientId);
      params.set("client_secret", config.clientSecret);
    }
    const response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!response.ok) throw await driveError(response, "sign-in");
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new DriveRequestError(502, "Google Drive sign-in returned no token.");
    cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  async function authed(url: string, init: RequestInit & { duplex?: "half" } = {}): Promise<Response> {
    const token = await accessToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetchImpl(url, { ...init, headers });
  }

  async function createFolder(name: string, parentId: string, appProperties?: Record<string, string>) {
    const response = await authed(`${DRIVE_API}/files?supportsAllDrives=true&fields=id,webViewLink`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties }),
    });
    if (!response.ok) throw await driveError(response, "folder create");
    const body = (await response.json()) as { id: string; webViewLink?: string };
    return { id: body.id, webViewLink: body.webViewLink ?? null };
  }

  return {
    async ensureRootFolder() {
      if (rootFolderId) return rootFolderId;
      const q = `appProperties has { key='${DRIVE_ROOT_APP_PROPERTY.key}' and value='${DRIVE_ROOT_APP_PROPERTY.value}' } and mimeType='${FOLDER_MIME}' and trashed=false`;
      const search = await authed(
        `${DRIVE_API}/files?${new URLSearchParams({
          q,
          fields: "files(id)",
          pageSize: "1",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
        }).toString()}`,
      );
      if (!search.ok) throw await driveError(search, "folder lookup");
      const found = (await search.json()) as { files?: { id: string }[] };
      if (found.files?.[0]?.id) {
        rootFolderId = found.files[0].id;
        return rootFolderId;
      }
      const created = await createFolder(DRIVE_ROOT_FOLDER_NAME, "root", {
        [DRIVE_ROOT_APP_PROPERTY.key]: DRIVE_ROOT_APP_PROPERTY.value,
      });
      rootFolderId = created.id;
      return rootFolderId;
    },
    createFolder,
    async uploadStream(input) {
      const start = await authed(
        `${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": input.mimeType,
            "x-upload-content-length": String(input.bytes),
          },
          body: JSON.stringify({ name: input.name, parents: [input.parentId], appProperties: input.appProperties }),
        },
      );
      if (!start.ok) throw await driveError(start, "upload start");
      const location = start.headers.get("location");
      if (!location) throw new DriveRequestError(502, "Google Drive did not return an upload address.");
      const response = await fetchImpl(location, {
        method: "PUT",
        headers: { "content-type": input.mimeType, "content-length": String(input.bytes) },
        body: input.body.pipeThrough(byteLimitStream(input.bytes)),
        duplex: "half",
      });
      if (!response.ok) throw await driveError(response, "upload");
      const body = (await response.json()) as { id: string; webViewLink?: string };
      return { id: body.id, webViewLink: body.webViewLink ?? null };
    },
    async download(fileId) {
      const response = await authed(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      );
      if (!response.ok) throw await driveError(response, "download");
      return response;
    },
    async trash(fileId) {
      const response = await authed(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ trashed: true }),
        },
      );
      if (!response.ok && response.status !== 404) throw await driveError(response, "trash");
    },
  };
}

let override: DriveClient | null | undefined;
let envClient: { signature: string; client: DriveClient } | null = null;

/** Tests only. Pass undefined to go back to the environment. */
export function setDriveClientForTests(client: DriveClient | null | undefined): void {
  override = client;
}

export function driveClient(): DriveClient | null {
  if (override !== undefined) return override;
  const config = driveConfigFromEnv();
  if (!config) return null;
  const signature = JSON.stringify([config.kind, config.folderId, config.kind === "service_account" ? config.key.client_email : config.clientId]);
  if (!envClient || envClient.signature !== signature) {
    envClient = { signature, client: createDriveClient(config) };
  }
  return envClient.client;
}
