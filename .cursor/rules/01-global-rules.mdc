---
alwaysApply: true
---
# Backend Development Guidelines

> **Agent instructions — Express backend engineer:**
>
> You are a skilled backend engineer experienced with Software Architecture, Node.js, Express.js, Sequelize ORM, MySQL, PostgreSQL, Redis, AWS, Firebase, Socket.io, Joi, and best practices in Security and Scalability.
>
> This file contains the project's backend guidelines: naming conventions, coding patterns, validation rules, project layout, linting/formatting, testing expectations, and a database-change checklist.
>
> Use this file as the authoritative style guide and checklist for backend edits and agent-generated artifacts.
>
> ---
>
> ## Runtime & Environment Requirements
> - **Node.js**: Version 20.x (LTS) or higher is required.
> - **Package Manager**: Use `npm` (or `yarn`/`pnpm` if specified in project root).
> - **Version Management**: Every project must include a `.nvmrc` file in the root directory.

---

## External Guides - Read When Needed

**Read these guides ONLY when working on related tasks:**

- **[project-workflow.md](./project-workflow.md)** - Read when: Planning features, handling unclear requirements, making architectural decisions, understanding agent permissions
- **[api-standards.md](./api-standards.md)** - Read when: Creating API endpoints, designing REST APIs, handling HTTP responses, implementing health checks
- **[file-structure.md](./file-structure.md)** - Read when: Creating new modules, organizing files, setting up projects, understanding where to place new code
-  **[database-guidelines.md](./database-guidelines.md)** - Read when: Working with models, creating migrations, optimizing queries, using the `sqquery` utility

---

## JavaScript Development Rules & Best Practices Ruleset

### Naming Conventions

#### Variables
- **Rule**: Use `camelCase` for all variable names
- **Format**: `firstName`, `userEmail`, `isActive`
- **Requirement**: Lowercase first word, capitalize subsequent words
- **Violation**: ❌ `first_name`, `FirstName`, `firstName_`

#### Functions & Methods
- **Rule**: Use `camelCase` with descriptive verb prefixes
- **Format**: `getUserData()`, `calculateTotal()`, `validateEmail()`
- **Verb Prefixes**:
  - `get` → retrieve data
  - `set` → assign value
  - `is/has` → return boolean
  - `calculate` → compute result
  - `validate` → check validity
  - `format` → transform data
  - `fetch` → retrieve from server
  - `handle` → event handlers
- **Requirement**: Name must clearly indicate function purpose
- **Violation**: ❌ `userData()`, `total()`, `check()`

#### Constants
- **Rule**: Use `UPPER_CASE` with underscores for true constants
- **Format**: `MAX_RETRY_COUNT`, `API_BASE_URL`, `DEFAULT_TIMEOUT`
- **Application**: Use only for module-level constants that never change
- **Violation**: ❌ `maxRetryCount`, `max_retry_count`, `Max_Retry_Count`

#### Boolean Variables
- **Rule**: Prefix with `is`, `has`, `can`, `should`, `does`
- **Format**: `isActive`, `hasPermission`, `canDelete`, `shouldRetry`, `doesExist`
- **Requirement**: Name must clearly indicate true/false meaning
- **Violation**: ❌ `active`, `permission`, `delete`

#### File Names
- **Rule**: Use `camelCase` for filenames (no spaces or underscores)
- **Format**: `publicRoutes.js`, `dataProcessor.js`, `apiClient.js`
- **Requirement**: Reflect main functionality
- **Violation**: ❌ `UserProfile.js`, `user-profile.js`, `user_profile.js`

#### Private Variables & Methods
- **Rule**: Prefix with underscore `_` for internal-use indicators
- **Format**: `_internalCache`, `_processData()`, `_validateInput()`
- **Note**: JavaScript doesn't enforce true privacy; use `#` for true private fields
- **Private Fields**: Use `#fieldName` syntax (ES2022+)
- **Violation**: ❌ Exposing internal logic without prefix

---

### Code Organization & Structure

