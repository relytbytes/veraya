<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations

**Always change the schema with `npx prisma migrate dev --name <change>`. Never use `prisma db push`.**

`db push` mutates the database without writing a migration file. When that happens, the migration history no longer reproduces the real schema, so `prisma migrate deploy` to a fresh production DB silently ships an incomplete schema and the app breaks at runtime. (This already happened once — a whole batch of features had to be back-filled into a catch-up migration.)

Rules of thumb:
- Schema change → `npx prisma migrate dev --name <description>`, then commit the generated folder under `prisma/migrations/`.
- Migration filenames must sort in the order they should be applied. A migration that references a table/column must sort *after* the migration that creates it.
- Before relying on a deploy, sanity-check the whole chain replays on an empty DB (`prisma migrate dev` builds a shadow DB and will fail loudly if it doesn't).
- The reservation availability/booking rules live in one place — `lib/reservations.ts`. Don't reimplement overlap/capacity/conflict logic in route handlers; import from there.
