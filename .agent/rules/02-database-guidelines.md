# Database Guidelines

## Schema Management
- **Rule**: Use migrations for all schema changes.
- **Pattern**: `npx sequelize-cli db:migrate`
- **Violation**: ❌ Modifying DB directly; editing `model.js` without migration.

---

## Data Integrity
- **Rule**: Use transactions for multi-step writes.
- **Pattern**: `await sequelize.transaction(async (t) => { ... })`
- **Violation**: ❌ Partial updates leaving DB inconsistent.

---

## Performance & Optimization
- **Rule**:
  - Index foreign keys
  - **Covering Indexes**: Use composite indexes for columns frequently queried together to avoid secondary table lookups.
  - Avoid N+1 queries
  - Use connection pooling
  - **Least Privilege**: The application's database user should only have the minimum permissions required (e.g., SELECT, INSERT, UPDATE, DELETE). Prevent schema-altering permissions (DROP, ALTER, TRUNCATE) for the runtime user.
  - Use select specific attributes
    - if you need only few columns, select only those columns
  - Use pagination
  - Implement caching with Redis where possible
- **Pattern**:
  - `table.index(['user_id'])` in migrations.
  - `Model.findAll({ include: [...] })` (eager loading).
- **Violation**: ❌ Missing indexes on FKs; looping DB calls; Fetch unnecessary data; Ignore query performance.

---

## Raw Queries & SQL Injection Prevention
- **Rule**: Avoid raw SQL queries where possible (prefer ORM/Query Builder). If raw queries are necessary, **ALWAYS** use parameter binding or replacements.
- **Pattern (Sequelize)**:
  ```js
  // Use replacements for security
  const results = await sequelize.query(
    'SELECT * FROM users WHERE status = :status',
    {
      replacements: { status: 'active' },
      type: QueryTypes.SELECT
    }
  );
  ```
- **Violation**: ❌ Template literal interpolation in SQL strings: `` `SELECT * FROM users WHERE status = '${status}'` ``.

---

## ORM Selection (findAll)
- **Rule**: When using `findAll` (or any read operation), **ALWAYS** use the `attributes` property to select only the columns needed for the response.
- **Requirement**: Do not fetch the entire row if only 2-3 fields are required. This reduces memory usage and improves performance.
- **Pattern**:
  ```js
  const users = await User.findAll({
    attributes: ['id', 'name', 'email'],
    where: { isActive: true }
  });
  ```
- **Violation**: ❌ `User.findAll()` without `attributes` (fetching all columns by default).

---

## Custom Query Generator (`sqquery`)
We use a custom utility `utils/query.js` to standardize and automate database querying. This utility handles pagination, sorting, filtering, searching, and date ranges automatically.

### Rule
**ALWAYS** use the `sqquery` utility for retrieving lists of data (`getAll` endpoints) to ensure consistent API behavior.

### Usage Pattern
```javascript
import { sqquery } from "../../utils/query.js";

// Controller example:
export async function getAll(req, res, next) {
  // Usage: GET /users?page=1&limit=50&search=john&startDate=2023-01-01&status=active
  const queryOptions = sqquery(
    req.query,          // 1. Request query params
    { role: "User" },   // 2. Default/Hardcoded filters
    ["name", "email"]   // 3. Searchable columns (for ?search=term)
  );

  const data = await Model.findAndCountAll(queryOptions);
  res.send({ status: "success", data });
}
```

### Key Features & Params
1. **Pagination**:
    - `page`: Current page (default: 1).
    - `limit`: Records per page (default: 100).
2. **Sorting**:
    - `sort`: Column to sort by (default: `createdAt`).
    - `sortBy`: Order `ASC` or `DESC` (default: `DESC`).
3. **Date Filtering**:
    - `startDate` & `endDate`: Automatically filters records by `createdAt` range.
    - Logic: `createdAt >= startDate` AND `createdAt < endDate + 1 day` (inclusive of start, covers end date).
4. **Advanced Filtering (Operators)**:
    - Pass conditions like `price[gt]=100` or `status[ne]=inactive`.
    - Supported Operators:
        - `gt` (>), `gte` (>=), `lt` (<), `lte` (<=)
        - `eq` (=), `ne` (!=)
        - `between`, `notBetween`, `in`, `notIn`
5. **Search**:
    - `search`: Keyword for `LIKE` query (`%term%`) on columns defined in the 3rd argument.
6. **Auto-Cleanup**:
    - The utility automatically removes special params (`page`, `limit`, `sort`, `search`, `startDate`, etc.) from the filter object, so you can pass `req.query` directly.