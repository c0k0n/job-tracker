/**
 * Resume upload limits, shared by the client (instant feedback before a
 * 10 MB round-trip) and the API route (the only enforcement that counts —
 * a client check is a courtesy, never a control).
 *
 * The PDFs themselves live in the R2 `RESUMES` bucket under
 * `${userId}/${resumeId}.pdf`; only the metadata below travels to the client.
 */

/** Upload ceiling. Chosen to sit far under the Worker's 100 MB request
 *  body limit and under the free-tier R2 10 GB budget. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

/** Per-user resume cap. 20 × 10 MB keeps one account bounded at 200 MB,
 *  so the shared 10 GB free allowance is never threatened by one user. */
export const MAX_RESUMES_PER_USER = 20;

/** The only accepted type. Enforced by magic bytes, not the client's
 *  `Content-Type`, which is attacker-controlled. */
export const RESUME_CONTENT_TYPE = 'application/pdf';

/** First five bytes of every real PDF. `%PDF-` — see PDF 32000-1 §7.5.2. */
export const PDF_MAGIC: readonly number[] = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function isPdfMagic(head: Uint8Array): boolean {
	return head.length >= PDF_MAGIC.length && PDF_MAGIC.every((b, i) => head[i] === b);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
