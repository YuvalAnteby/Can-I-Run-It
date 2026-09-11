# Frontend Rules — React (ciri)

This file extends the root `AGENTS.md`, All global rules apply here too.  
These rules are specific to the `frontend/` workspace.

## ALWAYS

- Always use TypeScript. Every prop, state value, event handler, and return type must be explicitly typed.
- Always define prop types with a TypeScript interface above the component, named `[ComponentName]Props`.
- Always use Tailwind CSS utility classes for styling directly within the `.tsx` file.
- Always handle three states explicitly for async operations: loading, error, success.
- Always keep non-component files (types, API calls, hooks) as flat, standalone `.ts` files within their relevant feature directories. Do not create dedicated folders or `index.ts` files for them.
- Always keep non-component files (types, API calls, hooks) as flat, standalone `.ts` files within their relevant feature directories.
- Always use the project's pre-configured axios instance (`nestClient`, located at `src/api/nestClient.ts`) for all API calls inside React Query hooks.
- Always use React Query for server state. Never fetch data directly inside `useEffect`. Strictly type the expected API response and use an array for the `queryKey`.
- Always validate forms with React Hook Form for forms with 2+ fields or any submission logic. Never build manual form state with `useState`.

## NEVER

- Never put business logic in components. Extract it to custom hooks or utility functions.
- Never use `useEffect` to sync state derived from props or other state. Use `useMemo` or derive inline.
- Never use inline styles except for dynamic values that cannot be expressed in CSS.
