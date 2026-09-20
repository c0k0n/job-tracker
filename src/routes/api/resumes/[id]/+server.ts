/**
 * /api/resumes/[id] — one resume's bytes.
 *
 * GET    stream the PDF out of R2. `?download=1` forces an attachment.
 * DELETE remove the R2 object, the row, and every link to it.
 *
 * The bucket is never public: this route is the only way to reach an object,
 * and it re-checks ownership on every call. A valid id belonging to another
 * account returns 404, not 403 — never confirm that someone else's file
 * exists.
 */

import { getDb } from '$lib/server/db';
import { deleteResume, getResumeForUser } from '$lib/server/resumes-data';
import { RESUME_CONTENT_TYPE } from '$lib/constants/resumes';
import type { RequestHandler } from './$types';

function fail(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}

export const GET: RequestHandler = async ({ locals, platform, params, url }) => {
	if (!locals.user) return fail(401, 'Sign in to view this resume.');
	const db = getDb(platform!.env.DB);

	const meta = await getResumeForUser(db, locals.user.id, params.id);
	if (!meta) return fail(404, 'That resume does not exist.');

	const object = await platform!.env.RESUMES.get(meta.r2Key);
	if (!object) return fail(410, 'That file is no longer stored.');

	const download = url.searchParams.get('download') === '1';
	const headers = new Headers({
		'Content-Type': RESUME_CONTENT_TYPE,
		'Content-Length': String(object.size),
		'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${contentDispositionName(meta.name)}"`,
		// Private, per-user documents: never let a shared cache hold them.
		'Cache-Control': 'private, no-store',
		'X-Content-Type-Options': 'nosniff',
		// hooks.server.ts stamps DENY on everything, but it skips headers a
		// route already set — the detail modal previews this in a same-origin
		// iframe, which DENY would break.
		'X-Frame-Options': 'SAMEORIGIN'
	});
	return new Response(object.body, { headers });
};

export const DELETE: RequestHandler = async ({ locals, platform, params }) => {
	if (!locals.user) return fail(401, 'Sign in to delete a resume.');
	const db = getDb(platform!.env.DB);

	const removed = await deleteResume(db, locals.user.id, params.id);
	if (!removed) return fail(404, 'That resume does not exist.');

	await platform!.env.RESUMES.delete(removed.r2Key);
	return new Response(JSON.stringify({ ok: true, id: removed.id, detached: removed.usedBy }), {
		status: 200,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
};

/** Header-safe filename for Content-Disposition (RFC 6266 / 5987-lite). */
function contentDispositionName(name: string): string {
	return name.replace(/["\\\r\n]/g, '').slice(0, 120) || 'resume.pdf';
}
