---
applyTo: "**/backend/**/*.ts, **/backend/**/*.js, **/backend/**/*.json, **/backend/**/*.spec.ts, **/backend/**/*.e2e-spec.ts"
description: "Apply when editing backend NestJS files: modules, services, controllers, DTOs, entities, guards"
---

# NestJS Rules — Non-Negotiable

## ALWAYS

- Always use explicit return types on every function and method. Use `unknown`, generics, or specific types instead of `any`.
- Register every new module in AppModule (or its parent feature module) imports array.
    If you generate a config module, you MUST show the AppModule change too.
- Use constructor injection. Never use property injection.
- Every controller method must delegate to a service. Zero business logic in controllers.
- Every method that performs I/O — database, HTTP, filesystem — must be async and return a typed Promise<T>. Never `any`.
- Every DTO must use class-validator decorators. Use @Type() from class-transformer for nested objects or dates, and @Transform() for value coercion (e.g. trimming strings). No plain interfaces for request bodies.
- Maintain a split-controller architecture where necessary. If an admin tool requires different endpoints than a standard user route, split them into separate controllers instead of merging them.
- Always use standard NestJS HttpException classes (or custom exceptions extending them) for error handling. Never throw generic JavaScript Error objects in controllers or services.
- Always use the built-in NestJS Logger (or the application's custom logger instance). Never use console.log, console.warn, or console.error.
- When performing multiple related database write operations in a service, always use TypeORM's DataSource or QueryRunner to wrap them in a transaction.
- Always apply `ValidationPipe` globally in `main.ts` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`. Never rely on per-route pipes unless there is an explicit reason to deviate.
- Always instantiate Logger as a private readonly class property using `private readonly logger = new Logger(ClassName.name)`. Prefer instance over static calls so log output is scoped to the originating class.
- Always decorate every controller with @ApiTags('resource-name') and every endpoint with @ApiOperation({ summary: '...' }) and the appropriate @ApiOkResponse / @ApiCreatedResponse with a typed dto class. Never leave an endpoint without Swagger decorators.

## NEVER

- Never use `any`. Use `unknown`, a specific type, or a generic.
- Never generate a module without registering it.
- Never put database queries in controllers.
- Never skip the imports array when creating a @Module.

## TESTING STANDARDS — Non-Negotiable

- **Where:** Always co-locate unit tests next to the file they test (e.g., `users.service.spec.ts` next to `users.service.ts`).
- **How (Unit):** Always use standard Jest testing practices. Mock all external dependencies, especially the TypeORM repository and custom providers. Never connect to a real database in a unit test.
- **How (E2E):** For E2E tests, use Supertest. Ensure the testing module initializes a dedicated test database environment.
- **Coverage:** Always generate a basic `.spec.ts` file for every new Service, Controller, and Guard you create.

## WHEN ASKED TO CREATE A MODULE

1. Generate the entity file (TypeORM, PostgreSQL)
2. Generate a custom repository if the service requires more than a simple TypeORM findOne/save/find call.
3. Generate DTOs with class-validator decorators
4. Generate the service
5. Generate the controller
6. Generate the `.spec.ts` files for the service and controller
7. Show the updated parent module file with the new module in imports[]
      Do not stop after step 1.

## FILE NAMING — ALWAYS follow these conventions

Always use strict kebab-case for all filenames (e.g., admin-auth.controller.ts). Never use PascalCase or camelCase for file names.

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

## DIRECTORY STRUCTURE — place new files here

src/
├── common/ ← decorators, filters, guards, interceptors, pipes, interfaces
├── config/ ← configuration files and validation schemas
├── modules/ ← feature modules (auth, users, etc.) each in their own folder
└── shared/ ← services and constants reused across modules

## OUTPUT FORMAT

- For NEW files: Output the complete file.
- For EXISTING files: DO NOT output the entire file. Output the specific newly generated code block, and explicitly state EXACTLY where it should be inserted (e.g., "Add this method below `findAll()` in `users.service.ts`").
- Ensure all generated code passes strict `tsconfig.json` and ESLint checks.

<!-- End of NestJS Instructions -->
