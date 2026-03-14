# Backend Rules — NestJS (ciri)

This file extends the root `GEMINI.md`. All global rules apply here too.
These rules are specific to the `backend/` workspace.

## ALWAYS

- Always use explicit return types on every function and method. Use `unknown`, generics, or specific types instead of `any`.
- Register every new module in `AppModule` (or its parent feature module) `imports` array. If you generate a config module, you MUST show the `AppModule` change too.
- Use constructor injection. Never use property injection.
- Every controller method must delegate to a service. Zero business logic in controllers.
- Every method that performs I/O — database, HTTP, filesystem — must be `async` and return a typed `Promise<T>`. Never `any`.
- Every DTO must use `class-validator` decorators. Use `@Type()` from `class-transformer` for nested objects or dates, and `@Transform()` for value coercion (e.g. trimming strings). No plain interfaces for request bodies.
- Maintain a split-controller architecture where necessary. If an admin tool requires different endpoints than a standard user route, split them into separate controllers instead of merging them.
- Always use standard NestJS `HttpException` classes (or custom exceptions extending them) for error handling. Never throw generic JavaScript `Error` objects in controllers or services.
- Always use the built-in NestJS `Logger`. Never use `console.log`, `console.warn`, or `console.error`.
- When performing multiple related database write operations in a service, always use TypeORM's `DataSource` or `QueryRunner` to wrap them in a transaction.
- Always apply `ValidationPipe` globally in `main.ts` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`. Never rely on per-route pipes unless there is an explicit reason to deviate.
- Always instantiate Logger as `private readonly logger = new Logger(ClassName.name)`. Prefer instance over static calls so log output is scoped to the originating class.
- Always decorate every controller with `@ApiTags('resource-name')` and every endpoint with `@ApiOperation({ summary: '...' })` and the appropriate `@ApiOkResponse` / `@ApiCreatedResponse` with a typed DTO class. Never leave an endpoint without Swagger decorators.

## NEVER

- Never use `any`. Use `unknown`, a specific type, or a generic.
- Never generate a module without registering it.
- Never put database queries in controllers.
- Never skip the `imports` array when creating a `@Module`.

## WHEN ASKED TO CREATE A MODULE

1. Generate the entity file (TypeORM, PostgreSQL)
2. Generate a custom repository if the service requires more than simple `findOne`/`save`/`find` calls
3. Generate DTOs with `class-validator` decorators
4. Generate the service
5. Generate the controller
6. Generate `.spec.ts` files for the service and controller
7. Show the updated parent module file with the new module in `imports[]`

Do not stop after step 1.

## File Naming

Always use strict kebab-case (e.g., `admin-auth.controller.ts`). Never PascalCase or camelCase for filenames.

- Controllers: `*.controller.ts`
- Services: `*.service.ts`
- Modules: `*.module.ts`
- DTOs: `*.dto.ts` — prefix with operation (e.g. `create-user.dto.ts`, `update-user.dto.ts`)
- Entities: `*.entity.ts`
- Guards: `*.guard.ts`
- Interceptors: `*.interceptor.ts`
- Pipes: `*.pipe.ts`
- Filters: `*.filter.ts`
- Interfaces: `*.interface.ts`

## Directory Structure

```
src/
├── common/   ← decorators, filters, guards, interceptors, pipes, interfaces
├── config/   ← configuration files and validation schemas
├── modules/  ← feature modules (cpu, gpu, etc.) each in their own folder
└── shared/   ← services and constants reused across modules
```

## Swagger

- Swagger is enabled at `/api/docs`.
- Non-negotiable — never generate an endpoint without Swagger decorators.

## Testing Standards

- Co-locate unit tests next to the file they test (e.g., `users.service.spec.ts` next to `users.service.ts`).
- Mock all external dependencies, especially TypeORM repositories. Never connect to a real database in a unit test.
- For E2E tests, use Supertest with a dedicated test database environment.
- Always generate a basic `.spec.ts` for every new Service, Controller, and Guard.
