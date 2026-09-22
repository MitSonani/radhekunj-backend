---
alwaysApply: true
---
---
description: Strict rules for backend testing and database isolation
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "tests/**/*"
  - "test/**/*"
  - "src/**/*.test.ts"
  - "src/**/*.spec.ts"
alwaysApply: true
---

# TEST DATABASE SAFETY RULES

These rules are mandatory for all backend tests.

## 1. NEVER USE DEVELOPMENT DATABASE

Automated tests MUST NEVER connect to the development database.

Development database example:

ecommerce_dev

Test database example:

ecommerce_test

Tests must only use the dedicated test database.

---

## 2. NEVER USE PRODUCTION DATABASE

Automated tests MUST NEVER connect to production.

Tests must never execute against:

- production PostgreSQL
- production Redis
- production S3
- production SMS
- production email
- production payment services

---

## 3. TEST DATABASE MUST BE EXPLICIT

Tests must explicitly load the test environment.

Do not allow tests to silently fall back to:

DATABASE_URL from normal development environment.

Prefer a dedicated:

TEST_DATABASE_URL

or:

.env.test

according to the project's environment architecture.

---

## 4. DATABASE SAFETY CHECK

Before executing database tests, verify that the connected database is the dedicated test database.

Example:

ecommerce_test

If the database is:

ecommerce_dev

or:

ecommerce_prod

FAIL IMMEDIATELY.

Never continue execution.

---

## 5. DATABASE RESET

Operations such as:

- deleteMany
- updateMany
- truncate
- DROP
- prisma migrate reset

are allowed ONLY on the dedicated test database.

Never execute these against development or production.

---

## 6. TESTS MUST NOT DEPEND ON DEVELOPMENT DATA

Tests must create their own required data.

Do not assume that manually created development records exist.

Bad:

```ts
const user = await prisma.user.findFirst();