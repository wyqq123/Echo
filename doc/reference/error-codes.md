# Error Codes

## Scope

This document records the current error behavior exposed by the backend routes.

The current backend primarily returns HTTP status codes plus a single `error` message string:

```json
{ "error": "..." }
```

There is not yet a dedicated machine-readable business error code field such as `code`.

### Column guide (active tables below)

| Column | Meaning |
|--------|---------|
| **First discovered** | Absolute calendar date (`YYYY-MM-DD`) when this row was **first** documented or when the **first confirmed incident** was observed (prod or agreed dev); use `N/A (catalog)` for stable validation messages taken only from route code. |
| **Last seen** | Absolute date of the **most recent** observed occurrence (logs, support, repro); `—` if unknown. **Update when the error fires again.** Used with the [forget policy](../../memory/metadata/forget-policy.md) for archival (T4). |
| **Prevention** | One line: how clients, deploy, or process should **avoid** recurrence (validation, config checks, tests, monitoring). |

## Current Error Model

### Standard Response Shape

- HTTP status code indicates the category
- JSON body usually contains:
  - `error`: human-readable error message

### Important Limitation

The system does not yet provide a normalized cross-route error registry. Different routes may use different message wording for similar failures.

Agents should preserve current behavior unless the task explicitly introduces a formal error-code system.

**Operational vs catalog rows:** When a row describes a **bug or incident** (not merely documented validation text), set **First discovered** and keep **Last seen** current so archival rules can apply.

## Archived entries

Resolved, low-risk rows **moved** from the tables below are listed in **`memory/archive/errors-resolved.md`** (full detail + status). This file keeps **pointers** only:

| HTTP | Message | Archived on |
|------|---------|-------------|
| _(none yet)_ | | |

_Update this mini-table whenever an entry is moved per `memory/metadata/forget-policy.md` § C._

## Current Known Errors By Area

### Auth

| HTTP | Message | First discovered | Last seen | Meaning | Suggested client handling | Prevention |
|------|---------|------------------|-----------|---------|---------------------------|------------|
| `400` | `Valid email is required` | N/A (catalog) | — | Registration email is missing or invalid | Ask user to correct email | Validate email client-side before submit. |
| `400` | `Password must be at least 8 characters` | N/A (catalog) | — | Registration password too short | Ask user to use longer password | Enforce min length in UI before API call. |
| `409` | `Email already registered` | N/A (catalog) | — | Registration conflict | Suggest login instead | Surface friendly duplicate-email flow. |
| `400` | `Email and password required` | N/A (catalog) | — | Login payload incomplete | Re-submit required fields | Disable submit until fields present. |
| `401` | `Invalid email or password` | N/A (catalog) | — | Login credentials invalid | Show retryable auth error | Rate-limit client retries; avoid logging passwords. |
| `400` | `refreshToken required` | N/A (catalog) | — | Refresh request malformed | Clear stale local session if needed | Only call refresh when token exists. |
| `401` | `Invalid or expired refresh token` | N/A (catalog) | — | Refresh token unusable | Force re-login | Rotate tokens safely; clear storage on 401. |
| `500` | `Registration failed` | N/A (catalog) | — | Unexpected register failure | Show generic server error | Monitor server logs; verify DB and env. |
| `500` | `Login failed` | N/A (catalog) | — | Unexpected login failure | Show generic server error | Same as above. |
| `500` | `Refresh failed` | N/A (catalog) | — | Unexpected refresh failure | Force re-login | Same as above. |
| `500` | `Logout failed` | N/A (catalog) | — | Unexpected logout failure | Safe to clear local session anyway | Treat as best-effort logout client-side. |

### Profile And Onboarding

