---
description: Backend testing standards
globs: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.js", "**/*.spec.js"]
alwaysApply: false
---

# Testing Rules

Tests should verify behavior and business outcomes.

Do not test implementation details unnecessarily.

---

# Unit Tests

Prioritize business-critical services:

- pricing
- discounts
- coupons
- inventory
- cart calculations
- order rules
- payment state transitions
- refund calculations

---

# API Tests

Test:

- successful requests
- invalid requests
- authentication failures
- authorization failures
- missing resources
- conflicts
- business validation failures
- unexpected failures

---

# Database Tests

Test important:

- constraints
- transactions
- foreign keys
- unique constraints
- inventory updates
- concurrent operations where practical

---

# E-Commerce Edge Cases

Test:

- empty cart
- out-of-stock product
- insufficient stock
- expired coupon
- invalid coupon
- coupon usage limit
- price changed before checkout
- duplicate checkout request
- payment failure
- payment timeout
- duplicate webhook
- refund exceeding paid amount
- cancelled order
- concurrent purchases

---

# Regression Tests

When fixing a bug:

1. Reproduce the bug.
2. Identify root cause.
3. Add a regression test where practical.
4. Fix the root cause.
5. Verify existing behavior.

Do not add arbitrary delays or retries simply to make a test pass.---
alwaysApply: true
---
