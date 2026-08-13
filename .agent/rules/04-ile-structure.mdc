---
alwaysApply: true
---
# Backend Codebase File Structure

## Folder Structure Explanation for Node.js Projects
A well-organized folder structure is key to building scalable and maintainable applications. Below is a recommended layout and concrete rules for each area.

Project tree (example):

```txt
project-root/
├── bin/
│   └── www                     # Server initialization
├── configs/                    # Configuration files
│   ├── db.js                   # Database configuration
│   ├── aws.js                  # AWS S3 configuration
│   ├── config.js               # Environment-specific database configuration
│   ├── redis.js                # Redis configuration
│   └── firebaseConfig.js       # Firebase configuration
├── constants/                  # Constants
├── middlewares/                # Custom middleware
│   ├── auth.js                 # Authentication middleware
│   ├── joiValidator.js         # Joi schema validator
│   ├── fileUploader.js         # File upload middleware
│   ├── rateLimiter.js          # Rate limiting
│   └── hpp.js                  # HTTP Parameter Pollution protection
├── migrations/                 # Database migrations
├── modules/                    # Feature modules
│   └── [moduleName]/
│       ├── model.js            # Sequelize model
│       ├── controller.js       # Request handlers
│       ├── service.js          # Business logic
│       ├── joiSchema.js        # Validation schemas
│       ├── constant.js         # Module constants
│       └── routers/            # Route definitions
│           └── index.js        # Main Public route for authenticated users
│           └── admin.js        # Main Admin route for authenticated users with admin role
├── public/                     # Public files
│   └── <fileName>.html         # Static files, Email templates, pdf templates
├── routes/                     # Main routing
│   ├── index.js                # Main router for public routers
│   └── v1/                     # API v1 routes
│       ├── admin.js            # Main Admin router for authenticated users with admin role
│       └── index.js            # Main API v1 router
├── scripts/                    # Utility scripts
├── seeders/                    # Database seeders for development and testing
├── services/                   # Business logic services
├── utils/                      # Utility functions
│   ├── cron.js                 # Cron jobs
│   ├── index.js                # Common utilities
│   ├── query.js                # Query builders
│   ├── sequelizeService.js    # Sequelize service
│   ├── socket.js               # Socket.IO handler
│   └── notification.js         # Notification service
├── uploads/                    # Local file storage
├── .env.example                # Environment variables example
├── .env                        # Environment variables
├── .gitignore                  # Git ignore file
├── .prettierignore             # Prettier ignore file
├── .prettierrc                 # Prettier configuration
├── .nvmrc                      # Node version (engines)
├── syncPostmanCollection.js    # Postman synchronization script
├── postman_collection.json     # Generated Postman collection
├── package.json                # Project dependencies
├── app.js                      # Express app configuration
└── README.md                   # Project documentation
```

---

