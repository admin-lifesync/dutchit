# Dutch It — split group trip expenses, simply.

A clean, fast, mobile-first web app for splitting shared trip expenses. Sign in with Google, create a trip, invite friends with a link, and let everyone log expenses in real time. Dutch It calculates balances and minimizes settlement transfers automatically.

> Made with Next.js 15 + TypeScript + TailwindCSS + ShadCN-style UI + Firebase.

---

## 1. Project overview

**What you can do**

- 🔐 Sign in with Google (Firebase Authentication)
- ✈️ Create trips/groups with a name, description, currency, and cover image
- 🔗 Invite friends via a one-tap shareable link (or pre-fill an email)
- 🧾 Add shared or personal expenses across 7 categories
- 🧮 Split expenses 5 ways — equal, exact amounts, percentages, shares, or personal
- ⚖️ See real-time balances per member (paid / owed / net)
- 💳 Get the smallest possible list of "X pays Y" settlements
- ✅ Record cash settlements and keep a settlement history
- 📜 Watch a live activity feed for every trip
- 🔍 Search and filter expenses by member, category, date, or amount
- 🌙 Dark mode out of the box, installable as a PWA

**What's intentionally simple**

- No money is ever moved by the app — Dutch It tells you who pays whom; you do the actual transfer.
- No emails are sent server-side — invitations work via shareable links you paste anywhere.

---

## 2. Tech stack

