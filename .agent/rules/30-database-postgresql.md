---
alwaysApply: true
---
---
description: PostgreSQL database design, queries, indexes and transaction rules
globs: ["**/*.sql", "**/*.prisma", "**/*repository*.ts", "**/*repository*.js", "**/*database*.ts"]
alwaysApply: false
---

# PostgreSQL Rules

PostgreSQL is the source of persistent application data.

The database must enforce important data integrity rules.

---

# Constraints

Use appropriate:

- PRIMARY KEY
- FOREIGN KEY
- UNIQUE
- NOT NULL
- CHECK

Do not rely exclusively on application validation.

Application validation improves user experience.

Database constraints protect data integrity.

---

# Naming

Use consistent snake_case database naming.

Examples:

user_id
product_id
created_at
updated_at
order_items
product_variants

Do not randomly mix camelCase and snake_case.

---

# IDs

Use the project's established ID strategy consistently.

Do not introduce a new ID format for one feature without a real reason.

---

# Timestamps

Important tables should generally have:

created_at
updated_at

Use appropriate timezone-aware timestamp types according to project conventions.

---

# Money

NEVER use floating-point database types for money.

Do not use:

FLOAT
REAL
DOUBLE PRECISION

for monetary values.

Prefer:

NUMERIC / DECIMAL

or integer smallest currency units.

Follow the project's established monetary representation consistently.

---

# SQL

Use parameterized queries.

Never build SQL using string concatenation with user input.

Bad:

SELECT * FROM users WHERE email = '${email}'

Good:

Use parameterized query values or the ORM's safe query mechanism.

---

# SELECT

Avoid:

SELECT *

Select only the columns required.

This reduces:

- network payload
- memory usage
- database work
- accidental sensitive-data exposure

---

# Indexes

Create indexes based on real query patterns.

Common candidates:

- user_id
- product_id
- category_id
- order_id
- status
- slug
- SKU
- email

Do not blindly index every column.

Indexes have:

- storage cost
- write cost
- maintenance cost

---

# Foreign Keys

Use foreign keys where relationships require database-level integrity.

Do not rely only on application code to maintain relationships.

---

# N+1 Queries

Avoid N+1 database queries.

If a loop causes one database query per item, investigate whether the data can be fetched using:

- joins
- batching
- eager loading
- appropriate aggregation

---

# Transactions

Use transactions when multiple database operations must succeed or fail together.

Examples:

- Creating an order
- Updating inventory
- Creating order items
- Processing refunds
- Changing payment state
- Multi-table user operations

---

# Inventory Concurrency

Inventory is concurrency-sensitive.

Do NOT blindly implement:

1. SELECT stock
2. calculate stock - quantity
3. UPDATE stock

without handling concurrent requests.

Use:

- atomic updates
- transactions
- row-level locking
- appropriate isolation

according to the actual requirement.

Never allow stock to become negative.

---

# Historical Data

Orders must preserve purchase-time information.

If product price changes tomorrow, yesterday's order must still show yesterday's price.

Order items should preserve relevant values such as:

- unit price
- quantity
- discount
- tax
- product/variant reference

Do not reconstruct historical order information solely from current product data.

---

# Migrations

Every schema change must use a migration.

Never rely on manually changing production tables.

Migrations must be:

- reviewable
- deterministic
- safe
- compatible with existing data

Consider migration impact on large production tables.