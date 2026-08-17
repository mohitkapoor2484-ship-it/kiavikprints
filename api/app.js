const {
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
} = require("../lib/store");

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const result = {};
  for (const pair of raw.split(";")) {
    const [key, ...rest] = pair.split("=");
    if (!key) {
      continue;
    }
    result[key.trim()] = decodeURIComponent(rest.join("=") || "");
  }
  return result;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sessionCookie(token, expiresAt) {
  return `kiavik_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Expires=${new Date(
    expiresAt,
  ).toUTCString()}`;
}

function expiredCookie() {
  return "kiavik_session=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

function requireSession(req) {
  const cookies = parseCookies(req);
  const session = getSessionByToken(cookies.kiavik_session);
  if (!session) {
    throw new Error("You need to sign in first.");
  }
  return session;
}

function requireAdmin(req) {
  const session = requireSession(req);
  if (!session.user.isAdmin) {
    throw new Error("Admin access is required.");
  }
  return session;
}

function paypalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPaypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Could not get PayPal access token.");
  }

  return payload.access_token;
}

async function createPaypalOrder(localOrder) {
  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: localOrder.orderNumber,
          description: `${localOrder.items.length} item(s) from Kiavik Prints`,
          amount: {
            currency_code: localOrder.currencyCode,
            value: localOrder.totalLabel,
            breakdown: {
              item_total: {
                currency_code: localOrder.currencyCode,
                value: localOrder.subtotalLabel,
              },
              shipping: {
                currency_code: localOrder.currencyCode,
                value: localOrder.shippingLabel,
              },
            },
          },
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "PayPal order creation failed.");
  }

  return payload;
}

async function capturePaypalOrder(paypalOrderId) {
  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "PayPal capture failed.");
  }
  return payload;
}

module.exports = async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url || "/api/bootstrap", "http://localhost");
    const route = requestUrl.pathname.replace(/^\/api\/?/, "") || "bootstrap";

    if (req.method === "GET" && route === "bootstrap") {
      const cookies = parseCookies(req);
      sendJson(res, 200, getBootstrap(cookies.kiavik_session));
      return;
    }

    if (req.method === "POST" && route === "auth/signup") {
      const user = signupUser(await readJson(req));
      const session = createSession(user.id);
      sendJson(
        res,
        200,
        { user },
        {
          "Set-Cookie": sessionCookie(session.token, session.expiresAt),
        },
      );
      return;
    }

    if (req.method === "POST" && route === "auth/login") {
      const user = loginUser(await readJson(req));
      const session = createSession(user.id);
      sendJson(
        res,
        200,
        { user },
        {
          "Set-Cookie": sessionCookie(session.token, session.expiresAt),
        },
      );
      return;
    }

    if (req.method === "POST" && route === "auth/logout") {
      const cookies = parseCookies(req);
      destroySession(cookies.kiavik_session);
      sendJson(res, 200, { success: true }, { "Set-Cookie": expiredCookie() });
      return;
    }

    if (req.method === "GET" && route === "admin/products") {
      requireAdmin(req);
      sendJson(res, 200, { products: listAdminProducts() });
      return;
    }

    if (req.method === "POST" && route === "admin/products") {
      requireAdmin(req);
      sendJson(res, 200, { product: upsertProduct(await readJson(req)) });
      return;
    }

    if (req.method === "PUT" && route === "admin/products") {
      requireAdmin(req);
      sendJson(res, 200, { product: upsertProduct(await readJson(req)) });
      return;
    }

    if (req.method === "DELETE" && route === "admin/products") {
      requireAdmin(req);
      sendJson(res, 200, deleteProduct(requestUrl.searchParams.get("id")));
      return;
    }

    if (req.method === "GET" && route === "admin/orders") {
      requireAdmin(req);
      sendJson(res, 200, { orders: listAdminOrders() });
      return;
    }

    if (req.method === "POST" && route === "orders/preview") {
      const session = getSessionByToken(parseCookies(req).kiavik_session);
      sendJson(res, 200, { order: createPreviewOrder(await readJson(req), session?.user || null) });
      return;
    }

    if (req.method === "POST" && route === "paypal/create-order") {
      const session = getSessionByToken(parseCookies(req).kiavik_session);
      const localOrder = createDraftOrder(await readJson(req), session?.user || null);
      const paypalOrder = await createPaypalOrder(localOrder);
      const updated = updateOrderPayment(localOrder.id, {
        paymentStatus: "paypal_created",
        paypalOrderId: paypalOrder.id,
      });
      sendJson(res, 200, { order: updated, paypalOrderId: paypalOrder.id });
      return;
    }

    if (req.method === "POST" && route === "paypal/capture-order") {
      const body = await readJson(req);
      const capture = await capturePaypalOrder(body.paypalOrderId);
      const captureId =
        capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || "";
      const updated = updateOrderPayment(body.localOrderId, {
        paymentStatus: "paid",
        paypalOrderId: body.paypalOrderId,
        paypalCaptureId: captureId,
      });
      sendJson(res, 200, { order: updated, capture });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Server error" });
  }
};
