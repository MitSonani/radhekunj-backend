---
alwaysApply: true
---
---
description: REST API design and consistency rules
alwaysApply: false
---

# API Rules

Use consistent REST API conventions.

Examples:

GET    /api/products
GET    /api/products/:id
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id

---

# Naming

Use plural resource names where appropriate:

/products
/orders
/users
/categories
/coupons

Avoid inconsistent naming such as:

/getProducts
/createProduct
/removeProduct

unless the existing API architecture explicitly uses RPC-style endpoints.

---

# HTTP Methods

Use HTTP methods according to their intended semantics.

GET
→ Retrieve data

POST
→ Create or execute an operation

PATCH
→ Partial update

PUT
→ Full replacement when appropriate

DELETE
→ Delete/deactivate a resource when appropriate

---

# HTTP Status Codes

Use appropriate status codes.

200
Successful request

201
Resource created

204
Successful request with no response body

400
Invalid request

401
Authentication required

403
Authenticated but not authorized

404
Resource not found

409
Conflict

422
Validation/business validation failure where appropriate

429
Rate limited

500
Unexpected server error

Do not return HTTP 200 for every response.

---

# Response Consistency

Use the project's existing response format.

Do not create a new response structure for every endpoint.

Success responses should be predictable.

Error responses should be predictable.

---

# Pagination

Large collections must support pagination.

Use a consistent approach.

Example:

?page=1&limit=20

Where appropriate, return:

- items/data
- page
- limit
- total
- totalPages

---

# Filtering

Use query parameters for filtering.

Example:

/products?categoryId=123&status=active

Validate filter values.

Never blindly pass user-provided filters to database queries.

---

# Sorting

Only support explicitly allowed sorting fields.

Never directly use arbitrary user input in SQL ORDER BY clauses.

Whitelist allowed sort fields.

---

# API Contract Changes

Before modifying an existing endpoint:

1. Search User Panel.
2. Search Admin Panel.
3. Check shared contracts.
4. Check tests.
5. Determine whether the change is breaking.

Do not remove or rename fields casually.