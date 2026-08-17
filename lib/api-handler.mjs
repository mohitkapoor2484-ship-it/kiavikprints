import {
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
} from "./netlify-store.mjs";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseCookies(req) {
  const raw = req.headers.get("cookie") || "";
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
  const raw = await req.text();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function sessionCookie(token, expiresAt, isSecure) {
  const secure = isSecure ? "; Secure" : "";
  return `kiavik_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Expires=${new Date(
    expiresAt,
  ).toUTCString()}${secure}`;
}

function expiredCookie(isSecure) {
  const secure = isSecure ? "; Secure" : "";
  return `kiavik_session=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

async function requireSession(req) {
  const cookies = parseCookies(req);
  const session = await getSessionByToken(cookies.kiavik_session);
  if (!session) {
    throw new HttpError(401, "You need to sign in first.");
  }

  return session;
}

async function requireAdmin(req) {
  const session = await requireSession(req);
  if (!session.user.isAdmin) {
    throw new HttpError(403, "Admin access is required.");
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

async function handleApiRequest(req) {
  try {
    const requestUrl = new URL(req.url);
    const route = requestUrl.pathname.replace(/^\/api\/?/, "") || "bootstrap";
    const isSecure = requestUrl.protocol === "https:";

    if (req.method === "GET" && route === "bootstrap") {
      const cookies = parseCookies(req);
      return jsonResponse(200, await getBootstrap(cookies.kiavik_session));
    }

    if (req.method === "POST" && route === "auth/signup") {
      const user = await signupUser(await readJson(req));
      const session = await createSession(user.id);
      return jsonResponse(
        200,
        { user },
        {
          "Set-Cookie": sessionCookie(session.token, session.expiresAt, isSecure),
        },
      );
    }

    if (req.method === "POST" && route === "auth/login") {
      const user = await loginUser(await readJson(req));
      const session = await createSession(user.id);
      return jsonResponse(
        200,
        { user },
        {
          "Set-Cookie": sessionCookie(session.token, session.expiresAt, isSecure),
        },
      );
    }

    if (req.method === "POST" && route === "auth/logout") {
      const cookies = parseCookies(req);
      await destroySession(cookies.kiavik_session);
      return jsonResponse(
        200,
        { success: true },
        {
          "Set-Cookie": expiredCookie(isSecure),
        },
      );
    }

    if (req.method === "GET" && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, { products: await listAdminProducts() });
    }

    if (req.method === "POST" && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, { product: await upsertProduct(await readJson(req)) });
    }

    if (req.method === "PUT" && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, { product: await upsertProduct(await readJson(req)) });
    }

    if (req.method === "DELETE" && route === "admin/products") {
      await requireAdmin(req);
      return jsonResponse(200, await deleteProduct(requestUrl.searchParams.get("id")));
    }

    if (req.method === "GET" && route === "admin/orders") {
      await requireAdmin(req);
      return jsonResponse(200, { orders: await listAdminOrders() });
    }

    if (req.method === "POST" && route === "orders/preview") {
      const session = await getSessionByToken(parseCookies(req).kiavik_session);
      return jsonResponse(200, {
        order: await createPreviewOrder(await readJson(req), session?.user || null),
      });
    }

    if (req.method === "POST" && route === "paypal/create-order") {
      const session = await getSessionByToken(parseCookies(req).kiavik_session);
      const localOrder = await createDraftOrder(await readJson(req), session?.user || null);
      const paypalOrder = await createPaypalOrder(localOrder);
      const updated = await updateOrderPayment(localOrder.id, {
        paymentStatus: "paypal_created",
        paypalOrderId: paypalOrder.id,
      });
      return jsonResponse(200, { order: updated, paypalOrderId: paypalOrder.id });
    }

    if (req.method === "POST" && route === "paypal/capture-order") {
      const body = await readJson(req);

      if (!body.paypalOrderId || !body.localOrderId) {
        throw new Error("PayPal order details are missing.");
      }

      const capture = await capturePaypalOrder(body.paypalOrderId);
      const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || "";
      const updated = await updateOrderPayment(body.localOrderId, {
        paymentStatus: "paid",
        paypalOrderId: body.paypalOrderId,
        paypalCaptureId: captureId,
      });

      return jsonResponse(200, { order: updated, capture });
    }

    throw new HttpError(404, "Not found");
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 400;
    return jsonResponse(statusCode, { error: error.message || "Server error" });
  }
}

export { handleApiRequest };
