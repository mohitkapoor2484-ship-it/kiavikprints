(function () {
  const state = { user: null, products: [], orders: [], imageData: "" };
  document.addEventListener("DOMContentLoaded", init);
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function init() {
    bind();
    try {
      const bootstrap = await request("/api/bootstrap");
      state.user = bootstrap.user;
      if (state.user?.isAdmin) await showDashboard(); else showLogin();
    } catch (e) { showLogin(); toast(e.message, true); }
  }

  function bind() {
    el("adminLoginForm")?.addEventListener("submit", login);
    el("adminLogoutButton")?.addEventListener("click", logout);
    el("productForm")?.addEventListener("submit", saveProduct);
    el("resetProductButton")?.addEventListener("click", resetForm);
    el("productImageFile")?.addEventListener("change", readImage);
  }

  function showLogin() { el("adminAuthPanel")?.classList.remove("hidden"); el("adminDashboard")?.classList.add("hidden"); }
  async function showDashboard() {
    el("adminAuthPanel")?.classList.add("hidden"); el("adminDashboard")?.classList.remove("hidden");
    el("adminWelcome").textContent = state.user?.fullName || "Kiavik Prints";
    await Promise.all([loadProducts(), loadOrders()]);
  }

  async function login(event) {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
      if (!result.user?.isAdmin) { await request("/api/auth/logout", { method: "POST", body: "{}" }); throw new Error("This account is not an administrator."); }
      state.user = result.user; await showDashboard(); toast("Signed in.");
    } catch (e) { toast(e.message, true); }
  }

  async function logout() {
    try { await request("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; showLogin(); } catch (e) { toast(e.message, true); }
  }

  async function loadProducts() {
    const result = await request("/api/admin/products"); state.products = result.products || []; renderProducts();
  }
  async function loadOrders() {
    const result = await request("/api/admin/orders"); state.orders = result.orders || []; renderOrders();
  }

  function renderProducts() {
    const target = el("adminProductList"); if (!target) return;
    if (!state.products.length) { target.innerHTML = `<div class="empty-state">No products yet.</div>`; return; }
    target.innerHTML = state.products.map((p) => `<article class="admin-product-card"><div>${p.imageData ? `<img src="${p.imageData}" alt="${esc(p.name)}">` : `<div class="placeholder-art">${esc(p.name)}</div>`}</div><div><strong>${esc(p.name)}</strong><div class="cart-meta">${esc(p.category || "Uncategorised")} · $${esc(p.priceLabel)}</div><div class="product-pill-row"><span class="product-pill">${p.isActive ? "Active" : "Draft"}</span>${p.customTextEnabled ? `<span class="product-pill">Custom text</span>` : ""}</div></div><div class="inline-actions"><button class="ghost-button" type="button" data-edit="${esc(p.id)}">Edit</button><button class="ghost-button" type="button" data-delete="${esc(p.id)}">Delete</button></div></article>`).join("");
    target.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editProduct(b.dataset.edit)));
    target.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteProduct(b.dataset.delete)));
  }

  function renderOrders() {
    const target = el("adminOrdersList"); if (!target) return;
    if (!state.orders.length) { target.innerHTML = `<div class="empty-state">No orders yet.</div>`; return; }
    target.innerHTML = state.orders.slice(0, 50).map((o) => `<article class="order-card"><div class="cart-row"><strong>${esc(o.orderNumber)}</strong><span class="product-pill">${esc(o.paymentStatus)}</span></div><div class="cart-meta">${esc(o.customerName)} · ${esc(o.customerEmail)} · ${new Date(o.createdAt).toLocaleString()}</div><div class="cart-row"><span>${o.items?.length || 0} line item(s)</span><strong>$${esc(o.totalLabel)} ${esc(o.currencyCode)}</strong></div></article>`).join("");
  }

  function editProduct(id) {
    const p = state.products.find((x) => x.id === id); if (!p) return;
    el("productId").value = p.id; el("productName").value = p.name || ""; el("productCategory").value = p.category || "";
    el("productPrice").value = (Number(p.priceCents || 0) / 100).toFixed(2); el("productDescription").value = p.description || "";
    el("productSizes").value = (p.sizeOptions || []).join(", "); el("productColors").value = (p.colorOptions || []).join(", ");
    el("productCustomText").checked = Boolean(p.customTextEnabled); el("productActive").checked = Boolean(p.isActive); state.imageData = p.imageData || "";
    renderImage(); el("productName").focus();
  }

  function resetForm() {
    el("productForm")?.reset(); el("productId").value = ""; el("productActive").checked = true; state.imageData = ""; renderImage();
  }

  function readImage(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 3_000_000) { toast("Use an image under 3 MB for the database-backed editor.", true); event.target.value = ""; return; }
    const reader = new FileReader(); reader.onload = () => { state.imageData = String(reader.result || ""); renderImage(); }; reader.readAsDataURL(file);
  }

  function renderImage() { const target = el("imagePreview"); if (target) target.innerHTML = state.imageData ? `<img src="${state.imageData}" alt="Product preview">` : `<div class="placeholder-art">Product image preview</div>`; }

  async function saveProduct(event) {
    event.preventDefault();
    const body = {
      id: el("productId").value || undefined,
      name: el("productName").value,
      category: el("productCategory").value,
      price: Number(el("productPrice").value || 0),
      description: el("productDescription").value,
      sizeOptions: el("productSizes").value,
      colorOptions: el("productColors").value,
      customTextEnabled: el("productCustomText").checked,
      isActive: el("productActive").checked,
      imageData: state.imageData,
    };
    try { await request("/api/admin/products", { method: body.id ? "PUT" : "POST", body: JSON.stringify(body) }); resetForm(); await loadProducts(); toast("Product saved."); } catch (e) { toast(e.message, true); }
  }

  async function deleteProduct(id) {
    const p = state.products.find((x) => x.id === id); if (!p || !confirm(`Delete ${p.name}?`)) return;
    try { await request(`/api/admin/products?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await loadProducts(); toast("Product deleted."); } catch (e) { toast(e.message, true); }
  }

  function toast(message, error = false) {
    const target = el("adminStatusToast"); if (!target) return;
    target.textContent = message; target.style.background = error ? "#8f2d20" : ""; target.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => target.classList.add("hidden"), 4200);
  }
})();