#### Module Structure
- **Rule**: One primary responsibility per file
- **Requirement**: Keep files focused and maintainable
- **Pattern**: Export single responsibility or related utilities
- **Violation**: ❌ Mixing unrelated features in one file

- **Rule**: Use ES6 modules (`import`/`export`) exclusively.
- **Requirement**: Ensure `"type": "module"` is set in `package.json`.
- **Format**:
  ```js
    import { getUser, createUser } from './services/userService.js';
    export const processLog = (log) => { /* ... */ };
    export default logger;
  ```
- **Violation**: ❌ Using CommonJS `require()` or `module.exports`.

#### Avoid Global Scope
- **Rule**: Encapsulate code in modules or functions
- **Requirement**: No global variables except constants
- **Pattern**: Use IIFE, modules, or namespaces
- **Violation**: ❌ `global.myVar = value`, `var x = 1` at root level

---

### Variable & Memory Management

#### Variable Declaration
- **Rule**: Use `const` by default, `let` when reassignment needed, never `var`
- **Pattern**:
```js
  const maxRetries = 3;      // Immutable
  let currentRetry = 0;      // Mutable
  const config = {};         // Const object (properties can change)
```
- **Requirement**: Always declare at narrowest scope possible
- **Violation**: ❌ `var userData = {}`, `global.x = value`

#### Variable Initialization
- **Rule**: Initialize variables at declaration when practical; prefer `const` and use `let` only if reassignment is required
- **Pattern**:
```js
  let data = null; // use `let` if you will reassign later
  const config = {}; // `const` object (properties can change)
```
- **Requirement**: Explicit initialization reduces undefined references
- **Violation**: ❌ `let result;` then later `result = value;` (avoid when possible)

#### Scope Management
- **Rule**: Use block scope with `let`/`const` in loops and conditionals
- **Pattern**:
```js
  for (let i = 0; i < array.length; i++) { /* ... */ }
  if (condition) { const result = compute(); }
```
- **Requirement**: Prevents accidental scope pollution
- **Violation**: ❌ Using `var` in loops creating shared references

#### Variable Naming Length
- **Rule**: Balance between brevity and clarity
- **Short Names OK**: Loop counters (`i`, `j`), iterators in `.map()`
- **Descriptive Names Required**: Variables living >5 lines, parameters in functions
- **Violation**: ❌ `x`, `temp`, `data1`, `getUserDataFromAPIAndProcessIt`

---

#### Function & Method Guidelines
- **Rule**:
  - Use **Named Function Declarations** for top-level exported business logic (Controllers, Services) to ensure clear stack traces and support hoisting.
  - Use **Arrow Functions** for callbacks, array iterators (`.map`, `.filter`), and simple internal utility functions.
- **Pattern**:
```js
  // Controller/Service: Named Function
  export async function getUserProfile(userId) { 
    // ... logic
  }

  // Utility/Callback: Arrow Function
  const calculateSum = (a, b) => a + b;           
  const results = users.map(user => user.id);
```
- **Requirement**: Named functions should be the default for the primary application logic layer.
- **Violation**: ❌ Using arrow functions for all top-level service/controller exports.

#### Function Parameters
- **Rule**: Maximum 3 parameters; use object destructuring for complex arguments
- **Pattern**:
```js
  // Good: Clear parameters
  const createUser = (name, email, role) => { /* ... */ };
  
  // Better: Too many params → use object
  const createUser = ({ name, email, role, department, manager }) => { /* ... */ };
```
- **Requirement**: Prevents function signature confusion
- **Violation**: ❌ `function process(a, b, c, d, e, f, g) { }`

#### Default Parameters
- **Rule**: Use default parameters instead of inside-function checks
- **Pattern**:
```js
  const retry = (maxAttempts = 3) => { /* ... */ };
  const fetch = (url, options = {}) => { /* ... */ };
```
- **Violation**: ❌ `if (!maxAttempts) maxAttempts = 3;`

