---
alwaysApply: true
---
---
description: Backend performance and scalability rules
alwaysApply: false
---

# Performance Rules

Do not optimize blindly.

First understand the actual bottleneck.

---

# Database

Avoid:

- N+1 queries
- SELECT *
- unnecessary queries
- loading huge datasets
- missing indexes on high-frequency query paths

Use EXPLAIN/EXPLAIN ANALYZE when investigating query performance.

---

# Pagination

Never return unbounded large collections from APIs.

Use pagination for:

- products
- users
- orders
- transactions
- logs
- reports

---

# Caching

Use Redis/cache only when there is a real benefit.

Good candidates may include:

- frequently requested relatively stable data
- sessions
- rate limits
- temporary checkout data
- expensive computed data

Do not cache mutable business-critical data without a clear invalidation strategy.

---

# Cache Invalidation

If caching is introduced, explicitly define:

- cache key
- TTL
- invalidation conditions
- stale-data behavior

Do not introduce caching without understanding consistency requirements.

---

# External APIs

External service calls can fail or become slow.

Handle:

- timeouts
- retries where safe
- provider errors
- duplicate requests
- rate limits

Do not retry non-idempotent operations blindly.

---

# Background Jobs

Long-running or non-critical work should use background jobs where appropriate.

Examples:

- emails
- notifications
- reports
- image processing
- asynchronous integrations

Do not block critical HTTP requests unnecessarily.

---

# Concurrency

Think about concurrent requests for:

- inventory
- coupons
- payments
- order creation
- refunds

Do not assume requests execute sequentially.