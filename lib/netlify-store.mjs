import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";

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
    customTextEnabled: true,
    isActive: true,
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
    customTextEnabled: true,
    isActive: true,
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
    customTextEnabled: true,
    isActive: true,
  },
];

let defaultsPromise;
let pool;

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

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
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

function parseOptionArray(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeString).filter(Boolean);
      }
    } catch {
      return parseList(value);
    }
  }

  return [];
}

function formatMoney(cents) {
  return (normalizeNumber(cents) / 100).toFixed(2);
}

function toIsoString(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
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

function buildOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `KP-${datePart}-${suffix}`;
}

function getPool() {
  if (!pool) {
    pool = getDatabase().pool;
  }

  return pool;
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
    createdAt: toIsoString(row.created_at),
  };
}

function toProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    priceCents: Number(row.price_cents),
    priceLabel: formatMoney(row.price_cents),
    imageData: row.image_data,
    sizeOptions: parseOptionArray(row.size_options),
    colorOptions: parseOptionArray(row.color_options),
    customTextEnabled: Boolean(row.custom_text_enabled),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toOrderItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    unitPriceCents: Number(row.unit_price_cents),
    unitPriceLabel: formatMoney(row.unit_price_cents),
    quantity: Number(row.quantity),
    sizeChoice: row.size_choice,
    colorChoice: row.color_choice,
    customText: row.custom_text,
    lineTotalCents: Number(row.line_total_cents),
    lineTotalLabel: formatMoney(row.line_total_cents),
  };
}

function toBuiltOrderItem(item) {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    unitPriceCents: item.unitPriceCents,
    unitPriceLabel: formatMoney(item.unitPriceCents),
    quantity: item.quantity,
    sizeChoice: item.sizeChoice,
    colorChoice: item.colorChoice,
    customText: item.customText,
    lineTotalCents: item.lineTotalCents,
    lineTotalLabel: formatMoney(item.lineTotalCents),
  };
}

function toOrder(row, items) {
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
    subtotalCents: Number(row.subtotal_cents),
    subtotalLabel: formatMoney(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    shippingLabel: formatMoney(row.shipping_cents),
    totalCents: Number(row.total_cents),
    totalLabel: formatMoney(row.total_cents),
    currencyCode: row.currency_code,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paypalOrderId: row.paypal_order_id,
    paypalCaptureId: row.paypal_capture_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    items,
  };
}

async function ensureDefaults() {
  if (!defaultsPromise) {
    defaultsPromise = seedDefaults().catch((error) => {
      defaultsPromise = null;
      throw error;
    });
  }

  await defaultsPromise;
}