| HTTP | Message | First discovered | Last seen | Meaning | Suggested client handling | Prevention |
|------|---------|------------------|-----------|---------|---------------------------|------------|
| `401` | auth middleware error | N/A (catalog) | — | Missing or invalid access token | Trigger re-auth path | Attach bearer token; refresh before expiry. |
| `404` | `User not found` | N/A (catalog) | — | Authenticated user record missing | Show blocking error and recover session | Ensure user exists server-side; avoid stale user ids. |
| `400` | `avatarUrl is too large` | N/A (catalog) | — | Avatar payload too large | Ask user to reduce image size | Compress or cap upload size client-side. |
| `400` | `avatarUrl must be a string or null` | N/A (catalog) | — | Invalid avatar field type | Fix payload | Type-check payload before PUT. |
| `400` | `displayName is required` | N/A (catalog) | — | Missing display name | Ask user to complete field | Block submit until display name set. |
| `400` | `fieldDomain is required` | N/A (catalog) | — | Missing field domain | Ask user to complete field | Same. |
| `400` | `At least one role is required` | N/A (catalog) | — | No role selected | Ask user to select at least one role | Require selection in UI. |
| `400` | `Too many roles` | N/A (catalog) | — | Too many roles selected | Enforce limit | Mirror server limit in UI. |
| `400` | `Invalid role: ...` | N/A (catalog) | — | Role outside allowed set | Fix payload source | Only send enum values server accepts. |
| `400` | `themes required when not skipping quarterly setup` | N/A (catalog) | — | Theme setup incomplete | Ask user to finish theme setup or skip | Gate theme step on skip flag. |
| `400` | `At most 3 focus themes` | N/A (catalog) | — | Too many themes submitted | Enforce UI limit | Cap selection at three. |
| `400` | `Each theme needs id and intent` | N/A (catalog) | — | Invalid theme object | Fix payload shape | Validate theme objects before save. |
| `500` | `Failed to load profile` | N/A (catalog) | — | Unexpected read failure | Show generic server error | Monitor DB and auth middleware. |
| `500` | `Failed to save onboarding` | N/A (catalog) | — | Unexpected write failure | Show generic server error | Same; verify migrations and payload size. |

### Tasks

| HTTP | Message | First discovered | Last seen | Meaning | Suggested client handling | Prevention |
|------|---------|------------------|-----------|---------|---------------------------|------------|
| `401` | auth middleware error | N/A (catalog) | — | Missing or invalid access token | Trigger re-auth path | Same as profile. |
| `400` | `tasks array required` | N/A (catalog) | — | Invalid request body | Fix client payload | Always send `tasks` array for save route. |
| `400` | `Each task needs a string id` | N/A (catalog) | — | Invalid task item | Fix client payload generation | Ensure stable string ids before PUT. |
| `500` | `Failed to load tasks` | N/A (catalog) | — | Unexpected read failure | Show generic server error | Monitor DB connectivity. |
| `500` | `Failed to save tasks` | N/A (catalog) | — | Unexpected write failure | Show generic server error | Remember full-replace semantics; validate payload. |

### Focus Themes

| HTTP | Message | First discovered | Last seen | Meaning | Suggested client handling | Prevention |
|------|---------|------------------|-----------|---------|---------------------------|------------|
| `401` | auth middleware error | N/A (catalog) | — | Missing or invalid access token | Trigger re-auth path | Same as profile. |
| `400` | `themes array required` | N/A (catalog) | — | Invalid request body | Fix client payload | Send `themes` array. |
| `400` | `Each theme needs id and intent` | N/A (catalog) | — | Invalid theme item | Fix payload shape | Validate before save. |
| `500` | `Failed to load themes` | N/A (catalog) | — | Unexpected read failure | Show generic server error | Monitor DB. |
| `500` | `Failed to save themes` | N/A (catalog) | — | Unexpected write failure | Show generic server error | Same. |

### Funnel Runs

| HTTP | Message | First discovered | Last seen | Meaning | Suggested client handling | Prevention |
|------|---------|------------------|-----------|---------|---------------------------|------------|
| `401` | auth middleware error | N/A (catalog) | — | Missing or invalid access token | Skip analytics or re-auth | Optional analytics only when authed. |
| `400` | `isSubsequent (boolean) and script required` | N/A (catalog) | — | Invalid analytics payload | Fix client payload | Send boolean + script per contract. |
| `500` | `Failed to record funnel run` | N/A (catalog) | — | Unexpected write failure | Log warning and continue | Do not block UX on analytics failure. |

### AI Proxy

| HTTP | Message | First discovered | Last seen | Meaning | Suggested client handling | Prevention |
|------|---------|------------------|-----------|---------|---------------------------|------------|
| `400` | `Missing required field: contents` | N/A (catalog) | — | Proxy payload incomplete | Fix client payload | Always include `contents` in proxy body. |
| `500` | `Missing DASHSCOPE_API_KEY on server` | N/A (catalog) | — | Server not configured for AI calls | Treat AI path as unavailable | Configure env in deploy; feature-detect AI. |
| `500` | `Qwen ... proxy error` | N/A (catalog) | — | Provider or proxy failure | Use fallback behavior where available | Retries with backoff; degrade gracefully. |

## Future Recommendation

When the project is ready, introduce a normalized format such as:

```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "error": "Invalid email or password"
}
```

Until then, use HTTP status plus message matching carefully.
