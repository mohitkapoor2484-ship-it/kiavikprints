# Kiavik Prints MVP Scope

## Step 1 Outcome

This document locks the version 1 scope for `Kiavik Prints` so the build can start without scope drift.

## Project Goal

Launch a small online store for `Kiavik Prints` where customers can:

- browse a starter product catalog
- add products to a cart
- create an account or continue as a guest
- enter shipping details
- pay with PayPal
- place an order successfully

The system must store the order in the database so it can be reviewed and fulfilled.

## MVP Success Criteria

Version 1 is successful if:

- at least `5 to 10` products can be listed online
- a customer can buy as a guest
- a customer can also create an account and log in
- checkout collects contact and shipping details
- PayPal payment completes successfully
- the order is saved with items, totals, shipping info, and payment status
- logged-in customers can view their past orders

## In Scope

### Storefront

- homepage
- shop page
- product detail page
- cart page
- checkout page
- login/signup page
- account orders page
- order success page

### Product Catalog

- small starter catalog managed through a non-code editor
- basic product data:
  - name
  - slug
  - description
  - price
  - product images
  - active/inactive status
- basic options for selected products:
  - size
  - color
  - custom text
  - quantity

### Checkout

- guest checkout
- account checkout
- shipping details collection
- contact email and phone capture
- order notes field
- PayPal checkout integration

### Account Features

- sign up
- sign in
- order history for signed-in users

### Order Storage

- save customer details at time of purchase
- save shipping address on the order
- save ordered items and selected options
- save subtotal, shipping, total, and payment status
- save PayPal order IDs and capture IDs

## Catalog Management Requirement

For MVP, products must be manageable without coding.

This means a non-technical person should be able to:

- add a product
- edit a product
- upload or replace product images
- hide a product
- delete a product

Direct database editing should **not** be the normal workflow for daily product updates.

## Recommended Catalog Approach

Recommended option:

- use a simple internal product editor for the catalog
- keep products, accounts, orders, and images inside the Netlify stack

This keeps catalog editing easy for family members while avoiding an extra external backend for core store data.

## Not Recommended for Daily Product Editing

- raw database tables
- SQL scripts
- Git commits for product changes
- code-only product files

## Out of Scope for Version 1

These items are intentionally excluded unless later promoted into scope:

- file uploads for STL, 3MF, logos, or artwork
- quote-only workflow
- custom pricing engine
- discount codes
- inventory tracking
- live shipping carrier rates
- advanced custom admin dashboard
- customer reviews
- wishlist
- marketplace integrations
- advanced analytics

## Core User Flows

### Guest Checkout

1. Customer opens the store.
2. Customer browses products and adds items to cart.
3. Customer proceeds to checkout as guest.
4. Customer enters contact and shipping details.
5. Customer pays with PayPal.
6. Order is stored with payment confirmation.
7. Customer sees order success page.

### Account Checkout

1. Customer signs up or logs in.
2. Customer browses products and adds items to cart.
3. Customer checks out with saved account identity.
4. Customer enters shipping details.
5. Customer pays with PayPal.
6. Order is stored and linked to the user account.
7. Customer can view the order later in account history.

## Data We Need to Build Next

Before implementation starts, the next required inputs are:

- `5 to 10` starter products
- price for each product
- options for each product
- shipping rules
- pickup vs delivery decision
- contact email
- phone or WhatsApp contact
- logo or temporary brand treatment

## Recommended Technical Direction

- frontend: `Next.js`
- hosting and functions: `Netlify`
- product editor: simple internal admin page
- database: `Netlify Database`
- customer auth: `Netlify Identity`
- product images: `Netlify Blobs`
- payments: `PayPal`

## Next Step

Step 2 is to define the catalog and data model:

- starter product list
- option structure for each product
- shipping rules
- database tables for products, orders, addresses, and order items
- Identity flow for customer accounts
- internal product editor fields and actions
