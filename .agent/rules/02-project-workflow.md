---
alwaysApply: true
---

# API Design & Standards

## Health & Readiness Checks
- **Rule**: Every project **MUST** include both `/health` and `/ready` endpoints.
- **Liveness (`/health`)**:
  - **Purpose**: Verifies if the process is alive.
  - **Requirement**: Returns `200 OK` immediately if the server is running.
- **Readiness (`/ready`)**:
  - **Purpose**: Verifies if the system is ready to handle traffic.
  - **Requirement**: Must verify critical dependencies:
    - Database connection status.
    - Redis connection (if used).
    - Message queue connectivity (if used).
  - **Behavior**: Returns `200 OK` only if ALL critical dependencies are healthy. If any dependency is degraded, return `503 Service Unavailable`.
- **Purpose**: Enables automated monitoring and robust liveness/readiness orchestration in containerized environments (AWS ECS, Kubernetes).

---

## Advanced API Patterns

- **Field Selection**: Support `?fields=id,name` to allow clients to request only the data they need, reducing bandwidth and improving database performance (use the utility to select only these columns in the DB query).
- **Bulk Operations**: When processing multiple resources, use dedicated bulk endpoints (e.g., `POST /users/bulk`) and database `bulkCreate`/`bulkUpdate` methods instead of looping individual API calls.

---

## Standard Status Codes
- **Rule**: Use these status codes consistently across all modules:

| Code | Usage | Example |
|------|-------|---------|
| **200** | Success | Standard response for GET, PUT, PATCH |
| **201** | Created | Successful POST (resource creation) |
| **204** | No Content | Successful DELETE (no body returned) |
| **400** | Bad Request | Validation errors, malformed input |
| **401** | Unauthorized | Missing or invalid auth token |
| **403** | Forbidden | Valid token but insufficient permissions |
| **404** | Not Found | Resource does not exist |
| **409** | Conflict | Duplicate resource (e.g., email already exists) |
| **422** | Unprocessable | Validation or semantic errors (standard for modern APIs) |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Error | Unexpected server failures |