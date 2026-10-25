import type { createGolfDocument, prepareGolfDocumentUpload } from '@/app/golf/actions/documents';
import { resolveMimeType } from '@/lib/storage/mime';
import type { ServerResult } from '../../lib/use-action';
import type { ChPutOutcome } from '../recruiting/upload';

/**
 * Sending a team document to Storage (UP-1). A server action carries the file in its request body, which Vercel caps
 * near 4.5 MB, well under the 25 MB the Hub takes, so the file goes straight to Storage on a signed URL the server made
 * for this coach and this team (`prepareGolfDocumentUpload`), and the server then records it (`createGolfDocument`), as
 * Recruiting's documents do (recruiting/upload.ts).
 */
export interface ChHubUploadIo {
  prepare: typeof prepareGolfDocumentUpload;
  put: (signedUrl: string, file: File, contentType: string) => Promise<ChPutOutcome>;
  create: typeof createGolfDocument;
}

export async function uploadTeamDocument(io: ChHubUploadIo, input: { teamId: string; file: File; folder: string | null }): Promise<ServerResult> {
  const { teamId, file } = input;
  const ticket = await io.prepare(teamId, { fileName: file.name, fileType: file.type, fileSize: file.size });
  if (!ticket.success || !ticket.data) return { success: false, error: ticket.error };
  const put = await io.put(ticket.data.signedUrl, file, ticket.data.contentType);
  if (!(put.status >= 200 && put.status < 300)) {
    const size = put.status === 413 || /"statusCode"\s*:\s*"?413"?|payload too large|exceeded the maximum allowed size/i.test(put.body);
    const type = put.status === 415 || /"statusCode"\s*:\s*"?415"?|invalid_?mime_?type|mime type .* is not supported/i.test(put.body);
    if (size) return { success: false, error: `Storage refused ${file.name}: it is over 25 MB.` };
    if (type) return { success: false, error: `Storage refused ${file.name}: it doesn’t take that type of file.` };
    return { success: false, error: `${file.name} didn’t finish sending. Check your connection and try again.` };
  }
  return io.create({
    team_id: teamId,
    title: file.name.replace(/\.[^.]+$/, ''),
    file_url: ticket.data.fileUrl,
    // The MIME type, as Fairway's Documents stores it (and the version row's mime_type copies it); the extension was
    // stored here once, so a Clubhouse upload's version read `pdf` where every other row reads `application/pdf`.
    file_type: resolveMimeType(file),
    file_size: file.size,
    player_visible: true,
    folder: input.folder ?? undefined,
    storage_path: ticket.data.storagePath,
  });
}
