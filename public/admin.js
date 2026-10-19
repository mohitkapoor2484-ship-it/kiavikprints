(function () {
  const MAX_PRODUCT_IMAGES = 10;
  const MAX_IMAGE_BYTES = 5_000_000;
  const ALLOWED_IMAGE_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
  const state = { user: null, products: [], orders: [], imageGallery: [] };
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
    renderImageGallery();
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
    el("productImageFile")?.addEventListener("change", readImages);
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
    if (adminWelcome) adminWelcome.textContent = state.user?.fullName || "3DReimagined";
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
    if (!state.products.length) { target.innerHTML = `<tr><td colspan="7" class="empty-state">No products yet.</td></tr>`; return; }
    const query = String(el("adminSearch")?.value || "").trim().toLowerCase();
    const category = String(el("adminCategoryFilter")?.value || "");
    const products = state.products.filter((product) => {
      const queryOk = !query || [product.name, product.category, product.subcategory, product.description].join(" ").toLowerCase().includes(query);
      const categoryOk = !category || String(product.category || "") === category;
      return queryOk && categoryOk;
    });
    target.innerHTML = products.map((p) => {
      const imageCount = Array.isArray(p.imageGallery) && p.imageGallery.length ? p.imageGallery.length : p.imageData ? 1 : 0;
      return `<tr>
      <td><div class="inventory-product">${p.imageData ? `<img src="${p.imageData}" alt="${esc(p.name)}">` : `<div class="placeholder-art">${esc(p.name)}</div>`}<div><strong>${esc(p.name)}</strong><div class="cart-meta">${esc(p.description || "").slice(0, 42)}${imageCount ? ` · ${imageCount} photo${imageCount === 1 ? "" : "s"}` : ""}</div></div></div></td>
      <td>${esc(formatCategory(p))}</td>
      <td>$${esc(p.priceLabel)}</td>
      <td>${esc(formatStock(p))}</td>
      <td>${esc(formatColorSetup(p))}</td>
      <td><span class="status">${p.isComingSoon ? "Coming soon" : p.isActive ? "Active" : "Hidden"}</span></td>
      <td><div class="inline-actions"><button class="edit-action" type="button" data-edit="${esc(p.id)}">Edit</button><button class="edit-action" type="button" data-delete="${esc(p.id)}">Delete</button></div></td>
    </tr>`;
    }).join("");
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

  function formatStock(product) {
    if (product.stockQuantity === null || product.stockQuantity === undefined) return "Unlimited";
    const quantity = Number(product.stockQuantity || 0);
    return quantity > 0 ? `${quantity} available` : "Sold out";
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
    el("productStockQuantity").value = p.stockQuantity === null || p.stockQuantity === undefined ? "" : String(p.stockQuantity);
    el("productExtraClickerPrice").value = (Number(p.extraClickerPriceCents || 0) / 100).toFixed(2);
    el("productExtraTextClickerPrice").value = (Number(p.extraTextClickerPriceCents || 0) / 100).toFixed(2);
    el("productSizes").value = (p.sizeOptions || []).join(", "); el("productColors").value = (p.colorOptions || []).join(", ");
    el("productBaseColors").value = (p.baseColorOptions || []).join(", ");
    el("productButtonColors").value = (p.buttonColorOptions || []).join(", ");
    el("productColorMode").value = p.colorMode === "multi" ? "multi" : "single";
    el("productColorSlots").value = String(p.colorSlotCount || 1);
    el("productTextColors").value = (p.textColorOptions || []).join(", ");
    el("productCustomText").checked = Boolean(p.customTextEnabled); el("productActive").checked = Boolean(p.isActive); el("productComingSoon").checked = Boolean(p.isComingSoon);
    clearImageGallery(); state.imageGallery = productImageGallery(p);
    syncClickerPricingFields(); syncColorConfig(); renderImageGallery(); el("productName").focus();
  }

  function resetForm() {
    el("productForm")?.reset(); el("productId").value = ""; el("productColorMode").value = "single"; el("productColorSlots").value = "1"; el("productStockQuantity").value = ""; el("productActive").checked = true; el("productComingSoon").checked = false; el("productExtraClickerPrice").value = "0"; el("productExtraTextClickerPrice").value = "0"; clearImageGallery(); syncSubcategory(); syncClickerPricingFields(); syncColorConfig(); renderImageGallery();
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

  function productImageGallery(product) {
    const images = Array.isArray(product?.imageGallery) && product.imageGallery.length ? product.imageGallery : product?.imageData ? [{ id: product.imageData, src: product.imageData }] : [];
    return images.map((image) => {
      const id = typeof image === "string" ? image : String(image?.id || image?.key || image?.src || "");
      const src = typeof image === "string" ? image : String(image?.src || image?.url || image?.id || "");
      return id && src ? { id, src } : null;
    }).filter(Boolean);
  }

  function revokeImagePreview(image) {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }

  function clearImageGallery() {
    state.imageGallery.forEach(revokeImagePreview);
    state.imageGallery = [];
  }

  function readImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const remaining = MAX_PRODUCT_IMAGES - state.imageGallery.length;
    if (remaining < 1) { toast("A product can have up to 10 photos.", true); return; }
    const selectedFiles = files.slice(0, remaining);
    const accepted = selectedFiles.filter((file) => ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase()) && file.size > 0 && file.size <= MAX_IMAGE_BYTES);
    if (files.length > remaining) toast(`Only the first ${remaining} selected photo${remaining === 1 ? "" : "s"} were added.`, true);
    if (accepted.length !== selectedFiles.length) toast("Use JPG, PNG, WebP, AVIF, or GIF photos under 5 MB each.", true);
    state.imageGallery.push(...accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      return { id: "", src: previewUrl, file, previewUrl };
    }));
    renderImageGallery();
  }

  function removeImage(index) {
    const [image] = state.imageGallery.splice(index, 1);
    revokeImagePreview(image);
    renderImageGallery();
  }

  function makePrimaryImage(index) {
    if (index < 1 || index >= state.imageGallery.length) return;
    const [image] = state.imageGallery.splice(index, 1);
    state.imageGallery.unshift(image);
    renderImageGallery();
  }

  function renderImageGallery() {
    const target = el("imagePreview"); if (!target) return;
    if (!state.imageGallery.length) {
      target.innerHTML = `<div class="image-gallery-empty">Add up to 10 product photos. The first photo will be used on the shop card.</div>`;
      return;
    }
    target.innerHTML = `<div class="image-gallery-summary"><strong>${state.imageGallery.length} of ${MAX_PRODUCT_IMAGES} photos</strong><span>The first photo is the main shop image.</span></div><div class="product-image-gallery-preview">${state.imageGallery.map((image, index) => `<figure class="product-image-gallery-item"><img src="${esc(image.src)}" alt="Product photo ${index + 1}"><figcaption><span>${index === 0 ? "Main photo" : `Photo ${index + 1}`}</span><div>${index > 0 ? `<button type="button" class="image-action" data-image-primary="${index}">Make primary</button>` : ""}<button type="button" class="image-action danger-button" data-image-remove="${index}">Remove</button></div></figcaption></figure>`).join("")}</div>`;
    target.querySelectorAll("[data-image-primary]").forEach((button) => button.addEventListener("click", () => makePrimaryImage(Number(button.dataset.imagePrimary))));
    target.querySelectorAll("[data-image-remove]").forEach((button) => button.addEventListener("click", () => removeImage(Number(button.dataset.imageRemove))));
  }

  async function uploadPendingImages() {
    const pendingImages = state.imageGallery.filter((image) => image.file);
    if (!pendingImages.length) return;
    toast(`Uploading ${pendingImages.length} product photo${pendingImages.length === 1 ? "" : "s"}...`);
    for (const image of pendingImages) {
      const form = new FormData();
      form.set("image", image.file, image.file.name);
      const response = await fetch("/api/admin/product-images", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not upload the product image.");
      revokeImagePreview(image);
      image.id = payload.image?.id || "";
      image.src = payload.image?.src || "";
      delete image.file;
      delete image.previewUrl;
      if (!image.id || !image.src) throw new Error("The product image upload did not return an image.");
    }
    renderImageGallery();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const saveButton = event.currentTarget.querySelector('button[type="submit"]');
    const originalLabel = saveButton?.textContent || "Save product";
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Saving..."; }
    try {
      await uploadPendingImages();
      const body = {
        id: el("productId").value || undefined,
        name: el("productName").value,
        category: el("productCategory").value,
        subcategory: el("productSubcategory").value,
        price: Number(el("productPrice").value || 0),
        stockQuantity: el("productStockQuantity").value === "" ? null : Number(el("productStockQuantity").value),
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
        isComingSoon: el("productComingSoon").checked,
        imageGallery: state.imageGallery.map((image) => image.id).filter(Boolean),
      };
      await request("/api/admin/products", { method: body.id ? "PUT" : "POST", body: JSON.stringify(body) });
      resetForm(); await loadProducts(); toast("Product saved.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = originalLabel; }
    }
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
