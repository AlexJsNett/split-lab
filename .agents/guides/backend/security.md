# Security (OWASP Top 10, mapped to this project)

Not a generic checklist — each category below is tied to a real piece of `split-lab`'s actual
attack surface and the milestone that creates it. Two categories need action now, before M3
CRUD ships; the rest get a hands-on "break it, see the exploit, then fix it" exercise once the
relevant milestone lands (same pattern as the `synchronize`-vs-migration exercise in
`data-layer.md`).

## Act now (before/during M3)

**A02 — Cryptographic Failures: `Project.apiKey` is stored in plaintext.**
`ProjectEntity.apiKey` (`@Column({ unique: true })`, from M2) stores the raw key as-is. If the
database ever leaks (backup exposed, SQL injection, insider access), every project's API key is
readable directly — no cracking needed. Contrast with passwords: you never store a password in
plaintext, you hash it (bcrypt/argon2) and compare hashes on login. API keys are a bit different
— you often need to *look one up* quickly by its value (a hash lookup works fine for that, unlike
passwords which are never looked up by value), so the fix isn't "hash exactly like a password,"
it's: store a hash of the key, return the raw key to the user exactly once (at creation time),
never again. Do this as part of M3's `manage-projects` feature, not deferred to M7 — the entity
shape is already committed, retrofitting hashing after real projects/keys exist means a painful
migration + forcing everyone to regenerate keys.

**A06 — Vulnerable & Outdated Components.**
Already partially addressed: `pnpm-lock.yaml` pins exact versions + integrity hashes,
`pnpm-workspace.yaml`'s `allowBuilds` gate limits which packages can run install scripts (see
`AGENTS.md`). Still missing: an automated check for known-vulnerable versions. Add
`pnpm audit` (or `pnpm audit --prod`) as a CI step once M3 stabilizes dependencies — cheap,
catches CVEs in transitive deps before they ship.

## Deferred — exploit demo lands with the milestone that creates the surface

- **A01 — Broken Access Control** (M7, but *design* it in M3): once `Project.apiKey` gates
  access, the bug to demo is an IDOR — `GET /feature-flags/:id` returning a flag that belongs to
  a *different* project than the one whose API key made the request, because the query filters
  by flag ID alone and forgets to also check `projectId` against the caller's authenticated
  project. Write the vulnerable version first, confirm the cross-tenant leak works, then fix by
  scoping every query to the authenticated project.
- **A03 — Injection**: TypeORM's repository/query-builder methods parameterize by default, so
  this is low-risk *unless* a raw `query()` call string-interpolates user input. Demo: write a
  deliberately naive `` `SELECT * FROM projects WHERE name = '${input}'` `` next to the safe
  parameterized version once M3 adds any search/filter endpoint, show `' OR '1'='1` breaking the
  naive one.
- **A04 — Insecure Design**: M4's assignment endpoint (`GET /experiments/:id/assign?userId=`) —
  what stops someone from hitting it with thousands of fake `userId`s to skew experiment
  results? Rate limiting / abuse detection question, revisit when M4 lands.
- **A05 — Security Misconfiguration**: default NestJS error responses can leak stack traces;
  no `helmet`/CORS config yet. Cheap fix, do it once M3 has real endpoints worth protecting —
  add `helmet()` and explicit CORS config, disable detailed error bodies outside dev.
- **A07 — Identification and Authentication Failures** (M7 itself): naive `apiKey === stored`
  string comparison is timing-attack-vulnerable (comparison time leaks how many leading
  characters matched). Use a constant-time compare (`crypto.timingSafeEqual`) instead — demo the
  timing difference if there's time, otherwise just apply it.
- **A08 — Software and Data Integrity Failures**: M11's third-party webhook integration needs
  signature verification on inbound webhooks (if any) and idempotency keys on outbound calls
  (already planned in M11's description) — without verification, anyone who guesses the webhook
  URL can inject fake events.
- **A09 — Security Logging and Monitoring Failures**: no structured logging strategy yet.
  Revisit once there's something worth monitoring (M9 async events onward).
- **A10 — Server-Side Request Forgery (SSRF)**: M11 again — if a user ever supplies a URL the
  server fetches (a webhook target, an enrichment API), demo pointing it at
  `http://169.254.169.254/...` (AWS instance metadata) or `localhost` to show what SSRF actually
  lets an attacker reach, then fix with an allowlist/validation on outbound URLs.

## Why this shape, not a security milestone number

Deliberately not `M17 — Security` as one lump milestone — bolting security on at the end is
itself an anti-pattern (that's literally A04, insecure design). Each fix lands with the
milestone that introduces the relevant surface, so the app is never in a state where a known,
documented hole sits unaddressed for milestones at a time.
