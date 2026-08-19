# Kiavik Prints — complete Netlify repository

This is the full source package: redesigned storefront plus the Netlify-native backend.

## Included

- `public/` — homepage, shop, custom printing, materials, about, contact, admin UI and assets.
- `public/app.js` — product catalogue, cart, accounts, shipping, draft orders and PayPal UI.
- `public/admin.js` — seller login, product CRUD, image upload-to-database and order list.
- `lib/api-handler.mjs` — `/api/*` request routing, authentication and PayPal server-side calls.
- `lib/netlify-store.mjs` — Netlify Database persistence for users, sessions, products and orders.
- `netlify/functions/api.mjs` — Netlify Function entry point.
- `netlify/database/migrations/` — full SQL schema.
- `netlify.toml` — publish/functions config and legacy route redirects.
- `package.json` and `package-lock.json`.
- `.env.example` and `.gitignore`.

## First local run

1. Use Node 20.6.1 or newer.
2. Copy `.env.example` to `.env` and set a strong `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. Run `npm install`.
4. Run `npx netlify dev` (or `npm run dev`).
5. Open the local URL Netlify prints in the terminal.
6. Seller/admin route: `/admin`.

## Existing Netlify project

If you are applying this to the existing Kiavik Prints Netlify project, keep the project's existing Database and environment variables. The migration uses `CREATE TABLE IF NOT EXISTS`, so it is safe for an existing schema with these tables.

## PayPal

PayPal remains disabled until `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are set. Use `PAYPAL_ENV=sandbox` while testing.

## Important

This ZIP intentionally excludes `.git/`, `.netlify/` and `node_modules/`. Those are machine/repository metadata, not source code. Put the contents in your local Git working folder, then use `git status` to review changes before committing.
