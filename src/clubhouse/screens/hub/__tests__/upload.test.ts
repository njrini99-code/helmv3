import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { uploadTeamDocument, type ChHubUploadIo } from '../upload';

/** UP-1: a Hub document goes prepare → signed PUT → record, and never rides in a server action's body. */

const file = (bytes: number, name = 'Pairings.pdf', type = 'application/pdf') => new File([new Uint8Array(bytes)], name, { type });
const ticket = { signedUrl: 'https://storage.example/sign?token=t', storagePath: 'golf-documents/t1/u.pdf', fileUrl: 'https://storage.example/public/u.pdf', contentType: 'application/pdf' };

function io(over: Partial<ChHubUploadIo> = {}): ChHubUploadIo {
  return {
    prepare: vi.fn(async () => ({ success: true, data: ticket })) as never,
    put: vi.fn(async () => ({ status: 200, body: '' })),
    create: vi.fn(async () => ({ success: true, data: { id: 'd1' } })) as never,
    ...over,
  };
}

describe('Hub · team document upload (UP-1)', () => {
  it('a 10 MB file: the server is sent its name, type and size only; the bytes go to the signed URL; the server records it', async () => {
    const steps = io();
    const big = file(10 * 1024 * 1024);
    const res = await uploadTeamDocument(steps, { teamId: 't1', file: big, folder: null });
    expect(res.success).toBe(true);
    expect(steps.prepare).toHaveBeenCalledWith('t1', { fileName: 'Pairings.pdf', fileType: 'application/pdf', fileSize: big.size });
    const prepareArgs = JSON.stringify(vi.mocked(steps.prepare).mock.calls[0]);
    expect(prepareArgs.length).toBeLessThan(200);
    expect(steps.put).toHaveBeenCalledWith(ticket.signedUrl, big, 'application/pdf');
    expect(steps.create).toHaveBeenCalledWith(expect.objectContaining({ team_id: 't1', title: 'Pairings', storage_path: ticket.storagePath, file_url: ticket.fileUrl, file_type: 'application/pdf', file_size: big.size }));
    expect(JSON.stringify(vi.mocked(steps.create).mock.calls[0]).length).toBeLessThan(600);
  });

  it('a refused prepare sends nothing; a failed transfer records nothing and says why', async () => {
    const refused = io({ prepare: vi.fn(async () => ({ success: false, error: 'Only a coach on this team can upload documents' })) as never });
    expect(await uploadTeamDocument(refused, { teamId: 't1', file: file(10), folder: null })).toEqual({ success: false, error: 'Only a coach on this team can upload documents' });
    expect(refused.put).not.toHaveBeenCalled();
    const tooBig = io({ put: vi.fn(async () => ({ status: 400, body: '{"statusCode":"413","error":"Payload too large"}' })) });
    const res = await uploadTeamDocument(tooBig, { teamId: 't1', file: file(10), folder: null });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/over 25 MB/) });
    expect(tooBig.create).not.toHaveBeenCalled();
    const wrongType = io({ put: vi.fn(async () => ({ status: 415, body: '' })) });
    expect(await uploadTeamDocument(wrongType, { teamId: 't1', file: file(10), folder: null })).toMatchObject({ success: false, error: expect.stringMatching(/doesn’t take that type/) });
    const dropped = io({ put: vi.fn(async () => ({ status: 0, body: '' })) });
    expect(await uploadTeamDocument(dropped, { teamId: 't1', file: file(10), folder: null })).toMatchObject({ success: false, error: expect.stringMatching(/didn’t finish sending/) });
  });

  it('the Hub’s live writes use the signed path, not uploadGolfDocument', () => {
    const src = readFileSync(join(__dirname, '..', 'writes.ts'), 'utf8');
    expect(src).not.toMatch(/uploadGolfDocument/);
    expect(src).toMatch(/uploadTeamDocument\(\{ prepare: prepareGolfDocumentUpload/);
  });
});
