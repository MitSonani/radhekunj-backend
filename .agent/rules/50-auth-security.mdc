---
alwaysApply: true
---
---
description: Authentication, authorization and security rules
alwaysApply: true
---

# Security Rules

The Backend is the security boundary.

Never trust the frontend.

---

# Authentication

Authentication answers:

"Who is the caller?"

Use the application's established authentication mechanism.

Do not implement authentication separately inside every feature.

---

# Authorization

Authorization answers:

"Is this user allowed to perform this operation?"

Authentication alone is not authorization.

Every protected operation must verify permissions.

---

# Resource Ownership

Always verify ownership where applicable.

Example:

GET /orders/:orderId

must verify that the authenticated customer is allowed to access that order.

Never assume possession of an ID grants access.

---

# Admin Authorization

Admin endpoints must verify:

- authentication
- admin role/permission
- resource-level permissions where applicable

The Admin Panel UI is not a security boundary.

---

# Passwords

Passwords must be securely hashed.

Never:

- store plaintext passwords
- return passwords
- log passwords
- send password hashes to frontend clients

---

# Secrets

Never hardcode:

- JWT secrets
- database passwords
- payment secrets
- SMTP credentials
- cloud credentials
- private API keys

Use environment variables or proper secret management.

---

# SQL Injection

Never concatenate user input into SQL.

Use:

- parameterized queries
- safe ORM methods
- validated query builders

---

# Mass Assignment

Do not blindly pass request bodies into database update/create operations.

Explicitly map allowed fields.

Example:

Do NOT:

user.update(req.body)

Prefer explicitly allowed fields.

---

# Rate Limiting

Rate-limit sensitive operations:

- Login
- Signup
- OTP
- Password reset
- Payment
- Coupon abuse
- Other high-risk endpoints

---

# CORS

Use explicit allowed origins.

Do not use unrestricted CORS in production unless there is a deliberate reason.

---

# Payment Security

Never trust:

paymentStatus = "success"

from the browser.

Verify payment using trusted backend mechanisms.

Payment secrets must remain server-side.

---

# Webhooks

Webhook endpoints must:

1. Verify signature/authenticity.
2. Validate payload.
3. Handle duplicate delivery.
4. Be idempotent.
5. Update database safely.
6. Return appropriate status.

Never process an unverified payment webhook as trusted.