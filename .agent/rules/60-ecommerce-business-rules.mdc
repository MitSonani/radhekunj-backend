---
alwaysApply: true
---
---
description: E-commerce business rules for products, cart, orders, inventory, coupons and payments
alwaysApply: true
---

# E-Commerce Business Rules

The Backend is the source of truth for all e-commerce business logic.

---

# Product

A product may contain:

- name
- description
- category
- images
- variants
- SKU
- price
- discount
- inventory
- attributes
- status

Follow the actual database/business model.

Do not invent product behavior.

---

# Pricing

Never trust prices sent by the frontend.

At checkout:

1. Load current product/variant data.
2. Verify availability.
3. Retrieve authoritative price.
4. Apply valid discounts.
5. Calculate taxes.
6. Calculate shipping.
7. Calculate final total.
8. Persist the authoritative values with the order.

---

# Cart

The backend must validate:

- product exists
- product is active
- variant exists where applicable
- requested quantity is valid
- inventory is sufficient
- current price
- applicable discounts

Never trust the frontend cart total.

---

# Inventory

Inventory must never become negative.

Inventory changes must be concurrency-safe.

Consider:

- concurrent checkout
- payment failure
- order cancellation
- order expiry
- refund
- restocking

Inventory behavior must follow a clearly defined business strategy.

---

# Orders

Orders must preserve historical purchase information.

Changing the current product price must NOT change existing orders.

Order items should contain the required purchase-time values.

---

# Order Status

Keep order status separate from payment status.

Example:

PENDING
CONFIRMED
PROCESSING
SHIPPED
DELIVERED
CANCELLED

Use the project's actual enum values.

---

# Payment Status

Example:

PENDING
AUTHORIZED
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED

Do not mix payment and fulfillment state into a single field unless explicitly required.

---

# Checkout

Checkout must be treated as a critical operation.

Consider:

- duplicate requests
- concurrent inventory changes
- price changes
- coupon expiration
- payment failure
- payment timeout
- retries
- webhook delivery
- order creation failures

Use transactions and idempotency where appropriate.

---

# Coupons

Validate coupons on the backend.

Check:

- active status
- expiration
- usage limit
- per-user usage
- minimum order value
- product restrictions
- category restrictions
- maximum discount
- eligibility

Never trust the discount calculated by the frontend.

---

# Payment

Never mark an order paid solely because the frontend reports success.

Use the payment provider's server-side verification and/or verified webhook.

Payment operations must be idempotent.

---

# Refunds

Refund operations must validate:

- order/payment state
- refundable amount
- previous refunds
- authorization
- provider response

Do not allow refund amount to exceed refundable amount.

---

# Deletion

Do not hard-delete records if doing so would destroy historical order/payment/audit information.

Use:

- status
- soft deletion
- archival

where appropriate.

---

# Business Logic Location

Do not duplicate these rules in User Panel or Admin Panel.

Business logic belongs in backend services.