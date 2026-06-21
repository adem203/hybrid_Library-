# Secure Hybrid Library Platform — Full Code Explanation (PFE Defense Guide)

> Compiled from the full explanation session. Explanation only — no code was modified.
> Use this as your study + defense reference.

---

## Table of Contents

**Part 0 — Project Map**

**Part 1 — Frontend foundation**
1. `api.js` (API service layer)
2. `AuthContext.js` (auth state + JWT storage)
3. `App.js` / `ProtectedRoute` (routing + frontend RBAC)

**Part 2 — Dashboards**
4. `EtudiantDashboard.js` (student)
5. `EnseignantDashboard.js` (teacher)
6. `AdminDashboard.js` (admin)

**Part 3 — Backend controllers**
7. `emprunts.controller.js` (loans + reservations)
8. `auth.controller.js` (login, OTP, reset, users)
9. `documents.controller.js` (upload + secure streaming)
10. `livres.controller.js` (books catalog)

**Part 4 — Shared sub-views**
11. `EmpruntsView.js` (admin loans management)
12. `ReservationsView.js` (admin reservations management)
13. `CirculationViews.js` (shared My Loans / My Reservations)

**Part 5 — Middleware & services**
14. `auth.middleware.js` (JWT verification)
15. `roles.middleware.js` (RBAC)
16. `upload.middleware.js` (multer uploads)
17. `storage.service.js` (Cloudinary)
18. `brevo.service.js` (email)
19. `notifications.service.js` (notification creation)
20. `penalites.job.js` (cron jobs)
21. `server.js` (Express entry point)
22. `db.js` (PostgreSQL connection)

**Part 6 — Consolidated checklists & talking points**

---

# PART 0 — PROJECT MAP

Your project is a **full-stack web application** with two completely separate parts that talk over HTTP:

```
v2/
├── backend/                    ← Node.js + Express REST API (the "server")
│   ├── server.js               ← entry point: middleware, CORS, mounts all routes
│   └── src/
│       ├── config/
│       │   ├── db.js           ← PostgreSQL connection pool
│       │   ├── schema.sql      ← database tables
│       │   └── migrations/     ← incremental DB changes (matricule, OTP, tickets…)
│       ├── middleware/
│       │   ├── auth.middleware.js    ← verifies JWT, loads user  (AUTHENTICATION)
│       │   ├── roles.middleware.js   ← requireRole / isAdmin …    (RBAC)
│       │   └── upload.middleware.js  ← file uploads (multer)
│       ├── modules/            ← one folder per feature (routes + controller)
│       │   ├── auth/           ← login, OTP, password reset, user management
│       │   ├── livres/         ← books (catalog)
│       │   ├── documents/      ← uploaded PDFs + secure streaming
│       │   ├── emprunts/       ← loans AND reservations (core circulation)
│       │   ├── categories/  ├── stats/  ├── support/  ├── notifications/
│       ├── services/           ← brevo (email), storage (Cloudinary)
│       └── jobs/penalites.job.js  ← cron: overdue penalties
│
└── bibliotheque-frontend/      ← React single-page app (the "client")
    └── src/
        ├── App.js              ← routing + ProtectedRoute (frontend RBAC)
        ├── api/api.js          ← ALL backend calls live here (axios)
        ├── context/
        │   ├── AuthContext.js  ← logged-in user, login/logout, token storage
        │   └── ThemeContext.js ← dark/light theme
        ├── pages/
        │   ├── LandingPage/        ← public page + login/register/reset forms
        │   ├── EtudiantDashboard/  ← STUDENT (catalog, loans, reservations)
        │   ├── EnseignantDashboard/← TEACHER (+ document upload)
        │   ├── AdminDashboard/     ← ADMIN (users, books, loans, reservations)
        │   │   ├── EmpruntsView.js     (loans management)
        │   │   ├── ReservationsView.js (reservations management)
        │   │   ├── StatistiquesView.js, AdminSupportView.js, AdminSettingsView.js
        │   └── BibliothecaireDashboard/ ← legacy librarian dashboard
        ├── components/         ← Sidebar, Navbar, ProtectedRoute, DateField, circulation
        └── i18n/               ← French/English translations
```

### The 5 user roles (RBAC)
`ADMIN`, `BIBLIOTHECAIRE` (librarian, legacy), `ENSEIGNANT` (teacher), `ETUDIANT` (student), `GUEST` (no dashboard — waits for staff to upgrade them).

### How a request flows (the pattern repeated everywhere)
```
React page  →  api.js (axios, adds JWT)  →  Express route
   →  auth.middleware (verify JWT)  →  roles.middleware (check role)
   →  controller (business logic + SQL)  →  PostgreSQL  →  JSON response  →  React updates state
```

### Tech stack
- **Backend:** Express, PostgreSQL (`pg`), JWT (`jsonwebtoken`), `bcrypt`, `helmet`, `express-validator`, `multer`, Brevo (email OTP), Cloudinary (file storage).
- **Frontend:** React 18, React Router, axios, i18next, Recharts (charts).

### Biggest files (where most logic lives)
1. `EnseignantDashboard.js` — 4,323 lines (teacher)
2. `EtudiantDashboard.js` — 4,052 lines (student)
3. `AdminDashboard.js` — 3,743 lines (admin)
4. `auth.controller.js` — 1,755 lines (all auth logic)
5. `emprunts.controller.js` — 1,065 lines (loans + reservations)

---

# PART 1 — FRONTEND FOUNDATION

---

# 1. `bibliotheque-frontend/src/api/api.js`

## 1. File overview
- **What it's responsible for:** The single place that defines **how the React frontend talks to the backend**. Every HTTP request the app makes is declared here as a named function.
- **Why it exists:** Without it, every component would build its own URLs and manually attach the JWT token. Centralising means: token attached automatically in one place; base URL configured once; endpoint changes fixed here only.
- **Which roles depend on it:** All roles. Functions are grouped by feature; the backend decides (via JWT + RBAC) whether the user may call each one.
- **Which files depend on it:** `context/AuthContext.js` (authAPI), `LandingPage.js` (authAPI), the three dashboards (livresAPI, documentsAPI, empruntsAPI, statsAPI, notificationsAPI, supportAPI), components showing covers (resolveAssetUrl).

## 2. Imports
```js
import axios from 'axios';
```
- **`axios`** (only import) — HTTP client chosen over `fetch` because it supports **interceptors** (automatic JWT injection + global error handling). Remove it → entire app fails to compile.

## 3. Constants and configuration
- **`BASE_URL`** (line 3): `process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1'`. In production (Vercel) reads the deployed backend URL from an env var; locally falls back to localhost. This is how the same code runs both on laptop and in the cloud. React env vars must be prefixed `REACT_APP_` and are **baked in at build time**.
- **`API_HOST`** (line 6): `BASE_URL.replace(/\/api\/v1\/?$/, '')` — the backend host **without** `/api/v1`. Legacy static files (old covers under `/uploads/images/...`) are served outside the `/api/v1` prefix.
- **`api` instance** (lines 18–21): one pre-configured axios instance with base URL + default JSON content-type. Every call reuses it.

## 4. Helper functions
### `resolveAssetUrl(val)` (lines 11–15)
- **Input:** a stored image path or URL (book cover). **Output:** a fully usable browser URL (or `''`).
- **Logic:** (1) empty/null → `''`; (2) already `http(s)` (Cloudinary) → return unchanged; (3) relative legacy path (`/uploads/...`) → prepend `API_HOST`, adding `/` only if needed.
- **Example:** Cloudinary URL returned as-is; `/uploads/images/clean-code.jpg` → `http://localhost:5000/uploads/images/clean-code.jpg`.
- **Why useful:** app stores covers in two systems (local + Cloudinary); this hides the difference.

## Two interceptors (the security heart)
### Request interceptor (lines 24–33) — auto-attach JWT
```js
const token = localStorage.getItem('token');
if (token) config.headers.Authorization = `Bearer ${token}`;
```
- Runs before every outgoing request. Reads JWT from `localStorage` and attaches it as a `Bearer` token. You never attach the token manually anywhere else.

### Response interceptor (lines 36–61) — global 401 handling (auto-logout)
- Runs after every response. On 401 (and not a public auth path and no `skipAuthRedirect`), it clears token+user from `localStorage` and hard-redirects to `/`.
- **The exception:** keeps an allow-list of public auth paths (`/auth/login`, `/auth/forgot-password`, etc.) where a 401 is *expected* (wrong password/code) and must NOT trigger logout — otherwise a failed login would reload the page and lose the error message.
- **`skipAuthRedirect`:** optional per-request flag so a component can handle a 401 itself.
- Always re-rejects the promise so callers show their own error.

## 5. API functions — group by group
Each export is a thin one-line wrapper mapping a named action → HTTP method + URL. Backend route/middleware/controller per function (cross-referenced against the route files):

### `authAPI` (lines 64–82)
| Function | Method · Endpoint | Backend route → middleware → controller |
|---|---|---|
| `login(data)` | POST `/auth/login` | public → `loginValidation` → `login` |
| `verifyLogin(data)` | POST `/auth/verify-login` | public → `verifyOtpValidation` → `verifyLogin` |
| `resendLoginCode(data)` | POST `/auth/resend-login` | public → `resendOtpValidation` → `resendLoginCode` |
| `register(data)` | POST `/auth/register` | **`publicRegistrationDisabled` (403)** — dead |
| `verifyRegistration` | POST `/auth/verify-registration` | **403 disabled** — dead |
| `resendRegistrationCode` | POST `/auth/resend-registration` | **403 disabled** — dead |
| `forgotPassword(data)` | POST `/auth/forgot-password` | public → `forgotPassword` |
| `verifyResetCode(data)` | POST `/auth/verify-reset-code` | public → `verifyResetCode` |
| `resetPassword(data)` | POST `/auth/reset-password` | public → `resetPassword` |
| `logout()` | POST `/auth/logout` | `authMiddleware` → `logout` |
| `getMe()` | GET `/auth/me` | `authMiddleware` → `getMe` |
| `updateMe(data)` | PUT `/auth/me` | `authMiddleware` → `updateMe` |
| `changePassword(data)` | PUT `/auth/change-password` | `authMiddleware` → `changePassword` |
| `getUsers(params)` | GET `/auth/users` | `authMiddleware` + `isBibliothecaire` → `getAllUsers` |
| `createUser(data)` | POST `/auth/users` | `authMiddleware` + `isBibliothecaire` + `createUserValidation` → `createUser` |
| `updateUser(id, data)` | PUT `/auth/users/:id` | `authMiddleware` + `isBibliothecaire` + `updateUserValidation` → `updateUser` |
| `toggleBloquer(id, bloquer)` | PUT `/auth/users/:id/bloquer` | `authMiddleware` + `isBibliothecaire` → `toggleBloquerUser` |
- **Detail:** `login` data uses French field name **`mot_de_passe`** (set in `AuthContext.login`), not `password`.

### `categoriesAPI` (lines 85–92)
- `getAll`, `getById`, `getResources`, `create`, `update`, `delete`. Reads open to any logged-in user; writes are `isBibliothecaire`.

### `livresAPI` (lines 95–107) — the catalog
- `getAll(params)` GET `/livres`; `search(q,params)` GET `/livres/search`; `getRayons()`; `getById(id)`; `create(formData)` POST `/livres` (multipart, cover); `update(id, formData)` PUT (multipart); `delete(id)`.

### `documentsAPI` (lines 110–123) — PDFs + secure reading
- `getAll`, `getById`, `upload(formData)` (multipart, teacher upload), `getStreamUrl`/`getDownloadUrl` (return strings, send no request), `streamFile(id)` (blob + JWT = read online), `downloadFile(id)`, `update`, `delete`, `getMesLectures`.
- ⚠️ `getStreamUrl`/`getDownloadUrl` return raw URLs without a token; the safe path is `streamFile`/`downloadFile` (blob + token).

### `empruntsAPI` (lines 126–143) — core: loans + reservations
- Loans: `getAll`, `getMesEmprunts`, `getRetards`, `creer`, `creerAdmin`, `valider`, `refuser`, `retourner`, `annuler`, `prolonger`.
- Reservations: `reserver(data)`, `getAllReservations`, `approveReservation`, `cancelReservation`, `getMesReservations`, `annulerMaReservation`.
- **Correction:** `reserver(data)` sends a payload object (`{ id_livre }`), not a bare id.
- Route ordering: `/reservations/...` declared before `/:id/...` so Express doesn't match "reservations" as an `:id`.

### `supportAPI` (146–156), `notificationsAPI` (159–164), `statsAPI` (166–174)
- Support tickets (student/teacher create + list; admin manage), notification bell (list, unread-count, mark read), and dashboard/charts stats (most behind `isBibliothecaire`/`isAdmin`).

