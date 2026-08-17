const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(process.cwd(), "data", "kiavik-prints.db");
const shopName = process.env.SHOP_NAME || "Kiavik Prints";
const currencyCode = (process.env.SHOP_CURRENCY || "AUD").toUpperCase();
const shippingOptions = [
  { code: "delivery", label: "Standard delivery", amountCents: 1200 },
  { code: "pickup", label: "Pickup", amountCents: 0 },
];

const sampleProducts = [
  {
    name: "Custom Name Keychain",
    category: "Keychains",
    description:
      "Lightweight personalized keychain with a single color body and raised custom text.",
    priceCents: 800,
    imageData: "",
    sizeOptions: ["Small", "Medium"],
    colorOptions: ["Black", "White", "Pink", "Blue"],
    customTextEnabled: 1,
    isActive: 1,
  },
  {
    name: "Custom Club Badge",
    category: "Badges",
    description:
      "Round or oval 3D printed badge for clubs and community groups with multiple attachment options.",
    priceCents: 1200,
    imageData: "",
    sizeOptions: ["30mm", "45mm", "55mm"],
    colorOptions: ["Black + Gold", "White + Gold", "Silver + Black"],
    customTextEnabled: 1,
    isActive: 1,
  },
  {
    name: "Desk Name Plate",
    category: "Desk Signs",
    description:
      "Freestanding desk plate with custom name text and bold dual-color print styling.",
    priceCents: 1800,
    imageData: "",
    sizeOptions: ["Standard", "Wide"],
    colorOptions: ["Black + Gold", "White + Black", "Navy + White"],
    customTextEnabled: 1,
    isActive: 1,
  },
];

let db;
let ready = false;

function timestamp() {
  return new Date().toISOString();
}