#### Return Statements
- **Rule**: Single exit point preferred; return early for error conditions
- **Pattern**:
```js
  const validate = (data) => {
    if (!data) return false;           // Early exit
    if (!data.email) return false;     // Early exit
    return true;                       // Normal exit
  };
```
- **Requirement**: Improves readability and reduces nesting
- **Violation**: ❌ Multiple nested `if` statements with return scattered

#### Pure Functions
- **Rule**: Functions should not modify external state or parameters
- **Pattern**:
```js
  // Pure: No side effects
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  
  // Impure: Modifies parameter
  const addItem = (arr, item) => {
    arr.push(item);     // ❌ Mutates parameter
    return arr;
  };
```
- **Requirement**: Easier to test, debug, and reason about
- **Violation**: ❌ Modifying parameters or global state

---

### Error Handling & Validation

#### Try-Catch Pattern
- **Rule**: Use `try...catch` for async operations and risky code
- **Pattern**:
```js
  try {
    const data = await fetchUserData(userId);
    return processData(data);
  } catch (error) {
    logger.error('Failed to fetch user', { userId, error: error.message, stack: error.stack });
    throw new ApiError(500, `User fetch failed: ${error.message}`);
  }
```
- **Requirement**: Always catch and handle errors, never swallow. Use structured logging.
- **Violation**: ❌ `catch (e) { }`, missing catch blocks, or raw `console.log`.

#### Error Objects
- **Rule**: Throw only `Error` or custom Error classes
- **Pattern**:
```js
  class ValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  }
  throw new ValidationError('Invalid email format');
```
- **Requirement**: Consistent error handling and stack traces
- **Violation**: ❌ `throw 'error'`, `throw 500`, `throw { message: 'fail' }`

#### Centralized Error Management
- **Rule**: Use a global error-handling middleware in `app.js` to catch all errors and return a standardized JSON response.
- **Requirement**: Define and use an `ApiError` or `AppError` class that extends `Error` to include properties like `statusCode` and `isOperational`.
- **Standard response format**:
  ```json
  {
    "status": "error",
    "message": "Error description",
    "stack": "..." // ONLY included if NODE_ENV is 'development'
  }
  ```
- **Violation**: ❌ Returning HTML error pages; inconsistent JSON formats across modules.

#### Input Validation & Boundary Purity
- **Rule**: All validation and sanitization must occur at the **External Boundaries** (Middleware/Routers).
- **Service Responsibility**: Services must assume that inputs they receive are already validated and sanitized by the boundary layer.
- **Example (Service Layer)**:
```js
  // Service: Assumes clean data from controller/middleware
  export async function createUser({ email, age }) {
    // Business logic only - no manual if (!email) checks
    const user = await User.create({ email, age });
    return user;
  }
```
- **Violation**: ❌ Performing manual validation (e.g., `if (!email)`) inside services or controllers instead of using schemas and middleware.

#### Input Validation & Sanitization (Joi)
- **Rule**: Validate and sanitize inputs at all external boundaries (HTTP handlers, cron jobs, queue consumers, CLI entrypoints).
- **Requirement**: Use the project's existing Joi-based validation middleware (for example `joiValidator`) at the route/handler edge — do not perform ad‑hoc validation inside service layers. Configure validation to run with `abortEarly: false`, `stripUnknown: true`, and `convert: true` so schemas return sanitized, predictable payloads.
- **Guidance**:
  - Place Joi schemas in the module-level schema file `modules/<feature>/validation.js` and reference them from route middleware.
  - Prefer named, reusable schemas and schema composition for shared shapes.
- **Sanitization & Escaping**: Validation is necessary but not sufficient — always sanitize and escape when crossing contexts:
  - Database: use parameterized queries or ORM/query-builder APIs to avoid injection.
  - Email/PDF/Output: escape user data when generating dynamic content (e.g., using a sanitizer for HTML templates) to prevent XSS.
  - Shell/OS: never interpolate user input into shell commands; use safe APIs.