## 12. Security in this file
- **JWT attached:** lines 26–28 (request interceptor). **Stored:** read from `localStorage` (written in AuthContext). **Session-expiry:** lines 53–58 (clear + redirect on 401). **Public-vs-protected awareness:** lines 39–51. JWT creation, password hashing, and role checks are all backend — correct separation.
- ⚠️ Token in `localStorage` is XSS-readable (theoretical); mitigations are server-side (helmet, validation). Defensible PFE trade-off vs httpOnly cookies.

## 14. Defense
**Say:** "Centralized API service on axios. A request interceptor attaches the JWT to every request; a response interceptor logs the user out on a 401. Each backend feature has its own group of functions, and the backend enforces who can call what via JWT + role middleware."
- **Q:** "Does this file decide what a student can do?" → "No. It only sends requests and carries the token; authorization is enforced on the backend."
- **Q:** "How is the token added?" → "An axios request interceptor reads it from localStorage and sets the Authorization Bearer header automatically."

## 15. Problems / risks
1. Dead registration functions (backend returns 403). Public self-registration disabled by design.
2. `localStorage` token (theoretical XSS) — known trade-off.
3. No request timeout — a hung backend leaves UI spinning.
4. Stale `── STATS ──` comment above the support group.
None break a demo.

---

# 2. `bibliotheque-frontend/src/context/AuthContext.js`

## 1. File overview
- **Responsible for:** the app's **single source of truth for "who is logged in."** Creates a React Context holding the current user; exposes `login`, `logout`, `setSession`, `updateUserData`; persists session (token + user) in `localStorage` so a refresh doesn't log you out.
- **Roles:** all (every authenticated page reads `user`).
- **Used by:** `App.js` (wraps app + ProtectedRoute/RoleRedirect), `LandingPage.js` (login/setSession), every dashboard (read user, logout), and indirectly `api.js` (reads/clears the token this file writes).

## 2. Imports
- `createContext` (the AuthContext object), `useContext` (in `useAuth`), `useState` (`user`, `loading`), `useEffect` (restore on startup), `authAPI` (login/logout).

## 3. Constants / helpers
- **`AuthContext = createContext(null)`** — initial `null` lets `useAuth` detect use outside the provider and throw.
- **`setSession(token, userData)`** (20–25): saves JWT + user JSON to localStorage, sets `user` state, returns userData. The single function that "starts a session" in both React and the browser. Exported so LandingPage calls it after OTP verification.
- **`updateUserData(nextUser)`** (51–57): shallow-merges new fields onto previous user, persists merged user (try/catch), sets state. Used after profile edit so header updates without re-login.

## 4. State variables
- **`user`** (init `null`): the logged-in user object or `null`. Updated by `setSession`, `updateUserData`, `logout`, startup effect. Everything depends on it (ProtectedRoute, RoleRedirect, headers). `null` → treated as logged out.
- **`loading`** (init `true`): whether startup session-restore is running. While `true`, provider renders a full-screen "Chargement…" spinner. Prevents a flash of the login page on refresh.

## 5. useEffect
- **Startup session restore** (11–18): runs once on mount. Reads `user`+`token` from localStorage; if both exist, rehydrates `user`. Sets `loading=false`. No API call — trusts stored user; token validity confirmed on first protected request. Risk: unprotected `JSON.parse` could throw on corrupted storage.

