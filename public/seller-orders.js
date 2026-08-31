(function () {
  const state = { user: null, orders: [] };
  const fulfillmentStatuses = [
    ["received", "Order received"],
    ["in_progress", "In progress"],
    ["awaiting_pickup", "Awaiting pickup"],
    ["out_for_delivery", "Out for delivery"],
    ["delivered", "Delivered"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
  ];
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
      const items = (order.items || []).map((item) => `<li><div><strong>${esc(item.quantity)} × ${esc(item.productName)}</strong><span>${esc(item.sizeChoice || "Default")} · ${esc(item.colorChoices?.join(" / ") || item.colorChoice || "Default")}${item.customText ? ` · Text: ${esc(item.customText)}` : ""}</span>${clickerTextPreview(item)}</div><b>$${esc(item.lineTotalLabel)}</b></li>`).join("");
      const options = fulfillmentStatuses.map(([value, label]) => `<option value="${value}" ${order.fulfillmentStatus === value ? "selected" : ""}>${label}</option>`).join("");
      return `<article class="seller-order-card"><div class="seller-order-head"><div><p class="eyebrow">${esc(delivery)}</p><h2>${esc(order.orderNumber)}</h2><p>${new Date(order.createdAt).toLocaleString()}</p></div><div><span class="product-pill">${esc(formatStatus(order.fulfillmentStatus))}</span><strong>$${esc(order.totalLabel)} ${esc(order.currencyCode)}</strong></div></div><div class="seller-order-details"><div><h3>Customer</h3><p>${esc(order.customerName)}<br>${esc(order.customerEmail)}${order.customerPhone ? `<br>${esc(order.customerPhone)}` : ""}</p></div><div><h3>${delivery}</h3><p>${order.deliveryMethod === "pickup" ? "Customer will pay cash when collecting." : esc(address || "Address not supplied.")}</p></div><div><h3>Notes</h3><p>${esc(order.orderNotes || "No notes.")}</p></div></div><div class="seller-order-status"><label>Customer progress<select data-order-status="${esc(order.id)}">${options}</select></label><button class="primary-button" type="button" data-save-status="${esc(order.id)}">Update status</button></div><div class="seller-order-actions">${order.fulfillmentStatus !== "cancelled" ? `<button class="ghost-button" type="button" data-cancel-order="${esc(order.id)}">Cancel order</button>` : ""}<button class="ghost-button danger-button" type="button" data-delete-order="${esc(order.id)}">Delete order</button></div><h3>Items</h3><ul class="seller-order-items">${items}</ul></article>`;
    }).join("");
    target.querySelectorAll("[data-save-status]").forEach((button) => button.addEventListener("click", () => saveStatus(button.dataset.saveStatus)));
    target.querySelectorAll("[data-cancel-order]").forEach((button) => button.addEventListener("click", () => cancelOrder(button.dataset.cancelOrder)));
    target.querySelectorAll("[data-delete-order]").forEach((button) => button.addEventListener("click", () => deleteOrder(button.dataset.deleteOrder)));
  }

  function formatStatus(status) {
    return fulfillmentStatuses.find(([value]) => value === status)?.[1] || "Order received";
  }

  function clickerTextPreview(item) {
    const match = String(item.sizeChoice || "").trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    const text = String(item.customText || "").trim().toUpperCase();
    if (!match || !text) return "";
    const columns = Number(match[1]);
    const rows = Number(match[2]);
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows !== text.length) return "";
    const cell = 34, gap = 4, pad = 10;
    const width = pad * 2 + columns * cell + (columns - 1) * gap;
    const height = pad * 2 + rows * cell + (rows - 1) * gap;
    const cells = Array.from({ length: text.length }, (_, index) => {
      const x = pad + (index % columns) * (cell + gap);
      const y = pad + Math.floor(index / columns) * (cell + gap);
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="6" fill="#f4fbfa" stroke="#78aaa6"/><text x="${x + cell / 2}" y="${y + 22}" text-anchor="middle" fill="#173f40" font-family="sans-serif" font-size="16" font-weight="700">${esc(text[index])}</text>`;
    }).join("");
    return `<figure class="clicker-order-preview"><figcaption>Buyer character layout</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${columns} by ${rows} clicker text layout: ${text}`)}">${cells}</svg></figure>`;
  }

  async function saveStatus(orderId) {
    const status = targetStatus(orderId);
    if (!status) return;
    try { await request("/api/admin/orders/status", { method: "PUT", body: JSON.stringify({ orderId, fulfillmentStatus: status }) }); toast("Order status updated."); await showDashboard(); } catch (error) { toast(error.message, true); }
  }

  async function cancelOrder(orderId) {
    if (!orderId || !confirm("Cancel this order? The customer will see it as cancelled.")) return;
    try { await request("/api/admin/orders/status", { method: "PUT", body: JSON.stringify({ orderId, fulfillmentStatus: "cancelled" }) }); toast("Order cancelled."); await showDashboard(); } catch (error) { toast(error.message, true); }
  }

  async function deleteOrder(orderId) {
    if (!orderId || !confirm("Permanently delete this order and its items? This cannot be undone.")) return;
    try { await request(`/api/admin/orders?id=${encodeURIComponent(orderId)}`, { method: "DELETE" }); toast("Order deleted."); await showDashboard(); } catch (error) { toast(error.message, true); }
  }

  function targetStatus(orderId) {
    return Array.from(document.querySelectorAll("[data-order-status]")).find((select) => select.dataset.orderStatus === orderId)?.value || "";
  }

  function toast(message, error = false) {
    const target = el("sellerOrdersToast"); if (!target) return;
    target.textContent = message; target.style.background = error ? "#8f2d20" : ""; target.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => target.classList.add("hidden"), 4200);
  }
})();
