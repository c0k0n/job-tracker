/**
 * Baseline response headers, shared by `src/hooks.server.ts` (which stamps
 * them on every response) and by routes that need to override one of them.
 *
 * The CSP is deliberately not strict: SvelteKit emits inline `<script>` and
 * `<style>` chunks, and the dashboard sets inline `style="width: …"` on its
 * chart bars, so `'unsafe-inline'` is required in both directives or the app
 * stops rendering. Everything else is locked down.
 */

/** One CSP directive per entry, so a route can replace a single one. */
export const BASE_CSP_DIRECTIVES: readonly string[] = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"connect-src 'self'",
	// Resume previews are same-origin PDFs streamed from R2 via
	// /api/resumes/[id], so 'self' is both correct and tighter than
	// `frame-src https:` (which would have to allow any host).
	"frame-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	// Strictest possible: nothing may embed our HTML pages, same-origin
	// included. /api/resumes/[id] overrides this one directive because the
	// detail modal previews a PDF in a same-origin iframe.
	"frame-ancestors 'none'"
];

/** `frame-ancestors` replaced with `value`. Used by the resume preview. */
export function cspWithFrameAncestors(value: string): string {
	return BASE_CSP_DIRECTIVES.map((d) =>
		d.startsWith('frame-ancestors') ? `frame-ancestors ${value}` : d
	).join('; ');
}

export const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
	// One year. The worker is only ever reachable over HTTPS (workers.dev
	// and any custom domain both terminate TLS at Cloudflare), so there is
	// no plaintext origin to strand. `includeSubDomains` is left off on
	// purpose: it would also apply to anything else hosted under the same
	// workers.dev subdomain, which is not ours to promise for.
	'Strict-Transport-Security': 'max-age=31536000',
	'Content-Security-Policy': BASE_CSP_DIRECTIVES.join('; ')
};
