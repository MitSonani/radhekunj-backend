---
description: Synchronization rules between Backend, User Panel, Admin Panel and shared contracts
alwaysApply: true
---

# Multi-Repository Synchronization

The e-commerce platform contains:

- User Panel - Next.js
- Admin Panel - Next.js
- Backend - Node.js
- PostgreSQL
- Optional shared contracts package

The Backend is the source of truth for business logic and API behavior.

---

# Shared Contracts

If a shared contracts package exists, use it.

Shared contracts may contain:

- API request types
- API response types
- DTOs
- Enums
- Validation schemas
- API client types

Do NOT duplicate business types independently across repositories.

Examples:

- OrderStatus
- PaymentStatus
- ProductStatus
- UserRole
- ProductResponse
- OrderResponse
- CartResponse

---

# API Changes

Before changing an existing API:

1. Search User Panel consumers.
2. Search Admin Panel consumers.
3. Check shared contracts.
4. Check tests.
5. Determine whether the change is breaking.
6. Update affected consumers.

Do not remove or rename an API field without checking all consumers.

---

# Cross-System Features

When implementing a feature that affects multiple systems, think through the complete flow.

Example:

Adding a product field:

Database
→ Backend model/schema
→ Backend service
→ API response
→ Shared contract
→ Admin Panel form
→ User Panel display

Another example:

New order status:

Database enum/value
→ Backend
→ API contract
→ Admin Panel
→ User Panel
→ Tests

---

# Business Logic

Business logic belongs in the Backend.

Do not duplicate:

- pricing
- discount calculations
- tax calculations
- inventory rules
- coupon rules
- order rules
- payment verification
- refund rules
- authorization

in frontend applications.

---

# Contract Stability

Treat API contracts as contracts between repositories.

Before changing a response:

1. Search all consumers.
2. Identify breaking changes.
3. Update shared types.
4. Update consumers.
5. Update tests.

Prefer backward-compatible changes when practical.

---

# Feature Completion

If a feature affects:

- database
- backend
- user panel
- admin panel

do not consider the feature complete until all required layers are handled.

Never modify only the currently open repository and assume the entire feature is finished.---
alwaysApply: true
---
