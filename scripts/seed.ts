/**
 * Local-D1 seed: one approved admin user + sample applications so a fresh
 * clone renders a meaningful dashboard.
 *
 * Usage: bun run seed   (local D1 only)
 *
 * The scrypt hash is produced by Better Auth's own `hashPassword`
 * (same params the server verifies with), so the seeded admin can sign in
 * with the password printed at the end.
 */

import { hashPassword } from 'better-auth/crypto';
import { generateSeedSQL } from './seed-data';

const ADMIN_EMAIL = 'ada@jobtracker.dev';
const ADMIN_PASSWORD = 'job-tracker-admin-1';
const ADMIN_NAME = 'Ada';

const hash = await hashPassword(ADMIN_PASSWORD);
const sql = generateSeedSQL({
	admin: { email: ADMIN_EMAIL, name: ADMIN_NAME, passwordHash: hash }
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'job-tracker-seed-'));
const file = join(dir, 'seed.sql');
writeFileSync(file, sql);

const run = Bun.spawnSync({
	cmd: ['bunx', 'wrangler', 'd1', 'execute', 'job-tracker', '--local', '--file', file],
	stdout: 'inherit',
	stderr: 'inherit'
});

rmSync(dir, { recursive: true, force: true });

if (run.exitCode !== 0) {
	console.error(
		'Seed failed. Is the local D1 migrated? Run: bunx wrangler d1 migrations apply job-tracker --local'
	);
	process.exit(run.exitCode ?? 1);
}

console.log(`Seeded local D1. Sign in with:
  email:    ${ADMIN_EMAIL}
  password: ${ADMIN_PASSWORD}
`);