## 6. Main functions
### `login(email, password)` (27–34)
- Sends `authAPI.login({ email, mot_de_passe: password })` → POST `/auth/login` (renames `password` → `mot_de_passe`).
- Two outcomes: (1) `requireOtp:true` → returns `{ requireOtp, email }`, NO session yet → LandingPage shows the code screen; (2) direct login → `setSession(token, userData)`.
- No error handling here — bubbles to LandingPage (api.js doesn't auto-redirect on `/auth/login` 401s).

### `logout()` (36–49)
- Best-effort `authAPI.logout()` (only if token exists, wrapped in try/catch → records `last_logout_at`). **Local sign-out always happens** even if the network fails: removes token+user, sets `user=null`.

### `useAuth()` (83–87)
- Reads the context; throws a clear error if used outside `<AuthProvider>`.

### Context value (line 59)
- `{ user, login, logout, setSession, updateUserData, loading, isAuthenticated: !!user }`. `isAuthenticated` is a frontend convenience only.

## 9. Full flows owned here
- **Direct login:** form → `login` → POST `/auth/login` → backend verifies + signs JWT → `setSession` → redirect.
- **OTP login:** `login` returns `{requireOtp}` (no session) → LandingPage shows code screen → `authAPI.verifyLogin` → `setSession(token,user)`.
- **Session restore:** reload → effect reads localStorage → setUser → spinner clears.
- **Logout:** `logout()` → best-effort server call → clear storage → redirect.

## 10. Security
- **JWT storage:** `setSession` line 21 (only place written). **Removal:** logout + api.js 401 interceptor. JWT creation/verification are backend. Password passes through `login` once → never stored. ⚠️ localStorage is XSS-readable (known trade-off).

## 12. Defense
**Say:** "Global auth state via React Context. Stores user + JWT, restores session from localStorage after refresh, supports two-step login: if the backend asks for an OTP, `login` returns a 'requireOtp' flag instead of creating a session, and the session is created with `setSession` only after the code is verified."
- **Q:** "How does the user stay logged in after refresh?" → "A useEffect reads token+user from localStorage; a loading flag shows a spinner until done, avoiding a login-page flash."
- **Q:** "What happens on logout if the server is unreachable?" → "Local sign-out still happens; the server call is best-effort in a try/catch."

## 13. Problems / risks
1. Unprotected `JSON.parse` on startup (corrupted storage could crash load) — low/moderate; don't hand-edit localStorage during demo.
2. Stored token not checked for expiry on restore — self-corrects via api.js 401 interceptor.
3. `password → mot_de_passe` rename (French DB/API vs English UI) — not a bug.

---

# 3. `bibliotheque-frontend/src/App.js` (+ inline `ProtectedRoute`)

> Note: `src/components/ProtectedRoute.js` is an **empty 0-byte file imported by nobody**. The real `ProtectedRoute` is defined inline in `App.js`.

## 1. File overview
- **Responsible for:** the React app root + the entire **frontend routing + access-control map**. Defines which URL renders which dashboard, who is allowed in, and where each role lands after login. Wires the theme + auth providers.
- **Roles:** all — `ADMIN → /admin`, `BIBLIOTHECAIRE → /bibliothecaire`, `ETUDIANT → /etudiant`, `ENSEIGNANT → /enseignant`. GUEST has no dashboard (stays on landing).

## 2. Imports
- `BrowserRouter as Router`, `Routes`, `Route`, `Navigate` (react-router-dom); `AuthProvider`/`useAuth`; `ThemeProvider`; the 5 page components; `global.css`.
- Provider nesting reflects import order: Theme (outer) → Auth → Router → Routes (routing depends on `useAuth`).

## 3. Constants / helpers
- **`ROLE_DASHBOARD_ROUTES`** (24–29): role → dashboard URL. **GUEST intentionally absent** (no dashboard; stays on landing).
- **`ProtectedRoute({ children, allowedRoles })`** (13–20): reads `user`; not logged in → `<Navigate to="/" replace>`; wrong role → redirect; else render children.
- **`RoleRedirect()`** (32–39): no user → `/`; dashboard role → redirect to it; no dashboard (GUEST/unknown) → render LandingPage (no loop).
- **`AppRoutes()`** (41–88): computes `hasDashboard` and renders the route table.
- **`App()`** (90–101): `<ThemeProvider><AuthProvider><Router><AppRoutes/></Router></AuthProvider></ThemeProvider>`.

## 4–5. State / Effects
- None. Reads `user` from AuthContext. No useEffect (purely declarative routing).

## 8. Route table (JSX)
- `/` → `hasDashboard ? <RoleRedirect/> : <LandingPage/>`.
- `/admin/*` → `ProtectedRoute allowedRoles={['ADMIN']}` → AdminDashboard.
- `/bibliothecaire/*` → `['BIBLIOTHECAIRE','ADMIN']` → BibliothecaireDashboard (legacy; admin ⊇ librarian).
- `/etudiant/*` → `['ETUDIANT']`; `/enseignant/*` → `['ENSEIGNANT']`.
- `*` → `<Navigate to="/" replace>` (fallback).

## 9. Flows
- **Protected navigation:** student types `/admin` → ProtectedRoute → role not ADMIN → redirect; even if bypassed, backend `isAdmin` blocks API calls.
- **Redirect after login:** user set → `hasDashboard` true → RoleRedirect → dashboard.
- **Guest stays on landing:** role GUEST → no dashboard → LandingPage.
- **Logout:** `user=null` → ProtectedRoute redirects to `/`.

## 10. Security
- **`ProtectedRoute`** is the only frontend access gate (login + role). **This is UX-level only**; real security is backend (`auth.middleware` + `roles.middleware`) re-checking on every API call. Forcing AdminDashboard to render still yields 403 on every admin request → no data leaks.

## 12. Defense
**Say:** "Routing + frontend access control. ProtectedRoute checks login + role before rendering a dashboard, otherwise redirects. RoleRedirect sends each user to the right dashboard; guests stay on the public page. This is only UX protection — the backend re-verifies JWT + role on every request."
- **Q:** "If you remove this frontend check, can a student access admin data?" → "They could render the page, but no data loads — every admin endpoint is guarded server-side and returns 403."
- **Q:** "What does `replace` do?" → "Replaces the current history entry so Back doesn't loop through redirects."

## 13. Problems / risks
1. Empty unused `components/ProtectedRoute.js` (0 bytes). The active one is in App.js.
2. Frontend-only role protection (by nature) — fine because backend enforces RBAC. Present as a strength (two-layer model).
3. Librarian dashboard accessible by BIBLIOTHECAIRE + ADMIN (intentional).
4. No explicit 403 page — silent redirect to `/` (UX choice).

---

# PART 2 — DASHBOARDS

---

# 4. `pages/EtudiantDashboard/EtudiantDashboard.js` (~4,050 lines)

## 1. File overview
- **Responsible for:** the entire student experience — home dashboard, book **catalog** (borrow/reserve/read), **digital library (GED)**, **my loans**, **my reservations**, **reading history**, **profile**, **help/support**. One big component with an internal "router" (`activeItem`) that swaps sections.
- **Roles:** ETUDIANT only.
- **Depends on:** Sidebar, Navbar, useAuth, six API groups (authAPI, livresAPI, documentsAPI, empruntsAPI, categoriesAPI, supportAPI, notificationsAPI), resolveAssetUrl, react-i18next, two CSS files.

## 2. Imports
- `useEffect/useRef/useState`; `useTranslation` (t()); Sidebar/Navbar; API groups; useAuth; student + reused admin CSS.

## 3. Constants / helpers (top ~660 lines)
- **Page sizes:** `PAGE_SIZE=10` (catalog), `GED_PAGE_SIZE=9`, `LOAN_PAGE_SIZE=5`, `RESV_PAGE_SIZE=4`, `HIST_PAGE_SIZE=10`, `CATALOGUE_FETCH_LIMIT=5000` (catalog fetched all at once, paginated client-side).
- **Date helpers:** `formatDateTimeSmart` (Today/Yesterday/full), `formatDateLong`, `formatDate`, `formatProfileDate`, `daysUntil`, `getLoanReturnInfo` (`{text,tone}` like "Overdue by 3 days").
- **Status maps:** `RESERVATION_STATUS_LABEL_KEYS` + `RESERVATION_BADGE`; `LOAN_STATUS_LABEL_KEYS` + `LOAN_BADGE`; `canCancelReservation` (EN_ATTENTE/CONFIRMEE) → shows Cancel-reservation; `canCancelLoan` (EN_ATTENTE) → shows cancel-loan.
- **Document helpers:** `getDocumentReadId` (tries id_ressource/id_document/document_id), `getDocumentFilePath`/`getDocumentFileUrl`, **`isReadableOnline(book)`** (NUMERIQUE/HYBRIDE or has format/file → shows "Read"), **`hasPhysicalCopies(book)`** (PHYSIQUE/HYBRIDE or has stock → shows Borrow/Reserve).
- **Home builders:** `buildStudentSummaryCards` (4 cards w/ availability flags), `buildRecentActivity` (merge loans+reservations+readings, top 5), `buildSuggestedResources` (top 4), `getMonthlyLectureCount`, `inferDocumentType` (regex → COURS/TP_TD/EXAMEN/CORRIGE/VIDEO/AUTRE).
- **Config tables:** `SIDEBAR_ITEMS`, `DOCUMENT_TYPE_TABS`, `SUPPORT_PROBLEM_TYPES`, `SUPPORT_FAQS`, `SUPPORT_STATUS_META`, `COVER_PALETTE` + `getCoverPlaceholder` (deterministic gradient + initials).
- **Sub-components:** `StudentHomeIcon`, `Pagination`, `InfoItem`, **`BookDetailsModal`** (footer holds Read/Borrow/Reserve gated by canRead/physical/dispo), **`LoanDetailsModal`**.

## 4. State (~45 useState)
- **Nav/notifications:** `activeItem` (init `'accueil'`), `notifications`, `unreadCount`.
- **Catalog:** `livres`, `search`, `filterCat`, `filterAvail` (`'tous'`), `sortBy` (`'pertinence'`), `page`, `availCounts`, `showAllCategories`, `selectedBook`, `loadingBook`.
- **GED:** `documents`, `documentsTotal`, `gedTypeFilter` (`'TOUS'`), `gedSearch`, `gedCategoryFilter`, `gedFormatFilter`, `gedSort` (`'recent'`), `gedPage`.
- **Loans:** `emprunts`, `selectedLoan`, `loanStatusFilter`, `loanSearch`, `loanPage`.
- **Reservations:** `reservations`, `searchRes`, `filterStatutRes`, `resvPage`.
- **History:** `lectures`, `histSearch`, `histFormat`, `histDate` (`'all'`), `histPage`, `selectedLecture`.
- **Home/profile/password/support:** `homeData` (with `availability`), `homeLoading`, `profileData`, `passwordForm`/`passwordVisibility`/`passwordSaving`, `supportTickets`/`supportForm`/etc.
- **Generic:** `categories`, `loading`, `msg` (toast), `searchInputRef`.

## 5. useEffect
1. `loadCategories()` once.
2. Notifications poll: unread count immediately, then every 30s (`setInterval`, cleaned with `cancelled` flag).
3. Section loader keyed on `activeItem`: loads the active tab's data (lazy loading).
4. Catalog loader on entering `catalogue`.
5. Five "reset to page 1 on filter change" effects.
- Several `eslint-disable exhaustive-deps` — sections refresh on tab switch.

## 6. Main functions
- **Loaders:** `loadHomeDashboard` (5 calls via `Promise.allSettled`, each result carries `available` flag → drives "data unavailable" cards), `loadStudentProfile` (getMe), `loadSupportTickets`, `loadCategories`, `loadLivres` (limit 5000, computes availCounts), `loadDocuments`, `loadEmprunts`, `loadReservations`, `loadLectures`.
- **`handleEmprunt(id_livre)`** — Borrow: `empruntsAPI.creer({ id_livre, duree_jours:14 })` → POST `/emprunts`; toast; reload catalog. Backend identifies the student from the JWT.
- **`handleReserver(id_livre)`** — Reserve: `empruntsAPI.reserver({ id_livre })` → POST `/emprunts/reservations`.
- **`handleAnnuler(id)`** — cancel pending loan → PUT `/emprunts/:id/annuler`.
- **`handleAnnulerReservation(id)`** — `window.confirm` then `annulerMaReservation(id)` → PUT `/emprunts/reservations/:id/annuler`.
- **`openBookDetails(id)`** — placeholder modal + spinner → `livresAPI.getById(id)`.
- **`handleReadDocument(document)`** ⭐ — resolve full document → `documentsAPI.streamFile(documentId)` fetches the PDF as a **blob with JWT** → object URL → `window.open` new tab → revoke after 60s. 404/popup-blocked handled. This is protected document streaming on the client.
- **`handleDownloadDocument`** — `downloadFile(id)` blob → `<a download>`; handles 404/403.
- **`handlePasswordSubmit`** — validates + `authAPI.changePassword`.
- **`handleSupportSubmit`** — validates + `supportAPI.createSupportTicket`.
- Notification handlers: `loadNotifications`, `handleMarkNotificationRead`, `handleMarkAllNotificationsRead`, `handleNotificationClick` (mark read + navigate via `sidebarItemForNotification`).
- `handleProfileEditUnavailable` (profile is admin-managed → students can't self-edit), `showMessage` (toast auto-clears after 3.5s).

## 7. Button logic
| Button | Where / condition | onClick | API | After |
|---|---|---|---|---|
| 📖 Read | catalog card + modal; if `isReadableOnline` | `handleReadDocument(l)` (stopPropagation) | GET `/documents/:id/stream` (blob) | PDF opens in new tab |
| Borrow | if `hasPhysicalCopies` & stock>0 | `handleEmprunt(id)` | POST `/emprunts` | toast, refresh |
| Reserve | if `hasPhysicalCopies` & stock<=0 | `handleReserver(id)` | POST `/emprunts/reservations` | toast |
| View details → | every card | `openBookDetails(id)` | GET `/livres/:id` | modal |
| Cancel reservation | if `canCancelReservation` | `handleAnnulerReservation(id)` | PUT `/emprunts/reservations/:id/annuler` | confirm → toast → refresh |
| Cancel loan | if `canCancelLoan` | `handleAnnuler(id)` | PUT `/emprunts/:id/annuler` | refresh |
- Card click opens details; action buttons call `e.stopPropagation()`. No Upload/Approve/Return (teacher/admin only).

## 8. JSX sections
- Sidebar (SIDEBAR_ITEMS), Navbar (bell), toast (color by ✅/❌/🔖), Home (hero, 4 summary cards, quick actions, recent activity, reading-progress + popular categories, suggested resources), Help (form + FAQ + tickets table), Catalog (IIFE filter→sort→paginate; hero, toolbar, filter sidebar, cat-grid book cards, pagination), Book card (cover/placeholder, chip, title, author, badge, action row), GED (stat cards, type tabs, toolbar, doc grid, format donut), My loans / reservations / history / profile + modals.

## 9. Flows
- **Borrow:** click → `handleEmprunt` → `creer` → POST `/emprunts` → auth.middleware → `creerDemande` → INSERT EN_ATTENTE → toast → refresh.
- **Reserve:** `reserver({id_livre})` → POST `/emprunts/reservations` → `reserverLivre`.
- **Read:** `handleReadDocument` → `streamFile(id)` (blob + JWT) → GET `/documents/:id/stream` → backend streams → Blob → object URL → window.open.

## 10. Security
- JWT auto-attached by interceptor. **Identity from token, not client** (Borrow/Reserve send only `id_livre`). Protected document streaming (`/stream`). Personal scoping (mes-* endpoints). Profile admin-managed. Frontend validation is UX; backend re-validates.

## 12. Defense
**Say:** "One React component with internal navigation. Each section lazy-loads its data. The catalog loads all books once and filters/sorts/paginates client-side. Action buttons are capability-driven (`isReadableOnline`, `hasPhysicalCopies` + stock). Reading streams a document through an authenticated endpoint as a blob. Every action sends only the resource id — the backend identifies the student from the JWT."
- **Q:** "Stop a student borrowing as someone else?" → "Request only contains the book id; identity from the JWT server-side."
- **Q:** "Why client-side filtering?" → "Fetch once (≤5000), filter in memory for instant UX; larger libraries would use server-side pagination."
- **Q:** "How is Read secured?" → "Fetched via axios from `/documents/:id/stream` with the JWT, as a blob, then opened from an object URL — no public link."

## 13. Risks
1. Catalog fetches ≤5000 rows client-side (fine for PFE).
2. **`window.open` for Read can be popup-blocked** — test popups on demo browser.
3. `window.confirm` for cancel (cosmetic inconsistency).
4. eslint-disable exhaustive-deps (sections refresh on tab switch).
5. Status maps duplicated across dashboards.
6. Profile edit disabled by design (admin-managed).

---

# 5. `pages/EnseignantDashboard/EnseignantDashboard.js` (~4,320 lines)

## 1. File overview
- **Responsible for:** the entire teacher experience — everything the student has (catalog borrow/reserve/read, my loans/reservations, profile, support) **plus**: (1) **upload documents/courses**, (2) **manage own documents** (edit/delete), (3) a **stats dashboard with charts** (recharts).
- **Roles:** ENSEIGNANT only.
- **Depends on:** Sidebar, Navbar, shared `MyLoansView`/`MyReservationsView` (CirculationViews), recharts, API groups; reuses admin + student CSS.

## 2. Imports (vs student)
- **`recharts`** (Area/Bar/Pie charts for teacher stats).
- **`MyLoansView, MyReservationsView`** — shared circulation components (good reuse).
- **`useCallback`** — stable loader identities for effect deps.

## 3. Constants / helpers
- `FORMAT_ICON`, `DOCUMENT_TYPE_TONES`, `COURSE_FILTERS`/`DIGITAL_FILTERS`, `getPedagogicalType` (regex → corrige/examen/tp_td/cours), `hasReadableFilePath`/`READABLE_FILE_FIELDS` (mirrors student catalog logic, kept local to avoid editing the student file). Upload constants: `UC_ALLOWED_EXTS` (PDF, MP4, DOCX, PPTX, XLSX), `ucGetLimitForExt` (200 MB docs / 1 GB video — **client-side claim**), `ucIsVideoExt`.

## 4. Sub-components
- **`UploadForm`** (285) — upload UI + logic (signature feature). Course/document preview component (~726). Edit-course form (~994). Digital-document preview (~1176). Default export `EnseignantDashboard` (1302).

## 5. State (~60 useState)
- Nav/notifications; my courses/documents (`mesCours`, filters, `editingCourse`); catalog (`books`, filters, `bookActionId`, `catalogMessage`); loans/reservations; digital library; stats (`statsPeriod='30'`); **profile editable** (`profileEditForm` {nom, prenom, email}); password (`passwordForm` {current, next, confirm}); support.
- **Key difference:** teachers **can edit their profile** (students cannot).

## 6. Main functions
- **`UploadForm.handleSubmit(e)`** ⭐⭐ — `validateFile` (ext in whitelist, size ≤ limit), validates title/category/type, builds FormData (`fichier`, titre, auteur, description, id_categorie, est_telechargeable, type_document), fake progress animation, `documentsAPI.upload(fd)` → POST `/documents/upload` (multipart). Success → reset + onSuccess. Endpoint requires ENSEIGNANT/BIBLIOTHECAIRE/ADMIN; uploader from JWT.
- **`handleBorrowBook(book)` / `handleReserveBook(book)`** — comment: "reuse the exact same endpoints students use. The backend stores req.user.id_user." Set `bookActionId` (disable button), `creer`/`reserver`, catalogMessage, reload.
- **`handleDeleteCours(id)`** — confirm + `documentsAPI.delete(id)` (backend checks ownership).
- **`handleEditSubmit(id, form)`** — `documentsAPI.update(id, {...})` → PUT `/documents/:id`.
- **`openDocumentBlob(document)`** — `streamFile(id)` blob → open/preview.
- Loaders (useCallback): `loadMesCours`, `loadCategories`, `loadBooks`, `loadDigitalDocuments`, `loadEmprunts`, `loadReservations`, `loadTeacherProfile`, `loadSupportTickets`, `loadNotifications`, `loadAll`.
- `handleCancelLoan`/`handleCancelReservation` (used by shared circulation views). Profile editing enabled (`authAPI.updateMe`).

## 7. Button logic
| Button | Where / condition | onClick | API | After |
|---|---|---|---|---|
| Publish course | upload submit; disabled while loading | `UploadForm.handleSubmit` | POST `/documents/upload` | progress → success → reset |
| Browse/select file | dropzone | `handleFileChange`/`handleDrop` → `applyFile` | — | validated + previewed |
| Borrow | catalog; if available | `handleBorrowBook` | POST `/emprunts` | button disables, message, reload |
| Reserve | catalog; if unavailable | `handleReserveBook` | POST `/emprunts/reservations` | message |
| View details | catalog | `handleBookDetails` | GET `/livres/:id` | modal |
| Edit (own doc) | my-courses | `handleEditSubmit` | PUT `/documents/:id` | updated, reload |
| Delete (own doc) | my-courses | `handleDeleteCours` | DELETE `/documents/:id` | confirm → removed |
| Read/Open | doc card | `openDocumentBlob` | GET `/documents/:id/stream` | opens/preview |
| Cancel loan/reservation | shared views | `handleCancelLoan`/`handleCancelReservation` | PUT `/emprunts/...` | refresh |
- Backend re-checks ownership on edit/delete.

## 8. JSX sections
- Sidebar/Navbar; Stats dashboard (recharts + KPI cards, `statsPeriod`); Upload (hero, dropzone, metadata form, progress); My courses (grid, edit/delete/preview, COURSE_FILTERS, COURSE_PAGE_SIZE=8); Catalog (Borrow/Reserve/Details); Digital library (preview); My loans/reservations via shared components; Profile (editable + modals); Help/support.

## 9. Flows
- **Upload:** form + file → handleSubmit validates → FormData → `documentsAPI.upload` → POST `/documents/upload` → auth + requireRole + multer → `uploadDocument` → Cloudinary + INSERT (uploader from JWT) → 201 → reload.
- **Teacher borrow/reserve:** identical to student; backend records the teacher from the JWT.
- **Edit/Delete own doc:** PUT/DELETE `/documents/:id` → requireRole → controller verifies ownership.

## 10. Security
- Role-gated upload (JWT identifies uploader). Ownership on edit/delete (UI + server). Same-endpoint borrow/reserve (server distinguishes by token). Client file validation is UX; multer enforces server-side. Protected streaming.

## 12. Defense
**Say:** "Teacher reuses the student's catalog/circulation — same endpoints, backend records the teacher from the JWT. Plus teachers publish documents: the form validates type/size, builds multipart FormData, posts to a role-protected endpoint. Teachers edit/delete only their own documents, enforced in UI and re-checked on the server."
- **Q:** "Stop a teacher deleting another's document?" → "UI only shows their own; the controller checks the owner against the JWT user before deleting."
- **Q:** "Stop a student uploading?" → "The upload endpoint is `requireRole('ENSEIGNANT','BIBLIOTHECAIRE','ADMIN')`; a student token gets 403, and the UI doesn't show upload."
- **Q:** "Max upload size?" → "Client validates 200 MB docs / 1 GB video, enforced again by the upload middleware." (See risk: actual server limits are smaller.)

## 13. Risks
1. **Fake upload progress** (setInterval to 90%, not real bytes).
2. **Large video uploads (client says 1 GB)** could time out live — demo a small PDF.
3. Hardcoded French strings in UploadForm (not `t()`).
4. Duplicated catalog logic copied from student file (acknowledged).
5. Very large single component (~4.3k lines).
6. `window.confirm` for delete (cosmetic).

---

# 6. `pages/AdminDashboard/AdminDashboard.js` (~3,740 lines)

## 1. File overview
- **Responsible for:** the admin control center — dashboard KPIs, **user management** (create/edit/block-unblock), **books** CRUD (cover upload), **documents**, **categories**, and acts as the **shell** mounting loans/reservations/stats/support sub-views.
- **Roles:** ADMIN (BIBLIOTHECAIRE legacy mirrors it). Backend `isBibliothecaire`/`isAdmin` on each call.

## 2. Imports
- recharts (PieChart); icon modules (`sidebarIcons`, `booksIcons`); **sub-view imports** `EmpruntsView`, `ReservationsView`, `StatistiquesView`, `AdminSupportView`, `AdminSettingsView` (admin splits sections into files); `useChartTheme`; PNG stat icons; API groups (no empruntsAPI here — loans/reservations handled in sub-views).

## 3. Constants / helpers
- `SIDEBAR_ITEMS` (menu with section headers + SVG icons); `toDashboardNumber`/`formatDashboardNumber` (French-locale, `—` when missing); `formatDashboardDateTime`; `DASHBOARD_STATUS_META` + `getDashboardStatusMeta`. Inline sub-components: `DashboardMetricCard`, `DashboardEmptyState`, `UserStatCard`, create/edit-user modals, book form, document form.

## 4. State
- Shell: `activeItem` (`'dashboard'`), notifications, `stats`/`loadingStats`, `users`/`loadingUsers`/`usersError`, books/documents/categories data. Each modal/form holds its own form state. Users sub-component: `search`, `roleFilter`, `statusFilter`, `dateFilter`, `currentPage`, `flash`, `busyId`, `createOpen`, `editing`.

## 5. useEffect
- Notifications poll; section loader keyed on `activeItem`; reset-page-on-filter-change effects.

## 6. Main functions
- **`loadUsers`** — `authAPI.getUsers({page:1, limit:10000})` (all users, client-side filter).
- **`handleToggleBlock(userId, bloquer)`** ⭐ — **refuses self-block** (`if userId===currentUserId throw`), `authAPI.toggleBloquer` → PUT `/auth/users/:id/bloquer`, optimistically updates local list.
- **`handleCreateUser(payload)`** — `authAPI.createUser` → POST `/auth/users`, reload users+stats.
- **`handleUpdateUser(userId, payload)`** — `authAPI.updateUser` → PUT `/auth/users/:id`, reload.
- Passed as props (`onCreateUser`/`onUpdateUser`/`onToggleBlock`) into the Users sub-component, wrapped with UI feedback (`handleToggle` again refuses self-block — defense in depth).
- **Create-user modal `handleSubmit`** ⭐ — normalizes name, lowercases email, validates name/email/password(≥6)/role∈{ETUDIANT,ENSEIGNANT} (admin can't create admin), builds payload, surfaces express-validator errors.
- **Book form `handleSubmit`** — FormData + cover → `livresAPI.update`/`create` → PUT/POST `/livres` (multipart). `handleDelete` → `livresAPI.delete`.
- Document management: `handleCreateDocument`, `handleDelete(doc)`.

## 7. Button logic
| Button | Where / condition | onClick | API | After |
|---|---|---|---|---|
| 👤＋ Add user | Users hero | modal `handleSubmit` | POST `/auth/users` | modal closes, reload, flash |
| Edit (user) | Users table | `handleUpdateUser` | PUT `/auth/users/:id` | row updates |
| Block/Unblock | Users table; forbidden for own account | `handleToggle` | PUT `/auth/users/:id/bloquer` | row toggles |
| Export CSV | Users hero | `exportUsersCSV` | — | downloads |
| Add/Save book | Books | book `handleSubmit` | POST/PUT `/livres` (multipart) | saved |
| Delete book | Books | `handleDelete` | DELETE `/livres/:id` | removed |
| Approve/Cancel reservation | ReservationsView | (that file) | PUT `/emprunts/reservations/:id/...` | status changes |
| Validate/Return/Extend loan | EmpruntsView | (that file) | PUT `/emprunts/:id/...` | status changes |
- **Admin cannot block own account** (checked twice).

## 8. JSX sections
- Sidebar (menu + live overdue badge `badges={{retards}}` + logout icon); Navbar; Dashboard (KPI cards, PieChart, recent-activity tables, empty states); Users (hero, 4 stat cards, toolbar filters, table, create/edit modals); Books (table, add/edit modal + cover, delete confirm); Documents/Categories CRUD; Emprunts/Reservations/Stats/Support/Settings delegated to sub-views.

## 9. Flows
- **Create user:** Add user → handleSubmit validates (email, pw≥6, role) → `authAPI.createUser` → POST `/auth/users` → auth + isBibliothecaire + createUserValidation → `createUser` → bcrypt-hash → INSERT utilisateurs → reload.
- **Block/unblock:** handleToggle (refuses self) → `toggleBloquer` → PUT → UPDATE est_bloque → next request from that user hits auth.middleware → 403.
- **Manage book:** `livresAPI.create/update/delete` → `/livres` (multipart) → isBibliothecaire → livres.controller.
- **Approve reservation / manage loan:** in ReservationsView/EmpruntsView.

## 10. Security
- Admin-only writes behind `isBibliothecaire`/`isAdmin`. Controlled account creation (role restricted to ETUDIANT/ENSEIGNANT in UI + backend `isIn`); public registration disabled. Password bcrypt-hashed on backend; min-6 both sides. Self-block prevention. Blocking enforced by auth.middleware. express-validator both sides.

## 12. Defense
**Say:** "Management hub. Loads shared stats/users, delegates loans/reservations/stats/support to sub-views. Admins create accounts (no public sign-up); the form only allows student/teacher, validated client + server. Admins can block users but never themselves; a blocked user is rejected by the auth middleware on every request. All management actions are guarded server-side — hiding a tab is just UX."
- **Q:** "Can an admin create another admin from the UI?" → "No. Role dropdown only offers student/teacher; backend rejects others."
- **Q:** "Block a logged-in user?" → "Their token stays valid but auth.middleware checks est_bloque on every request → 403 immediately."
- **Q:** "Why split admin into sub-views but not student/teacher?" → "Admin is the largest; I extracted loans/reservations/stats/support; I'd do the same for the others in a refactor."

## 13. Risks
1. `loadUsers` fetches ≤10,000 users client-side (fine for PFE).
2. Very large file (~3.7k lines).
3. Optimistic update in `handleToggleBlock` (re-throws on error; low risk).
4. Self-block guarding duplicated (defense in depth, not a bug).
5. CSV export is client-side (exports loaded/filtered rows).

---

# PART 3 — BACKEND CONTROLLERS

---

# 7. `backend/src/modules/emprunts/emprunts.controller.js` (~1,065 lines)

## 1. File overview
- **Responsible for:** all loan + reservation business logic — the core "circulation" system. Creates loan requests, approves/refuses, records returns (with penalties), cancellations, extensions, full reservation lifecycle, admin listing/search.
- **Roles:** students/teachers (own requests), admin/librarian (validation/returns/listings). Relies on `req.user` (from auth.middleware) + route role guards.
- **Depends on:** `db` (`query`, `getClient` for transactions), `notifications.service` (`notifyAdmins`).

## 2. Imports
- `{ query, getClient }` (single queries vs BEGIN/COMMIT/ROLLBACK transactions — critical for stock integrity); `{ notifyAdmins }` (best-effort, `.catch(()=>{})`).

## 3. Constants / helpers
- `MIN_YEAR=1900`, `MAX_YEAR=9999`, `isValidIsoDate(s)` (validates admin dates). Facet-search SQL builders in `getAllEmprunts` (loan code / ISBN / borrower / book).

## 4. Main functions
### `creerDemande(req,res)` — student/teacher requests a loan (8)
- POST `/emprunts`. Transaction: requires `id_livre`; re-checks `est_bloque` (403); checks book exists; if `stock_disponible<=0` → 409 ("want to reserve?"); checks no existing EN_ATTENTE/EN_COURS loan for this book (409); computes `date_retour_prevue = now + duree_jours` (default 14); **INSERT EN_ATTENTE**; COMMIT; notifyAdmins; 201.
- **⭐ A request does NOT decrement stock.** Identity from `req.user.id_user`.

### `validerEmprunt(req,res)` — librarian approves (113) ⭐
- PUT `/emprunts/:id/valider` (isBibliothecaire). Validates id + optional duree_jours∈[1,60]. Transaction: **`SELECT ... FOR UPDATE OF e`** (locks the loan so two admins can't approve the same one); 404 if not found; specific errors if not EN_ATTENTE; **`SELECT stock_disponible ... FOR UPDATE`** (locks stock; 400 if 0); UPDATE loan → EN_COURS (`WHERE statut='EN_ATTENTE'`); **UPDATE stock = stock-1 WHERE stock>0**; if either affects 0 rows → ROLLBACK; COMMIT.
- **⭐ Most important for data-integrity defense:** row locks + transaction → stock never negative, no double-approval. Stock decremented here.

### `refuserEmprunt` (266)
- PUT `/emprunts/:id/refuser`. UPDATE → REFUSE `WHERE statut='EN_ATTENTE'`. No stock change.

### `enregistrerRetour(req,res)` — record return (293) ⭐
- PUT `/emprunts/:id/retourner` (isBibliothecaire). Transaction: lock loan (EN_COURS/EN_RETARD); if overdue, **penalty = days_late × `PENALITE_PAR_JOUR`** (default 100); UPDATE → RETOURNE + date_retour_effectif + penalite_montant; **UPDATE stock + 1**; COMMIT.

### `annulerEmprunt` (366)
- PUT `/emprunts/:id/annuler`. UPDATE → ANNULE `WHERE id_emprunt=$1 AND id_user=$2 AND statut='EN_ATTENTE'`. **Ownership check via id_user.**

### `getMesEmprunts` (394)
- GET `/emprunts/mes-emprunts`. `WHERE e.id_user=$1` (personal scoping); optional statut; pagination; joins title/author/cover/category/ISBN.

### `getRetards` (435)
- GET `/emprunts/retards` (isBibliothecaire). Overdue loans, computes jours_retard + penalite_estimee in SQL.

### `getAllEmprunts` (469)
- GET `/emprunts` (isBibliothecaire). Filters statut/user_id/livre_id; free-text `q` with mode detection (loan code EMP-001 / ISBN / borrower probe / all facets). Paginated, count. **All parameterized → injection-safe.**

### `reserverLivre` (653)
- POST `/emprunts/reservations`. Requires id_livre; book exists; no duplicate active (EN_ATTENTE) reservation; **INSERT reservations (EN_ATTENTE)**; notifyAdmins; 201. Uses req.user.id_user.

### `getAllReservations` (712)
- GET `/emprunts/reservations` (isBibliothecaire). Filter statut/q; paginated; parameterized.

### `approveReservation` (788)
- PUT `/emprunts/reservations/:id/approve`. UPDATE → CONFIRMEE `WHERE statut='EN_ATTENTE'`.

### `cancelReservation` (811)
- PUT `/emprunts/reservations/:id/cancel`. UPDATE → ANNULEE `WHERE statut IN ('EN_ATTENTE','CONFIRMEE')`.

### `prolongerEmprunt` (834)
- PUT `/emprunts/:id/prolonger`. Clamps jours∈[1,60], adds interval `WHERE statut IN ('EN_COURS','EN_RETARD')`.

### `getMesReservations` (868)
- GET `/emprunts/mes-reservations`. `WHERE res.id_user=$1`.

### `cancelMaReservation` (894)
- PUT `/emprunts/reservations/:id/annuler`. UPDATE → ANNULEE `WHERE id_reservation=$1 AND id_user=$2 AND statut IN ('EN_ATTENTE','CONFIRMEE')`. Ownership check.

### `creerEmpruntAdmin(req,res)` — admin creates loan directly (935)
- POST `/emprunts/admin` (isBibliothecaire). Validates id_user+id_livre+ISO dates (due≥borrow). Transaction: user exists/not blocked, **lock stock (FOR UPDATE)**, no duplicate active loan, **INSERT EN_COURS**, **decrement stock**, COMMIT.

## 5. Status & stock model
- **Loan statuses:** EN_ATTENTE → (EN_COURS via approve | REFUSE | ANNULE); EN_COURS/EN_RETARD → RETOURNE.
- **Reservation statuses:** EN_ATTENTE → (CONFIRMEE | ANNULEE); also EXPIREE.
- **Stock:** −1 on approval (validerEmprunt / creerEmpruntAdmin), +1 on return (enregistrerRetour). Never changed by request/refusal/cancellation. Every change uses FOR UPDATE locks in a transaction.

## 6. Security
- JWT identity everywhere (`req.user.id_user`). Ownership checks (annulerEmprunt, cancelMaReservation). Role gating (isBibliothecaire). Blocked-user enforcement (creerDemande, creerEmpruntAdmin). Concurrency safety (FOR UPDATE). Injection-safe.

## 7. Database
- Tables: emprunts, reservations, livres_physiques (stock + ISBN + shelf), ressources (title/author/cover), utilisateurs, categories. Writes: emprunts (INSERT/UPDATE), reservations (INSERT/UPDATE), livres_physiques.stock_disponible (−1/+1).

## 8. Flows
- **Borrow → Approve:** POST `/emprunts` (INSERT EN_ATTENTE, stock unchanged) → later PUT `/emprunts/:id/valider` (lock loan + stock, UPDATE EN_COURS, stock −1).
- **Return:** PUT `/:id/retourner` (penalty if late, RETOURNE, stock +1).
- **Reserve:** POST `/reservations` (INSERT EN_ATTENTE) → admin approve → CONFIRMEE.

## 12. Defense
**Say:** "Circulation engine. A loan request is created pending and doesn't touch stock. Stock is decremented at a single point — approval — inside a transaction with row locks, so two librarians can't approve the same request and stock never goes negative. Returns restore stock and compute a late penalty. Users can only cancel their own pending items (id_user clause); borrower identity always comes from the JWT."
- **Q:** "Prevent overselling on concurrent approvals?" → "Approval runs in a transaction and locks the stock row with FOR UPDATE; the decrement is guarded by `WHERE stock_disponible>0`, rolling back if it affects zero rows."
- **Q:** "When does stock change?" → "Only on approval (−1) and return (+1)."
- **Q:** "Cancel someone else's loan?" → "No — the cancel query includes `AND id_user=<token user> AND statut='EN_ATTENTE'`."

## 13. Risks
1. Some handlers use `id` without parseInt (still parameterized → safe; non-numeric → 404).
2. Penalty units ambiguous (`PENALITE_PAR_JOUR=100`, displays /100 or `.toFixed(3)`) — pick one explanation (stored as integer subunits, displayed as DT).
3. Reservation→loan is manual (admin approves then creates loan); EXPIREE handled by cron.
4. `getAllEmprunts` search is complex (multi-mode) but parameterized.
5. No server check that a reserved book is actually unavailable (UI-only guard).

---

# 8. `backend/src/modules/auth/auth.controller.js` (~1,755 lines)

## 1. File overview
- **Responsible for:** all authentication + account logic — two-step login with email OTP, JWT issuance, password reset by email code, change-password, profile read/update, admin user management, matricule generation.
- **Roles:** public (login/reset), authenticated (me/change-password/logout), admin/librarian (user management).
- **Depends on:** bcryptjs, jsonwebtoken, crypto, db, express-validator, brevo.service.

## 2. Imports
- `bcrypt` (hash/compare passwords + codes), `jwt` (issueAuthToken), `crypto` (secure random codes), `query`/`getClient`, `validationResult`, brevo (`sendEmailVerificationCode`, `sendPasswordResetCode`, `assertBrevoConfig`).

## 3. Constants / helpers
- Roles: `STUDENT_ROLE='ETUDIANT'`, `GUEST_ROLE='GUEST'`, `USER_EDITABLE_ROLES=['ETUDIANT','ENSEIGNANT']`, `PROTECTED_ADMIN_ROLES=['ADMIN','BIBLIOTHECAIRE']`.
- OTP config: `OTP_LENGTH=6`, `OTP_MAX_ATTEMPTS=5`, `OTP_RESEND_COOLDOWN_SECONDS=60`. `PASSWORD_CHANGE_INTERVAL_DAYS=30`.
- **`issueAuthToken(user)`** — `jwt.sign({ id_user, email, role }, JWT_SECRET, { expiresIn:'24h' })`. **JWT created here.**
- **`buildUserResponse(user)`** — safe user object (no `mot_de_passe`).
- `generateOtp`/`generateResetCode` (crypto.randomInt → zero-padded 6 digits). `generateMatricule` (advisory-lock-serialized IDs ETU/ENS/ADM). `normalizeEmail`, `splitFullName`, `normalizePasswordChangePayload`.

## 4. Main functions
### `login(req,res)` — step 1 (683) ⭐
- POST `/auth/login`. Validation errors (400); lookup user (generic "email or password incorrect" if not found — no enumeration); 403 if blocked; **`bcrypt.compare(mot_de_passe, hash)`**; `assertBrevoConfig`; rate-limit (unused OTP <60s → 429); generate OTP → **bcrypt.hash it** (stored hashed) → expiry now+TTL(10min); transaction invalidates old OTPs + inserts new (`login_otps`); email the code; return `{ requireOtp:true, email }` (no token yet).

### `verifyLogin(req,res)` — step 2 (795) ⭐
- POST `/auth/verify-login`. Transaction: find user; blocked check; **SELECT ... FOR UPDATE** latest unused OTP; if `attempts>=5` → 429 locked; if expired → 400; **bcrypt.compare(code, code_hash)** — wrong → increment attempts, commit, 400; correct → mark used, update last_login_at; **issueAuthToken** → `{ token, user }`.

### `resendLoginCode` (899) — re-sends an OTP (same 60s cooldown).

### `forgotPassword(req,res)` — reset step 1 (1035) ⭐
- POST `/auth/forgot-password`. ensure storage + Brevo; lookup user; **if no user → still 200 generic message** (no enumeration); generate code → bcrypt.hash → store in `password_reset_codes` (invalidate old) in a transaction → email it; if email send fails, **invalidate the code**.

### `verifyResetCode` (1125) — POST `/auth/verify-reset-code`. Validates code **without consuming** (so UI shows "code OK"). Generic invalid message.

### `resetPassword(req,res)` — reset step 3 (1161) ⭐
- POST `/auth/reset-password`. Validates new pw≥6 + matches confirm. Transaction: re-validate code **with lock**; **bcrypt.hash** new pw; UPDATE utilisateurs.mot_de_passe + password_changed_at; mark code used.

### `logout` (999) — records last_logout_at (token is stateless, discarded client-side).
### `getMe` (1240) — returns current user by req.user.id_user; lazily assigns missing matricule.
### `updateMe` (1269) — user updates own profile fields.

### `changePassword(req,res)` — authenticated change (1376) ⭐
- PUT `/auth/change-password`. Transaction: validate fields; SELECT ... FOR UPDATE; **bcrypt.compare(currentPassword, hash)** (wrong → 400); **students rate-limited once/30 days** (429 with nextAllowedChangeDate); bcrypt.hash new pw; UPDATE + password_changed_at.

### `getAllUsers` (1466) — admin list with role/bloque filters + pagination; safe columns (no password); parameterized.

### `createUser(req,res)` — admin creates account (1525) ⭐
- POST `/auth/users` (isBibliothecaire, createUserValidation). Transaction: validation errors; **role∈USER_EDITABLE_ROLES (ETUDIANT/ENSEIGNANT)** — no admin creation; email not used (409); **bcrypt.hash** password; generate matricule if needed; INSERT utilisateurs; safe user.

### `updateUser(req,res)` — admin edits account (1603) ⭐
- PUT `/auth/users/:id` (isBibliothecaire, updateUserValidation). Transaction: SELECT ... FOR UPDATE; **protected admin role can't be changed** (400); else role must be editable; never overwrites existing matricule; if password provided → bcrypt.hash + password_changed_at; handles unique violations (23505) for email/matricule → 409.

### `toggleBloquerUser` (1710) — PUT `/auth/users/:id/bloquer`. UPDATE est_bloque. (Self-block prevention is in the frontend admin handler.)

## 5. Security (centerpiece)
- **JWT created:** issueAuthToken (jwt.sign, 24h), only in verifyLogin (after OTP). **Verified** in auth.middleware.
- **bcrypt hashing:** hash in createUser/updateUser/resetPassword/changePassword; compare in login/changePassword. Passwords never stored/returned plaintext (buildUserResponse omits it).
- **OTP/reset codes hashed** in DB. **Secure randomness** (crypto.randomInt).
- **Brute-force defense:** OTP attempts capped at 5 → 429; 60s resend cooldown; student password change once/month.
- **No enumeration:** generic messages on bad login + forgot-password.
- **RBAC at data level:** USER_EDITABLE_ROLES / PROTECTED_ADMIN_ROLES prevent escalation. express-validator everywhere. FOR UPDATE locks; advisory lock for matricule.

## 6. Database
- Tables: utilisateurs (nom, prenom, email, mot_de_passe hash, role, matricule, est_bloque, password_changed_at, last_login_at, last_logout_at), login_otps, password_reset_codes. Writes: INSERT/UPDATE users, INSERT/UPDATE codes (used_at, attempts).

## 7. Flows
- **Login w/ code:** POST `/auth/login` (bcrypt.compare → generate+hash OTP → email → requireOtp) → POST `/auth/verify-login` (FOR UPDATE OTP, check attempts/expiry, bcrypt.compare → mark used → jwt.sign → token+user).
- **Reset:** forgot-password (hash+store code → email, generic 200) → verify-reset-code (validate no consume) → reset-password (FOR UPDATE validate → bcrypt.hash new → UPDATE → mark used).
- **Admin create:** POST `/auth/users` → auth + isBibliothecaire + createUserValidation → role check → email unique → bcrypt.hash → INSERT.

## 12. Defense
**Say:** "All auth lives here. Login is two-step: verify the password with bcrypt, then send a 6-digit code generated with crypto and stored only as a bcrypt hash. The JWT is issued only after the code is verified. Codes expire, are single-use, lock after five wrong attempts, with a 60s resend cooldown. Reset uses the same hashed-code pattern and never reveals whether an email exists. Admins create accounts — only student/teacher — and admin accounts are protected from role changes."
- **Q:** "Where is the JWT created and what's in it?" → "issueAuthToken, only after OTP. id_user, email, role, signed with a secret, 24h expiry."
- **Q:** "How are passwords stored?" → "bcrypt (10 rounds). Compared with bcrypt.compare; never stored/returned."
- **Q:** "Brute-forcing the code?" → "Five attempts, 10-min expiry, single-use, 60s resend cooldown, crypto random, stored hashed."
- **Q:** "Escalate to admin?" → "No. Create/update only allow student/teacher; protected admin roles can't change."

## 13. Risks
1. Leftover debug log (`[LOGIN TRACKING]`) — no secrets, just id+timestamp.
2. Dev-mode logs the OTP/reset code to console (helpful as a fallback if email fails; never in production).
3. register/verifyRegistration/resendRegistrationCode exported but unused (routes → publicRegistrationDisabled 403).
4. Self-block prevention is frontend-only (toggleBloquerUser doesn't block it server-side).
5. **Emails depend on Brevo being configured — the #1 demo risk.** Dev fallback: code printed to server console.

---

# 9. `backend/src/modules/documents/documents.controller.js` (~697 lines)

## 1. File overview
- **Responsible for:** the digital document subsystem — listing, detail, **upload** (Cloudinary), **protected online reading (stream)**, controlled download, metadata edit, delete, reading history. The "hybrid" = physical books + digital documents.
- **Roles:** readers = students/teachers/staff; managers = teachers (own docs) + admin/librarian.
- **Depends on:** db, express-validator, path/fs (legacy local), stream.Readable (proxy), storage.service.uploadBuffer (Cloudinary), notifications.service.

## 2. Imports
- `uploadBuffer` (Cloudinary), `fs`/`path` (legacy local files), `Readable` (proxy remote → client), `notifyAdmins`/`createNotification`.

## 3. Constants / helpers (security-critical)
- `DOCUMENT_MANAGER_ROLES=['BIBLIOTHECAIRE','ADMIN']`, `DOCUMENT_PUBLIC_READER_ROLES` (+ ETUDIANT, ENSEIGNANT).
- **`isPathInside(target, root)`** + `resolveStoredUploadPath`/`buildStoredUploadUrl` — **path-traversal protection** (refuse anything outside upload dir; reject null bytes).
- `getDocumentOwnership(client,id)`; **`canManageDocument(user,doc)`** (admin/librarian OR the teacher who uploaded → ownership rule for edit/delete); `isDocumentOwner`, `canAccessDocumentFile` (read access), `canBypassDownloadRestriction`.
- `isRemoteUrl(url)` (Cloudinary vs local). **`proxyRemoteFile(req,res,fileUrl,{...})`** ⭐ — fetches the Cloudinary file server-side and pipes it to the client, **honoring HTTP Range requests** (PDF viewers, video seeking). The client never sees the Cloudinary URL — heart of "protected document stream."

## 4. Main functions
### `getAllDocuments` (112) — GET `/documents`. Lists NUMERIQUE resources with filters (categorie/format/telechargeable/q), pagination. Parameterized.
### `getDocumentById` (191) — GET `/documents/:id`. Full detail incl. url_fichier.
### `uploadDocument(req,res)` — teacher/admin upload (223) ⭐
- POST `/documents/upload` (requireRole(ENSEIGNANT,BIBLIOTHECAIRE,ADMIN) + multer). Requires req.file + titre; MIME → format; size KB; **uploadBuffer → Cloudinary → url_fichier**; transaction: INSERT ressources (NUMERIQUE) → INSERT documents_numeriques (url, name, format, size, est_telechargeable, **id_uploade_par=req.user.id_user**); if teacher: notifyAdmins + createNotification to students. 201.
### `streamDocument(req,res)` — read online (349) ⭐⭐
- GET `/documents/:id/stream` (auth). Fetch doc (404 if none); **`canAccessDocumentFile` → 403** if not allowed; if student → async-insert historique_lectures + increment nb_consultations (non-blocking); MIME by format; **remote (Cloudinary):** proxyRemoteFile (inline, Range); **local:** resolveStoredUploadPath (traversal-safe) → 404 if missing → supports **206 partial content** (Range) via fs.createReadStream, else 200.
### `downloadDocument` (456) — GET `/documents/:id/download`. Same access check + `est_telechargeable` enforcement (only managers/owner bypass). Streams as attachment.
### `updateDocument` (516) — PUT `/documents/:id`. Transaction: getDocumentOwnership → **canManageDocument → 403**; COALESCE updates; optional est_telechargeable toggle.
### `deleteDocument` (604) — DELETE `/documents/:id`. Transaction: fetch + **canManageDocument → 403**; DELETE ressources (cascade); best-effort delete local file.
### `getMesLectures` (663) — GET `/documents/historique/mes-lectures`. `WHERE hl.id_user=$1` (personal scoping).

## 5. Security
- **Protected streaming:** files never static (server.js only exposes /uploads/images). All document bytes pass through streamDocument/downloadDocument behind auth + access checks. Access control per read (canAccessDocumentFile). Ownership for write (canManageDocument). Download restriction (est_telechargeable + bypass). Path traversal blocked. Cloudinary URL hidden (proxy). Uploader from JWT. Parameterized SQL.

## 6. Database
- Tables: ressources (NUMERIQUE), documents_numeriques (url_fichier, nom_fichier, format, taille_ko, est_telechargeable, nb_consultations, id_uploade_par), historique_lectures, categories, utilisateurs. Writes: INSERT resource+doc; UPDATE metadata/flag; DELETE cascade; INSERT history + view++ on student stream.

## 8. Flows
- **Upload:** POST `/documents/upload` (multipart) → auth → requireRole → multer → uploadDocument: Cloudinary → INSERT ressources + documents_numeriques (uploader=token) → notify → 201.
- **Read:** GET `/documents/:id/stream` → auth → streamDocument → access check (403 else) → log history + view++ (students) → proxyRemoteFile (Cloudinary, Range) OR local fs stream (206/200).
- **Edit/Delete own doc:** PUT/DELETE `/documents/:id` → canManageDocument (403 else).

## 12. Defense
**Say:** "Documents are never public files. Every read goes through an authenticated stream endpoint that checks access, logs the consultation for students, and proxies the file from Cloudinary — so the client never sees the storage URL, and Range requests work for PDF/video. Teachers upload through a role-protected endpoint; the uploader is from the JWT. Teachers edit/delete only their own documents; admins manage all. I guard against path traversal by refusing any resolved path outside the upload directory."
- **Q:** "Protected from someone not logged in?" → "Stream/download routes run the JWT middleware then an access function; no public URL — even the Cloudinary link is behind a server proxy."
- **Q:** "PDF viewer seek/scroll?" → "Both paths support Range requests and respond 206 Partial Content."
- **Q:** "Teacher delete another's doc?" → "No. canManageDocument allows only admins/librarians or the uploader; else 403."

## 13. Risks
1. Orphaned Cloudinary files if DB insert fails (harmless leak).
2. `getDocumentById` returns url_fichier in JSON — if Cloudinary URLs are public, a client could fetch directly, bypassing the proxy (minor leak to tighten).
3. historique_lectures only logged for students (intentional).
4. Fire-and-forget history insert (won't break streaming).
5. File-type re-validation relies on upload.middleware (multer filter).

---

# 10. `backend/src/modules/livres/livres.controller.js` (~457 lines)

## 1. File overview
- **Responsible for:** the physical-book catalog — list (filters/sort/pagination), full-text search, detail, create/update/delete (cover upload + stock), shelf (rayons) list.
- **Roles:** any authenticated user reads; only admin/librarian (isBibliothecaire) writes.
- **Depends on:** db, express-validator, path, storage.service.uploadBuffer.

## 2. Imports
- `uploadBuffer` (Cloudinary cover, folder bibliotheque/couvertures), `validationResult` (livreValidation), query/getClient.

## 3. Helpers / config
- **`validSortCols=['date_creation','titre','auteur','stock_disponible']`** — whitelist for the sort column (interpolated into SQL, so the whitelist prevents injection via `sort`). `order` forced to ASC/DESC.

## 4. Main functions
### `getAllLivres` (10) — GET `/livres`. Dynamic WHERE (PHYSIQUE + categorie/disponible/rayon/q), whitelisted sort/order, count + paginated select joining ressources+livres_physiques+categories. User values parameterized; only whitelisted column name interpolated.
### `searchLivres` (103) — GET `/livres/search?q=`. Requires q≥2 (400). ILIKE across title/author/ISBN/description/category. Parameterized.
### `getLivreById` (155) — GET `/livres/:id`. Full detail; 404 if not physical.
### `createLivre(req,res)` — add book (184) ⭐
- POST `/livres` (isBibliothecaire + uploadImage + livreValidation). Validation errors; if req.file → Cloudinary cover. Transaction: INSERT ressources (PHYSIQUE) → INSERT livres_physiques with **stock_disponible = stock_total** (`VALUES (...,$4,$4)`). Unique-ISBN violation (23505 → 409).
### `updateLivre(req,res)` — edit book (268) ⭐
- PUT `/livres/:id`. Transaction: verify exists (fetch stocks); **stock consistency** (non-negative ints, `stock_disponible ≤ stock_total` else 400); optional cover → Cloudinary; UPDATE ressources (COALESCE, conditional cover column) + UPDATE livres_physiques. ISBN clash → 409.
### `deleteLivre(req,res)` — delete (387) ⭐
- DELETE `/livres/:id` (isBibliothecaire). **Refuses if active loans (EN_COURS/EN_ATTENTE) → 409** or **active reservations (EN_ATTENTE/CONFIRMEE) → 409**; else DELETE ressources (cascade removes livres_physiques). 404 if not found. Referential-integrity guard.
### `getRayons` (440) — GET `/livres/rayons`. DISTINCT emplacement_rayon + COUNT (shelf filter dropdown).

## 5. Security
- Role gating (isBibliothecaire writes; auth reads). Injection-safe (parameterized; sort/order whitelisted). Validation (express-validator + stock checks). Data integrity (disponible ≤ total, unique ISBN 409, delete blocked while loans/reservations active, transactions).

## 6. Database
- Tables: ressources (PHYSIQUE), livres_physiques (isbn, emplacement_rayon, stock_total, stock_disponible), categories; reads emprunts/reservations for the delete guard. stock_disponible set = stock_total on create; adjustable on update (≤ total); −1/+1 by the loan controller (not here).

## 8. Flows
- **Add book:** POST `/livres` (multipart) → auth → isBibliothecaire → uploadImage → livreValidation → createLivre → Cloudinary cover → INSERT ressources + livres_physiques (dispo=total) → 201.
- **Edit stock:** PUT `/livres/:id` → validate (dispo≤total) → UPDATE both tables.
- **Delete:** DELETE `/livres/:id` → block if active loans/reservations → cascade delete.
- **Browse:** GET `/livres` / `/livres/:id` / `/livres/search`.

## 12. Defense
**Say:** "Manages the physical catalog. Reading is open to any authenticated user; create/edit/delete are librarian/admin only. On create, available equals total stock. On update I enforce available ≤ total, and I block deleting a book with active loans or reservations to protect referential integrity. Covers are on Cloudinary. Search/filtering are parameterized, and the sort column is whitelisted against SQL injection."
- **Q:** "Prevent injection in the sort parameter?" → "It's not a bind parameter, so I validate it against a fixed whitelist and force ASC/DESC; everything else uses `$1,$2` placeholders."
- **Q:** "Stock when a book is borrowed?" → "Not here — this sets initial stock; the loan controller decrements on approval and restores on return, in transactions with locks."
- **Q:** "Delete a borrowed book?" → "No — deleteLivre checks active loans/reservations and returns 409."

## 13. Risks
1. Redundant ternary in updateLivre (line 336: both branches `$6` — harmless no-op).
2. updateLivre lets admin set stock_disponible directly (could desync from real loans; ≤ total guard exists; admins trusted).
3. COALESCE update can't clear a field to NULL (intentional partial update).
4. No image cleanup on book delete (orphaned cover; harmless).

---

# PART 4 — SHARED SUB-VIEWS

---

# 11. `pages/AdminDashboard/EmpruntsView.js` (~976 lines) — Admin Loans Management

## 1. Overview
- Admin **loan management** — list all loans, search/filter, KPI cards, **create loan manually**, **approve** pending, **record returns**, **extend** due dates. Frontend counterpart to emprunts.controller admin endpoints.
- Roles: ADMIN/BIBLIOTHECAIRE.
- Depends on: empruntsAPI, statsAPI, authAPI, livresAPI; shared circulationShared (EMP_STATUTS, formatStatus, isEmpruntEnRetard, DetailsModal); DateField; loansIcons.

## 2. Imports
- empruntsAPI (getAll, creerAdmin, valider, retourner, prolonger); statsAPI (KPI cards); authAPI/livresAPI (create-loan pickers); circulationShared (status constants/formatting + DetailsModal); DateField (DD/MM/YYYY); loansIcons.

## 3. Constants / helpers
- MIN_YEAR/MAX_YEAR + validateIsoDate (mirrors backend isValidIsoDate); clampIsoYear (trims 5+ digit years); formatDDMMYYYY; exportEmpruntsCSV (UTF-8 BOM CSV from visible rows); normalizeSearch + display helpers. Comment documents the flat row shape the backend returns.

## 4. State
- items (loans, limit 10000), empStats/dashboard (KPI sources), filters (search, statut, dateMin, dateMax, borrowerFilter, page), action targets (returnTarget/returnSubmitting, extendTarget/extendDays/extendError/extendSubmitting, approvingId), flash.

## 6. Functions
- loadList (587) — empruntsAPI.getAll({page:1, limit:10000}).
- loadWidgets (597) — stats for KPI cards.
- handleSubmit (create loan, 431) — validate dates → empruntsAPI.creerAdmin({id_user,id_livre,date_emprunt,date_retour_prevue,notes_biblio}) → POST `/emprunts/admin`.
- **approuver(e)** (701) ⭐ — only EN_ATTENTE; setApprovingId; empruntsAPI.valider(id,{}) → PUT `/emprunts/:id/valider`; optimistically flips to EN_COURS; reload. Backend re-checks/decrements stock — no client stock logic.
- confirmReturn (662) — empruntsAPI.retourner(id) → PUT `/emprunts/:id/retourner`; shows message + penalty; reload.
- confirmExtend (679) — validate jours≥1, empruntsAPI.prolonger(id,{jours}) → PUT `/emprunts/:id/prolonger`; reload.

## 7. Button logic
| Button | Condition | Function → API | After |
|---|---|---|---|
| Approve | EN_ATTENTE; disabled while approvingId | approuver → valider | EN_COURS, stock −1 server-side |
| Return | active loan | confirmReturn → retourner | RETOURNE, stock +1, penalty |
| Extend | active loan | confirmExtend → prolonger | due date extended |
| + New loan | always | handleSubmit → creerAdmin | EN_COURS loan |
| Export | rows present | exportEmpruntsCSV | CSV |
- Custom modals for return/extend (not native popups).

## 8–10. Security & Defense
- All actions hit isBibliothecaire endpoints. Date validation client+server. No stock logic on client (trusts transactional backend).
- **Q:** "Where is stock decremented on approve?" → "Only on the backend in validerEmprunt, in a transaction with a row lock; the frontend just calls approve."

## 13. Risks
1. limit:10000 client-side (fine for PFE).
2. Optimistic update on approve (loadList corrects).
3. Mixed confirmation UX (custom modals here, window.confirm elsewhere).

---

# 12. `pages/AdminDashboard/ReservationsView.js` (~554 lines) — Admin Reservations Management

## 1. Overview
- Admin **reservation management** — list/search/filter, KPI cards, **approve / cancel**. Roles: ADMIN/BIBLIOTHECAIRE.

## 2–3. Imports / helpers
- empruntsAPI (reservations endpoints), shared circulation helpers, icons, CSS. reservationIdOf(row) resolver, CSV export, search normalization.

## 4. State
- items (limit 10000), filters (search, statut, page), actionLoading ({id,type} to disable the specific button), flash.

## 6. Functions
- load (238) — empruntsAPI.getAllReservations({page:1, limit:10000}).
- **approve(row)** (~278) ⭐ — resolve id, setActionLoading {id,'approve'}, empruntsAPI.approveReservation(id) → PUT `/emprunts/reservations/:id/approve`; optimistically → CONFIRMEE; reload.
- **cancel(row)** (300) — **window.confirm** then empruntsAPI.cancelReservation(id) → PUT `/emprunts/reservations/:id/cancel`; optimistically → ANNULEE; reload.

## 7. Button logic
| Button | Condition | Function → API | After |
|---|---|---|---|
| Approve | EN_ATTENTE | approve → approveReservation | CONFIRMEE |
| Cancel | EN_ATTENTE/CONFIRMEE | cancel (confirm) → cancelReservation | ANNULEE |

## 8–10. Defense
- Both behind isBibliothecaire. Backend guards source status (`WHERE statut=...`) so stale UI/double-clicks can't corrupt state.
- **Q:** "Approving gives the book to the student?" → "No. It marks CONFIRMEE; the loan is created separately. Reservations are manual."
- **Q:** "Approved twice?" → "Backend update guarded by `WHERE statut='EN_ATTENTE'`; second attempt affects zero rows."

## 13. Risks
1. Approve confirms but doesn't reserve stock (by design).
2. window.confirm for cancel (cosmetic).
3. Optimistic updates (corrected by reload).

---

# 13. `components/circulation/CirculationViews.js` (~877 lines) — Shared My Loans / My Reservations

## 1. Overview
- Reusable `MyLoansView` and `MyReservationsView` (user-facing tracking screens). Header comment: replicate the student dashboard's look/behaviour with the same me-*/mr-* CSS and student.* keys so the **teacher dashboard reuses them** without duplicating markup. Backend endpoints already scoped to req.user.id_user → passing the caller's own data keeps each role to their own records.

## 2. Imports
- useEffect/useMemo/useState, useTranslation, resolveAssetUrl, student CSS (global, no-op if host loaded it).

## 3. Helpers (self-contained copies)
- getCoverPlaceholder, normalizeText, formatDate/formatDateLong, daysUntil. Status maps identical to student (RESERVATION_STATUS_*, LOAN_STATUS_*, LOAN_BADGE, canCancelLoan EN_ATTENTE, canCancelReservation EN_ATTENTE/CONFIRMEE, getLoanReturnInfo, getLoanSummary). Sub-components Pagination + LoanDetailsModal.

## 4–6. Components
### `MyLoansView({ emprunts, loading, onCancel })` (245)
- Props-driven; owns only view state (loanSearch, loanStatusFilter, loanPage, selectedLoan). useMemo stat counts (actifs/attente/retournés/refusés). Client-side filter → sort by request date DESC → paginate (LOAN_PAGE_SIZE=5). **handleCancel(id)** → calls onCancel(id) (parent does the API) and closes the modal. The component never calls the API itself.
### `MyReservationsView({ reservations, loading, onCancel, onOpenBookDetails })` (492)
- Same pattern; RESV_PAGE_SIZE=4. Stat cards, CSS conic-gradient donut of status breakdown, "recent reservations" sidebar. Cancel (when canCancelReservation) → onCancel(id_reservation); details → onOpenBookDetails(id_livre).

## 7. Button logic
| Button | Condition | Calls |
|---|---|---|
| Details (loan) | always | setSelectedLoan (local) |
| Cancel (loan) | canCancelLoan | onCancel(id) → parent → empruntsAPI.annuler |
| Details (reservation) | always | onOpenBookDetails(id_livre) |
| Cancel (reservation) | canCancelReservation | onCancel(id) → parent → annulerMaReservation |

## 8–10. Defense
- No direct API calls; host passes user-scoped data + owns the cancel action (ownership-checked endpoint).
- **Q:** "Why shared instead of duplicating?" → "To reuse the exact loan/reservation UI in the teacher dashboard. It's presentational, receiving data + callbacks; the backend scopes data per user."
- **Q:** "Could a teacher see a student's loans?" → "No. The host passes the teacher's own data from a mes-* endpoint filtered by the JWT user id."

## 13. Risks
1. Duplicated helpers/status maps vs student file (intentional).
2. Student dashboard still has its own inline versions (two implementations).

---

# PART 5 — MIDDLEWARE & SERVICES

---

# 14. `middleware/auth.middleware.js` (~68 lines) — JWT Authentication

## 1. Overview
- Verifies the JWT on protected routes and attaches the user to req.user. The single gate every protected endpoint passes first.

## 2. Imports
- jwt (verify), query (re-load the user from DB).

## 3–4. `authMiddleware(req,res,next)`
1. Reads Authorization header; requires `Bearer <token>` → 401 if missing/malformed.
2. `jwt.verify(token, JWT_SECRET)` → decodes { id_user, email, role }.
3. **Re-queries the DB** for the user → 401 if the user no longer exists (deleted-user token rejected).
4. **Checks est_bloque** → 403 if blocked (blocked user locked out instantly on next request).
5. Attaches req.user, calls next().
- Distinct errors: TokenExpiredError (401 expired), JsonWebTokenError (401 invalid), 500 otherwise.

## 5. Security
- JWT verification happens here and only here. DB re-check → token validity isn't enough; user must exist and not be blocked.

## 6. Defense
- **Q:** "Blocked user's existing tokens still usable?" → "No. Every request re-loads the user and checks est_bloque; blocked → 403 immediately."
- **Q:** "What's in the token, where's the secret?" → "id_user, email, role, signed with JWT_SECRET from env, verified here."

## 7. Risks
1. A DB query per request (slightly heavier, but enables instant block/delete enforcement — intentional).
2. No token refresh/blocklist — logout is client-side; a stolen token works until expiry (24h). Mention httpOnly cookies / short expiry + refresh as future hardening.

---

# 15. `middleware/roles.middleware.js` (~31 lines) — RBAC

## 1. Overview
- Role-based access control; runs after authMiddleware, rejects disallowed roles.

## 2–3. Functions
- **requireRole(...roles)** — 401 if no req.user, 403 if role not in the list (message names required vs actual).
- Shortcuts: `isAdmin = requireRole('ADMIN','BIBLIOTHECAIRE')`, `isBibliothecaire` (same set), `isEnseignant = requireRole('ENSEIGNANT','ADMIN')`, `isAuthenticated = requireRole('ETUDIANT','ENSEIGNANT','BIBLIOTHECAIRE','ADMIN')`.
- GUEST intentionally absent from every shortcut → resource routes deny GUEST by default.

## 4. Security
- The **real authorization layer** (frontend ProtectedRoute is just UX). Routes compose authMiddleware + a role shortcut.

## 5. Defense
- **Q:** "Admin-only access enforced?" → "Each admin route runs authMiddleware then isBibliothecaire/isAdmin; a non-admin token gets 403 regardless of the frontend."
- **Q:** "Why can a librarian use admin routes?" → "isAdmin/isBibliothecaire allow both ADMIN+BIBLIOTHECAIRE — admin is a superset of librarian."

## 6. Risks
1. isAdmin and isBibliothecaire are identical (both allow ADMIN+BIBLIOTHECAIRE) — confusing naming, not a security bug.
2. Role is loaded fresh from the DB (auth.middleware selects role from the row), so role changes apply on next request.

---

# 16. `middleware/upload.middleware.js` (~125 lines) — File Uploads (multer)

## 1. Overview
- Receives uploads **into memory** (not disk) and enforces type + size limits before the controller pushes to Cloudinary. Memory storage because Render/serverless disks don't persist.

## 2–3. Constants / helpers
- `storage = multer.memoryStorage()` (buffer in RAM).
- `fileFilter` — MIME whitelist (PDF, MP4/AVI/MKV, DOC/DOCX, PPT/PPTX, XLS/XLSX, images, ZIP); else error.
- **Size limits:** VIDEO_LIMIT_BYTES = 100 MB, DOCUMENT_LIMIT_BYTES = 10 MB, ABSOLUTE_LIMIT_BYTES = 100 MB (multer hard cap).
- isVideoMime, getLimitForMime, formatBytes.

## 4. Functions
- `uploadDocument` = multer({storage, fileFilter, limits:{fileSize:100MB}}).single('fichier') (field name **fichier**).
- **enforceUploadLimit** — post-multer, applies the per-type limit (10 MB docs / 100 MB video); 400 if exceeded.
- `uploadImage` = images only, 5 MB cap, field name **image**.
- **handleUpload(uploadFn, {enforcePerTypeLimit})** — wraps multer to convert MulterError/LIMIT_FILE_SIZE into clean 400 JSON, then optionally enforceUploadLimit.
- Exports: uploadDocument (with per-type enforcement), uploadImage.

## 5. Security
- MIME whitelist blocks executables/unknown types. Two-stage size enforcement (multer cap + per-type). Memory storage avoids writing untrusted files to disk; controller hands them to Cloudinary.

## 6. Defense
- **Q:** "Prevent malicious uploads?" → "Multer keeps the file in memory, a MIME whitelist rejects disallowed types, size limits cap docs at 10 MB / videos at 100 MB; the file goes to Cloudinary, nothing executable on disk."
- **Q:** "Why memory storage?" → "The hosting disk isn't persistent; I buffer and stream to Cloudinary."

## 7. Risks ⚠️
1. **Front/back size mismatch (IMPORTANT).** Teacher UploadForm validates **200 MB docs / 1 GB video**, but this middleware enforces **10 MB docs / 100 MB video**. A 50 MB PDF passes the browser check, uploads, then gets rejected by enforceUploadLimit ("document too large, max 10 Mo"). **Demo with a <10 MB PDF.** Server is authoritative.
2. MIME-type trust (declared MIME, not magic bytes) — a renamed file could pass; mention content-sniffing as hardening.

---

# 17. `services/storage.service.js` (~76 lines) — Cloudinary Storage

## 1. Overview
- Uploads file buffers to Cloudinary and returns the secure URL stored in the DB. Replaces local disk.

## 2–3. Config / helpers
- cloudinary.config({ cloud_name, api_key, api_secret, secure:true }) from env.
- isConfigured() — true only if all three Cloudinary env vars exist.
- resourceTypeForMime(mime) — image / video / raw (PDF/DOCX/ZIP → raw).

## 4. `uploadBuffer(buffer, {folder, mimetype, originalname})`
- Promise. Not configured → rejects. Opens cloudinary.uploader.upload_stream with the right resource_type and a **uuidv4() public_id** (random filename — not guessable), resolves with { url: secure_url, publicId, resourceType, bytes }. Writes via uploadStream.end(buffer).

## 5. Security
- Credentials from env. Random UUID public IDs → URLs not guessable. secure:true → HTTPS.

## 6. Defense
- **Q:** "Where are uploaded files stored?" → "Cloudinary. I stream the in-memory buffer and store the secure URL in Postgres, with a random UUID public id."
- **Q:** "If Cloudinary isn't configured?" → "uploadBuffer rejects with a clear error and the controller returns 500."

## 7. Risks
1. Cloudinary dependency for the demo (verify keys/quota).
2. Raw files may be public-by-URL on Cloudinary — app proxies via /stream, but the raw secure_url (returned by getDocumentById) could be fetched directly; tighten as needed.
3. Orphaned files if DB write fails (harmless leak).

---

# 18. `services/brevo.service.js` (~141 lines) — Transactional Email

## 1. Overview
- Sends OTP and password-reset emails via the Brevo HTTP API. The delivery channel for two-step login and reset.

## 2–3. Config / helpers
- **escapeHtml(value)** — escapes & < > " ' before injecting into email HTML (XSS/HTML-injection protection in emails).
- getBrevoConfig() — reads BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME; throws BREVO_CONFIG_MISSING listing missing vars.
- assertBrevoConfig() — used by auth controller to fail fast before generating a code.
- createBrevoError(message, code, details) — structured errors.

## 4. Functions
- **sendOtpEmail({toEmail, toName, code, ttlMinutes, subject, intro, outro})** — checks native fetch; POSTs to Brevo with sender/to/subject and both HTML (escaped) and text content; throws structured errors on network failure or non-OK (captures status + body).
- sendPasswordResetCode(...) — wraps with reset copy.
- VERIFICATION_COPY (register/login) + sendEmailVerificationCode({..., purpose}) — wraps with login/register copy.

## 5. Security
- HTML escaping of all dynamic values. API key from env, not logged in plaintext. Codes generated/validated/hashed in the auth controller; this service only transports them.

## 6. Defense
- **Q:** "How are codes delivered?" → "Through Brevo's transactional email API over HTTPS, both HTML and plain text, with every dynamic value HTML-escaped to prevent injection."
- **Q:** "If email config is missing?" → "assertBrevoConfig throws before a code is generated, so the flow returns a clear error rather than pretending to send."

## 7. Risks
1. **Hard dependency on Brevo for login — #1 demo risk.** Verify beforehand. Fallback: dev-mode console logs the code.
2. Relies on native fetch (Node 18+) — checks and errors clearly if unavailable.
3. No retry/queue — transient failure fails the attempt; user retries.

---

# 19. `modules/notifications/notifications.service.js` (~110 lines) — Notification Creation

## 1. Overview
- Internal helper other modules call to create notifications (loan requests, reservations, uploads, overdue cron, support). Reading/marking is the controller's job.

## 2–3. Constants
- ALLOWED_TYPES (BOOK_RESERVATION, SUPPORT_TICKET, DOCUMENT_UPLOAD, OVERDUE_LOAN, BOOK_LOAN_REQUEST, GENERAL); ALLOWED_RECIPIENT_ROLES (ADMIN, BIBLIOTHECAIRE, ENSEIGNANT, ETUDIANT).

## 4. Functions
- **createNotification(payload)** — validates required fields (title/message/type), type in allow-list, recipientRole valid, at least one of recipientRole/recipientId. INSERT with **ON CONFLICT DO NOTHING**. A UNIQUE index on (type, related_entity_type, related_entity_id, recipient_role, recipient_id) makes it **idempotent** — same event can't create duplicates. Wrapped in try/catch returning null ("never break the business action"). Title truncated to 255.
- **notifyAdmins(payload)** — createNotification({..., recipientRole:'ADMIN'}). BIBLIOTHECAIRE reads ADMIN-role notifications too.

## 5. Security/robustness
- Allow-listed types/roles. Idempotent via UNIQUE index → no spam (e.g., daily overdue cron). Best-effort — failures swallowed so loans/reservations/uploads always succeed.

## 6. Defense
- **Q:** "Prevent duplicate notifications (overdue job daily)?" → "A UNIQUE index on type + related entity + recipient, with ON CONFLICT DO NOTHING, makes creation idempotent."
- **Q:** "Can a notification failure break a borrow?" → "No. Creation is wrapped in try/catch and returns null on failure; callers also .catch(()=>{}). The business action commits regardless."

## 7. Risks
1. Depends on the UNIQUE index existing (migration 006). If schema is out of sync, idempotency is lost (duplicates) but nothing breaks. Verify migrations ran.
2. Silent failures — notifications can be missed without an error surfaced (acceptable trade-off).

---

# 20. `jobs/penalites.job.js` (~95 lines) — Scheduled Cron Jobs

## 1. Overview
- Two daily scheduled tasks — mark overdue loans EN_RETARD (08:00) and expire stale reservations (09:00). Started from server.js via initJobs().

## 2. Imports
- node-cron, query, notifyAdmins.

## 3–4. Functions
- **marquerRetards()** (9) — UPDATE emprunts SET statut='EN_RETARD' WHERE statut='EN_COURS' AND date_retour_prevue < CURRENT_DATE, RETURNING ids. For each, fetch readable info + notifyAdmins({type:'OVERDUE_LOAN', relatedEntityId:id_emprunt}). UNIQUE index → one notification per loan even if the job repeats.
- **expirerReservations()** (62) — UPDATE reservations SET statut='EXPIREE' WHERE statut='EN_ATTENTE' AND date_reservation < NOW() - INTERVAL '7 days'. Pending reservations auto-expire after 7 days.
- **initJobs()** (82) — cron.schedule('0 8 * * *', marquerRetards) / ('0 9 * * *', expirerReservations), timezone Africa/Tunis.

## 5. Database
- Writes emprunts.statut (→ EN_RETARD) and reservations.statut (→ EXPIREE). Reads users/resources for notification text.

## 6. Defense
- **Q:** "How does a loan become overdue?" → "A daily cron at 8 AM (Tunis) flips any EN_COURS loan past its due date to EN_RETARD and notifies admins once per loan."
- **Q:** "Reservation nobody fulfills?" → "A 9 AM daily job expires pending reservations older than 7 days (EXPIREE)."
- **Q:** "Overdue computed live or stored?" → "Both: the cron persists EN_RETARD daily, and read queries also compute overdue on the fly, so the UI is accurate between runs."

## 7. Risks
1. Runs in-process; multiple instances would each run it — idempotent notifications + status guards keep it safe.
2. During a short demo the cron won't fire (daily) — overdue is also computed live; marquerRetards is exported if you want to call it manually.
3. Timezone hardcoded to Africa/Tunis (configurable in a refactor).

---

# 21. `server.js` (~156 lines) — Express App Entry Point

## 1. Overview
- Bootstraps Express — global middleware (security, CORS, parsing, logging), serving cover images, mounting all /api/v1 routes, health check, 404 + error handlers, starting cron jobs.

## 2. Imports
- express, cors, helmet, morgan, path, the eight route modules, initJobs.

## 3. Middleware / config
- **helmet({ crossOriginResourcePolicy:'cross-origin' })** — secure HTTP headers; CORP override lets the frontend load covers cross-origin.
- **CORS** — normalizeOrigin strips trailing slashes; allowedOrigins = localhost + FRONTEND_URL (comma-separated); isAllowedOrigin also regex-allows any *.vercel.app (preview deploys); no-origin (curl/health) allowed; disallowed refused cleanly (no 500); methods + Authorization header; credentials:true.
- Body parsers — JSON + urlencoded, **10 MB limit**.
- morgan('dev') in development.
- **Static images** — serves ONLY /uploads/images (covers) with a CORP header. **Documents are NOT static** — they go through the authenticated stream endpoint (key security point).

## 4. Routes
- GET /health (status JSON). API_PREFIX='/api/v1' mounts auth, categories, livres, documents, emprunts, stats, support, notifications. 404 handler (catch-all JSON). Global error handler (logs, 500; error.message only in development).

## 5. Startup
- app.listen(PORT) prints a banner and calls initJobs() to start the cron.

## 6. Security
- Helmet, CORS allow-list (known frontends + Vercel previews), body size cap, documents not served statically, error messages hidden in production.

## 7. Defense
- **Q:** "Security middleware?" → "Helmet for secure headers, a CORS allow-list permitting only my frontends and Vercel previews, a 10 MB body limit, and a global error handler that hides internal messages in production."
- **Q:** "Documents protected at the server level?" → "Only covers are static. Documents have no static route — only reachable through the authenticated /documents/:id/stream."
- **Q:** "CORS in production?" → "Allowed origins from FRONTEND_URL plus any *.vercel.app for previews; everything else refused without CORS headers."

## 8. Risks
1. *.vercel.app wildcard allows any Vercel app (CORS-wise) — lock to the exact domain in production.
2. No app-level rate limiting (OTP endpoints have cooldowns; general endpoints not throttled) — mention express-rate-limit as hardening.
3. CORS refusal returns callback(null,false) (clean; blocked origin gets an opaque CORS failure — expected).

---

# 22. `config/db.js` (~76 lines) — PostgreSQL Connection

## 1. Overview
- Creates the PostgreSQL connection pool and exposes query, getClient (transactions), pool. Single DB access point.

## 2. Imports
- pg.Pool, dotenv.

## 3. Config
- useConnectionString — true if DATABASE_URL set (production: Neon/Render).
- **Fail-fast** — if neither DATABASE_URL nor DB_HOST is set, log a helpful message and process.exit(1).
- sslEnabled — SSL on for remote URLs (unless PGSSL=disable).
- Pool — connectionString + ssl:{rejectUnauthorized:false} (managed), or discrete host/port/db/user/password (local). max:10, idle 30s, connect timeout 10s.
- Startup connectivity test — pool.connect callback; on error logs mode/message/code/stack + process.exit(1); on success logs success.

## 4. Functions
- query(text, params) = pool.query (single statements; callers always parameterize).
- getClient() = pool.connect (dedicated client for BEGIN/COMMIT/ROLLBACK transactions — stock/OTP/reset integrity).

## 5. Security/robustness
- Parameterized queries everywhere (this module provides the primitives). SSL on remote DBs. Fail-fast on missing config/unreachable DB. Secrets from env.

## 6. Defense
- **Q:** "How does the backend connect, local vs deployed?" → "If DATABASE_URL is set (managed Postgres like Neon) it uses that with SSL; otherwise discrete host/port/credentials for local. Fails fast with a clear message if neither is configured."
- **Q:** "Data integrity for stock?" → "getClient checks out a dedicated connection so the loan controller can run BEGIN/…/COMMIT transactions with SELECT … FOR UPDATE row locks. query is for simple parameterized statements."
- **Q:** "Pool size?" → "Max 10 connections, 30s idle timeout, 10s connect timeout."

## 7. Risks
1. ssl:{rejectUnauthorized:false} — accepts the provider's cert without verifying the chain (common for free tiers; technically weaker). Known trade-off.
2. process.exit(1) on startup failure — correct fail-fast, but a transient DB hiccup at boot kills the server (no retry).
3. Pool max 10 — fine for PFE; tune for production.

---

# PART 6 — CONSOLIDATED CHECKLISTS & TALKING POINTS

## The things to VERIFY before your defense (highest demo risk)
1. **Brevo email delivery** — login OTP + password reset depend on it (#1 priority). Dev-mode console logs the code as a fallback.
2. **Cloudinary** — uploads + covers depend on it. Verify keys/quota.
3. **Upload size mismatch** — client says 200 MB docs / 1 GB video; the server enforces **10 MB docs / 100 MB video**. **Demo with a <10 MB PDF.**
4. **Popup permission** — student/teacher "Read document" uses window.open; test it in the demo browser.
5. **Cron is daily** — can't show overdue live; rely on the live-computed overdue list, or call marquerRetards manually.

## Your strongest cross-cutting talking points (lead with these)
- **Two-layer security:** frontend ProtectedRoute (UX) + backend auth.middleware (JWT, DB re-check, block check) + roles.middleware (RBAC). "Removing the frontend changes nothing."
- **Stock integrity:** decrement only at approval, inside transactions with SELECT … FOR UPDATE row locks → no double-approval, no negative stock.
- **Protected documents:** never public files; streamed through authenticated endpoints with access checks, Cloudinary URL hidden behind a server proxy, HTTP Range support, path-traversal guards.
- **Auth hardening:** bcrypt-hashed passwords AND OTP/reset codes, crypto-secure codes, attempt limits + cooldowns, no user enumeration, controlled account creation (no public signup, no self-made admins).
- **Defense-in-depth uploads:** memory storage + MIME whitelist + two-stage size limits + random Cloudinary IDs.
- **Robust notifications:** idempotent via a UNIQUE index, best-effort so they never break a business action.

## Status & stock model (memorize)
- **Loan statuses:** EN_ATTENTE → (EN_COURS via approve | REFUSE | ANNULE); EN_COURS/EN_RETARD → RETOURNE.
- **Reservation statuses:** EN_ATTENTE → (CONFIRMEE | ANNULEE); also EXPIREE (cron after 7 days).
- **Stock (livres_physiques.stock_disponible):** set = stock_total on book creation; −1 on loan approval; +1 on return; never changed by request/refusal/cancellation. Every change uses FOR UPDATE locks inside a transaction.

## The request flow (recite this)
```
React page → api.js (axios adds JWT) → Express route
  → auth.middleware (verify JWT, DB re-check, block check)
  → roles.middleware (check role)
  → controller (business logic + parameterized SQL, transactions for integrity)
  → PostgreSQL → JSON response
  → response interceptor (401 → auto-logout) → React updates state → UI changes
```

---

*End of document. Explanation only — no source files were modified.*
