# Staging Deployment & Operational Guide

This guide details the staging deployment architecture, configuration parameters, migration deployment procedures, and smoke-testing checklists for the three applications in this repository:
- **Backend API**: `backend` (Express.js + TypeScript + Prisma ORM)
- **Admin Panel**: `admin` (Next.js 16 + React 19 + Tailwind CSS)
- **User Panel / Storefront**: `user-frontend` (Next.js 16 + React 19 + Tailwind CSS)

---

## 1. Application Runtime & Build Specifications

| Property | Backend API (`backend`) | Admin Panel (`admin`) | User Storefront (`user-frontend`) |
|---|---|---|---|
| **Runtime** | Node.js `>=20.0.0` (LTS) | Node.js `>=20.0.0` (LTS) | Node.js `>=20.0.0` (LTS) |
| **Package Manager** | `npm` (uses `package-lock.json`) | `npm` (uses `package-lock.json`) | `npm` (uses `package-lock.json`) |
| **Framework** | Express.js 4.x + TypeScript | Next.js 16.3.1 (App Router) | Next.js 16.3.1 (App Router) |
| **Install Command** | `npm ci` | `npm ci` | `npm ci` |
| **Build Command** | `npm run build` (`tsc`) | `npm run build` (`next build`) | `npm run build` (`next build`) |
| **Start Command** | `npm start` (`node dist/server.js`) | `npm start` (`next start --port $PORT`) | `npm start` (`next start --port $PORT`) |
| **Dev Port (Default)**| `3000` | `3002` | `3001` |
| **Health Probes** | `GET /health` (liveness), `GET /ready` (readiness) | Native Next.js HTTP 200 | Native Next.js HTTP 200 |

---

## 2. Staging Environment Configuration

Never commit secrets or `.env` files to source control. Configure staging environment variables via the platform host dashboard or secure secret manager.

### A. Backend API (`backend`)
Configure these environment variables in your staging container/PaaS runner:

| Variable | Required | Staging Example | Description |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `staging` (or `production`) | Runtime environment flag. Enables production safety guards when set to `production`. |
| `PORT` | Optional | `3000` | Server listening port (defaults to `3000` or `$PORT` injected by platform). |
| `DATABASE_URL` | **Yes** | `postgresql://user:pass@staging-db.host:5432/ecommerce_staging?schema=public` | PostgreSQL connection string for dedicated staging database. |
| `JWT_SECRET` | **Yes** | *[Secure 32+ char random string]* | Secret used to sign and verify customer/admin auth tokens. |
| `CORS_ORIGIN` | **Yes** | `https://staging.aura-store.com,https://admin-staging.aura-store.com` | Comma-separated list of allowed frontend origins for CORS headers. |
| `REDIS_URL` | Optional | `redis://staging-redis.host:6379` | Optional Redis URL for BullMQ notification queue. If omitted, worker skips gracefully. |
| `AWS_REGION` | Optional | `ap-south-1` | AWS S3 region for image uploads. Falls back to placeholder URLs if omitted. |
| `AWS_ACCESS_KEY_ID` | Optional | *[IAM Access Key]* | AWS IAM credentials with S3 bucket PutObject/DeleteObject access. |
| `AWS_SECRET_ACCESS_KEY` | Optional | *[IAM Secret Key]* | AWS IAM secret key. |
| `AWS_S3_BUCKET` | Optional | `aura-staging-media` | S3 bucket name. |
| `AWS_S3_PUBLIC_BASE_URL` | Optional | `https://cdn-staging.aura-store.com` | Optional CloudFront CDN distribution base URL without trailing slash. |
| `RAZORPAY_KEY_ID` | Optional | `rzp_test_...` | Razorpay Test Key ID. When provided, enables live Razorpay test-mode API integration. |
| `RAZORPAY_KEY_SECRET` | Optional | *[Razorpay Test Secret]* | Razorpay Test Key Secret for signature verification. |
| `RAZORPAY_WEBHOOK_SECRET`| Optional| *[Webhook Secret]* | Secret configured in Razorpay Dashboard for webhook signature verification. |

### B. Admin Panel (`admin`)
Configure these variables at **build time** (Next.js bakes `NEXT_PUBLIC_*` variables during `next build`):

| Variable | Required | Staging Example | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://staging-api.aura-store.com/api/v1` | Publicly accessible URL prefix for Backend API. |
| `PORT` | Optional | `3002` | Port for the Node.js server runner (`next start`). |

### C. User Panel (`user-frontend`)
Configure these variables at **build time**:

| Variable | Required | Staging Example | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://staging-api.aura-store.com/api/v1` | Publicly accessible URL prefix for Backend API. |
| `PORT` | Optional | `3001` | Port for the Node.js server runner (`next start`). |

---

## 3. Database Deployment & Migration Procedure

### Strict Safety Guidelines
1. **Dedicated Staging Database**: Always point `DATABASE_URL` to a distinct staging database instance (e.g. `ecommerce_staging`).
2. **Never Reset**: Never execute `prisma migrate reset` or `prisma db push --force-reset` on staging or production.
3. **Automated Migration Deployment**: Use Prisma's non-destructive deploy command:
   ```bash
   npm run db:migrate:deploy
   # Equivalent to: npx prisma migrate deploy
   ```

