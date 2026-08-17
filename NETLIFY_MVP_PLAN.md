# Kiavik Prints Netlify MVP Plan

## Goal

Build `Kiavik Prints` on a mostly single-platform stack so hosting, database, auth, storage, and server-side logic stay under `Netlify`.

## Recommended Stack

- frontend: `Next.js`
- hosting: `Netlify`
- server-side APIs: `Netlify Functions`
- database: `Netlify Database`
- customer accounts: `Netlify Identity`
- product images: `Netlify Blobs`
- payments: `PayPal`

## Why This Stack

- fewer platforms to manage
- easier deployment workflow
- simpler environment-variable management
- one place for hosting, functions, auth, database, and storage
- still flexible enough for guest checkout and a custom product editor

## Store Architecture

### Public Store

- homepage
- shop page
- product page
- cart
- checkout
- account orders page

### Private Admin

- admin login
- add product
- edit product
- hide product
- delete product
- upload product image

### Data Ownership

- `Netlify Database`
  - products
  - product options
  - orders
  - order items
  - shipping addresses
  - PayPal transaction references
- `Netlify Identity`
  - customer signup
  - customer login
  - password recovery
  - account sessions
- `Netlify Blobs`
  - product images

## How Checkout Works

### Guest Checkout

1. Customer adds products to cart.
2. Customer enters shipping and contact details.
3. Netlify Function creates a local order draft.
4. Netlify Function creates a PayPal order.
5. PayPal completes payment.
6. Netlify Function captures payment and marks the order as paid.

### Account Checkout

1. Customer signs in with Netlify Identity.
2. Customer adds products to cart.
3. Checkout creates the order in Netlify Database linked to the Identity user.
4. PayPal payment completes.
5. Customer can view past orders later.

## Product Management Workflow

This should be a custom internal page, not a database dashboard.

The editor should let your kid:

- type product name
- set price
- choose category
- upload image
- type description
- enter size options
- enter colour options
- turn visibility on or off
- save product

Safer default actions:

- `Hide` instead of forcing immediate deletion
- `Edit` instead of manual table changes

## Suggested Database Tables

- `products`
- `product_variants` or option fields on products
- `orders`
- `order_items`
- `order_addresses`
- `payments`

Identity users can be linked to orders through the external Identity user ID.

For guest checkout:

- no account is required
- order still stores email, name, phone, and shipping details

## MVP Build Order

1. Set up Netlify project, Netlify Database, Netlify Identity, and Netlify Blobs.
2. Create database schema for products, orders, and order items.
3. Build the public storefront pages.
4. Build the internal product editor page.
5. Connect product image uploads to Netlify Blobs.
6. Add guest checkout flow.
7. Add customer signup and login with Netlify Identity.
8. Add PayPal order creation and capture functions.
9. Store orders and payment status in Netlify Database.
10. Test guest checkout, account checkout, and admin product management.

## What We Avoid With This Plan

- no external CMS required
- no external database required for MVP
- no direct table editing for daily product changes
- no platform split between Netlify hosting and another backend unless needed later

## Practical Recommendation

For `Kiavik Prints`, this is the better path if the priority is reducing platform sprawl.

If later we outgrow Netlify’s MVP limits or want more out-of-the-box backend tooling, we can still move the data layer later. But for version 1, this is a clean architecture.
