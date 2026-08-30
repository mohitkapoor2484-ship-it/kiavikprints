import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";

function env(name, fallback = "") {
  const value = globalThis.Netlify?.env?.get?.(name);
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

const shopName = () => env("SHOP_NAME", "Kiavik Prints");
const currencyCode = () => env("SHOP_CURRENCY", "AUD").toUpperCase();
const shippingOptions = [
  { code: "delivery", label: "Standard delivery", amountCents: 1200 },
  { code: "pickup", label: "Pickup", amountCents: 0 },
];
const fulfillmentStatuses = new Set(["draft", "awaiting_payment", "received", "in_progress", "awaiting_pickup", "out_for_delivery", "delivered", "completed", "cancelled"]);

const sampleProducts = [
  {
    name: "Custom Name Keychain",
    category: "Keychains",
    description: "Lightweight personalised keychain with raised custom text.",
    priceCents: 800,
    imageData: "",
    sizeOptions: ["Small", "Medium"],
    colorMode: "single",
    colorSlotCount: 1,
    colorOptions: ["Black", "White", "Pink", "Blue"],
    textColorOptions: ["Black", "White", "Pink", "Blue"],
    customTextEnabled: true,
    isActive: true,
  },
  {
    name: "Custom Club Badge",
    category: "Badges",
    description: "Round 3D printed badge for clubs, schools and community groups.",
    priceCents: 1200,
    imageData: "",
    sizeOptions: ["30mm", "45mm", "55mm"],
    colorMode: "multi",
    colorSlotCount: 2,
    colorOptions: ["Black + Gold", "White + Gold", "Teal + Orange"],
    textColorOptions: ["Black", "White", "Gold", "Orange"],
    customTextEnabled: true,
    isActive: true,
  },
  {
    name: "Desk Name Plate",
    category: "Desk Signs",
    description: "Freestanding desk plate with custom name text and dual-colour styling.",
    priceCents: 1800,
    imageData: "",
    sizeOptions: ["Standard", "Wide"],
    colorMode: "multi",
    colorSlotCount: 2,
    colorOptions: ["Black + Gold", "White + Black", "Navy + White"],
    textColorOptions: ["Gold", "White", "Black"],
    customTextEnabled: true,
    isActive: true,
  },
];

let pool;
let defaultsPromise;

function makeId() {
  return crypto.randomUUID();
}

function getPool() {
  if (!pool) pool = getDatabase().pool;
  return pool;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean);
  return normalizeString(value).split(",").map((x) => x.trim()).filter(Boolean);
}

function parseOptionArray(value) {
  if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(normalizeString).filter(Boolean);
    } catch {}
  }
  return parseList(value);
}

function toIso(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function money(cents) {
  return (normalizeNumber(cents) / 100).toFixed(2);
}

function normalizeColorMode(value, fallback = "single") {
  return normalizeString(value || fallback).toLowerCase() === "multi" ? "multi" : "single";
}

function normalizeColorSlotCount(value, fallback = 1, mode = "single") {
  const count = clampNumber(Math.round(normalizeNumber(value, fallback)), 1, 4);
  return mode === "multi" ? Math.max(2, count) : 1;
}

function isClickerProduct(category, subcategory) {
  return normalizeString(category).toLowerCase() === "toys & fidgets"
    && normalizeString(subcategory).toLowerCase() === "clickers";
}

function parseClickerGridSize(value) {
  const match = normalizeString(value).match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return null;
  const columns = Number(match[1]);
  const rows = Number(match[2]);
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns > 10 || rows > 10 || columns * rows > 64) return null;
  return { columns, rows, count: columns * rows };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isAdmin: Boolean(row.is_admin),
    createdAt: toIso(row.created_at),
  };
}

