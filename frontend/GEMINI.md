# Frontend Rules — React (ciri)

This file extends the root `GEMINI.md`. All global rules apply here too.
These rules are specific to the `frontend/` workspace.

## ALWAYS

- Always use functional components with hooks. Never class components.
- Always use TypeScript. Every prop, state value, event handler, and return type must be explicitly typed.
- Always use explicit return types on every function and method.
- Always define prop types with a TypeScript interface above the component, named `[ComponentName]Props`.
- Always use named exports for components. Use default exports only for route-level page components.
- Always co-locate component files: one folder per component containing the component and its `.test.tsx` file. Avoid `index.ts` barrel files; import directly from the named component file.
- Always use `useReducer` when state has more than 2 related values or complex transitions. Never chain multiple `useState` calls for related state.
- Always include a cleanup function in `useEffect` when subscribing to events, timers, or external resources.
- Always validate forms with React Hook Form for forms with 2+ fields or any submission logic. Never build manual form state with `useState`.
- Always handle three states explicitly for async operations: loading, error, success.
- Always use Tailwind CSS utility classes for styling directly within the `.tsx` file.
- Always use Vite-compatible env syntax (`import.meta.env.VITE_API_URL`). Never use `process.env`.
- Always use React Query for server state. Never fetch data directly inside `useEffect`. Strictly type the expected API response and use an array for the `queryKey`.
- Always use the project's pre-configured axios instance (`nestClient`, located at `src/api/nestClient.ts`) for all API calls inside React Query hooks. Never call bare `axios.get/post/...` directly in components or query functions.
- Always keep non-component files (types, API calls, hooks) as flat, standalone `.ts` files within their relevant feature directories. Do not create dedicated folders or `index.ts` files for them.

## NEVER

- Never use `any`. Use `unknown`, a specific type, or a generic.
- Never put business logic in components. Extract it to custom hooks or utility functions.
- Never use inline styles except for dynamic values that cannot be expressed in CSS.
- Never reach into another component's folder to import its internal files directly.
- Never use `useEffect` to sync state derived from props or other state. Use `useMemo` or derive inline.
- Never use array index as a `key` prop in lists that can be reordered or filtered.
- Never generate `.css`, `.scss`, or `.module.css` files unless explicitly instructed.

## WHEN ASKED TO CREATE A COMPONENT

1. Create the folder `src/components/[ComponentName]/`
2. Generate `[ComponentName].tsx` with typed props interface and a named export
3. Use Tailwind for styles; only fall back to `.module.css` if explicitly instructed
4. Generate `[ComponentName].test.tsx` with at minimum a render smoke test
5. If the component needs server data, generate a co-located `use[ComponentName].ts` custom hook

Do not stop after step 1.

## WHEN ASKED TO CREATE A PAGE / ROUTE

1. Create `src/pages/[PageName]/[PageName].tsx` — default export for the page component
2. Wire up the route in `src/router.tsx` — always show this change
3. If the page requires data, create `src/pages/[PageName]/use[PageName]Data.ts` using React Query

## File Naming

- Components: `PascalCase.tsx` (e.g. `UserCard.tsx`)
- Pages: `PascalCase.tsx` inside their own folder (e.g. `pages/Dashboard/Dashboard.tsx`)
- Custom Hooks: `camelCase.ts` starting with `use` (e.g. `useUserData.ts`)

## Testing Standards

- Co-locate test files directly alongside the file they test.
- Always use React Testing Library. Query by accessibility roles (`getByRole`, `getByText`, `getByLabelText`). Test user behavior, not implementation details.
- Always test custom hooks using `renderHook`. When testing components or hooks that use React Query, wrap the render in a configured test `QueryClientProvider` with retries turned off.
- Always mock network requests using MSW. Handlers live in `src/mocks/handlers.ts`; server instance in `src/mocks/server.ts`; initialized in `test/setup.ts` with `onUnhandledRequest: 'error'`. Never create a new MSW server inside a test file. Never let a test make a real network request.
- Never use `any` when mocking data; use `Partial<Type>` or strict mock factories.
- Never test third-party library internals — only test how your code interacts with them.