- **Additional rules**:
  - Validate inbound webhooks and signed requests at the boundary (verify signature before parsing/processing).
  - Validate messages consumed from queues or topics before handing to business logic.
  - Log validation failures with contextual identifiers (request id, route), but redact sensitive values.
- **Violation**: ❌ Accepting and processing raw `req.body`/message payloads without schema validation or sanitization; performing validation inside controllers or services instead of the middleware/router edge.

#### Authentication Security (Passwords)
- **Rule**: **NEVER** store passwords in plain text. Use **Bcrypt** for hashing.
- **Requirement**: Use a salt round of at least `10`.
- **Implementation**: Hash password via a Sequelize hook before saving to the database.
- **Violation**: ❌ Storing plain password; using weak hashing algorithms (MD5, SHA1).

#### Defensive Programming
- **Rule**: Check for null/undefined before accessing properties
- **Pattern**:
```js
  // Safe: Optional chaining
  const userName = user?.profile?.name ?? 'Guest';
  
  // Safe: Nullish coalescing
  const count = data?.items?.length ?? 0;
```
- **Requirement**: Prevents "Cannot read property of undefined" errors
- **Violation**: ❌ `user.profile.name` without checks

---

### Performance Optimization

#### Loop Optimization
- **Rule**: Avoid nested loops; extract loop body to separate function if complex
- **Pattern**:
```js
  // Good: Single loop with method
  const results = users.map(processUser);
  
  // Avoid: Nested loops
  users.forEach(user => {           // ❌ Avoid
    groups.forEach(group => {
      // Complex logic
    });
  });
```
- **Requirement**: Reduces computational complexity, improves readability
- **Violation**: ❌ O(n²) nested iterations

#### Array Methods Over Loops
- **Rule**: Use `.map()`, `.filter()`, `.reduce()` instead of manual loops
- **Pattern**:
```js
  // Modern: Functional approach
  const activeUsers = users.filter(u => u.isActive).map(u => u.name);
  
  // Avoid: Manual loop
  const activeUsers = [];            // ❌
  for (let i = 0; i < users.length; i++) {
    if (users[i].isActive) {
      activeUsers.push(users[i].name);
    }
  }
```
- **Requirement**: More concise, less error-prone
- **Violation**: ❌ Using manual `for` loops for simple transformations

#### Async/Await Pattern
- **Rule**: Use `async/await` instead of `.then()` chains
- **Pattern**:
```js
  // Modern: async/await
  const loadUser = async (id) => {
    const user = await fetchUser(id);
    const posts = await fetchUserPosts(id);
    return { user, posts };
  };
```
- **Requirement**: Cleaner, more readable asynchronous code
- **Violation**: ❌ `.then().then().then()` chains

---

### Code Quality Standards

#### Code Duplication (DRY Principle)
- **Rule**: Don't Repeat Yourself; extract common logic to functions
- **Pattern**:
```js
  // Before: Duplicated validation
  const createUser = (email) => {
    if (!email || !email.includes('@')) throw Error('Invalid email');
    // ...
  };
  
  // After: Extracted
  const validateEmail = (email) => {
    if (!email || !email.includes('@')) throw Error('Invalid email');
  };
  const createUser = (email) => {
    validateEmail(email);
    // ...
  };
```
- **Requirement**: Easier maintenance, reduces bugs
- **Violation**: ❌ Copy-pasting code across files

#### Magic Numbers & Strings
- **Rule**: Extract magic values to named constants
- **Pattern**:
```js
  const MAX_RETRY_ATTEMPTS = 3;
  const API_TIMEOUT_MS = 5000;
  const USER_ROLES = {
    ADMIN: 'admin',
    USER: 'user',
    GUEST: 'guest'
  };
  
  const retry = (fn) => {
    for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
      // ...
    }
  };
```
- **Requirement**: Self-documenting, easier to maintain
- **Violation**: ❌ `for (let i = 0; i < 3; i++)`, `timeout: 5000`

