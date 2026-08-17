# Kiavik Prints MVP

This is a Netlify-native MVP for `Kiavik Prints`.

It includes:

- storefront with starter products
- product detail dialog with size, colour, and custom text
- cart and checkout form
- guest checkout
- customer signup and login
- saved order history for signed-in users
- family-friendly admin page for adding, editing, hiding, and deleting products
- PayPal-ready server endpoints with a preview-order fallback

## Stack

- `Netlify` static hosting from [`public/`](./public)
- `Netlify Functions` for `/api/*`
- `Netlify Database` for users, sessions, products, and orders
- plain HTML, CSS, and JavaScript frontend

## Project layout

- storefront publish directory: `public/`
- serverless backend: `netlify/functions/api.mjs`
- database migrations: `netlify/database/migrations/`
- shared backend logic: `lib/`

## Local development

1. Open `Projects/Kiavik Prints`
2. Copy `.env.example` to `.env`
3. Set the admin email and password
4. Run:

```powershell
npx netlify dev
```

Netlify will serve the static site, functions, and local database-compatible environment together.

## Live Netlify setup

In the Netlify project dashboard, set these environment variables:

- `SHOP_NAME`
- `SHOP_CURRENCY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PAYPAL_ENV`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

The database schema is defined in `netlify/database/migrations/` and is applied by Netlify during deploys.

## Default routes

- Storefront: `/`
- Product admin: `/admin` or `/admin.html`
- API: `/api/*`

## Notes

- Sample products are seeded automatically when the database is empty.
- A default admin account is created if no admin exists yet.
- Product images are still stored as inline image data for the MVP. Moving uploads to Netlify Blobs is the next storage upgrade after this.