| Area              | Choice                                                 |
| ----------------- | ------------------------------------------------------ |
| Framework         | [Next.js 15](https://nextjs.org/) (App Router) + React 19 |
| Language          | TypeScript (strict)                                    |
| Styling           | [Tailwind CSS](https://tailwindcss.com/) 3 + custom HSL theme tokens |
| UI primitives     | Radix UI + shadcn-style components (vendored, no CLI required) |
| Icons             | [lucide-react](https://lucide.dev/)                    |
| Animations        | Tailwind `animate` + tasteful Framer Motion (ready to use) |
| Backend           | [Firebase](https://firebase.google.com/) (Auth + Firestore) |
| Testing           | [Vitest](https://vitest.dev/)                          |
| Deployment        | Vercel (recommended) or Firebase Hosting               |

---

## 3. Local development setup

You'll need:

- **Node.js 20** or newer (`node --version` should print `v20.x` or higher)
- **npm 10** or newer (ships with Node 20)
- A Firebase project (see step 4)

```bash
git clone <your-fork-url> dutchit
cd dutchit
npm install
cp .env.example .env.local        # then fill in Firebase keys
npm run dev
```

Open <http://localhost:3000>. Sign in with Google and create your first trip.

Common scripts:

```bash
npm run dev        # start the dev server (http://localhost:3000)
npm run build      # production build
npm start          # run the production server
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
npm test           # run unit tests (settlement + split engines)
npm run test:watch # vitest watch mode
```

---

## 4. Firebase setup (step-by-step, beginner-friendly)

### 4.1 Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Pick a name (e.g. `dutchit-prod`). Disable Google Analytics if you don't need it.
3. After creation, click **Continue**.

### 4.2 Enable Google Authentication

1. In the left sidebar choose **Build → Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Click **Google → Enable**, set the support email, and **Save**.
5. (Optional) In **Settings → Authorized domains**, add the domain you'll deploy to (e.g. `dutchit.vercel.app`). Localhost is allowed by default.

### 4.3 Create Firestore Database

1. In the sidebar choose **Build → Firestore Database**.
2. Click **Create database**.
3. Choose a location close to your users (e.g. `asia-south1` for India). **This cannot be changed later.**
4. Pick **Start in production mode** — we'll publish proper rules in step 5.
5. Click **Enable**.

### 4.4 Get the web app config keys

1. In the sidebar click the gear icon → **Project settings**.
2. Scroll to **Your apps** and click the **`</>` (Web)** icon.
3. Give the app a nickname (e.g. `dutchit-web`). **Skip Firebase Hosting setup here**, you can do it later.
4. Copy the `firebaseConfig` object — you'll paste each value into `.env.local`:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "dutchit-prod.firebaseapp.com",
  projectId: "dutchit-prod",
  storageBucket: "dutchit-prod.appspot.com",
  messagingSenderId: "0123456789",
  appId: "1:0123456789:web:abcd1234"
};
```

### 4.5 Paste the config into `.env.local`

Open `.env.local` (created from `.env.example`) and replace the placeholders:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=dutchit-prod.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dutchit-prod
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=dutchit-prod.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=0123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:0123456789:web:abcd1234
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Restart `npm run dev` after editing `.env.local` so Next.js picks up the new values.

---

## 5. Firestore security rules

The complete production rules ship in [`firestore.rules`](./firestore.rules). They enforce:

- Only authenticated users may access anything.
- Users may only read/write their own profile under `users/{uid}`.
- Only **group members** can read group data (group doc + its expenses, settlements, and activity).
- Only **group admins** can delete a group (which cascades to its subcollections).
- Only the **expense creator or a group admin** can edit/delete an expense.
- Members may only add themselves to a group via an invitation acceptance flow.
- Members may remove themselves from a group (leave), but only admins can remove others.
- Activity log entries are append-only.

To deploy the rules:

```bash
npm install -g firebase-tools         # if you don't have the CLI yet
firebase login
firebase use --add                    # pick your project, give it an alias like 'default'
firebase deploy --only firestore:rules
```

You can also paste them in the Firebase console under **Firestore → Rules**, then click **Publish**.

---

## 6. Firestore indexes

The app needs one composite index (the rest are auto-created). It's already declared in [`firestore.indexes.json`](./firestore.indexes.json):

```json
{
  "collectionGroup": "groups",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "memberIds", "arrayConfig": "CONTAINS" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
}
```

Deploy it:

```bash
firebase deploy --only firestore:indexes
```

If you ever see an error like _"The query requires an index. You can create it here: https://…"_, just open that link — Firebase will pre-fill the form for you. Always commit the resulting changes back into `firestore.indexes.json`.

---

## 7. Environment variables

The full reference lives in [`.env.example`](./.env.example):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`NEXT_PUBLIC_APP_URL` is used to build invite links. Set it to your deployed origin (e.g. `https://dutchit.vercel.app`) in production.

---

## 8. Deployment

### 8.1 Vercel (recommended)

1. Push your repo to GitHub/GitLab/Bitbucket.
2. Go to <https://vercel.com/new> and import the repo.
3. Framework preset is auto-detected (Next.js).
4. Under **Environment variables**, paste every `NEXT_PUBLIC_FIREBASE_*` value plus `NEXT_PUBLIC_APP_URL` (set this to your final URL, e.g. `https://dutchit.vercel.app`).
5. Click **Deploy**. Done.

After the first successful deploy, add the Vercel domain to **Firebase → Authentication → Settings → Authorized domains**.

### 8.2 Firebase Hosting

> Vercel is the smoothest path. Firebase Hosting also works, but because the app uses dynamic routes (`/trips/[id]`, `/invite/[code]`) you need a tiny bit more setup.

1. Add `output: 'export'` and tell Next.js the dynamic params are resolved at runtime in `next.config.mjs`:

   ```js
   const nextConfig = {
     output: "export",
     // Required because [id] / [code] routes are resolved client-side.
     trailingSlash: true,
     // …existing config…
   };
   ```

2. Add `export const dynamic = "force-static";` to the dynamic route files (`app/(app)/trips/[id]/page.tsx` and `app/(app)/invite/[code]/page.tsx`) **and** export an empty `generateStaticParams`:

   ```ts
   export const dynamic = "force-static";
   export const dynamicParams = true;
   export function generateStaticParams() { return []; }
   ```

3. The hosting config in [`firebase.json`](./firebase.json) already serves the `out/` folder and rewrites all routes to `index.html`, so SPA navigation handles the rest.

4. Build and deploy:

   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. After deploy, add the `web.app` / `firebaseapp.com` domain to **Firebase → Authentication → Authorized domains** if it isn't already.

---

## 9. Build instructions

```bash
npm install
npm run build      # produces .next/ (or out/ if using static export)
npm start          # serves the built app on port 3000
```

A successful production build prints the route table — every page should be either `○ (Static)` or `ƒ (Dynamic)`. No errors during `Generating static pages` is the green light.

---

## 10. Common errors & fixes

Every user-facing error in Dutch It has a short code (e.g. `ERR-GRP-403`). Open
[`ERROR_HANDBOOK.md`](./ERROR_HANDBOOK.md) for a full debugging runbook of every
code: cause, Firebase console checks, and recovery steps.

| Code shown to user | Developer-facing summary | Quick fix |
| --- | --- | --- |
| `ERR-CFG-001` | `.env.local` missing one of the `NEXT_PUBLIC_FIREBASE_*` keys | Copy from `.env.example`, fill in, restart dev server |
| `ERR-AUTH-403` | Domain not authorized for sign-in | Firebase Console → Authentication → Settings → Authorized domains |
| `ERR-AUTH-409` | Browser blocked the sign-in popup | Allow popups for this origin |
| `ERR-AUTH-503` | Network unreachable during sign-in | Reconnect, then retry |
| `ERR-GRP-403` | User UID not in `groups/{id}.memberIds` (or stale rules) | Re-invite; `firebase deploy --only firestore:rules` |
| `ERR-GRP-404` | Group document doesn't exist | The trip was deleted — go back to `/trips` |
| `ERR-EXP-403` | Caller is not the expense creator nor an admin | Ask the original creator or an admin |
| `ERR-INV-404` | Invite code is invalid or revoked | Ask the inviter for a new link |
| `ERR-NET-503` | Browser is offline (banner pinned to top) | Reconnect — Firestore SDK auto-resyncs |
| `The query requires an index` | New composite index needed | Open the link in the error or run `firebase deploy --only firestore:indexes` |
| Build fails: _"useSearchParams() should be wrapped in a suspense boundary"_ | A new client page reads search params without `<Suspense>` | Wrap as `app/signin/page.tsx` does |
| Service worker stale after deploy | Browser cache | Bump `CACHE_NAME` in `public/sw.js` |

> Users will never see raw `FirebaseError`, `permission-denied`, or stack
> traces. Anything caught by an `instanceof FirebaseError` check is translated
> into a typed `AppError` with an `ERR-*` code via
> [`lib/errors/firebase-error-map.ts`](./lib/errors/firebase-error-map.ts).

---

## 10a. Error handling architecture

```
lib/errors/
├── error-codes.ts        # Canonical ERR-* constants
├── user-messages.ts      # Friendly title + description per code
├── app-error.ts          # AppError class (typed, retryable, with context)
├── firebase-error-map.ts # FirebaseError → AppError
├── handle-error.ts       # The single entry point for all catch blocks
└── index.ts              # Barrel export
lib/logger.ts             # Structured dev/prod logger (only console.* in app code)
components/offline-banner.tsx
app/error.tsx             # Per-page error boundary with retry
app/global-error.tsx      # Last-resort fallback when the root layout crashes
app/not-found.tsx         # Friendly 404
```

**Rules of the road**:

1. Every `catch` in app code uses `handleError(e, { domain, context })` —
   never `toast({ description: e.message })`.
2. Domains are typed: `auth | group | expense | settlement | invitation | user | generic`.
   They disambiguate generic Firestore errors (e.g. `permission-denied` →
   `ERR-GRP-403` in a group flow vs `ERR-EXP-403` in an expense flow).
3. `AppError.retryable` is set automatically based on the code. UI surfaces
   that support retry can read it.
4. The user message **never** mentions Firebase / Firestore / permission-denied.
   This is enforced by a unit test in `tests/errors.test.ts`.

Adding a new error code is a 5-minute task — see the **"Adding a new error
code"** section in `ERROR_HANDBOOK.md`.

---

## 10b. Production readiness checklist

Run through this before shipping a new build to production.

```bash
npm run lint        # ESLint (next/core-web-vitals)
npm run typecheck   # tsc --noEmit (strict)
npm test            # Vitest suite (errors, splits, balance)
npm run build       # Next.js production build
```

| Item | Why |
| --- | --- |
| `npm run lint` passes with **0 warnings** | Catches unused imports, missing deps in hooks, accessibility regressions. |
| `npm run typecheck` passes | All catch sites flow through `AppError`, no implicit `any`. |
| `npm test` passes | Includes the `tests/errors.test.ts` suite that prevents jargon from leaking to users. |
| `npm run build` passes | Catches `useSearchParams` / Suspense boundary issues, missing static params, etc. |
| `firestore.rules` deployed | `firebase deploy --only firestore:rules`. The bundled rules permit member-driven bookkeeping updates without exposing membership lists. |
| `firestore.indexes.json` deployed | `firebase deploy --only firestore:indexes`. Required for the dashboard's "trips by updatedAt" query. |
| Authorized domains contain your prod host | Firebase Console → Authentication → Settings. |
| `.env.local` is **not** committed | `.gitignore` already excludes it; `git status` should not list it. |
| `NEXT_PUBLIC_APP_URL` is set on the deploy target | Used to render shareable invite links. |
| Service worker `CACHE_NAME` bumped if app shell changed | Forces returning users to pick up the new build. |
| Sentry / Logflare / your log drain wired up (optional) | The structured JSON logger output is ready to ingest. |

**Smoke test before pushing tags**:

1. Sign in with Google in a fresh incognito window.
2. Create a trip with a non-default currency.
3. Add an expense with each split type.
4. Open the trip in another browser as a different user via an invite link.
5. Have the second user record a settlement.
6. Confirm both dashboards reflect the new balance in real time.
7. Toggle airplane mode and confirm the offline banner appears.

---

## 11. Folder structure

```
dutchit/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Auth-protected route group
│   │   ├── layout.tsx            # <Protected> + <AppShell>
│   │   ├── dashboard/page.tsx
│   │   ├── trips/
│   │   │   ├── page.tsx          # All trips
│   │   │   ├── new/page.tsx      # Create trip
│   │   │   └── [id]/page.tsx     # Trip detail (expenses, settle, members, activity)
│   │   └── invite/[code]/page.tsx
│   ├── signin/page.tsx           # Public sign-in
│   ├── manifest.ts               # PWA manifest
│   ├── globals.css               # Tailwind + theme tokens
│   ├── layout.tsx                # Root: <ThemeProvider>+<AuthProvider>+<Toaster>
│   └── page.tsx                  # Landing page
│
├── components/
│   ├── auth/                     # auth-provider, route-protection wrapper
│   ├── expenses/                 # expense list, form, details, category icons
│   ├── settlements/              # settlement panel + record-payment dialog
│   ├── trips/                    # trip cards, members panel, activity feed
│   ├── layout/                   # logo, app shell with bottom-nav
│   ├── ui/                       # shadcn-style primitives (button, card, …)
│   ├── theme-provider.tsx
│   ├── theme-toggle.tsx
│   ├── offline-banner.tsx        # navigator.onLine banner pinned to top
│   └── pwa-register.tsx          # registers /sw.js in production
│
├── hooks/
│   ├── use-auth.ts               # re-export from auth-provider
│   ├── use-toast.ts              # toast store (shadcn pattern)
│   ├── use-trip.ts               # subscribes to one trip + its derived state
│   └── use-user-groups.ts        # subscribes to all trips for the current user
│
├── lib/
│   ├── firebase/
│   │   ├── client.ts             # SDK init + persistence
│   │   ├── firestore.ts          # All Firestore reads/writes
│   │   └── types.ts              # Shared schema interfaces
│   ├── errors/                   # Centralised error system (see ERROR_HANDBOOK.md)
│   │   ├── error-codes.ts
│   │   ├── user-messages.ts
│   │   ├── app-error.ts
│   │   ├── firebase-error-map.ts
│   │   ├── handle-error.ts
│   │   └── index.ts
│   ├── logger.ts                 # Structured dev/prod logger
│   ├── splits/compute.ts         # Equal / exact / percent / share / personal
│   ├── balance/calculate.ts      # Per-member balance + greedy debt simplification
│   ├── currency.ts               # Currency list + formatting
│   └── utils.ts                  # cn(), initials(), date helpers, round2()
│
├── tests/                        # Vitest unit tests for splits, balance, errors
├── public/                       # icons, service worker, static assets
│
├── firestore.rules               # Deployed via `firebase deploy --only firestore:rules`
├── firestore.indexes.json        # Composite indexes
├── firebase.json                 # Firebase CLI configuration (rules + hosting)
│
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── package.json
```

---

## 12. How the settlement logic works

Two pieces of math drive the entire app — both fully unit-tested in `tests/`.

### 12.1 Splits (`lib/splits/compute.ts`)

Every expense has a `splitType` and a list of `splitValues` (one entry per participant with the resolved `owed` amount). The engine handles five modes:

| Mode | Input | Validation | Notes |
| --- | --- | --- | --- |
| **Equal** | _just the participants_ | none | Any 1-cent rounding residue is added to the **largest** share so the sum exactly equals the bill. |
| **Exact** | per-person amounts | totals must equal `amount` | UI surfaces the running total live. |
| **Percent** | per-person % | totals must equal `100` | Owed amount = `amount × percent / 100`, then residue rebalanced. |
| **Share** | per-person weight | total weight > 0 | Owed amount = `amount × weight / totalWeight`, then residue rebalanced. |
| **Personal** | one user | none | Single-entry split — useful for "this is just yours". |

### 12.2 Balances (`lib/balance/calculate.ts`)

Given the group's members, every expense, and every recorded settlement, the engine returns:

```ts
type MemberBalance = {
  uid: string;
  paid: number;     // total amount this member has paid out
  owed: number;     // total they should have paid given the splits
  net: number;      // paid - owed (positive => is owed money)
};
```

**Recorded settlements** shift balances by treating "X paid Y in cash" as if X had pre-paid an extra `amount` and Y had consumed an extra `amount` worth of expense.

### 12.3 Debt simplification

`simplifyDebts(balances)` returns the smallest list of transfers that brings everyone to zero. It's the standard greedy algorithm Splitwise uses:

1. Split members into creditors (positive net) and debtors (negative net).
2. Repeatedly settle the largest debtor against the largest creditor for `min(debt, credit)`.
3. Stop when both heaps are empty.

This guarantees at most `N - 1` transfers for `N` members and never produces fractional transfers. (For very large groups, optimal minimization is NP-hard, but the difference is rarely meaningful in real trips.)

---

## 13. How invite links work

1. Inside a trip, an existing member opens **Members → Invite**.
2. The app calls `createInvitation()` which writes a document to `invitations/{code}` with a 10-character random `code`, a reference to the group, and `status: 'pending'`.
3. The member shares the URL `${NEXT_PUBLIC_APP_URL}/invite/{code}` (any chat app, email, etc.).
4. The invitee opens the link.
   - If they aren't signed in, the protected route automatically redirects them to `/signin?next=/invite/{code}` and back after auth.
5. The invite landing page calls `acceptInvitation()` inside a Firestore transaction that:
   - Verifies the invite is still `pending`.
   - Adds the user to the group's `memberIds` and `members` array (as a non-admin).
   - Marks the invite as `accepted` and stamps `acceptedBy` + `acceptedAt`.
6. The activity feed gains a "X joined the group" entry, balances and expenses become live for the new member instantly via Firestore listeners.

Security rules ensure invites can only be _flipped_ from pending → accepted by the user accepting it, and that membership additions only happen via this single transactional shape.

---

## 14. Future improvements

- Receipt image uploads to Firebase Storage (UI is already wired for `receiptURL`).
- Push notifications via Firebase Cloud Messaging.
- Multi-currency expenses inside a single trip with FX conversion.
- Recurring expenses (e.g. monthly rent split).
- Export trip to CSV / PDF.
- Email-based invites via a Cloud Function + SendGrid.
- Charts (per-category, per-member spend) on the trip page.
- Localisation (i18n) — strings are already concentrated.

---

## 15. Screenshots

> Drop your screenshots in `docs/screenshots/` and reference them here.

- `docs/screenshots/dashboard.png` — Dashboard overview
- `docs/screenshots/trip.png` — Trip detail with expenses tab
- `docs/screenshots/settle.png` — Suggested settlements
- `docs/screenshots/expense-form.png` — Expense form with percentage split

---

## 16. License

MIT © 2026 — Yours to use, fork, and ship. See [`LICENSE`](./LICENSE) for the legalese.