function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory || "",
    description: row.description,
    priceCents: Number(row.price_cents),
    priceLabel: money(row.price_cents),
    extraClickerPriceCents: Number(row.extra_clicker_price_cents || 0),
    extraTextClickerPriceCents: Number(row.extra_text_clicker_price_cents || 0),
    imageData: row.image_data || "",
    sizeOptions: parseOptionArray(row.size_options),
    colorMode: normalizeColorMode(row.color_mode, "single"),
    colorSlotCount: normalizeColorSlotCount(row.color_slot_count, 1, row.color_mode),
    colorOptions: parseOptionArray(row.color_options),
    baseColorOptions: parseOptionArray(row.base_color_options),
    buttonColorOptions: parseOptionArray(row.button_color_options),
    textColorOptions: parseOptionArray(row.text_color_options),
    customTextEnabled: Boolean(row.custom_text_enabled),
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toOrderItem(row) {
  const colorChoices = parseOptionArray(row.color_choices);
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    unitPriceCents: Number(row.unit_price_cents),
    unitPriceLabel: money(row.unit_price_cents),
    quantity: Number(row.quantity),
    sizeChoice: row.size_choice || "",
    colorChoice: row.color_choice || colorChoices.join(" / "),
    colorChoices,
    customText: row.custom_text || "",
    textColorChoice: row.text_color_choice || "",
    lineTotalCents: Number(row.line_total_cents),
    lineTotalLabel: money(row.line_total_cents),
  };
}