function makeId() {
  return crypto.randomUUID();
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  return normalizeString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMoney(cents) {
  return (normalizeNumber(cents) / 100).toFixed(2);
}

function ensureDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  db = new DatabaseSync(databasePath);
  db.exec("pragma journal_mode = wal;");
  db.exec("pragma foreign_keys = on;");
  return db;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || "").split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function parseJsonField(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : fallback;
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureSchema() {
  if (ready) {
    return;
  }

  const sqlite = ensureDb();
  sqlite.exec(`
    create table if not exists kp_users (
      id text primary key,
      full_name text not null,
      email text not null unique,
      password_hash text not null,
      is_admin integer not null default 0,
      created_at text not null
    );

    create table if not exists kp_sessions (
      id text primary key,
      user_id text not null,
      token text not null unique,
      expires_at text not null,
      created_at text not null,
      foreign key (user_id) references kp_users(id) on delete cascade
    );

    create table if not exists kp_products (
      id text primary key,
      slug text not null unique,
      name text not null,
      category text not null default '',
      description text not null default '',
      price_cents integer not null,
      image_data text not null default '',
      size_options text not null default '[]',
      color_options text not null default '[]',
      custom_text_enabled integer not null default 0,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists kp_orders (
      id text primary key,
      order_number text not null unique,
      user_id text,
      customer_name text not null,
      customer_email text not null,
      customer_phone text not null default '',
      shipping_name text not null,
      shipping_email text not null,
      shipping_phone text not null default '',
      address_line1 text not null,
      address_line2 text not null default '',
      suburb text not null,
      state text not null,
      postcode text not null,
      country text not null,
      delivery_method text not null,
      order_notes text not null default '',
      subtotal_cents integer not null,
      shipping_cents integer not null,
      total_cents integer not null,
      currency_code text not null,
      payment_method text not null,
      payment_status text not null,
      paypal_order_id text not null default '',
      paypal_capture_id text not null default '',
      created_at text not null,
      updated_at text not null,
      foreign key (user_id) references kp_users(id) on delete set null
    );

    create table if not exists kp_order_items (
      id text primary key,
      order_id text not null,
      product_id text,
      product_name text not null,
      unit_price_cents integer not null,
      quantity integer not null,
      size_choice text not null default '',
      color_choice text not null default '',
      custom_text text not null default '',
      line_total_cents integer not null,
      foreign key (order_id) references kp_orders(id) on delete cascade
    );
  `);

  seedDefaults();
  ready = true;
}

function seedDefaults() {
  const sqlite = ensureDb();
  const count = sqlite.prepare("select count(*) as count from kp_products").get().count;
  if (!count) {
    const insert = sqlite.prepare(`
      insert into kp_products (
        id, slug, name, category, description, price_cents, image_data,
        size_options, color_options, custom_text_enabled, is_active, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const product of sampleProducts) {
      const now = timestamp();
      insert.run(
        makeId(),
        slugify(product.name),
        product.name,
        product.category,
        product.description,
        product.priceCents,
        product.imageData,
        JSON.stringify(product.sizeOptions),
        JSON.stringify(product.colorOptions),
        product.customTextEnabled,
        product.isActive,
        now,
        now,
      );
    }
  }

  const adminCount = sqlite.prepare("select count(*) as count from kp_users where is_admin = 1").get().count;
  if (!adminCount) {
    const now = timestamp();
    const adminEmail = normalizeString(process.env.ADMIN_EMAIL || "admin@kiavik.local").toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
    sqlite
      .prepare(`
        insert into kp_users (id, full_name, email, password_hash, is_admin, created_at)
        values (?, ?, ?, ?, 1, ?)
      `)
      .run(makeId(), "Kiavik Admin", adminEmail, hashPassword(adminPassword), now);
  }
}

function toProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    priceCents: row.price_cents,
    priceLabel: formatMoney(row.price_cents),
    imageData: row.image_data,
    sizeOptions: parseJsonField(row.size_options, []),
    colorOptions: parseJsonField(row.color_options, []),
    customTextEnabled: Boolean(row.custom_text_enabled),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
  };
}

function createSession(userId) {
  ensureSchema();
  const sqlite = ensureDb();
  const id = makeId();
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
  sqlite
    .prepare(`
      insert into kp_sessions (id, user_id, token, expires_at, created_at)
      values (?, ?, ?, ?, ?)
    `)
    .run(id, userId, token, expiresAt, now.toISOString());
  return { token, expiresAt };
}

function getUserByEmail(email) {
  ensureSchema();
  const sqlite = ensureDb();
  return sqlite
    .prepare("select * from kp_users where lower(email) = lower(?)")
    .get(normalizeString(email).toLowerCase());
}

function getSessionByToken(token) {
  ensureSchema();
  if (!token) {
    return null;
  }

  const sqlite = ensureDb();
  const row = sqlite
    .prepare(`
      select s.*, u.full_name, u.email, u.is_admin, u.created_at as user_created_at
      from kp_sessions s
      join kp_users u on u.id = s.user_id
      where s.token = ?
    `)
    .get(token);

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    sqlite.prepare("delete from kp_sessions where token = ?").run(token);
    return null;
  }

  return {
    id: row.id,
    token: row.token,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      fullName: row.full_name,
      email: row.email,
      isAdmin: Boolean(row.is_admin),
      createdAt: row.user_created_at,
    },
  };
}

function destroySession(token) {
  ensureSchema();
  if (!token) {
    return;
  }
  ensureDb().prepare("delete from kp_sessions where token = ?").run(token);
}

function signupUser(input) {
  ensureSchema();
  const fullName = normalizeString(input.fullName);
  const email = normalizeString(input.email).toLowerCase();
  const password = String(input.password || "");

  if (!fullName || !email || !password) {
    throw new Error("Name, email, and password are required.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (getUserByEmail(email)) {
    throw new Error("An account with this email already exists.");
  }

  const sqlite = ensureDb();
  const now = timestamp();
  const id = makeId();
  sqlite
    .prepare(`
      insert into kp_users (id, full_name, email, password_hash, is_admin, created_at)
      values (?, ?, ?, ?, 0, ?)
    `)
    .run(id, fullName, email, hashPassword(password), now);

  return toUser(sqlite.prepare("select * from kp_users where id = ?").get(id));
}

function loginUser(input) {
  ensureSchema();
  const email = normalizeString(input.email).toLowerCase();
  const password = String(input.password || "");
  const user = getUserByEmail(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }

  return toUser(user);
}

function sanitizeProductInput(input, existing = null) {
  const name = normalizeString(input.name);
  const category = normalizeString(input.category);
  const description = normalizeString(input.description);
  const priceCents = Math.round(normalizeNumber(input.price, existing ? existing.price_cents / 100 : 0) * 100);
  const slug = slugify(input.slug || name || (existing ? existing.slug : ""));
  const imageData = normalizeString(input.imageData);
  const sizeOptions = parseList(input.sizeOptions);
  const colorOptions = parseList(input.colorOptions);
  const customTextEnabled = Boolean(input.customTextEnabled) ? 1 : 0;
  const isActive = Boolean(input.isActive) ? 1 : 0;

  if (!name) {
    throw new Error("Product name is required.");
  }

  if (!slug) {
    throw new Error("Product slug could not be generated.");
  }

  if (!Number.isFinite(priceCents) || priceCents < 0) {
    throw new Error("Product price is invalid.");
  }

  return {
    slug,
    name,
    category,
    description,
    priceCents,
    imageData,
    sizeOptions,
    colorOptions,
    customTextEnabled,
    isActive,
  };
}

function listPublicProducts() {
  ensureSchema();
  return ensureDb()
    .prepare("select * from kp_products where is_active = 1 order by created_at desc")
    .all()
    .map(toProduct);
}

function listAdminProducts() {
  ensureSchema();
  return ensureDb()
    .prepare("select * from kp_products order by updated_at desc")
    .all()
    .map(toProduct);
}

function upsertProduct(input) {
  ensureSchema();
  const sqlite = ensureDb();
  const existing = input.id
    ? sqlite.prepare("select * from kp_products where id = ?").get(input.id)
    : null;
  const product = sanitizeProductInput(input, existing);

  const duplicate = sqlite
    .prepare("select id from kp_products where slug = ? and id != ?")
    .get(product.slug, input.id || "");
  if (duplicate) {
    throw new Error("Another product already uses this slug.");
  }

  const now = timestamp();
  if (existing) {
    sqlite
      .prepare(`
        update kp_products
        set slug = ?, name = ?, category = ?, description = ?, price_cents = ?, image_data = ?,
            size_options = ?, color_options = ?, custom_text_enabled = ?, is_active = ?, updated_at = ?
        where id = ?
      `)
      .run(
        product.slug,
        product.name,
        product.category,
        product.description,
        product.priceCents,
        product.imageData,
        JSON.stringify(product.sizeOptions),
        JSON.stringify(product.colorOptions),
        product.customTextEnabled,
        product.isActive,
        now,
        existing.id,
      );
      return toProduct(sqlite.prepare("select * from kp_products where id = ?").get(existing.id));
  }

  const id = makeId();
  sqlite
    .prepare(`
      insert into kp_products (
        id, slug, name, category, description, price_cents, image_data,
        size_options, color_options, custom_text_enabled, is_active, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      product.slug,
      product.name,
      product.category,
      product.description,
      product.priceCents,
      product.imageData,
      JSON.stringify(product.sizeOptions),
      JSON.stringify(product.colorOptions),
      product.customTextEnabled,
      product.isActive,
      now,
      now,
    );
  return toProduct(sqlite.prepare("select * from kp_products where id = ?").get(id));
}

function deleteProduct(id) {
  ensureSchema();
  if (!id) {
    throw new Error("Product id is required.");
  }
  ensureDb().prepare("delete from kp_products where id = ?").run(id);
  return { success: true };
}

function buildOrderItems(items) {
  const sqlite = ensureDb();
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Your cart is empty.");
  }

  const findProduct = sqlite.prepare("select * from kp_products where id = ? and is_active = 1");
  const builtItems = [];
  let subtotalCents = 0;

  for (const rawItem of items) {
    const product = findProduct.get(rawItem.productId);
    if (!product) {
      throw new Error("One of the selected products is no longer available.");
    }

    const quantity = Math.max(1, Math.min(99, Math.round(normalizeNumber(rawItem.quantity, 1))));
    const sizeChoice = normalizeString(rawItem.sizeChoice);
    const colorChoice = normalizeString(rawItem.colorChoice);
    const customText = normalizeString(rawItem.customText);
    const lineTotalCents = product.price_cents * quantity;
    subtotalCents += lineTotalCents;

    builtItems.push({
      id: makeId(),
      productId: product.id,
      productName: product.name,
      unitPriceCents: product.price_cents,
      quantity,
      sizeChoice,
      colorChoice,
      customText,
      lineTotalCents,
    });
  }

  return { builtItems, subtotalCents };
}

function listOrderItems(orderId) {
  return ensureDb()
    .prepare("select * from kp_order_items where order_id = ?")
    .all(orderId)
    .map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      unitPriceCents: row.unit_price_cents,
      unitPriceLabel: formatMoney(row.unit_price_cents),
      quantity: row.quantity,
      sizeChoice: row.size_choice,
      colorChoice: row.color_choice,
      customText: row.custom_text,
      lineTotalCents: row.line_total_cents,
      lineTotalLabel: formatMoney(row.line_total_cents),
    }));
}

function toOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    shippingName: row.shipping_name,
    shippingEmail: row.shipping_email,
    shippingPhone: row.shipping_phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    country: row.country,
    deliveryMethod: row.delivery_method,
    orderNotes: row.order_notes,
    subtotalCents: row.subtotal_cents,
    subtotalLabel: formatMoney(row.subtotal_cents),
    shippingCents: row.shipping_cents,
    shippingLabel: formatMoney(row.shipping_cents),
    totalCents: row.total_cents,
    totalLabel: formatMoney(row.total_cents),
    currencyCode: row.currency_code,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paypalOrderId: row.paypal_order_id,
    paypalCaptureId: row.paypal_capture_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: listOrderItems(row.id),
  };
}

function getOrdersForUser(userId) {
  ensureSchema();
  if (!userId) {
    return [];
  }

  return ensureDb()
    .prepare("select * from kp_orders where user_id = ? order by created_at desc")
    .all(userId)
    .map(toOrder);
}

function listAdminOrders() {
  ensureSchema();
  return ensureDb()
    .prepare("select * from kp_orders order by created_at desc limit 50")
    .all()
    .map(toOrder);
}

function createPreviewOrder(input, sessionUser = null) {
  ensureSchema();
  const sqlite = ensureDb();
  const customerName = normalizeString(input.customerName || sessionUser?.fullName);
  const customerEmail = normalizeString(input.customerEmail || sessionUser?.email).toLowerCase();
  const customerPhone = normalizeString(input.customerPhone);
  const shippingName = normalizeString(input.shippingName || customerName);
  const shippingEmail = normalizeString(input.shippingEmail || customerEmail).toLowerCase();
  const shippingPhone = normalizeString(input.shippingPhone || customerPhone);
  const addressLine1 = normalizeString(input.addressLine1);
  const addressLine2 = normalizeString(input.addressLine2);
  const suburb = normalizeString(input.suburb);
  const state = normalizeString(input.state);
  const postcode = normalizeString(input.postcode);
  const country = normalizeString(input.country || "Australia");
  const deliveryMethod = normalizeString(input.deliveryMethod || "delivery");
  const orderNotes = normalizeString(input.orderNotes);
  const { builtItems, subtotalCents } = buildOrderItems(input.items);
  const shippingOption = shippingOptions.find((option) => option.code === deliveryMethod);

  if (!customerName || !customerEmail || !shippingName || !shippingEmail || !addressLine1 || !suburb || !state || !postcode) {
    throw new Error("Please complete the contact and shipping details.");
  }

  if (!shippingOption) {
    throw new Error("Selected delivery method is invalid.");
  }

  const shippingCents = shippingOption.amountCents;
  const totalCents = subtotalCents + shippingCents;
  const now = timestamp();
  const orderId = makeId();
  const orderNumber = `KP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
    1000 + Math.random() * 9000,
  )}`;

  sqlite
    .prepare(`
      insert into kp_orders (
        id, order_number, user_id, customer_name, customer_email, customer_phone,
        shipping_name, shipping_email, shipping_phone, address_line1, address_line2,
        suburb, state, postcode, country, delivery_method, order_notes, subtotal_cents,
        shipping_cents, total_cents, currency_code, payment_method, payment_status,
        paypal_order_id, paypal_capture_id, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)
    `)
    .run(
      orderId,
      orderNumber,
      sessionUser?.id || null,
      customerName,
      customerEmail,
      customerPhone,
      shippingName,
      shippingEmail,
      shippingPhone,
      addressLine1,
      addressLine2,
      suburb,
      state,
      postcode,
      country,
      deliveryMethod,
      orderNotes,
      subtotalCents,
      shippingCents,
      totalCents,
      currencyCode,
      "paypal",
      "preview_pending",
      now,
      now,
    );

  const insertItem = sqlite.prepare(`
    insert into kp_order_items (
      id, order_id, product_id, product_name, unit_price_cents, quantity,
      size_choice, color_choice, custom_text, line_total_cents
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of builtItems) {
    insertItem.run(
      item.id,
      orderId,
      item.productId,
      item.productName,
      item.unitPriceCents,
      item.quantity,
      item.sizeChoice,
      item.colorChoice,
      item.customText,
      item.lineTotalCents,
    );
  }

  return toOrder(sqlite.prepare("select * from kp_orders where id = ?").get(orderId));
}

function createDraftOrder(input, sessionUser = null) {
  return createPreviewOrder(input, sessionUser);
}

function updateOrderPayment(orderId, updates) {
  ensureSchema();
  const sqlite = ensureDb();
  const existing = sqlite.prepare("select * from kp_orders where id = ?").get(orderId);
  if (!existing) {
    throw new Error("Order not found.");
  }

  sqlite
    .prepare(`
      update kp_orders
      set payment_status = ?, paypal_order_id = ?, paypal_capture_id = ?, updated_at = ?
      where id = ?
    `)
    .run(
      normalizeString(updates.paymentStatus || existing.payment_status),
      normalizeString(updates.paypalOrderId || existing.paypal_order_id),
      normalizeString(updates.paypalCaptureId || existing.paypal_capture_id),
      timestamp(),
      orderId,
    );

  return toOrder(sqlite.prepare("select * from kp_orders where id = ?").get(orderId));
}

function getBootstrap(sessionToken) {
  ensureSchema();
  const session = getSessionByToken(sessionToken);
  return {
    shop: {
      name: shopName,
      currencyCode,
      shippingOptions,
    },
    config: {
      paypalConfigured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
      paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
      paypalEnv: normalizeString(process.env.PAYPAL_ENV || "sandbox") || "sandbox",
    },
    session: session
      ? {
          user: session.user,
          orders: getOrdersForUser(session.user.id),
        }
      : null,
    products: listPublicProducts(),
  };
}

module.exports = {
  createDraftOrder,
  createPreviewOrder,
  createSession,
  deleteProduct,
  destroySession,
  getBootstrap,
  getOrdersForUser,
  getSessionByToken,
  listAdminOrders,
  listAdminProducts,
  loginUser,
  shippingOptions,
  signupUser,
  toUser,
  updateOrderPayment,
  upsertProduct,
};
