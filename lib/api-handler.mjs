import {
  createDraftOrder,
  createCashPickupOrder,
  createPreviewOrder,
  createSession,
  deleteAdminOrder,
  deleteProduct,
  deleteUserDraftOrder,
  destroySession,
  getBootstrap,
  getSessionByToken,
  listAdminOrders,
  listAdminProducts,
  loginUser,
  signupUser,
  updateOrderPayment,
  updateOrderFulfillment,
  upsertProduct,
} from "./netlify-store.mjs";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function env(name, fallback = "") {
  const value = globalThis.Netlify?.env?.get?.(name);
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function parseCookies(req) {
  const raw = req.headers.get("cookie") || "";
  const result = {};
  for (const pair of raw.split(";")) {
    const [key, ...rest] = pair.split("=");
    if (!key) continue;
    result[key.trim()] = decodeURIComponent(rest.join("=") || "");
  }
  return result;
}

async function readJson(req) {
  const raw = await req.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "Invalid JSON request."); }
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function sessionCookie(token, expiresAt, isSecure) {
  return `kiavik_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${isSecure ? "; Secure" : ""}`;
}

function expiredCookie(isSecure) {
  return `kiavik_session=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isSecure ? "; Secure" : ""}`;
}

async function requireSession(req) {
  const session = await getSessionByToken(parseCookies(req).kiavik_session);
  if (!session) throw new HttpError(401, "You need to sign in first.");
  return session;
}

async function requireAdmin(req) {
  const session = await requireSession(req);
  if (!session.user.isAdmin) throw new HttpError(403, "Admin access is required.");
  return session;
}

function paypalBaseUrl() {
  return env("PAYPAL_ENV", "sandbox") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getPaypalAccessToken() {
  const clientId = env("PAYPAL_CLIENT_ID");
  const clientSecret = env("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured.");
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || "Could not get PayPal access token.");
  return payload.access_token;
}

async function createPaypalOrder(localOrder) {
  const token = await getPaypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: localOrder.orderNumber,
        description: `${localOrder.items.length} item(s) from Kiavik Prints`,
        amount: {
          currency_code: localOrder.currencyCode,
          value: localOrder.totalLabel,
          breakdown: {
            item_total: { currency_code: localOrder.currencyCode, value: localOrder.subtotalLabel },
            shipping: { currency_code: localOrder.currencyCode, value: localOrder.shippingLabel },
          },
        },
      }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "PayPal order creation failed.");
  return payload;
}

async function capturePaypalOrder(paypalOrderId) {
  const token = await getPaypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "PayPal capture failed.");
  return payload;
}

export async function handleApiRequest(req) {
  try {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "") || "bootstrap";
    const isSecure = url.protocol === "https:";

    if (req.method === "GET" && route === "health") return jsonResponse(200, { ok: true });
    if (req.method === "GET" && route === "bootstrap") return jsonResponse(200, await getBootstrap(parseCookies(req).kiavik_session));

    if (req.method === "POST" && route === "auth/signup") {
      const user = await signupUser(await readJson(req));
      const session = await createSession(user.id);
      return jsonResponse(200, { user }, { "Set-Cookie": sessionCookie(session.token, session.expiresAt, isSecure) });
    }
    if (req.method === "POST" && route === "auth/login") {
      const user = await loginUser(await readJson(req));
      const session = await createSession(user.id);
      return jsonResponse(200, { user }, { "Set-Cookie": sessionCookie(session.token, session.expiresAt, isSecure) });
    }
    if (req.method === "POST" && route === "auth/logout") {
      await destroySession(parseCookies(req).kiavik_session);
      return jsonResponse(200, { success: true }, { "Set-Cookie": expiredCookie(isSecure) });
    }

    if (req.method === "GET" && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, { products: await listAdminProducts() });
    }
    if ((req.method === "POST" || req.method === "PUT") && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, { product: await upsertProduct(await readJson(req)) });
    }
    if (req.method === "DELETE" && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, await deleteProduct(url.searchParams.get("id")));
    }
    if (req.method === "GET" && route === "admin/orders") {
      await requireAdmin(req);
      return jsonResponse(200, { orders: await listAdminOrders() });
    }
    if (req.method === "PUT" && route === "admin/orders/status") {
      await requireAdmin(req);
      const body = await readJson(req);
      return jsonResponse(200, { order: await updateOrderFulfillment(body.orderId, body.fulfillmentStatus) });
    }
    if (req.method === "DELETE" && route === "admin/orders") {
      await requireAdmin(req);
      return jsonResponse(200, await deleteAdminOrder(url.searchParams.get("id")));
    }

    if (req.method === "POST" && route === "orders/preview") {
      const session = await getSessionByToken(parseCookies(req).kiavik_session);
      return jsonResponse(200, { order: await createPreviewOrder(await readJson(req), session?.user || null) });
    }
    if (req.method === "POST" && route === "orders/cash-pickup") {
      const session = await getSessionByToken(parseCookies(req).kiavik_session);
      return jsonResponse(200, { order: await createCashPickupOrder(await readJson(req), session?.user || null) });
    }
    if (req.method === "DELETE" && route === "orders/draft") {
      const session = await getSessionByToken(parseCookies(req).kiavik_session);
      if (!session) throw new HttpError(401, "Sign in to delete a draft order.");
      return jsonResponse(200, await deleteUserDraftOrder(url.searchParams.get("id"), session.user.id));
    }

    if (req.method === "POST" && route === "paypal/create-order") {
      const session = await getSessionByToken(parseCookies(req).kiavik_session);
      const localOrder = await createDraftOrder(await readJson(req), session?.user || null);
      const paypalOrder = await createPaypalOrder(localOrder);
      const updated = await updateOrderPayment(localOrder.id, { paymentStatus: "paypal_created", paypalOrderId: paypalOrder.id });
      return jsonResponse(200, { order: updated, paypalOrderId: paypalOrder.id });
    }

    if (req.method === "POST" && route === "paypal/capture-order") {
      const body = await readJson(req);
      if (!body.paypalOrderId || !body.localOrderId) throw new Error("PayPal order details are missing.");
      const capture = await capturePaypalOrder(body.paypalOrderId);
      const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || "";
      const updated = await updateOrderPayment(body.localOrderId, { paymentStatus: "paid", paypalOrderId: body.paypalOrderId, paypalCaptureId: captureId, fulfillmentStatus: "received" });
      return jsonResponse(200, { order: updated, capture });
    }

    throw new HttpError(404, "Not found");
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 400;
    return jsonResponse(statusCode, { error: error?.message || "Server error" });
  }
}