function toOrder(row, items = []) {
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
    subtotalLabel: money(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    shippingLabel: money(row.shipping_cents),
    totalCents: Number(row.total_cents),
    totalLabel: money(row.total_cents),
    currencyCode: row.currency_code,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status || "received",
    paypalOrderId: row.paypal_order_id || "",
    paypalCaptureId: row.paypal_capture_id || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
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
    const productCount = Number((await client.query("select count(*)::int as count from kp_products")).rows[0]?.count || 0);
    if (!productCount) {
      for (const product of sampleProducts) {
        await client.query(
          `insert into kp_products
          (id, slug, name, category, description, price_cents, image_data, size_options, color_mode, color_slot_count, color_options, text_color_options, custom_text_enabled, is_active)
          values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12::jsonb,$13,$14)`,
          [
            makeId(), slugify(product.name), product.name, product.category, product.description,
            product.priceCents, product.imageData, JSON.stringify(product.sizeOptions),
            product.colorMode, product.colorSlotCount, JSON.stringify(product.colorOptions), JSON.stringify(product.textColorOptions),
            product.customTextEnabled, product.isActive,
          ],
        );
      }
    }

    const adminCount = Number((await client.query("select count(*)::int as count from kp_users where is_admin=true")).rows[0]?.count || 0);
    const adminEmail = env("ADMIN_EMAIL");
    const adminPassword = env("ADMIN_PASSWORD");
    if (!adminEmail || !adminPassword) {
      if (!adminCount) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be configured before the first database seed.");
      }
    } else {
      const normalizedAdminEmail = normalizeEmail(adminEmail);
      const { rows: existingAdminRows } = await client.query("select * from kp_users where email=$1 limit 1", [normalizedAdminEmail]);
      const existingAdmin = existingAdminRows[0] || null;

      if (!existingAdmin) {
        await client.query(
          "insert into kp_users (id, full_name, email, password_hash, is_admin) values ($1,$2,$3,$4,true)",
          [makeId(), "Kiavik Admin", normalizedAdminEmail, hashPassword(adminPassword)],
        );
      } else if (
        !Boolean(existingAdmin.is_admin)
        || existingAdmin.full_name !== "Kiavik Admin"
        || !verifyPassword(adminPassword, existingAdmin.password_hash)
      ) {
        await client.query(
          "update kp_users set full_name=$2, password_hash=$3, is_admin=true where id=$1",
          [existingAdmin.id, "Kiavik Admin", hashPassword(adminPassword)],
        );
      }

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
  const { rows } = await client.query("select * from kp_users where email=$1 limit 1", [normalizeEmail(email)]);
  return rows[0] || null;
}

async function getOrderItems(orderId, client = getPool()) {
  const { rows } = await client.query("select * from kp_order_items where order_id=$1 order by created_at asc", [orderId]);
  return rows.map(toOrderItem);
}

async function getOrders(whereSql = "", params = []) {
  const { rows } = await getPool().query(`select * from kp_orders ${whereSql} order by created_at desc`, params);
  const result = [];
  for (const row of rows) result.push(toOrder(row, await getOrderItems(row.id)));
  return result;
}

export async function createSession(userId) {
  await ensureDefaults();
  const id = makeId();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await getPool().query("insert into kp_sessions (id,user_id,token,expires_at) values ($1,$2,$3,$4)", [id, userId, token, expiresAt]);
  return { token, expiresAt };
}

export async function getSessionByToken(token) {
  await ensureDefaults();
  if (!token) return null;
  const { rows } = await getPool().query(
    `select s.id,s.user_id,s.token,s.expires_at,u.full_name,u.email,u.is_admin,u.created_at as user_created_at
     from kp_sessions s join kp_users u on u.id=s.user_id where s.token=$1 limit 1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await getPool().query("delete from kp_sessions where token=$1", [token]);
    return null;
  }
  return {
    id: row.id,
    token: row.token,
    expiresAt: toIso(row.expires_at),
    user: { id: row.user_id, fullName: row.full_name, email: row.email, isAdmin: Boolean(row.is_admin), createdAt: toIso(row.user_created_at) },
  };
}

export async function destroySession(token) {
  await ensureDefaults();
  if (token) await getPool().query("delete from kp_sessions where token=$1", [token]);
}

export async function signupUser(input) {
  await ensureDefaults();
  const fullName = normalizeString(input.fullName);
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  if (!fullName || !email || !password) throw new Error("Name, email and password are required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (await getUserByEmail(email)) throw new Error("An account with this email already exists.");
  const { rows } = await getPool().query(
    "insert into kp_users (id,full_name,email,password_hash,is_admin) values ($1,$2,$3,$4,false) returning *",
    [makeId(), fullName, email, hashPassword(password)],
  );
  return toUser(rows[0]);
}

export async function loginUser(input) {
  await ensureDefaults();
  const user = await getUserByEmail(input.email);
  if (!user || !verifyPassword(String(input.password || ""), user.password_hash)) throw new Error("Invalid email or password.");
  return toUser(user);
}

export async function listPublicProducts() {
  await ensureDefaults();
  const { rows } = await getPool().query("select * from kp_products where is_active=true order by updated_at desc");
  return rows.map(toProduct);
}

export async function listAdminProducts() {
  await ensureDefaults();
  const { rows } = await getPool().query("select * from kp_products order by updated_at desc");
  return rows.map(toProduct);
}

function sanitizeProductInput(input, existing = null) {
  const name = normalizeString(input.name || existing?.name);
  if (!name) throw new Error("Product name is required.");
  const category = normalizeString(input.category ?? existing?.category);
  const requestedSubcategory = normalizeString(input.subcategory ?? existing?.subcategory);
  if (requestedSubcategory && !isClickerProduct(category, requestedSubcategory)) {
    throw new Error("Clickers can only be used as a Toys & Fidgets subcategory.");
  }
  const subcategory = isClickerProduct(category, requestedSubcategory) ? "Clickers" : "";
  const description = normalizeString(input.description ?? existing?.description);
  const rawPrice = input.price !== undefined ? input.price : existing ? Number(existing.price_cents) / 100 : 0;
  const priceCents = Math.round(normalizeNumber(rawPrice) * 100);
  if (priceCents < 0) throw new Error("Product price is invalid.");
  const rawExtraClickerPrice = input.extraClickerPrice !== undefined ? input.extraClickerPrice : existing ? Number(existing.extra_clicker_price_cents) / 100 : 0;
  const extraClickerPriceCents = Math.round(normalizeNumber(rawExtraClickerPrice) * 100);
  const rawExtraTextClickerPrice = input.extraTextClickerPrice !== undefined ? input.extraTextClickerPrice : existing ? Number(existing.extra_text_clicker_price_cents) / 100 : 0;
  const extraTextClickerPriceCents = Math.round(normalizeNumber(rawExtraTextClickerPrice) * 100);
  if (extraClickerPriceCents < 0 || extraTextClickerPriceCents < 0) throw new Error("Extra clicker prices cannot be negative.");
  const requestedColorMode = normalizeColorMode(input.colorMode ?? existing?.color_mode, "single");
  const colorMode = requestedColorMode;
  const colorSlotCount = normalizeColorSlotCount(
    input.colorSlotCount ?? existing?.color_slot_count,
    existing?.color_slot_count || 1,
    colorMode,
  );
  const sizeOptions = input.sizeOptions !== undefined ? parseList(input.sizeOptions) : parseOptionArray(existing?.size_options);
  const customTextEnabled = input.customTextEnabled === undefined ? Boolean(existing?.custom_text_enabled) : Boolean(input.customTextEnabled);
  const clickerProduct = isClickerProduct(category, subcategory);
  if (clickerProduct && (!sizeOptions.length || sizeOptions.some((size) => !parseClickerGridSize(size)))) {
    throw new Error("Clicker sizes must use an XxY grid format, such as 1x1 or 2x3.");
  }
  return {
    slug: slugify(input.slug || existing?.slug || name),
    name,
    category,
    subcategory,
    description,
    priceCents,
    extraClickerPriceCents: clickerProduct ? extraClickerPriceCents : 0,
    extraTextClickerPriceCents: clickerProduct ? extraTextClickerPriceCents : 0,
    imageData: input.imageData !== undefined ? normalizeString(input.imageData) : (existing?.image_data || ""),
    sizeOptions,
    colorMode,
    colorSlotCount,
    colorOptions: input.colorOptions !== undefined ? parseList(input.colorOptions) : parseOptionArray(existing?.color_options),
    baseColorOptions: input.baseColorOptions !== undefined ? parseList(input.baseColorOptions) : parseOptionArray(existing?.base_color_options),
    buttonColorOptions: input.buttonColorOptions !== undefined ? parseList(input.buttonColorOptions) : parseOptionArray(existing?.button_color_options),
    textColorOptions: input.textColorOptions !== undefined ? parseList(input.textColorOptions) : parseOptionArray(existing?.text_color_options),
    customTextEnabled,
    isActive: input.isActive === undefined ? (existing ? Boolean(existing.is_active) : true) : Boolean(input.isActive),
  };
}

export async function upsertProduct(input) {
  await ensureDefaults();
  const id = normalizeString(input.id);
  if (id) {
    const { rows } = await getPool().query("select * from kp_products where id=$1 limit 1", [id]);
    if (!rows[0]) throw new Error("Product not found.");
    const p = sanitizeProductInput(input, rows[0]);
    const updated = await getPool().query(
      `update kp_products set slug=$2,name=$3,category=$4,subcategory=$5,description=$6,price_cents=$7,image_data=$8,
       size_options=$9::jsonb,color_mode=$10,color_slot_count=$11,color_options=$12::jsonb,base_color_options=$13::jsonb,button_color_options=$14::jsonb,text_color_options=$15::jsonb,custom_text_enabled=$16,is_active=$17,extra_clicker_price_cents=$18,extra_text_clicker_price_cents=$19,updated_at=now()
       where id=$1 returning *`,
      [
        id, p.slug, p.name, p.category, p.subcategory, p.description, p.priceCents, p.imageData, JSON.stringify(p.sizeOptions),
        p.colorMode, p.colorSlotCount, JSON.stringify(p.colorOptions), JSON.stringify(p.baseColorOptions), JSON.stringify(p.buttonColorOptions),
        JSON.stringify(p.textColorOptions), p.customTextEnabled, p.isActive, p.extraClickerPriceCents, p.extraTextClickerPriceCents,
      ],
    );
    return toProduct(updated.rows[0]);
  }
  const p = sanitizeProductInput(input);
  const created = await getPool().query(
    `insert into kp_products (id,slug,name,category,subcategory,description,price_cents,image_data,size_options,color_mode,color_slot_count,color_options,base_color_options,button_color_options,text_color_options,custom_text_enabled,is_active,extra_clicker_price_cents,extra_text_clicker_price_cents)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18,$19) returning *`,
    [
      makeId(), p.slug, p.name, p.category, p.subcategory, p.description, p.priceCents, p.imageData, JSON.stringify(p.sizeOptions),
      p.colorMode, p.colorSlotCount, JSON.stringify(p.colorOptions), JSON.stringify(p.baseColorOptions), JSON.stringify(p.buttonColorOptions),
      JSON.stringify(p.textColorOptions), p.customTextEnabled, p.isActive, p.extraClickerPriceCents, p.extraTextClickerPriceCents,
    ],
  );
  return toProduct(created.rows[0]);
}

export async function deleteProduct(id) {
  await ensureDefaults();
  if (!id) throw new Error("Product id is required.");
  const result = await getPool().query("delete from kp_products where id=$1", [id]);
  return { success: result.rowCount > 0 };
}

function buildOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `KP-${date}-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function buildOrderInput(input, user, paymentMethod, paymentStatus) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw new Error("Your cart is empty.");
  const ids = [...new Set(items.map((i) => normalizeString(i.productId)).filter(Boolean))];
  const { rows } = await getPool().query("select * from kp_products where id=any($1::text[]) and is_active=true", [ids]);
  const map = new Map(rows.map((row) => [row.id, row]));
  const builtItems = [];
  let subtotalCents = 0;
  for (const raw of items) {
    const product = map.get(normalizeString(raw.productId));
    if (!product) throw new Error("One of the products in your cart is unavailable.");
    const quantity = Math.max(1, Math.min(99, Math.floor(normalizeNumber(raw.quantity, 1))));
    const colorMode = normalizeColorMode(product.color_mode, "single");
    const colorSlotCount = normalizeColorSlotCount(product.color_slot_count, 1, colorMode);
    const allowedColors = parseOptionArray(product.color_options);
    const baseColorOptions = parseOptionArray(product.base_color_options);
    const buttonColorOptions = parseOptionArray(product.button_color_options);
    const colorChoices = (
      Array.isArray(raw.colorChoices)
        ? raw.colorChoices
        : normalizeString(raw.colorChoice)
          ? [raw.colorChoice]
          : []
    ).map((choice) => normalizeString(choice)).filter(Boolean);
    if (baseColorOptions.length || buttonColorOptions.length) {
      const expectedChoices = Number(Boolean(baseColorOptions.length)) + Number(Boolean(buttonColorOptions.length));
      if (colorChoices.length !== expectedChoices) {
        throw new Error(`${product.name} needs ${expectedChoices === 2 ? "a base and click-button colour" : "a colour"} selection.`);
      }
      let choiceIndex = 0;
      if (baseColorOptions.length && !baseColorOptions.includes(colorChoices[choiceIndex++])) {
        throw new Error(`The selected base colour for ${product.name} is unavailable.`);
      }
      if (buttonColorOptions.length && !buttonColorOptions.includes(colorChoices[choiceIndex])) {
        throw new Error(`The selected click-button colour for ${product.name} is unavailable.`);
      }
    } else if (allowedColors.length) {
      if (colorChoices.length !== colorSlotCount) {
        throw new Error(`${product.name} needs ${colorSlotCount} colour selection${colorSlotCount > 1 ? "s" : ""}.`);
      }
      if (colorChoices.some((choice) => !allowedColors.includes(choice))) {
        throw new Error(`One of the selected colours for ${product.name} is unavailable.`);
      }
    } else if (colorChoices.length) {
      throw new Error(`${product.name} does not use selectable colours.`);
    }
    const customText = normalizeString(raw.customText);
    if (customText && !Boolean(product.custom_text_enabled)) {
      throw new Error(`${product.name} does not allow custom text.`);
    }
    if (isClickerProduct(product.category, product.subcategory) && Boolean(product.custom_text_enabled) && !customText) {
      throw new Error(`${product.name} needs custom text in every clicker square.`);
    }
    let clickerGrid = null;
    if (isClickerProduct(product.category, product.subcategory)) {
      const selectedSize = normalizeString(raw.sizeChoice);
      if (!parseOptionArray(product.size_options).includes(selectedSize)) {
        throw new Error(`${product.name} does not offer the selected clicker size.`);
      }
      clickerGrid = parseClickerGridSize(selectedSize);
      if (!clickerGrid) throw new Error(`${product.name} needs a clicker size in XxY format.`);
    }
    if (clickerGrid && customText) {
      const grid = clickerGrid;
      if (!new RegExp(`^[A-Za-z0-9]{${grid.count}}$`).test(customText)) {
        throw new Error(`${product.name} needs exactly ${grid.count} letters or numbers for its ${grid.columns}x${grid.rows} grid.`);
      }
    }
    const textColorOptions = parseOptionArray(product.text_color_options);
    const textColorChoice = normalizeString(raw.textColorChoice);
    if (textColorChoice && textColorOptions.length && !textColorOptions.includes(textColorChoice)) {
      throw new Error(`The selected text colour for ${product.name} is unavailable.`);
    }
    if (customText && textColorOptions.length && !textColorChoice) {
      throw new Error(`Please choose a text colour for ${product.name}.`);
    }
    const extraClickers = Math.max(0, (clickerGrid?.count || 1) - 1);
    const extraClickerPriceCents = customText ? Number(product.extra_text_clicker_price_cents || 0) : Number(product.extra_clicker_price_cents || 0);
    const unitPriceCents = Number(product.price_cents) + extraClickers * extraClickerPriceCents;
    const lineTotalCents = unitPriceCents * quantity;
    subtotalCents += lineTotalCents;
    builtItems.push({
      id: makeId(), productId: product.id, productName: product.name, unitPriceCents, quantity,
      sizeChoice: normalizeString(raw.sizeChoice),
      colorChoice: colorChoices.join(" / "),
      colorChoices,
      customText,
      textColorChoice,
      lineTotalCents,
    });
  }

  const deliveryMethod = normalizeString(input.deliveryMethod || "delivery");
  const shipping = shippingOptions.find((x) => x.code === deliveryMethod) || shippingOptions[0];
  const customerName = normalizeString(input.customerName || user?.fullName);
  const customerEmail = normalizeEmail(input.customerEmail || user?.email);
  if (!customerName || !customerEmail) throw new Error("Customer name and email are required.");
  const shippingName = normalizeString(input.shippingName || customerName);
  const country = normalizeString(input.country || "Australia");
  if (deliveryMethod !== "pickup") {
    if (!normalizeString(input.addressLine1) || !normalizeString(input.suburb) || !normalizeString(input.state) || !normalizeString(input.postcode)) {
      throw new Error("Shipping address is incomplete.");
    }
  }
  return {
    id: makeId(), orderNumber: buildOrderNumber(), userId: user?.id || null, customerName, customerEmail,
    customerPhone: normalizeString(input.customerPhone), shippingName, shippingEmail: customerEmail,
    shippingPhone: normalizeString(input.customerPhone), addressLine1: normalizeString(input.addressLine1),
    addressLine2: normalizeString(input.addressLine2), suburb: normalizeString(input.suburb), state: normalizeString(input.state),
    postcode: normalizeString(input.postcode), country, deliveryMethod, orderNotes: normalizeString(input.orderNotes),
    subtotalCents, shippingCents: shipping.amountCents, totalCents: subtotalCents + shipping.amountCents,
    currencyCode: currencyCode(), paymentMethod, paymentStatus, items: builtItems,
  };
}

async function persistOrder(order) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into kp_orders
      (id,order_number,user_id,customer_name,customer_email,customer_phone,shipping_name,shipping_email,shipping_phone,
       address_line1,address_line2,suburb,state,postcode,country,delivery_method,order_notes,subtotal_cents,shipping_cents,total_cents,
       currency_code,payment_method,payment_status,fulfillment_status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning *`,
      [order.id,order.orderNumber,order.userId,order.customerName,order.customerEmail,order.customerPhone,order.shippingName,
       order.shippingEmail,order.shippingPhone,order.addressLine1,order.addressLine2,order.suburb,order.state,order.postcode,
       order.country,order.deliveryMethod,order.orderNotes,order.subtotalCents,order.shippingCents,order.totalCents,order.currencyCode,
       order.paymentMethod,order.paymentStatus,order.fulfillmentStatus || "received"],
    );
    for (const item of order.items) {
      await client.query(
        `insert into kp_order_items (id,order_id,product_id,product_name,unit_price_cents,quantity,size_choice,color_choice,color_choices,custom_text,text_color_choice,line_total_cents)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
        [
          item.id, order.id, item.productId, item.productName, item.unitPriceCents, item.quantity, item.sizeChoice,
          item.colorChoice, JSON.stringify(item.colorChoices), item.customText, item.textColorChoice, item.lineTotalCents,
        ],
      );
    }
    await client.query("COMMIT");
    const itemRows = order.items.map((item) => ({
      id:item.id, product_id:item.productId, product_name:item.productName, unit_price_cents:item.unitPriceCents,
      quantity:item.quantity, size_choice:item.sizeChoice, color_choice:item.colorChoice, color_choices:item.colorChoices,
      custom_text:item.customText, text_color_choice:item.textColorChoice,
      line_total_cents:item.lineTotalCents,
    }));
    return toOrder(rows[0], itemRows.map(toOrderItem));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createPreviewOrder(input, user = null) {
  await ensureDefaults();
  return persistOrder({ ...(await buildOrderInput(input, user, "draft", "draft")), fulfillmentStatus: "draft" });
}