async function seedDefaults() {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const productCount = Number(
      (await client.query("select count(*)::int as count from kp_products")).rows[0]?.count || 0,
    );

    if (!productCount) {
      for (const product of sampleProducts) {
        await client.query(
          `
            insert into kp_products (
              id, slug, name, category, description, price_cents, image_data,
              size_options, color_options, custom_text_enabled, is_active
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
          `,
          [
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
          ],
        );
      }
    }

    const adminCount = Number(
      (
        await client.query("select count(*)::int as count from kp_users where is_admin = true")
      ).rows[0]?.count || 0,
    );

    if (!adminCount) {
      await client.query(
        `
          insert into kp_users (id, full_name, email, password_hash, is_admin)
          values ($1, $2, $3, $4, true)
        `,
        [
          makeId(),
          "Kiavik Admin",
          normalizeEmail(process.env.ADMIN_EMAIL || "admin@kiavik.local"),
          hashPassword(process.env.ADMIN_PASSWORD || "ChangeMe123!"),
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getUserByEmail(email, client = getPool()) {
  const { rows } = await client.query(
    "select * from kp_users where email = $1 limit 1",
    [normalizeEmail(email)],
  );
  return rows[0] || null;
}

async function createSession(userId) {
  await ensureDefaults();

  const id = makeId();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await getPool().query(
    `
      insert into kp_sessions (id, user_id, token, expires_at)
      values ($1, $2, $3, $4)
    `,
    [id, userId, token, expiresAt],
  );

  return { token, expiresAt };
}

async function getSessionByToken(token) {
  await ensureDefaults();

  if (!token) {
    return null;
  }

  const { rows } = await getPool().query(
    `
      select
        s.id,
        s.user_id,
        s.token,
        s.expires_at,
        u.full_name,
        u.email,
        u.is_admin,
        u.created_at as user_created_at
      from kp_sessions s
      join kp_users u on u.id = s.user_id
      where s.token = $1
      limit 1
    `,
    [token],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await getPool().query("delete from kp_sessions where token = $1", [token]);
    return null;
  }

  return {
    id: row.id,
    token: row.token,
    expiresAt: toIsoString(row.expires_at),
    user: {
      id: row.user_id,
      fullName: row.full_name,
      email: row.email,
      isAdmin: Boolean(row.is_admin),
      createdAt: toIsoString(row.user_created_at),
    },
  };
}

async function destroySession(token) {
  await ensureDefaults();

  if (!token) {
    return;
  }

  await getPool().query("delete from kp_sessions where token = $1", [token]);
}

async function signupUser(input) {
  await ensureDefaults();

  const fullName = normalizeString(input.fullName);
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");

  if (!fullName || !email || !password) {
    throw new Error("Name, email, and password are required.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (await getUserByEmail(email)) {
    throw new Error("An account with this email already exists.");
  }

  const { rows } = await getPool().query(
    `
      insert into kp_users (id, full_name, email, password_hash, is_admin)
      values ($1, $2, $3, $4, false)
      returning *
    `,
    [makeId(), fullName, email, hashPassword(password)],
  );

  return toUser(rows[0]);
}

async function loginUser(input) {
  await ensureDefaults();

  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const user = await getUserByEmail(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }

  return toUser(user);
}

function sanitizeProductInput(input, existing = null) {
  const name = normalizeString(input.name);
  const category = normalizeString(input.category);
  const description = normalizeString(input.description);
  const existingPrice = existing ? Number(existing.price_cents) / 100 : 0;
  const rawPrice = input.price ?? input.priceCents ?? existingPrice;
  const priceCents = Math.round(normalizeNumber(rawPrice, existingPrice) * 100);
  const slug = slugify(input.slug || name || existing?.slug || "");
  const imageData = normalizeString(input.imageData);
  const sizeOptions = parseList(input.sizeOptions);
  const colorOptions = parseList(input.colorOptions);
  const customTextEnabled =
    input.customTextEnabled === undefined
      ? Boolean(existing?.custom_text_enabled)
      : Boolean(input.customTextEnabled);
  const isActive =
    input.isActive === undefined ? (existing ? Boolean(existing.is_active) : true) : Boolean(input.isActive);

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

async function listPublicProducts() {
  await ensureDefaults();
  const { rows } = await getPool().query(
    "select * from kp_products where is_active = true order by created_at desc",
  );
  return rows.map(toProduct);
}

async function listAdminProducts() {
  await ensureDefaults();
  const { rows } = await getPool().query("select * from kp_products order by updated_at desc");
  return rows.map(toProduct);
}

async function getProductById(id) {
  const { rows } = await getPool().query("select * from kp_products where id = $1 limit 1", [id]);
  return rows[0] || null;
}

async function upsertProduct(input) {
  await ensureDefaults();

  const existing = input.id ? await getProductById(input.id) : null;
  const product = sanitizeProductInput(input, existing);
  const { rows: duplicateRows } = await getPool().query(
    "select id from kp_products where slug = $1 and id <> $2 limit 1",
    [product.slug, input.id || ""],
  );

  if (duplicateRows[0]) {
    throw new Error("Another product already uses this slug.");
  }

  if (existing) {
    const { rows } = await getPool().query(
      `
        update kp_products
        set
          slug = $1,
          name = $2,
          category = $3,
          description = $4,
          price_cents = $5,
          image_data = $6,
          size_options = $7::jsonb,
          color_options = $8::jsonb,
          custom_text_enabled = $9,
          is_active = $10,
          updated_at = now()
        where id = $11
        returning *
      `,
      [
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
        existing.id,
      ],
    );

    return toProduct(rows[0]);
  }

  const { rows } = await getPool().query(
    `
      insert into kp_products (
        id, slug, name, category, description, price_cents, image_data,
        size_options, color_options, custom_text_enabled, is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
      returning *
    `,
    [
      makeId(),
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
    ],
  );

  return toProduct(rows[0]);
}

async function deleteProduct(id) {
  await ensureDefaults();

  if (!id) {
    throw new Error("Product id is required.");
  }

  await getPool().query("delete from kp_products where id = $1", [id]);
  return { success: true };
}

async function buildOrderItems(items, client) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Your cart is empty.");
  }

  const builtItems = [];
  let subtotalCents = 0;

  for (const rawItem of items) {
    const { rows } = await client.query(
      "select * from kp_products where id = $1 and is_active = true limit 1",
      [rawItem.productId],
    );
    const product = rows[0];

    if (!product) {
      throw new Error("One of the selected products is no longer available.");
    }

    const quantity = Math.max(1, Math.min(99, Math.round(normalizeNumber(rawItem.quantity, 1))));
    const sizeChoice = normalizeString(rawItem.sizeChoice);
    const colorChoice = normalizeString(rawItem.colorChoice);
    const customText = normalizeString(rawItem.customText);
    const unitPriceCents = Number(product.price_cents);
    const lineTotalCents = unitPriceCents * quantity;
    subtotalCents += lineTotalCents;

    builtItems.push({
      id: makeId(),
      productId: product.id,
      productName: product.name,
      unitPriceCents,
      quantity,
      sizeChoice,
      colorChoice,
      customText,
      lineTotalCents,
    });
  }

  return { builtItems, subtotalCents };
}

async function loadOrderItems(orderIds) {
  if (!orderIds.length) {
    return new Map();
  }

  const { rows } = await getPool().query(
    `
      select *
      from kp_order_items
      where order_id = any($1::text[])
      order by created_at asc
    `,
    [orderIds],
  );

  const grouped = new Map();

  for (const row of rows) {
    const item = toOrderItem(row);
    const bucket = grouped.get(row.order_id) || [];
    bucket.push(item);
    grouped.set(row.order_id, bucket);
  }

  return grouped;
}

async function hydrateOrders(rows) {
  if (!rows.length) {
    return [];
  }

  const itemsByOrderId = await loadOrderItems(rows.map((row) => row.id));
  return rows.map((row) => toOrder(row, itemsByOrderId.get(row.id) || []));
}

async function getOrdersForUser(userId) {
  await ensureDefaults();

  if (!userId) {
    return [];
  }

  const { rows } = await getPool().query(
    "select * from kp_orders where user_id = $1 order by created_at desc",
    [userId],
  );

  return hydrateOrders(rows);
}

async function listAdminOrders() {
  await ensureDefaults();

  const { rows } = await getPool().query("select * from kp_orders order by created_at desc limit 50");
  return hydrateOrders(rows);
}

async function createPreviewOrder(input, sessionUser = null) {
  await ensureDefaults();

  const customerName = normalizeString(input.customerName || sessionUser?.fullName);
  const customerEmail = normalizeEmail(input.customerEmail || sessionUser?.email);
  const customerPhone = normalizeString(input.customerPhone);
  const shippingName = normalizeString(input.shippingName || customerName);
  const shippingEmail = normalizeEmail(input.shippingEmail || customerEmail);
  const shippingPhone = normalizeString(input.shippingPhone || customerPhone);
  const addressLine1 = normalizeString(input.addressLine1);
  const addressLine2 = normalizeString(input.addressLine2);
  const suburb = normalizeString(input.suburb);
  const state = normalizeString(input.state);
  const postcode = normalizeString(input.postcode);
  const country = normalizeString(input.country || "Australia");
  const deliveryMethod = normalizeString(input.deliveryMethod || "delivery");
  const orderNotes = normalizeString(input.orderNotes);
  const shippingOption = shippingOptions.find((option) => option.code === deliveryMethod);

  if (
    !customerName ||
    !customerEmail ||
    !shippingName ||
    !shippingEmail ||
    !addressLine1 ||
    !suburb ||
    !state ||
    !postcode
  ) {
    throw new Error("Please complete the contact and shipping details.");
  }

  if (!shippingOption) {
    throw new Error("Selected delivery method is invalid.");
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const { builtItems, subtotalCents } = await buildOrderItems(input.items, client);
    const shippingCents = shippingOption.amountCents;
    const totalCents = subtotalCents + shippingCents;

    const { rows } = await client.query(
      `
        insert into kp_orders (
          id, order_number, user_id, customer_name, customer_email, customer_phone,
          shipping_name, shipping_email, shipping_phone, address_line1, address_line2,
          suburb, state, postcode, country, delivery_method, order_notes, subtotal_cents,
          shipping_cents, total_cents, currency_code, payment_method, payment_status,
          paypal_order_id, paypal_capture_id
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, '', ''
        )
        returning *
      `,
      [
        makeId(),
        buildOrderNumber(),
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
      ],
    );

    const order = rows[0];

    for (const item of builtItems) {
      await client.query(
        `
          insert into kp_order_items (
            id, order_id, product_id, product_name, unit_price_cents, quantity,
            size_choice, color_choice, custom_text, line_total_cents
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          item.id,
          order.id,
          item.productId,
          item.productName,
          item.unitPriceCents,
          item.quantity,
          item.sizeChoice,
          item.colorChoice,
          item.customText,
          item.lineTotalCents,
        ],
      );
    }

    await client.query("COMMIT");
    return toOrder(order, builtItems.map(toBuiltOrderItem));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createDraftOrder(input, sessionUser = null) {
  return createPreviewOrder(input, sessionUser);
}

async function updateOrderPayment(orderId, updates) {
  await ensureDefaults();

  const paymentStatus = updates.paymentStatus ? normalizeString(updates.paymentStatus) : null;
  const paypalOrderId = Object.prototype.hasOwnProperty.call(updates, "paypalOrderId")
    ? normalizeString(updates.paypalOrderId)
    : null;
  const paypalCaptureId = Object.prototype.hasOwnProperty.call(updates, "paypalCaptureId")
    ? normalizeString(updates.paypalCaptureId)
    : null;

  const { rows } = await getPool().query(
    `
      update kp_orders
      set
        payment_status = coalesce($1, payment_status),
        paypal_order_id = coalesce($2, paypal_order_id),
        paypal_capture_id = coalesce($3, paypal_capture_id),
        updated_at = now()
      where id = $4
      returning *
    `,
    [paymentStatus, paypalOrderId, paypalCaptureId, orderId],
  );

  const order = rows[0];
  if (!order) {
    throw new Error("Order not found.");
  }

  const hydrated = await hydrateOrders([order]);
  return hydrated[0];
}

async function getBootstrap(sessionToken) {
  await ensureDefaults();

  const session = await getSessionByToken(sessionToken);
  const [products, orders] = await Promise.all([
    listPublicProducts(),
    session ? getOrdersForUser(session.user.id) : Promise.resolve([]),
  ]);

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
          orders,
        }
      : null,
    products,
  };
}

export {
  createDraftOrder,
  createPreviewOrder,
  createSession,
  deleteProduct,
  destroySession,
  getBootstrap,
  getSessionByToken,
  listAdminOrders,
  listAdminProducts,
  loginUser,
  signupUser,
  updateOrderPayment,
  upsertProduct,
};