#### Complexity Limits
- **Rule**: Keep functions simple; break down if >40 lines or >3 nesting levels
- **Pattern**:
```js
  // Complex: Too many responsibilities
  const processOrder = (order) => {                    // ❌
    // 50 lines of logic
    if (...) {
      if (...) {
        if (...) {
          // 3+ nesting levels
        }
      }
    }
  };
  
  // Better: Broken down
  const validateOrder = (order) => { /* 5 lines */ };
  const calculateTax = (items) => { /* 8 lines */ };
  const processOrder = async (order) => {
    validateOrder(order);
    const tax = calculateTax(order.items);
    return saveOrder({ ...order, tax });
  };
```
- **Requirement**: Easier to test, understand, maintain
- **Violation**: ❌ Functions >40 lines with deep nesting
---

### Testing & Documentation

#### JSDoc Comments
- **Rule**: Document public functions with JSDoc
- **Pattern**:
```js
  /**
  * Fetches user data from API
  * @param {string} userId - The user ID to fetch
  * @param {Object} options - Configuration options
  * @param {number} options.timeout - Request timeout in ms (default: 5000)
  * @returns {Promise<Object>} User data object
  * @throws {Error} If user not found or request fails
  * @example
  * const user = await getUser('123', { timeout: 3000 });
  */
  const getUser = async (userId, options = {}) => { /* ... */ };
```
- **Requirement**: IDE autocomplete, developer knowledge
- **Violation**: ❌ No documentation, misleading docs

#### Type Safety
- **Rule**: Use JSDoc types for better IDE support
- **Pattern**:
```js
  /**
   * @typedef {Object} User
   * @property {number} id
   * @property {string} name
   * @property {string} email
   */
  
  /**
   * @param {User} user
   * @returns {Promise<void>}
   */
  const saveUser = async (user) => { /* ... */ };
```
- **Requirement**: Catches type errors, improves DX
- **Violation**: ❌ No type hints, loose typing

---

### Modern ES6+ Standards

#### Template Literals
- **Rule**: Use backticks and template literals for strings
- **Pattern**:
```js
  const message = `Hello, ${name}!`;
  const multiline = `
    Line 1
    Line 2
    Line 3
  `;
```
- **Violation**: ❌ String concatenation `'Hello, ' + name + '!'`

#### Destructuring
- **Rule**: Use destructuring for objects and arrays
- **Pattern**:
```js
  // Object destructuring
  const { name, email, age } = user;
  const { id, ...rest } = data;
  
  // Array destructuring
  const [first, second, ...rest] = array;
  const [, , third] = array;  // Skip first two
```
- **Requirement**: Cleaner, more concise code
- **Violation**: ❌ `const name = user.name; const email = user.email;`

#### Spread Operator
- **Rule**: Use spread syntax for copying objects/arrays
- **Pattern**:
  // Object spread
  const updatedUser = { ...user, email: '<new@example.com>' };
  
  // Array spread
  const allItems = [...items1, ...items2];
  
  // Function arguments
  const result = Math.max(...numbers);
- **Requirement**: Non-mutating updates, immutability
- **Violation**: ❌ Direct mutations `user.email = 'new@example.com'`

#### Optional Chaining & Nullish Coalescing
- **Rule**: Use `?.` for safe property access, `??` for null defaults
- **Pattern**:
  const roleName = user?.role?.name ?? 'Guest';
  const count = result?.rows?.length ?? 0;
- **Requirement**: Prevents "Cannot read property" errors
- **Violation**: ❌ `user.role.name` without checks
- **Defense in Depth**: Always implement validation at multiple layers — use Joi middleware at the edge AND database-level constraints (foreign keys, NOT NULL, CHECK constraints) to ensure data integrity even if the app layer is bypassed.
- **Date Standard**: Use **ISO 8601** (`YYYY-MM-DDTHH:mm:ss.sssZ`) for all date/time values in API responses.
- **Requirement**: Leverages native engine optimizations for specific data patterns.