export async function createDraftOrder(input, user = null) {
  await ensureDefaults();
  return persistOrder({ ...(await buildOrderInput(input, user, "paypal", "pending")), fulfillmentStatus: "awaiting_payment" });
}

export async function createCashPickupOrder(input, user = null) {
  await ensureDefaults();
  const order = { ...(await buildOrderInput(input, user, "cash_on_pickup", "awaiting_cash_pickup")), fulfillmentStatus: "received" };
  if (order.deliveryMethod !== "pickup") throw new Error("Cash orders are available for pickup only.");
  return persistOrder(order);
}

export async function deleteUserDraftOrder(orderId, userId) {
  await ensureDefaults();
  if (!orderId || !userId) throw new Error("Sign in to delete a draft order.");
  const result = await getPool().query(
    "delete from kp_orders where id=$1 and user_id=$2 and payment_status='draft'",
    [orderId, userId],
  );
  if (!result.rowCount) throw new Error("Draft order not found.");
  return { success: true };
}

export async function updateOrderPayment(orderId, patch) {
  await ensureDefaults();
  const { rows } = await getPool().query(
    `update kp_orders set payment_status=coalesce($2,payment_status), paypal_order_id=coalesce($3,paypal_order_id),
     paypal_capture_id=coalesce($4,paypal_capture_id), fulfillment_status=coalesce($5,fulfillment_status), updated_at=now() where id=$1 returning *`,
    [orderId, patch.paymentStatus ?? null, patch.paypalOrderId ?? null, patch.paypalCaptureId ?? null, patch.fulfillmentStatus ?? null],
  );
  if (!rows[0]) throw new Error("Order not found.");
  return toOrder(rows[0], await getOrderItems(orderId));
}

