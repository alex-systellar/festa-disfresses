<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# El Mundialet — project conventions

## Git

**Commit and push straight to `main`. Do not create branches, and do not open
pull requests.** This is a small single-person project and the branch-then-merge
round trip is pure overhead here — it has repeatedly meant a fix sat unmerged
while the deployment stayed broken. Push when the work is verified.

Before pushing, `npm run typecheck`, `npm run lint` and `npm run build` should
all pass. CI runs the same three on every push.

## Deployment

Vercel builds `main` as production. `vercel.json` pins `framework: "nextjs"` —
without it Vercel served `public/` as a static site and 404'd every route while
`/flags/*.svg` still returned 200, which is the signature of that failure. Do
not set `regions` there; pinning a function region is a paid-plan feature and
fails the deploy.

Two settings must exist in the Vercel project or the app cannot work:
a connected Blob store (injects `BLOB_READ_WRITE_TOKEN`; without it the first
claim fails fast on purpose, because the deployment filesystem is read-only)
and `ADMIN_KEY` for `/admin`.

## Testing

There is no test runner. Verification is an end-to-end script run against a
real server — see the API contract in `src/app/api/*/route.ts`. Start it with
`EMAIL_DNS_CHECK=off MAX_PER_IP=off MAX_PER_DEVICE=off`: `@example.com` has no
MX records by design, and the suite makes forty-odd claims from one loopback
address, which the duplicate limits would otherwise refuse.

Assets are committed and regenerated with `npm run anthems` / `npm run flags`.
Both are idempotent and skip what already exists.