### Staging Database Step-by-Step Setup
1. Provision a PostgreSQL instance (PostgreSQL 15, 16, or 17).
2. Ensure the database user has permissions to create tables and indexes on schema `public`.
3. In your staging build/deploy pipeline, execute migrations before starting the backend:
   ```bash
   cd backend
   npm ci
   npm run db:migrate:deploy
   npm run build
   npm start
   ```
4. Check migration status anytime without altering data:
   ```bash
   npx prisma migrate status
   ```

---

## 4. Staging Deployment Options

The project uses standard web technologies without proprietary vendor lock-in.

### Option A: Platform as a Service (PaaS) — Recommended for Speed
- **Backend**: Render Web Service, Railway Service, or Fly.io app running `npm start`.
  - Add PostgreSQL addon (or external managed DB).
  - Add optional Redis addon (e.g. Upstash, Redis Cloud, or native Render/Railway Redis).
  - Build Command: `npm ci && npm run build`
  - Pre-Deploy Command: `npm run db:migrate:deploy`
  - Start Command: `npm start`
- **Admin Panel & User Storefront**: Vercel, Netlify, or Render Static/Node Web Service.
  - Root directory: `admin` and `user-frontend` respectively.
  - Build Command: `npm run build`
  - Environment Variable: `NEXT_PUBLIC_API_URL=https://staging-api.yourdomain.com/api/v1`

### Option B: Containerized Docker Deployment
If deploying via Docker / AWS ECS / Google Cloud Run / DigitalOcean:
- Backend runs in a lightweight Node.js 20 Alpine container.
- Run `prisma migrate deploy` as a migration task or pre-start hook.
- Frontends run using standard standalone Next.js container builds or static hosting.

---

## 5. Staging Smoke-Test Checklist

Run these checks against your staging environment once deployed.

### Step 1: Backend Health & Readiness
```bash
# 1. Liveness check (should return HTTP 200 {"status":"ok"})
curl -i https://staging-api.yourdomain.com/health

# 2. Readiness check (should return HTTP 200 {"status":"ready","checks":{"database":"up",...}})
curl -i https://staging-api.yourdomain.com/ready

# 3. API Version Banner (should return HTTP 200 {"success":true,"version":"/api/v1"})
curl -i https://staging-api.yourdomain.com/api/v1
```

### Step 2: Public Catalog & Category Endpoints
```bash
# 4. Public active categories
curl -i https://staging-api.yourdomain.com/api/v1/categories

# 5. Public active products
curl -i https://staging-api.yourdomain.com/api/v1/products
```

### Step 3: Customer Authentication Flow
```bash
# 6. Request customer OTP
curl -i -X POST https://staging-api.yourdomain.com/api/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"9876543210","countryCode":"+91"}'

# 7. Verify OTP (use OTP delivered via SMS or logged in staging worker)
curl -i -X POST https://staging-api.yourdomain.com/api/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"9876543210","otp":"<OTP_RECEIVED>"}'
```

### Step 4: Admin Authentication & Management
```bash
# 8. Request Admin OTP
curl -i -X POST https://staging-api.yourdomain.com/api/v1/auth/admin/otp/send \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"<ADMIN_MOBILE>","countryCode":"+91"}'

# 9. Verify Admin OTP to receive admin JWT token
curl -i -X POST https://staging-api.yourdomain.com/api/v1/auth/admin/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"<ADMIN_MOBILE>","otp":"<OTP_RECEIVED>"}'

# 10. Query admin orders with token
curl -i https://staging-api.yourdomain.com/api/v1/admin/orders \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

### Step 5: Storefront & Admin UI Verification
- [ ] Visit `https://staging.yourdomain.com/` — Homepage renders active categories, featured products, and hero CTAs.
- [ ] Visit `https://staging.yourdomain.com/categories` — Categories index renders without 404.
- [ ] Visit `https://staging.yourdomain.com/products` — Product cards render and filter properly.
- [ ] Add item to cart, adjust quantity, test coupon code.
- [ ] Proceed to checkout with Cash on Delivery (COD) order.
- [ ] Visit `https://staging.yourdomain.com/orders` — Verify customer order appears in order history with accurate details.
- [ ] Visit `https://admin-staging.yourdomain.com/orders` — Verify order appears, test COD cash collection status transition, and enter manual shipment tracking info.

### Step 6: Third-Party Integrations (Activation Checklist)
| Integration | Staging Readiness Status | Verification Action when Configured |
|---|---|---|
| **AWS S3 Image Uploads** | `PENDING CONFIGURATION` | Admin uploads product image; verify presigned upload POST to S3 succeeds and image URL displays. (Safe fallback to placeholder images active until configured). |
| **Razorpay Test Mode** | `PENDING CONFIGURATION` | Provide `RAZORPAY_KEY_ID=rzp_test_...` and secret; test checkout with Razorpay test modal cards, verify signature and webhook event. |
| **SMS / OTP Gateway** | `PENDING CONFIGURATION` | Configure SMS provider in background worker to replace mock console log. |
| **Shiprocket External Booking**| `MANUAL WORKFLOW` | Administrator books shipment via Shiprocket dashboard and enters AWB tracking number & carrier in Admin Orders UI. |