#### Modern Data Structures (Map & Set)
- **Rule**: Use `Map` for dynamic keys or performance-sensitive lookups; use `Set` for collections of unique values.
- **Pattern**:
  ```js
  const userRoles = new Map([['admin', 1], ['editor', 2]]);
  const uniqueTags = new Set(['node', 'express', 'node']); // size: 2
  ```
- **Requirement**: Leverages native engine optimizations for specific data patterns.

#### Ternary Operators
- **Rule**: Use for simple conditions; avoid nested ternary
- **Pattern**:
```js
  // Good: Simple
  const status = isActive ? 'Active' : 'Inactive';
  
  // Avoid: Nested ternary
  const status = isActive ? 'Active' : isPending ? 'Pending' : 'Inactive';  // ❌
  
  // Better: Use if statement
  let status;
  if (isActive) status = 'Active';
  else if (isPending) status = 'Pending';
  else status = 'Inactive';
```
- **Requirement**: Code readability
- **Violation**: ❌ Multiple levels of nested ternary

#### Parallel vs Sequential Async (Promise.all / for...of)
- **Rule**: Use `Promise.all` for independent async tasks; use `for...of` (sequential awaits) when order or dependency matters.
- **Pattern**:
```js
  // Parallel: Independent tasks
  const [a, b] = await Promise.all([fetchA(), fetchB()]);
  
  // Sequential: Dependent tasks
  for (const task of tasks) {
    await step1(task);
    await step2(task);  // Ensures proper sequence
  }
```
- **Requirement**: Identify whether tasks can truly run in parallel or require strict ordering before choosing the pattern.
- **Violation**: ❌ Running dependent steps inside `Promise.all` or awaiting independent calls one-by-one.

#### Strict Equality (===)
- **Rule**: Prefer `===` and `!==` over `==` and `!=` to avoid implicit type coercion.
- **Pattern**:
```js
  // Good: Strict equality
  console.log([] === ![]);  // false (as expected)
  if (value === 0) { /* ... */ }
  
  // Bad: Loose equality with unexpected behavior
  console.log([] == ![]);   // ❌ true (due to coercion)
```
- **Requirement**: Only allow explicit, intentional conversions; comparisons should check both type and value.
- **Violation**: ❌ Relying on `==` behavior such as `[] == ![]` and other coercion edge cases.

---

### Code Quality & Practices

#### Always Read Entire Files
- **Rule**: Read the complete file before making modifications
- **Reasoning**:
  - Prevents duplicating existing code
  - Helps understand the overall architecture
  - Avoids missing important context or dependencies
  - Reduces mistakes and rework
- **Pattern**: Before editing, use tools to read full file content to understand structure and context
- **Violation**: ❌ Making edits without reviewing what already exists in the file

#### Run Linting After Major Changes
- **Rule**: Execute linting immediately after significant code modifications
- **Reasoning**:
  - Catches syntax errors early
  - Validates correct method usage
  - Identifies code style violations
  - Prevents corrupted files from propagating
- **Requirement**: Make linting a standard part of the development workflow
- **Violation**: ❌ Skipping lint checks, submitting code with warnings

