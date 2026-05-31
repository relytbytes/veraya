# Veraya

**Built for one restaurant. Ready for a hundred.**

The restaurant platform with a brain, powered by Vera, the intelligence that catches what you'd miss before it costs you. Veraya brings service, inventory, purchasing, team management and reporting into one operating platform. Vera watches it all, flags cost leaks and operational risk, and turns the noise of a busy shift into a short list of what actually needs your attention.

A full-stack restaurant management platform built with Next.js 16, Prisma 7, and PostgreSQL.

## Modules

| Module | Path | Description |
|---|---|---|
| Dashboard | `/` | Sales KPIs, low stock alerts, recent orders |
| POS | `/pos` | Take orders, manage cart, process payments |
| Menu | `/menu` | Categories, items, recipe costing, margins |
| Inventory | `/inventory` | Stock levels, adjustments, alerts |
| Purchasing | `/purchasing` | Supplier management |
| Staff | `/staff` | Staff accounts and roles |
| Reports | `/reports` | Sales analytics, top items |
| Settings | `/settings` | Configuration (coming soon) |

## Quick Start

### 1. Prerequisites

- Node.js 20+ (installed via nvm above)
- PostgreSQL running locally

### 2. Configure Database

Edit `.env`:
```
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASS@localhost:5432/restaurant_ops"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Run Migrations & Seed

```bash
npm run db:migrate    # creates tables
npm run db:seed       # creates admin user + sample data
```

### 4. Start the Dev Server

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

**Default credentials:** `admin@restaurant.com` / `admin123`

## Stack

- **Next.js 16** — App Router, Server Components, Route Handlers
- **Prisma 7** — ORM with `@prisma/adapter-pg`
- **NextAuth v5** — JWT-based credentials auth
- **Tailwind CSS v4** + Radix UI primitives
- **PostgreSQL**
