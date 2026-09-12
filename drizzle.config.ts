import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config. `generate` is the only command used in this project:
 * migrations are applied via `wrangler d1 migrations apply` (see
 * docs/drizzle-research.md + cloudflare-research.md), so the
 * d1-http driver credentials are intentionally absent. If you ever need
 * `drizzle-kit push/migrate` against remote D1, set CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_TOKEN in the environment.
 */
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './db/migrations',
	casing: 'snake_case'
});
