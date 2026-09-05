/**
 * Centralized mock resume fixtures.
 *
 * In the eventual backend phase, uploaded PDFs are stored in Cloudflare R2
 * and signed URLs are generated. For now, this fixture map provides deterministic
 * preview URLs for seeded sample applications.
 */
export const RESUME_URLS: Record<string, string> = {
	'resume-acme': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
	'resume-stripe': 'https://www.africau.edu/images/default/sample.pdf',
	'resume-figma': 'https://www.orimi.com/pdf-test.pdf',
	'resume-linear': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
	'resume-datadog': 'https://www.africau.edu/images/default/sample.pdf',
	'resume-openai': 'https://www.orimi.com/pdf-test.pdf'
};