export async function updateOrderFulfillment(orderId, fulfillmentStatus) {
  await ensureDefaults();
  const status = normalizeString(fulfillmentStatus).toLowerCase();
  if (!fulfillmentStatuses.has(status) || status === "draft" || status === "awaiting_payment") throw new Error("Order status is invalid.");
  const { rows } = await getPool().query(
    "update kp_orders set fulfillment_status=$2,updated_at=now() where id=$1 and payment_status<>'draft' returning *",
    [orderId, status],
  );
  if (!rows[0]) throw new Error("Submitted order not found.");
  return toOrder(rows[0], await getOrderItems(orderId));
}

export async function deleteAdminOrder(orderId) {
  await ensureDefaults();
  if (!orderId) throw new Error("Order id is required.");
  const result = await getPool().query("delete from kp_orders where id=$1 and payment_status<>'draft'", [orderId]);
  if (!result.rowCount) throw new Error("Submitted order not found.");
  return { success: true };
}

export async function listAdminOrders() {
  await ensureDefaults();
  return getOrders();
}

export async function listUserOrders(userId) {
  await ensureDefaults();
  return getOrders("where user_id=$1", [userId]);
}

export async function getBootstrap(sessionToken = "") {
  await ensureDefaults();
  const session = await getSessionByToken(sessionToken);
  const user = session?.user || null;
  const paypalClientId = env("PAYPAL_CLIENT_ID");
  const paypalSecret = env("PAYPAL_CLIENT_SECRET");
  return {
    shop: {
      name: shopName(),
      currencyCode: currencyCode(),
      shippingOptions,
      paypalEnabled: Boolean(paypalClientId && paypalSecret),
      paypalClientId: paypalClientId || "",
      paypalEnvironment: env("PAYPAL_ENV", "sandbox"),
    },
    products: await listPublicProducts(),
    user,
    orders: user ? await listUserOrders(user.id) : [],
  };
}
