(function () {
  const state = { user: null, orders: [] };
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[c]));

  document.addEventListener("DOMContentLoaded", init);

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function init() {
    el("sellerOrdersLoginForm")?.addEventListener("submit", login);
    el("sellerOrdersLogoutButton")?.addEventListener("click", logout);
    try {
      const bootstrap = await request("/api/bootstrap");
      state.user = bootstrap.user;
      if (state.user?.isAdmin) await showDashboard(); else showLogin();
    } catch (error) { showLogin(); toast(error.message, true); }
  }

  function showLogin() { el("sellerOrdersAuthPanel")?.classList.remove("hidden"); el("sellerOrdersDashboard")?.classList.add("hidden"); }
  async function showDashboard() {
    el("sellerOrdersAuthPanel")?.classList.add("hidden"); el("sellerOrdersDashboard")?.classList.remove("hidden");
    const result = await request("/api/admin/orders");
    state.orders = (result.orders || []).filter((order) => order.paymentStatus !== "draft");
    renderOrders();
  }

  async function login(event) {
    event.preventDefault();
    try {
      const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      if (!result.user?.isAdmin) { await request("/api/auth/logout", { method: "POST", body: "{}" }); throw new Error("This account is not an administrator."); }
      state.user = result.user; await showDashboard();
    } catch (error) { toast(error.message, true); }
  }

  async function logout() {
    try { await request("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; showLogin(); } catch (error) { toast(error.message, true); }
  }

  function renderOrders() {
    const target = el("sellerOrdersList"); if (!target) return;
    if (!state.orders.length) { target.innerHTML = `<div class="empty-state">No submitted orders yet.</div>`; return; }
    target.innerHTML = state.orders.map((order) => {
      const delivery = order.deliveryMethod === "pickup" ? "Cash pickup" : "Delivery";
      const address = [order.addressLine1, order.addressLine2, order.suburb, order.state, order.postcode, order.country].filter(Boolean).join(", ");
      const items = (order.items || []).map((item) => `<li><strong>${esc(item.quantity)} × ${esc(item.productName)}</strong><span>${esc(item.sizeChoice || "Default")} · ${esc(item.colorChoices?.join(" / ") || item.colorChoice || "Default")}${item.customText ? ` · Text: ${esc(item.customText)}` : ""}</span><b>$${esc(item.lineTotalLabel)}</b></li>`).join("");
      return `<article class="seller-order-card"><div class="seller-order-head"><div><p class="eyebrow">${esc(delivery)}</p><h2>${esc(order.orderNumber)}</h2><p>${new Date(order.createdAt).toLocaleString()}</p></div><div><span class="product-pill">${esc(order.paymentStatus.replaceAll("_", " "))}</span><strong>$${esc(order.totalLabel)} ${esc(order.currencyCode)}</strong></div></div><div class="seller-order-details"><div><h3>Customer</h3><p>${esc(order.customerName)}<br>${esc(order.customerEmail)}${order.customerPhone ? `<br>${esc(order.customerPhone)}` : ""}</p></div><div><h3>${delivery}</h3><p>${order.deliveryMethod === "pickup" ? "Customer will pay cash when collecting." : esc(address || "Address not supplied.")}</p></div><div><h3>Notes</h3><p>${esc(order.orderNotes || "No notes.")}</p></div></div><h3>Items</h3><ul class="seller-order-items">${items}</ul></article>`;
    }).join("");
  }

  function toast(message, error = false) {
    const target = el("sellerOrdersToast"); if (!target) return;
    target.textContent = message; target.style.background = error ? "#8f2d20" : ""; target.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => target.classList.add("hidden"), 4200);
  }
})();
