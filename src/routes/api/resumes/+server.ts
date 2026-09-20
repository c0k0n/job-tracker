/**
 * /api/resumes — the user's resume library.
 *
 * GET  list metadata (never the file bytes).
 * POST upload a PDF into R2 under `${userId}/${id}.pdf`, then record it.
 *
 * Auth is the session in `locals.user`, populated by hooks.server.ts. There
 * is no unauthenticated path here: an anonymous request gets 401 before any
 * bucket call happens.
 *
 * Validation order matters. The cheap, unforgeable checks (auth, count,
 * size, magic bytes) run before anything is written, and the R2 object is
 * removed again if the D1 insert fails — otherwise a failed upload would
 * leave an orphan object that no row points at and nothing can garbage
 * collect.
 */

import { getDb } from '$lib/server/db';
import { countResumes, insertResume, listResumes } from '$lib/server/resumes-data';
import {
	MAX_RESUMES_PER_USER,
	MAX_RESUME_BYTES,
	RESUME_CONTENT_TYPE,
	isPdfMagic
} from '$lib/constants/resumes';
import type { RequestHandler } from './$types';

/** Multipart wrapper overhead on top of the file itself. */
const MULTIPART_SLACK_BYTES = 64 * 1024;

function fail(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}

function ok(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) return fail(401, 'Sign in to view your resumes.');
	const db = getDb(platform!.env.DB);
	return ok({ resumes: await listResumes(db, locals.user.id) });
};

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) return fail(401, 'Sign in to upload a resume.');
	const userId = locals.user.id;
	const db = getDb(platform!.env.DB);
	const bucket = platform!.env.RESUMES;

	// Reject an oversized body before buffering it. Chunked uploads carry no
	// content-length; those fall through to the file.size check below.
	const declared = Number(request.headers.get('content-length') ?? '');
	if (Number.isFinite(declared) && declared > MAX_RESUME_BYTES + MULTIPART_SLACK_BYTES) {
		return fail(413, 'That file is too large. The limit is 10 MB.');
	}

	if ((await countResumes(db, userId)) >= MAX_RESUMES_PER_USER) {
		return fail(409, `You can keep up to ${MAX_RESUMES_PER_USER} resumes. Delete one first.`);
	}

	const form = await request.formData();
	const entry = form.get('file');
	if (!(entry instanceof File)) return fail(400, 'No file was received.');
	if (entry.size === 0) return fail(400, 'That file is empty.');
	if (entry.size > MAX_RESUME_BYTES)
		return fail(413, 'That file is too large. The limit is 10 MB.');

	// Magic bytes, not the browser's Content-Type — that header is whatever
	// the client says it is.
	const head = new Uint8Array(await entry.slice(0, 5).arrayBuffer());
	if (!isPdfMagic(head)) return fail(415, 'Only PDF files are accepted.');

	const id = crypto.randomUUID();
	const r2Key = `${userId}/${id}.pdf`;
	const name = sanitizeName(entry.name);

	await bucket.put(r2Key, await entry.arrayBuffer(), {
		httpMetadata: { contentType: RESUME_CONTENT_TYPE }
	});

	try {
		const created = await insertResume(db, userId, {
			id,
			name,
			r2Key,
			sizeBytes: entry.size,
			contentType: RESUME_CONTENT_TYPE
		});
		return ok({ resume: created }, 201);
	} catch {
		// The row is the only thing that can find this object again — without
		// it the bytes are unreachable, so take them back out.
		await bucket.delete(r2Key);
		return fail(500, 'Could not save that resume. Please try again.');
	}
};

/**
 * Display name only: strip anything that could break out of a
 * Content-Disposition header or a path, and cap the length.
 */
function sanitizeName(raw: string): string {
	const cleaned = raw
		.replace(/["\\\r\n]/g, '')
		.replace(/[^\x20-\x7e]/g, '')
		.trim()
		.slice(0, 120);
	return cleaned || 'resume.pdf';
}