## Folder rules and purpose
- **bin/**
  - **Purpose**: Contains the server entry point scripts (e.g., `www`).
  - **Rule**: This file is responsible for creating the HTTP server, setting up the port, and handling server-level errors (like `EADDRINUSE`). It should import the configured Express app from `app.js` and call `.listen()`. **Do not** put application logic here.

- **configs/**
  - **Purpose**: Centralized configuration files for external services and application settings (Database, AWS, Redis, Firebase, etc.).
  - **Rule**:
    - Each major service should have its own config file (e.g., `db.js`, `aws.js`).
    - **Security**: Never hardcode secrets. Use `process.env` to access environment variables.
    - Export configuration objects that can be easily imported by other modules.

- **constants/**
  - **Purpose**: Application-wide constants to avoid magic strings and numbers.
  - **Rule**: Store things like error codes, status strings, default values, and configuration constants that don't change between environments.

- **middlewares/**
  - **Purpose**: Reusable Express middleware functions.
  - **Rule**:
    - Common uses: Authentication (`auth.js`), Request Validation (`joiValidator.js`), File Uploads (`fileUploader.js`), Rate Limiting (`rateLimiter.js`).
    - Keep them small and focused on a single responsibility (e.g., checking a token, logging a request).
    - Always call `next()` or return a response.

- **migrations/**
  - **Purpose**: Database schema evolution scripts (Sequelize/TypeORM).
  - **Rule**:
    - Files must be timestamped to ensure correct execution order.
    - **Idempotency**: Migrations should be safe to run multiple times or have checks.
    - Always include a `down` method for rollback capabilities.

- **modules/**
  - **Purpose**: The core of the application, organized by feature/domain (Vertical Slice Architecture).
  - **Rule**: Each module (e.g., `user`, `order`, `product`) should be self-contained:
    - `model.js`: Database schema definition.
    - `controller.js`: Handles HTTP requests, parses input, calls the service, and sends responses. **No business logic here.**
    - `service.js`: Contains the business logic. Interacts with the database (Model) and other services. Returns plain objects, not HTTP responses.
    - `joiSchema.js`: Joi validation schemas for inputs.
    - `constant.js`: Module-specific constants.
    - `routers/admin.js`: Defines the routes for admin users and maps them to controller methods.
      - Note: Admin authorization is handled at a higher level; redundant role-check middleware is not required here.
    - `routers/index.js`: Defines the routes for public users and maps them to controller methods.

- **public/**
  - **Purpose**: Server-managed static assets and templates.
  - **Rule**: Use for serving assets used by the backend, such as Email templates (HTML), PDF templates, or public files/images.

- **routes/**
  - **Purpose**: Top-level route registration and API versioning.
  - **Rule**:
    - `index.js`: The main router that mounts other routers.
    - `v1/index.js`: Groups all v1 API routes.
    - Delegate actual route definitions to the `modules` (e.g., `router.use('/users', userModule.router)`).

- **scripts/**
  - **Purpose**: Standalone scripts for maintenance, cron jobs, or one-off tasks (e.g., data backfill, cleanup).
  - **Rule**: These should be runnable via `node` or `npm scripts`.

- **seeders/**
  - **Purpose**: Scripts to populate the database with initial or test data.
  - **Rule**:
  - **Requirement**: Always generate a corresponding seeder file when creating a new model or module to provide dummy data for testing.

- **services/**
  - **Purpose**: Shared business logic or integrations that don't fit into a specific module (e.g., `EmailService`, `PaymentGateway`).
  - **Rule**: These services should be generic and reusable across multiple modules.

- **utils/**
  - **Purpose**: Generic helper functions and utilities.
  - **Rule**:
    - `db.js`: Database connection logic.
    - `cron.js`: Cron job definitions.
    - `query.js`: Helper functions for building complex DB queries.
    - `socket.js`: Socket.IO configuration and handlers.
    - **Purity**: Utils should generally be pure functions or stateless helpers. Avoid business logic here.

- **uploads/**
  - **Purpose**: Temporary or permanent storage for uploaded files (if not using S3).
  - **Rule**: Ensure this directory is git-ignored.

- **app.js**
  - **Purpose**: The Express application factory.
  - **Rule**:
    - Sets up middleware (body-parser, cors, helmet).
    - Mounts the main router.
    - Configures global error handling.
    - Exports the `app` instance. **Do not start the server here.**

- **.env**
  - **Purpose**: Local environment variables.
  - **Rule**: **NEVER COMMIT THIS FILE.** Use `.env.example` as a template for other developers.
  - **Naming**: Use `UPPER_SNAKE_CASE` for all variables (e.g., `PORT`, `DATABASE_URL`).
  - **Mandatory Variables**: Every project must define `NODE_ENV`, `PORT`, `DATABASE_URL`, and `JWT_SECRET`.
  - **Environment Logic**:
    - In `production`: Set `NODE_ENV=production`. Hide stack traces in error responses.
    - In `development`: Set `NODE_ENV=development`. Enable detailed stack traces for debugging.

---

## Best-practice rules (apply across folders)
- **Single responsibility**: Each file should have one responsibility (controller — HTTP, service — business logic, model — DB mapping, utils — pure helpers).
- **Naming**: Use consistent file suffixes: `controller.js`, `service.js`, `model.js`, `routes.js`, `joiSchema.js`.
- **Route files**: Use `index.js` and `admin.js` to re-export module public and admin API's respectively; keep re-exports minimal and explicit.
- **Small modules**: Keep files small and focused; split complex logic into helper files.
- **Configuration**: Load config from environment at startup and pass explicit config objects into modules (avoid `process.env` scattered throughout the codebase).
- **Secrets**: Use a secrets manager (Vault, AWS Secrets Manager) or CI-provided secrets for production; use `.env` only for local development.

- **Lockfiles**: Commit `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` to version control to ensure reproducible installs across environments.

---

## Linting & formatting
- **Lint**: Enforce ESLint with a shared config;
- **Format**: Use Prettier and include `.prettierignore` for generated code or vendor files.

---

## Quick checklist for PRs touching structure
- Add/update module README when adding a new top-level module.
- **Add seeder**: Generate a seeder file for any new models to ensure test data is available.
- Add tests for new services/controllers.
- Update `app.js`/router index to register new routes.
- Ensure migrations are included and idempotent.

---

## Process Stability & Reliability (app.js / bin/www)
- **Uncaught/Unhandled**: Every project **MUST** handle `uncaughtException` and `unhandledRejection` to prevent silent failures or hanging processes.
- **Graceful Shutdown**: Implement a shutdown handler for `SIGTERM` and `SIGINT` that:
  1. Stops accepting new requests.
  2. Closes database and Redis connections.
  3. Exits the process cleanly after a short timeout (e.g., 10s).
- **Rule**: Use a process manager like **PM2** in production for automatic restarts and clustering.

---

## Architectural Standards & Layered Responsibility
- **Controllers (`controller.js`)**:
  - Should be "thin".
  - Handle HTTP concerns only (req/res, status codes).
  - Delegate business logic to Services.
  - Use `http-errors` for error handling (e.g., `next(createError(404, 'Not Found'))`).
- **Services (`service.js`)**:
  - Contain all business logic and database interactions.
  - Return plain objects/data, NOT HTTP responses.
  - Should be reusable and testable independent of Express.
- **Models (`model.js`)**:
  - Define database schema and associations (Sequelize/Mongoose).
  - Keep data-layer logic (hooks, scopes) here.
- **Validation (`joiSchema.js`)**:
  - Store Joi schemas for request validation.
  - Strictly validate `req.body`, `req.query`, and `req.params`.