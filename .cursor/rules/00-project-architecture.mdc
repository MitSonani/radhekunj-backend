---
alwaysApply: true
---
---
description: Core architecture rules for the e-commerce Node.js backend
alwaysApply: true
---

# Backend Architecture Rules

This is the backend for a production e-commerce application.

Technology:

- Node.js
- TypeScript where supported by the project
- PostgreSQL
- Redis where required
- REST APIs
- External services such as payment, email, shipping, storage, etc.

The Backend is the source of truth for:

- Business logic
- Authentication
- Authorization
- Pricing
- Discounts
- Coupons
- Cart calculations
- Orders
- Inventory
- Payments
- Refunds
- User permissions

---

# Architecture

Follow this general flow:

Route
→ Middleware
→ Controller
→ Service
→ Repository / Data Access
→ Database

External services should be accessed through dedicated service/integration modules.

Example:

Controller
→ OrderService
→ OrderRepository
→ PostgreSQL

PaymentService
→ PaymentProvider

EmailService
→ EmailProvider

---

# Responsibilities

## Routes

Routes should define:

- HTTP method
- Endpoint
- Middleware
- Validation
- Controller

Routes must NOT contain business logic.

---

## Controllers

Controllers should be thin.

Controllers should:

1. Read request data.
2. Call the appropriate service.
3. Return the response.

Controllers should NOT contain:

- Complex business logic
- Large SQL queries
- Pricing calculations
- Inventory calculations
- Payment logic
- Complex authorization logic

---

## Services

Services contain business logic.

Examples:

- ProductService
- CartService
- OrderService
- PaymentService
- CouponService
- InventoryService
- UserService

Services may coordinate:

- repositories
- transactions
- external services
- business validation

---

## Repository / Data Access

Repositories are responsible for database access.

Repositories should contain:

- SQL queries
- ORM queries
- database-specific operations

Repositories should NOT contain business decisions.

Bad:

repository decides whether a coupon is valid.

Good:

CouponService decides whether coupon is valid.
CouponRepository retrieves coupon data.

---

# Reusability

Before creating a new:

- service
- repository
- utility
- middleware
- helper
- validation schema

search the existing project first.

Do not create duplicate implementations.

Follow established project patterns.

---

# New Feature Workflow

Before implementing a feature:

1. Inspect existing architecture.
2. Search for similar features.
3. Identify affected database tables.
4. Identify required API endpoints.
5. Identify validation requirements.
6. Identify authorization requirements.
7. Identify transaction requirements.
8. Identify external integrations.
9. Identify User Panel/Admin Panel impact.
10. Implement using existing patterns.

Do not immediately start writing code without understanding the existing implementation.

---

# Changes

Prefer small, focused changes.

Do not:

- rewrite unrelated files
- rename unrelated functions
- restructure the entire project
- introduce unnecessary libraries
- change existing API contracts without checking consumers

unless explicitly required.