#### Structured Logging
- **Rule**: **DO NOT** use raw `console.log` for production errors or request tracking.
- **Requirement**: Use a structured logging library like **Winston** or **Morgan** (or the project's standardized `utils/logger.js`).
- **Correlation IDs**: Implement a unique `x-request-id` (UUID) for every incoming request. Include this ID in every log entry and outgoing response header to enable easy tracing across multiple services or log streams.
- **Pattern**: `logger.error('Message', { requestId: req.id, meta: data })` instead of `console.log(error)`.
- **Violation**: ❌ Scattered `console.log` in production-bound code.

#### External Library Usage
- **Rule**: Validate library syntax and patterns before implementation
- **Requirement**: When working with external libraries, verify the latest syntax unless you are 100% certain the interface is stable
- **Pattern**:
  1. **Fetch Latest Docs**: Use the `context7` MCP to fetch the latest documentation for the library.
  2. **Fallback**: If `context7` is unavailable, use the `search_web` tool to find the official documentation website and read the latest usage guides.
  3. Check for recent breaking changes
  4. Test with current library version
- **Violation**: ❌ Using outdated patterns, skipping library documentation, stating "library isn't working" without investigating correct syntax
- **Special Case**: When a user explicitly requests a specific library, do NOT suggest alternatives. If it isn't working, investigate correct usage patterns instead.

---



---



---

## Database changes — agent checklist

When an agent generates or updates database-related code (models, migrations, seeds), follow these rules to avoid accidental data loss or downtime:

- **Generate a migration file for schema changes**: never alter schema by editing models only. Produce a timestamped migration script that clearly documents the intent and the rollback.
- **Do not create indexes inline with column DDL**: create indexes in a separate migration and only when explicitly requested — indexing large tables can be expensive and should be scheduled.
- **Avoid destructive operations**: do not drop or rename columns in a single migration step. Prefer: add new column → backfill data (batched) → switch reads/writes → drop old column after verification.
- **NULL → NOT NULL safely**: when setting NOT NULL, add column nullable with a default/backfill step, populate in batches, then alter to NOT NULL in a separate migration.
- **Use transactions when supported**: wrap schema and data changes in transactions where the DB supports it; for operations that cannot be transactional, document the risk and require human approval.
- **Batch large data migrations**: avoid long-running single transactions; use pagination/batching and progress logging to reduce locks and timeouts.
- **Check for duplicates before unique/index creation**: verify data cleanliness before adding UNIQUE constraints or indexes that will fail on duplicates.
- **Include a rollback / down migration**: provide an explicit reversible down script or an abort plan and document data-loss risks.
- **Document performance & risk**: each migration should include estimated runtime, affected rows, index build method (concurrent/online), and suggested maintenance window.
- **Update models and tests**: update application model definitions and any related tests or validation code to match the migration.
- **Require human confirmation for production apply**: agent may generate migration files and local test suggestions, but require explicit human confirmation to run migrations against production databases.
- **Generate seeders for new models**: when creating a new model or module, always generate a corresponding seeder file to populate dummy data for testing purposes.

---

## Postman Collection Automation

### Automate Postman Collection Sync
We use a custom automation setup to keep our Postman collection in sync with our codebase. This prevents manual updates and ensures our API documentation is always accurate.

#### Agent Responsibilities
1. **Update `postman_collection.json`**: Whenever you create or modify an API route (e.g., adding a new endpoint in Express), you **MUST** automatically regenerate or update the `postman_collection.json` file in the project root to reflect these changes.
2. **Exclude `_temp` folder**: **DO NOT** generate Postman collection entries for any routes in the `_temp` folder or any folder prefixed with `_temp`. This folder is to help us quickly scaffold a new module.
3. **Sync with Postman**: After updating the JSON file, you **MUST** run the synchronization command:
```bash
  npm run sync:postman
```
This script (`syncPostmanCollection.js`) handles the upload to Postman using the configured API key and collection UID.

#### Best Practices for `postman_collection.json`
- **Grouping**: Group endpoints by their resource or filename (e.g., all `User` routes in a "User" folder).
- **Variables**: Use variables for environment-dependent values, specifically `{{base_url}}` for the API host, `{{token}}` for the authentication token, etc.
- **Examples**: Include example request bodies and expected responses for every endpoint.
- **Methods**: Ensure the correct HTTP method (GET, POST, PUT, DELETE, etc.) is specified.
- **Headers**: Include headers for authentication (e.g., `Authorization: Bearer {{token}}`).
- **Parameters**: Clearly define path parameters (e.g., `:id`) and query parameters.
- **Scripts**: Use Pre-request and Test scripts for workflow automation.
- **Example**: On Login/Signup routes, use a Test script to save the received token to an environment variable (`pm.environment.set("token", ...)`), enabling seamless authentication for subsequent requests.

#### Workflow Summary
1. **Code Change**: Add/update an Express route.
2. **JSON Update**: Update `postman_collection.json` with the new route details.
3. **Sync Command**: Run `npm run sync:postman` to push changes to the postman.
