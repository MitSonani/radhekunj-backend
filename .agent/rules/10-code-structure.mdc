---
alwaysApply: true
---
---
description: Backend code organization and reusable service architecture
globs: ["**/*.ts", "**/*.js"]
alwaysApply: false
---

# Code Structure Rules

Organize code by clear responsibility.

Follow the existing project structure if one already exists.

A typical feature structure may look like:

src/
├── modules/
│   ├── users/
│   │   ├── user.routes.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.repository.ts
│   │   ├── user.schema.ts
│   │   └── user.types.ts
│   │
│   ├── products/
│   ├── categories/
│   ├── cart/
│   ├── orders/
│   ├── payments/
│   └── coupons/
│
├── shared/
│   ├── middleware/
│   ├── errors/
│   ├── utils/
│   ├── services/
│   └── constants/
│
└── config/

Do not force this structure if the existing project already follows a different consistent architecture.

---

# Single Responsibility

Each module should have a clear responsibility.

Avoid huge files such as:

product.service.ts containing:

- product logic
- category logic
- inventory logic
- coupon logic
- order logic

Split responsibilities into appropriate services.

---

# Naming

Use consistent naming.

Examples:

ProductController
ProductService
ProductRepository

OrderController
OrderService
OrderRepository

Do not randomly mix:

ProductManager
ProductHandler
ProductHelper
ProductService

for equivalent responsibilities.

---

# Utilities

Only create utilities for genuinely reusable functionality.

Do not create a utility for a single operation unless there is a strong reason.

Avoid generic files such as:

utils.ts
helpers.ts
common.ts

containing unrelated functions.

Prefer focused utilities:

money.util.ts
date.util.ts
pagination.util.ts