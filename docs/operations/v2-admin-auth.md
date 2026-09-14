# v2 single-admin authentication

The backend has one deployment-configured administrator. It uses an async
scrypt password hash and opaque, in-memory sessions; there is no registration,
user table, JWT, Redis dependency, or role system.

## Configuration

Set these values in the untracked `infra/.env` file:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=scrypt:16384:8:1:<32 lowercase hex salt>:<128 lowercase hex key>
REACT_URL=http://localhost:3000
```

`REACT_URL` is the exact browser-facing frontend origin. Development must use
matching hostnames and ports for the frontend and this value. Production uses a
single HTTPS site, and the production Compose file refuses to start without
`REACT_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD_HASH`.

Generate a hash from hidden terminal input. Do not put the password in a shell
argument, a process command line, or source control:

```bash
read -r -s -p 'Admin password: ' ADMIN_PASSWORD
printf '\n'
printf '%s\n' "$ADMIN_PASSWORD" | npm --prefix backend run hash:admin-password
unset ADMIN_PASSWORD
```

The setup utility strips one final line ending, preserves intentional spaces,
accepts passwords from 12 through 256 characters, and prints only the fixed-cost
hash encoding. Copy the hash into `infra/.env`; never commit that file.

## HTTP contract

All auth responses send `Cache-Control: no-store`.

| Method and path | Requirements | Result |
| --- | --- | --- |
| `POST /api/v1/admin/auth/login` | JSON `username` and `password`, exact `Origin: REACT_URL`, at most 10 attempts per IP per minute | `200 { username, expiresAt }` and a session cookie |
| `GET /api/v1/admin/auth/session` | Valid session cookie | `200 { username, expiresAt }` |
| `POST /api/v1/admin/auth/logout` | Exact `Origin: REACT_URL`; a valid session is optional | `204`; revoke and clear the cookie when present |

Login validation accepts a username up to 100 characters and a password up to
256 characters. Wrong usernames and passwords return the same `401` response.
Missing or mismatched origins return `403`; missing, malformed, expired, or
revoked sessions return `401`. Login throttling returns `429` with
`Retry-After`.

The cookie is named `ciri_admin_session` and is host-only: no `Domain` is set.
It is `HttpOnly`, `Path=/api`, `SameSite=Strict`, and has `Max-Age=1800`.
`Secure` is enabled in production. Logout clears it with the matching security
attributes and without a `Max-Age` option.

`AdminGuard` protects only admin controllers. It authenticates the cookie and
attaches `{ username, expiresAt }` to the request. For `POST`, `PUT`, `PATCH`,
and `DELETE`, it also requires the exact configured Origin. CORS is not a
replacement for this check, and scripts must send the configured Origin
header explicitly.

## Frontend handoff for #67

The login form, protected routes, navigation, and sign-in UI are outside this
issue. The frontend should:

- use the existing `nestClient` with per-request `withCredentials: true` for
  login, session, logout, and future admin calls;
- initialize auth state with `GET /api/v1/admin/auth/session`;
- treat `401` as “sign-in required” and keep no token or session data in
  `localStorage`.

The browser must reach the API and frontend through matching HTTPS deployment
origins in production. Do not add a cross-domain cookie workaround.

## Rotation and lifecycle

To rotate credentials, generate a new hash, update `ADMIN_USERNAME` or
`ADMIN_PASSWORD_HASH`, and restart the backend. Restarting invalidates every
session because the store is process-local. Sessions have a 30-minute absolute
expiry and are not refreshed by reads. This deployment supports one backend
replica; moving to multiple replicas or requiring restart persistence needs a
PostgreSQL-backed session store and coordinated deployment changes.

The isolated Compose test stack supplies explicit public test-only credentials
(`test-admin` and its fixed test hash) before `AppModule` initializes. Those
values are not production defaults.
