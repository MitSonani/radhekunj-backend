# E-Commerce Backend

Production-grade Node.js backend API for the e-commerce platform. This repository provides the foundation infrastructure — business modules (products, orders, cart, payments, etc.) will be built on top of this base.

## Technology Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Cache (ready):** Redis via ioredis
- **Validation:** Zod
- **Logging:** Winston
- **Testing:** Vitest + Supertest

## Requirements

- Node.js >= 20.0.0 (see `.nvmrc`)
- npm
- PostgreSQL 14+
- Redis (optional — not required for foundation)

## Installation

```bash
npm install
```

## Environment Variables

Copy the example file and configure your local values:

```bash
cp .env.example .env
```

| Variable       | Required | Description                                      |
| -------------- | -------- | ------------------------------------------------ |
| `NODE_ENV`     | No       | `development`, `production`, or `test` (default: `development`) |
| `PORT`         | No       | HTTP port (default: `3000`)                      |
| `DATABASE_URL` | Yes      | PostgreSQL connection string                     |
| `REDIS_URL`    | No       | Redis connection string (optional)               |
| `CORS_ORIGIN`  | No       | Comma-separated allowed origins                  |

## Database Setup

1. Create a PostgreSQL database.
2. Set `DATABASE_URL` in your `.env` file.
3. Generate the Prisma client:

```bash
npm run db:generate
```

No initial migration is required until e-commerce models are added. When models are introduced:

```bash
npm run db:migrate
```

## Prisma Commands

| Command                    | Description                        |
| -------------------------- | ---------------------------------- |
| `npm run db:generate`      | Generate Prisma client             |
| `npm run db:migrate`       | Create and apply dev migrations    |
| `npm run db:migrate:deploy`| Apply migrations in production     |
| `npm run db:push`          | Push schema changes (dev only)     |
| `npm run db:studio`        | Open Prisma Studio                 |

## Development

```bash
npm run dev
```

The server starts with hot reload via `tsx watch`.

## Production

```bash
npm run build
npm run start
```

## Other Commands

```bash
npm run lint          # Run ESLint
npm run format        # Format with Prettier
npm run typecheck     # TypeScript type checking
npm test              # Run tests
```

## API Endpoints

| Method | Path        | Description                          |
| ------ | ----------- | ------------------------------------ |
| GET    | `/health`   | Liveness check — process is running  |
| GET    | `/ready`    | Readiness check — DB/Redis status    |
| GET    | `/api/v1`   | API version info                     |

## Project Structure

```
src/
├── config/           # Centralized environment configuration
├── database/         # Prisma client and Redis connection
├── middleware/       # Express middleware (logging, errors, etc.)
├── modules/          # Feature modules (future)
├── routes/           # Route definitions
├── shared/
│   ├── errors/       # Application error classes
│   ├── utils/        # Logger, validation helpers
│   ├── constants/    # Shared constants
│   └── types/        # Shared TypeScript types
├── app.ts            # Express app configuration
└── server.ts         # HTTP server and graceful shutdown
```

## Architecture

```
Routes → Controllers → Services → Repositories → Database
```

Business logic belongs in services. Database access belongs in repositories. Controllers handle HTTP concerns only.
# radhekunj-backend
