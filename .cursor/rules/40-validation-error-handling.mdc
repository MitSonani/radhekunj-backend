---
alwaysApply: true
---
---
description: Backend validation, errors and exception handling rules
alwaysApply: true
---

# Validation Rules

Validate all external input.

Input sources include:

- request body
- route parameters
- query parameters
- headers where applicable
- webhook payloads

Never trust frontend validation.

---

# Validation Location

Validate requests at the API boundary.

Business validation belongs in services.

Example:

Schema validation:

email must be valid

Business validation:

email already belongs to another user

Do not mix all validation into controllers.

---

# Error Handling

Use centralized error handling.

Do not create random error-response structures in individual controllers.

Errors should provide:

- appropriate HTTP status
- safe client-facing message
- internal debugging context

---

# Client Errors

Examples:

Invalid input
→ 400/422 depending on project convention

Authentication missing/invalid
→ 401

Permission denied
→ 403

Resource doesn't exist
→ 404

Business conflict
→ 409

Rate limit
→ 429

---

# Internal Errors

Unexpected errors should result in a safe 500 response.

Do NOT expose:

- stack traces
- SQL queries
- database schema
- file paths
- internal service details
- secrets

in production API responses.

---

# Logging Errors

Log enough information to diagnose the issue.

Include appropriate context such as:

- request ID
- endpoint
- operation
- user ID where appropriate
- error name/message

Never log:

- passwords
- access tokens
- refresh tokens
- payment secrets
- unnecessary sensitive data

---

# Don't Hide Errors

Never do:

try {
    await operation();
} catch {
    // ignore
}

unless there is a deliberate and documented reason.

Every caught error must either:

- be handled
- be transformed
- be logged appropriately
- be rethrown

---

# Error Consistency

Do not create different error formats for every service.

Use the existing application error mechanism.

Before creating a new custom error class, check whether an existing one already solves the problem.