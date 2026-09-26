# Security policy

This repository is public. The deployed app is private — sign-ups are gated behind an admin
approval queue, and every user sees only their own rows.

## Reporting a vulnerability

Open a GitHub issue, or email the address in the repository owner's profile. Please do not open a
public issue for anything that could be actively exploited — say what you found and give a little
time before disclosing.

## What is sensitive

| Item                 | Where it lives                | Committed?                            |
| -------------------- | ----------------------------- | ------------------------------------- |
| `BETTER_AUTH_SECRET` | Cloudflare secret (encrypted) | **Never**                             |
| `.dev.vars`          | Local only                    | **Never** (gitignored)                |
| `database_id`        | `wrangler.jsonc`              | Yes — an identifier, not a credential |
| `BETTER_AUTH_URL`    | Not set at all                | n/a                                   |

Full git history has been checked for committed secrets; only `.dev.vars.example` (a template with
placeholder values) is tracked.

## What is enforced

Session cookies are `HttpOnly` + `Secure`, signed and verified server-side — a forged cookie does
not produce a session. Every list query and every write filters on the acting user's id in SQL; the six single-row-by-id reads assert ownership in JS before returning or writing. Either way a foreign row is unreachable. The `disabled` and
`role` fields are server-owned and cannot be set from a client payload. Response headers include a
content security policy, `X-Frame-Options: DENY`, `nosniff`, and a locked-down permissions policy.

Details in [docs/security.md](docs/security.md), including the known gaps — read the "Known gaps"
table before assuming something is covered.
