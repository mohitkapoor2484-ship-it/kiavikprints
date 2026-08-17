# Kiavik Prints MVP

This is a local full-stack MVP for `Kiavik Prints`.

It includes:

- storefront with starter products
- product detail dialog with size, colour, and custom text
- cart and checkout form
- guest checkout
- customer signup and login
- saved order history for signed-in users
- family-friendly admin page for adding, editing, hiding, and deleting products
- PayPal-ready server endpoints with a local preview-order fallback

## Stack

- `Node.js 24+`
- built-in `node:sqlite` local database
- plain HTML, CSS, and JavaScript frontend

This path was chosen so the MVP can run today without waiting on package installs or hosted setup.

## Run

1. Open `Projects/Kiavik Prints`
2. Copy `.env.example` to `.env`
3. Set the admin email and password
4. Run:

```powershell
node server.js
```

5. Open:

```text
http://127.0.0.1:4280
```

For phone access on the same Wi-Fi:

- leave `HOST=0.0.0.0` in `.env`
- start the server
- use the printed `LAN access: http://...:4280` URL on your phone
- if Windows prompts for firewall access, allow it on your private network

## Default admin route

- Storefront: `/`
- Product admin: `/admin.html`

## PayPal setup

To enable real PayPal checkout, add these values in `.env`:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV=sandbox` or `PAYPAL_ENV=live`

When PayPal is not configured, the app still allows `Create Preview Order`, which stores the order locally for testing the flow.

## Data storage

The local database is created automatically at:

```text
data/kiavik-prints.db
```

## Notes

- Sample products are seeded automatically on first run.
- A default admin account is created if none exists.
- Change the default admin password before using this outside local MVP testing.
