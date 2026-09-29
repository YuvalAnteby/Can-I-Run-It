# Backend Rules — NestJS (ciri)

This file extends the root `AGENTS.md`, all global rules apply here too.
These rules are specific to the `backend/` workspace.

## Directory Structure

```
src/
├── common/   ← decorators, filters, guards, interceptors, pipes, interfaces
├── config/   ← configuration files and validation schemas
├── modules/  ← feature modules (cpu, gpu, etc.) each in their own folder
└── shared/   ← services and constants reused across modules
```

## ALWAYS

- Use constructor injection. Never use property injection.
- Every controller method must delegate to a service. Zero business logic in controllers.
- Every DTO must use `class-validator` decorators. Use `@Type()` from `class-transformer` for nested objects or dates, and `@Transform()` for value coercion (e.g. trimming strings). No plain interfaces for request bodies.
- Maintain a split-controller architecture where necessary. If an admin tool requires different endpoints than a standard user route, split them into separate controllers instead of merging them.
- Always use standard NestJS `HttpException` classes (or custom exceptions extending them) for error handling.
- Always use the built-in NestJS `Logger`. Never use `console.log`, `console.warn`, or `console.error`. Prefer using instance for scoping the orginating class.

# NEVER

- Never generate a module without registering it.
- Never skip the `imports` array when creating a `@Module`.

## Swagger

- Swagger is enabled at `/api/docs`.
- Always decorate controllers, DTOs and entities with appropriate swagger tags

## Testing Standards

- Co-locate unit tests next to the file they test (e.g., `users.service.spec.ts` next to `users.service.ts`).
- Mock all external dependencies, especially TypeORM repositories. Never connect to a real database in a unit test.
- For E2E tests, use Supertest with a dedicated test database environment.
- Always generate a basic `.spec.ts` for every new Service, Controller, and Guard.
