/**
 * D1-backed Drizzle client factory.
 *
 * The binding is per-request (event.platform.env.DB), so there is no
 * module-level db instance — call sites pass the binding in. The full schema
 * (tables + relations) is attached so relational queries and Better Auth's
 * `advanced.database.joins` work (see docs/research/better-auth.md
 * "Joins").
 */

import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Db = DrizzleD1Database<typeof schema>;

export function getDb(d1: D1Database): Db {
	return drizzle(d1, { schema });
}
