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
    syncSubcategory();
    syncColorConfig();
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
    el("productCategory")?.addEventListener("input", syncSubcategory);
    el("productSubcategory")?.addEventListener("change", syncClickerPricingFields);
    el("productColorMode")?.addEventListener("change", syncColorConfig);
    el("productColorSlots")?.addEventListener("change", syncColorConfig);
    el("clearProductButton")?.addEventListener("click", resetForm);
    el("adminSearch")?.addEventListener("input", renderProducts);
    el("adminCategoryFilter")?.addEventListener("change", renderProducts);
  }

  function showLogin() { el("adminAuthPanel")?.classList.remove("hidden"); el("adminDashboard")?.classList.add("hidden"); }
  async function showDashboard() {
    el("adminAuthPanel")?.classList.add("hidden"); el("adminDashboard")?.classList.remove("hidden");
    const adminWelcome = el("adminWelcome");
    if (adminWelcome) adminWelcome.textContent = state.user?.fullName || "Kiavik Prints";
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
    const result = await request("/api/admin/products"); state.products = result.products || []; renderCategoryFilter(); renderProducts(); renderStats();
  }
  async function loadOrders() {
    const result = await request("/api/admin/orders"); state.orders = result.orders || []; renderOrders(); renderStats();
  }

  function renderProducts() {
    const target = el("adminProductList"); if (!target) return;
    if (!state.products.length) { target.innerHTML = `<tr><td colspan="6" class="empty-state">No products yet.</td></tr>`; return; }
    const query = String(el("adminSearch")?.value || "").trim().toLowerCase();
    const category = String(el("adminCategoryFilter")?.value || "");
    const products = state.products.filter((product) => {
      const queryOk = !query || [product.name, product.category, product.subcategory, product.description].join(" ").toLowerCase().includes(query);
      const categoryOk = !category || String(product.category || "") === category;
      return queryOk && categoryOk;
    });
    target.innerHTML = products.map((p) => `<tr>
      <td><div class="inventory-product">${p.imageData ? `<img src="${p.imageData}" alt="${esc(p.name)}">` : `<div class="placeholder-art">${esc(p.name)}</div>`}<div><strong>${esc(p.name)}</strong><div class="cart-meta">${esc(p.description || "").slice(0, 42)}</div></div></div></td>
      <td>${esc(formatCategory(p))}</td>
      <td>$${esc(p.priceLabel)}</td>
      <td>${esc(formatColorSetup(p))}</td>
      <td><span class="status">${p.isActive ? "Active" : "Hidden"}</span></td>
      <td><div class="inline-actions"><button class="edit-action" type="button" data-edit="${esc(p.id)}">Edit</button><button class="edit-action" type="button" data-delete="${esc(p.id)}">Delete</button></div></td>
    </tr>`).join("");
    target.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editProduct(b.dataset.edit)));
    target.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteProduct(b.dataset.delete)));
  }

  function renderCategoryFilter() {
    const target = el("adminCategoryFilter"); if (!target) return;
    const current = target.value;
    const categories = [...new Set(state.products.map((product) => String(product.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    target.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}`;
    target.value = categories.includes(current) ? current : "";
  }

  function formatCategory(product) {
    return [product.category, product.subcategory].filter(Boolean).join(" / ") || "Uncategorised";
  }

  function formatColorSetup(product) {
    if ((product.baseColorOptions || []).length || (product.buttonColorOptions || []).length) {
      return "Base + button colours";
    }
    const count = Number(product.colorSlotCount || 1);
    return count > 1 ? `${count} buyer colours` : "Single colour";
  }

  function renderStats() {
    const active = state.products.filter((product) => product.isActive).length;
    const hidden = state.products.filter((product) => !product.isActive).length;
    const customers = new Set(state.orders.map((order) => order.customerEmail).filter(Boolean)).size;
    if (el("statActiveProducts")) el("statActiveProducts").textContent = String(active);
    if (el("statHiddenProducts")) el("statHiddenProducts").textContent = String(hidden);
    if (el("statRecentOrders")) el("statRecentOrders").textContent = String(state.orders.length);
    if (el("statCustomers")) el("statCustomers").textContent = String(customers);
  }

  function renderOrders() {
    const target = el("adminOrdersList"); if (!target) return;
    if (!state.orders.length) { target.innerHTML = `<div class="empty-state">No orders yet.</div>`; return; }
    target.innerHTML = state.orders.slice(0, 50).map((o) => `<article class="order-card"><div class="cart-row"><strong>${esc(o.orderNumber)}</strong><span class="product-pill">${esc(o.paymentStatus)}</span></div><div class="cart-meta">${esc(o.customerName)} · ${esc(o.customerEmail)} · ${new Date(o.createdAt).toLocaleString()}</div><div class="cart-row"><span>${o.items?.length || 0} line item(s)</span><strong>$${esc(o.totalLabel)} ${esc(o.currencyCode)}</strong></div></article>`).join("");
  }

  function editProduct(id) {
    const p = state.products.find((x) => x.id === id); if (!p) return;
    el("productId").value = p.id; el("productName").value = p.name || ""; el("productCategory").value = p.category || "";
    syncSubcategory(); el("productSubcategory").value = p.subcategory === "Clickers" ? "Clickers" : "";
    el("productPrice").value = (Number(p.priceCents || 0) / 100).toFixed(2); el("productDescription").value = p.description || "";
    el("productExtraClickerPrice").value = (Number(p.extraClickerPriceCents || 0) / 100).toFixed(2);
    el("productExtraTextClickerPrice").value = (Number(p.extraTextClickerPriceCents || 0) / 100).toFixed(2);
    el("productSizes").value = (p.sizeOptions || []).join(", "); el("productColors").value = (p.colorOptions || []).join(", ");
    el("productBaseColors").value = (p.baseColorOptions || []).join(", ");
    el("productButtonColors").value = (p.buttonColorOptions || []).join(", ");
    el("productColorMode").value = p.colorMode === "multi" ? "multi" : "single";
    el("productColorSlots").value = String(p.colorSlotCount || 1);
    el("productTextColors").value = (p.textColorOptions || []).join(", ");
    el("productCustomText").checked = Boolean(p.customTextEnabled); el("productActive").checked = Boolean(p.isActive); state.imageData = p.imageData || "";
    syncClickerPricingFields(); syncColorConfig(); renderImage(); el("productName").focus();
  }

  function resetForm() {
    el("productForm")?.reset(); el("productId").value = ""; el("productColorMode").value = "single"; el("productColorSlots").value = "1"; el("productActive").checked = true; el("productExtraClickerPrice").value = "0"; el("productExtraTextClickerPrice").value = "0"; state.imageData = ""; syncSubcategory(); syncClickerPricingFields(); syncColorConfig(); renderImage();
  }

  function syncSubcategory() {
    const select = el("productSubcategory"); if (!select) return;
    const isToyCategory = String(el("productCategory")?.value || "").trim().toLowerCase() === "toys & fidgets";
    select.disabled = !isToyCategory;
    if (!isToyCategory) select.value = "";
    syncClickerPricingFields();
  }

  function syncClickerPricingFields() {
    const isClicker = String(el("productCategory")?.value || "").trim().toLowerCase() === "toys & fidgets"
      && el("productSubcategory")?.value === "Clickers";
    el("clickerPricingFields")?.classList.toggle("hidden", !isClicker);
    const label = el("productPriceLabel");
    if (label) label.textContent = isClicker ? "1x1 price (AUD)" : "Price (AUD)";
  }

  function syncColorConfig() {
    const mode = el("productColorMode")?.value || "single";
    const slots = el("productColorSlots");
    if (!slots) return;
    const singleOption = slots.querySelector('option[value="1"]');
    if (mode === "multi") {
      if (singleOption) singleOption.disabled = true;
      slots.disabled = false;
      if (Number(slots.value || 0) < 2) slots.value = "2";
      return;
    }
    if (singleOption) singleOption.disabled = false;
    slots.value = "1";
    slots.disabled = true;
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
      subcategory: el("productSubcategory").value,
      price: Number(el("productPrice").value || 0),
      extraClickerPrice: Number(el("productExtraClickerPrice").value || 0),
      extraTextClickerPrice: Number(el("productExtraTextClickerPrice").value || 0),
      description: el("productDescription").value,
      sizeOptions: el("productSizes").value,
      colorMode: el("productColorMode").value,
      colorSlotCount: Number(el("productColorSlots").value || 1),
      colorOptions: el("productColors").value,
      baseColorOptions: el("productBaseColors").value,
      buttonColorOptions: el("productButtonColors").value,
      textColorOptions: el("productTextColors").value,
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
