// =============================================================================
// src/lib/baseball/import-raw-file-storage.ts
//
// Packet: qa-screens (Import Dossier + adapters — stats-integrations DEEPEN)
//
// GAP 1 — preserve the original uploaded file. Server-only helpers that upload the
// raw import bytes into the PRIVATE `baseball-imports` bucket and mint a short-
// lived signed URL for download. Path layout (matches the storage RLS policy in
// 20260624000500): <team_id>/<run_id>/<filename> so foldername[1] is the team id.
//
// Best-effort by contract: an upload failure NEVER fails the import — the data is
// already (or about to be) written; the run simply lands with file_url=null. The
// caller logs the failure but proceeds.
//
// NOT a 'use server' module (no exported server actions) — pure helpers a server
// action imports. They take the already-constructed Supabase server client.
// =============================================================================

const BASEBALL_IMPORTS_BUCKET = 'baseball-imports';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageClient = { storage: any };

/** Strip path separators + control chars from a user filename for a safe key. */
function safeFileName(fileName: string): string {
  const base = (fileName || 'import').split(/[\\/]/).pop() ?? 'import';
  // Keep it readable but storage-key safe.
  const cleaned = base.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 180) || 'import';
}

/**
 * The storage object key for a run's raw file. Deterministic from (team, run,
 * filename) so the same run always resolves to the same object.
 */
function rawFileStoragePath(
  teamId: string,
  runId: string,
  fileName: string,
): string {
  return `${teamId}/${runId}/${safeFileName(fileName)}`;
}

/**
 * Upload the raw bytes for a run. Returns the storage path on success or null on
 * any failure (best-effort — the caller leaves file_url null and never throws).
 */
export async function uploadImportRawFile(
  supabase: StorageClient,
  args: {
    teamId: string;
    runId: string;
    fileName: string;
    bytes: Uint8Array;
    contentType: string;
  },
): Promise<string | null> {
  try {
    const path = rawFileStoragePath(args.teamId, args.runId, args.fileName);
    // Blob keeps the contentType honest and avoids Node Buffer/ArrayBuffer typing
    // mismatches across runtimes. upsert:true so a re-stage of the same run (e.g.
    // re-upload before approval) overwrites its own object rather than 409ing.
    const blob = new Blob([new Uint8Array(args.bytes)], { type: args.contentType });
    const { error } = await supabase.storage
      .from(BASEBALL_IMPORTS_BUCKET)
      .upload(path, blob, { contentType: args.contentType, upsert: true });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/**
 * Mint a short-lived signed download URL for a stored raw file. Returns null if
 * the path is empty or the sign fails (the UI then hides the download affordance).
 */
export async function signImportRawFileUrl(
  supabase: StorageClient,
  storagePath: string | null | undefined,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BASEBALL_IMPORTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl as string;
  } catch {
    return null;
  }
}
