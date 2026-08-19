(function () {
  const categories = [
    { slug: "lamps-light-boxes", label: "Lamps & Light Boxes", matches: ["Lamps & Light Boxes", "Lamps"] },
    { slug: "personalised-gifts", label: "Personalised Gifts", matches: ["Personalised Gifts", "Badges", "Keychains", "Desk Signs", "Custom Gifts"] },
    { slug: "keychains", label: "Keychains", matches: ["Keychains"] },
    { slug: "signs-name-plates", label: "Signs & Name Plates", matches: ["Desk Signs", "Signs & Name Plates", "Business"] },
    { slug: "toys-fidgets", label: "Toys & Fidgets", matches: ["Toys & Fidgets", "Fun Prints"] },
    { slug: "home-decor", label: "Home & Décor", matches: ["Home & Decor", "Home & Décor", "Home & Desk"] },
    { slug: "fathers-day-seasonal", label: "Father's Day / Seasonal", matches: ["Father's Day / Seasonal"] },
  ];

  const state = {
    bootstrap: null,
    products: [],
    cart: loadCart(),
    activeCategory: new URL(location.href).searchParams.get("category") || "all",
    query: (new URL(location.href).searchParams.get("q") || "").trim().toLowerCase(),
    currentProduct: null,
    paypalLoaded: false,
    localOrderId: "",
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bind();
    await refresh();
  }

  function el(id) { return document.getElementById(id); }
  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
  function money(cents) { return (Number(cents || 0) / 100).toFixed(2); }

  function bind() {
    el("cartPill")?.addEventListener("click", () => el("checkout")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    el("closeProductDialog")?.addEventListener("click", () => el("productDialog")?.close());
    el("productOptionForm")?.addEventListener("submit", (e) => { e.preventDefault(); addCurrentProduct(); });
    el("signinForm")?.addEventListener("submit", signIn);
    el("signupForm")?.addEventListener("submit", signUp);
    el("logoutButton")?.addEventListener("click", logout);
    el("previewOrderButton")?.addEventListener("click", saveDraft);
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => switchAuth(button.dataset.authTab)));
    el("productDialog")?.addEventListener("close", () => {
      const u = new URL(location.href); u.searchParams.delete("product"); history.replaceState({}, "", u);
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function refresh() {
    try {
      state.bootstrap = await request("/api/bootstrap");
      state.products = state.bootstrap.products || [];
      renderAll();
      hydrateCustomer();
      openDeepLink();
      await setupPaypal();
    } catch (error) { toast(error.message, true); }
  }

  function renderAll() {
    renderCategories();
    renderProducts();
    renderCart();
    renderShipping();
    renderAccount();
    const hc = el("headerCartCount"); if (hc) hc.textContent = String(cartCount());
  }

  function renderCategories() {
    const target = el("categoryChips"); if (!target) return;
    const all = [{ slug: "all", label: "All Products" }, ...categories];
    target.innerHTML = all.map((c) => `<button type="button" class="tab-button ${state.activeCategory === c.slug ? "active" : ""}" data-category="${esc(c.slug)}">${esc(c.label)}</button>`).join("");
    target.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      const u = new URL(location.href);
      if (state.activeCategory === "all") u.searchParams.delete("category"); else u.searchParams.set("category", state.activeCategory);
      history.replaceState({}, "", u);
      renderCategories(); renderProducts();
    }));
  }

  function productMatches(product) {
    const category = categories.find((c) => c.slug === state.activeCategory);
    const catOk = !category || state.activeCategory === "all" || category.matches.some((m) => String(product.category || "").toLowerCase() === m.toLowerCase());
    const q = state.query;
    const qOk = !q || [product.name, product.category, product.description].join(" ").toLowerCase().includes(q);
    return catOk && qOk;
  }

  function renderProducts() {
    const target = el("productsGrid"); if (!target) return;
    const products = state.products.filter(productMatches);
    if (!products.length) {
      target.innerHTML = `<div class="empty-state">No products match this view yet. <a href="/custom-print/">Request a custom print</a>.</div>`;
      return;
    }
    target.innerHTML = products.map((p) => {
      const media = p.imageData ? `<img src="${p.imageData}" alt="${esc(p.name)}">` : `<div class="placeholder-art">${esc(p.name)}</div>`;
      const pills = [p.customTextEnabled ? "Personalised" : "Ready made", p.sizeOptions?.length ? `${p.sizeOptions.length} sizes` : "Single size", p.colorOptions?.length ? `${p.colorOptions.length} colours` : "Single colour"];
      return `<article class="product-card"><div class="product-card-media">${media}</div><div class="product-card-body"><div class="product-topline"><span class="product-category">${esc(p.category || "Kiavik")}</span><span class="product-status">Made to order</span></div><h3>${esc(p.name)}</h3><p class="card-copy">${esc((p.description || "Custom 3D printed product").slice(0,110))}</p><div class="product-pill-row">${pills.map((x) => `<span class="product-pill">${esc(x)}</span>`).join("")}</div><div class="product-card-footer"><p class="product-price"><span>From</span>$${esc(p.priceLabel || money(p.priceCents))}</p><button class="primary-button" type="button" data-open-product="${esc(p.id)}">${p.customTextEnabled ? "Customise" : "Choose options"}</button></div></div></article>`;
    }).join("");
    target.querySelectorAll("[data-open-product]").forEach((button) => button.addEventListener("click", () => openProduct(button.dataset.openProduct)));
  }

  function openProduct(id) {
    const p = state.products.find((x) => x.id === id); if (!p) return;
    state.currentProduct = p;
    el("dialogProductId").value = p.id;
    el("dialogCategory").textContent = p.category || "Kiavik Print";
    el("dialogName").textContent = p.name;
    el("dialogPrice").textContent = `$${p.priceLabel || money(p.priceCents)}`;
    el("dialogDescription").textContent = p.description || "";
    el("dialogMedia").innerHTML = p.imageData ? `<img src="${p.imageData}" alt="${esc(p.name)}">` : `<div class="placeholder-art">${esc(p.name)}</div>`;
    populateSelect("sizeField", "dialogSize", p.sizeOptions || []);
    populateSelect("colorField", "dialogColor", p.colorOptions || []);
    el("textField")?.classList.toggle("hidden", !p.customTextEnabled);
    if (el("dialogText")) el("dialogText").value = "";
    if (el("dialogQuantity")) el("dialogQuantity").value = 1;
    el("productDialog")?.showModal();
    const u = new URL(location.href); u.searchParams.set("product", p.id); history.replaceState({}, "", u);
  }

  function populateSelect(fieldId, selectId, values) {
    const field = el(fieldId), select = el(selectId); if (!field || !select) return;
    field.classList.toggle("hidden", !values.length);
    select.innerHTML = values.map((x) => `<option>${esc(x)}</option>`).join("");
  }

  function openDeepLink() {
    const id = new URL(location.href).searchParams.get("product"); if (id) openProduct(id);
  }

  function addCurrentProduct() {
    const p = state.currentProduct; if (!p) return;
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      productId: p.id,
      name: p.name,
      priceCents: p.priceCents,
      quantity: Math.max(1, Number(el("dialogQuantity")?.value || 1)),
      sizeChoice: el("sizeField")?.classList.contains("hidden") ? "" : (el("dialogSize")?.value || ""),
      colorChoice: el("colorField")?.classList.contains("hidden") ? "" : (el("dialogColor")?.value || ""),
      customText: el("textField")?.classList.contains("hidden") ? "" : (el("dialogText")?.value || ""),
    };
    state.cart.push(item); saveCart(); renderCart(); el("productDialog")?.close(); toast("Added to cart.");
  }

  function cartCount() { return state.cart.reduce((s, i) => s + Number(i.quantity || 1), 0); }
  function cartSubtotal() { return state.cart.reduce((s, i) => s + Number(i.priceCents || 0) * Number(i.quantity || 1), 0); }
  function loadCart() { try { return JSON.parse(localStorage.getItem("kiavik_cart") || "[]"); } catch { return []; } }
  function saveCart() { localStorage.setItem("kiavik_cart", JSON.stringify(state.cart)); }

  function renderCart() {
    const count = cartCount();
    if (el("cartCount")) el("cartCount").textContent = String(count);
    if (el("headerCartCount")) el("headerCartCount").textContent = String(count);
    if (el("cartSubtotal")) el("cartSubtotal").textContent = `$${money(cartSubtotal())}`;
    const target = el("cartItems"); if (!target) return;
    if (!state.cart.length) { target.innerHTML = `<div class="empty-state">Your cart is empty.</div>`; return; }
    target.innerHTML = state.cart.map((item) => `<article class="cart-item"><div class="cart-row"><strong>${esc(item.name)}</strong><span class="cart-qty-badge">Qty ${item.quantity}</span></div><div class="cart-meta">${esc(item.sizeChoice || "Default")} · ${esc(item.colorChoice || "Default")}</div>${item.customText ? `<div class="cart-meta">Text: ${esc(item.customText)}</div>` : ""}<div class="cart-row"><strong>$${money(item.priceCents * item.quantity)}</strong><button class="ghost-button" data-remove="${esc(item.id)}" type="button">Remove</button></div></article>`).join("");
    target.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { state.cart = state.cart.filter((x) => x.id !== button.dataset.remove); saveCart(); renderCart(); }));
  }

  function renderShipping() {
    const target = el("shippingOptions"); if (!target) return;
    const options = state.bootstrap?.shop?.shippingOptions || [];
    target.innerHTML = options.map((o, i) => `<label class="shipping-choice"><input type="radio" name="deliveryMethod" value="${esc(o.code)}" ${i === 0 ? "checked" : ""}><span>${esc(o.label)} · $${money(o.amountCents)}</span></label>`).join("");
  }

  function switchAuth(tab) {
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.toggle("active", b.dataset.authTab === tab));
    el("signinForm")?.classList.toggle("hidden", tab !== "signin");
    el("signupForm")?.classList.toggle("hidden", tab !== "signup");
  }

  function renderAccount() {
    const user = state.bootstrap?.user;
    el("accountAuth")?.classList.toggle("hidden", Boolean(user));
    el("accountSummary")?.classList.toggle("hidden", !user);
    if (!user) return;
    el("signedInName").textContent = user.fullName || "Customer";
    el("signedInEmail").textContent = user.email || "";
    const orders = state.bootstrap.orders || [];
    el("ordersList").innerHTML = orders.length ? orders.map((o) => `<article class="order-card"><strong>${esc(o.orderNumber)}</strong><div class="cart-meta">${new Date(o.createdAt).toLocaleDateString()} · ${esc(o.paymentStatus)}</div><div class="cart-row"><span>${o.items?.length || 0} item(s)</span><strong>$${esc(o.totalLabel)}</strong></div></article>`).join("") : `<div class="empty-state">No orders yet.</div>`;
  }

  async function signIn(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try { await request("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(fd)) }); await refresh(); toast("Signed in."); } catch (e) { toast(e.message, true); }
  }

  async function signUp(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try { await request("/api/auth/signup", { method: "POST", body: JSON.stringify(Object.fromEntries(fd)) }); await refresh(); toast("Account created."); } catch (e) { toast(e.message, true); }
  }

  async function logout() {
    try { await request("/api/auth/logout", { method: "POST", body: "{}" }); await refresh(); toast("Signed out."); } catch (e) { toast(e.message, true); }
  }

  function hydrateCustomer() {
    const user = state.bootstrap?.user; if (!user || !el("checkoutForm")) return;
    const form = el("checkoutForm");
    if (!form.customerName.value) form.customerName.value = user.fullName || "";
    if (!form.customerEmail.value) form.customerEmail.value = user.email || "";
    if (!form.shippingName.value) form.shippingName.value = user.fullName || "";
  }

  function orderPayload() {
    const form = el("checkoutForm");
    if (!state.cart.length) throw new Error("Add at least one product to your cart.");
    if (!form) throw new Error("Checkout form is unavailable.");
    const fd = new FormData(form);
    return {
      ...Object.fromEntries(fd),
      items: state.cart.map((i) => ({ productId: i.productId, quantity: i.quantity, sizeChoice: i.sizeChoice, colorChoice: i.colorChoice, customText: i.customText })),
    };
  }

  async function saveDraft() {
    try {
      const payload = await request("/api/orders/preview", { method: "POST", body: JSON.stringify(orderPayload()) });
      toast(`Draft ${payload.order.orderNumber} saved.`);
      await refresh();
    } catch (e) { toast(e.message, true); }
  }

  async function setupPaypal() {
    const shop = state.bootstrap?.shop || {};
    const shell = el("paypalShell"), notice = el("paypalNotice");
    if (!shop.paypalEnabled || !shop.paypalClientId) {
      shell?.classList.add("hidden");
      if (notice) notice.textContent = "PayPal buttons appear once PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are configured in Netlify.";
      return;
    }
    shell?.classList.remove("hidden");
    if (!state.paypalLoaded) {
      await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(shop.paypalClientId)}&currency=${encodeURIComponent(shop.currencyCode || "AUD")}`);
      state.paypalLoaded = true;
    }
    if (!globalThis.paypal || !el("paypalButtons")) return;
    el("paypalButtons").innerHTML = "";
    globalThis.paypal.Buttons({
      createOrder: async () => {
        const result = await request("/api/paypal/create-order", { method: "POST", body: JSON.stringify(orderPayload()) });
        state.localOrderId = result.order.id;
        return result.paypalOrderId;
      },
      onApprove: async (data) => {
        await request("/api/paypal/capture-order", { method: "POST", body: JSON.stringify({ paypalOrderId: data.orderID, localOrderId: state.localOrderId }) });
        state.cart = []; saveCart(); renderCart(); toast("Payment received. Thank you."); await refresh();
      },
      onError: (err) => toast(err?.message || "PayPal checkout failed.", true),
    }).render("#paypalButtons");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`); if (existing) return resolve();
      const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Could not load PayPal.")); document.head.appendChild(s);
    });
  }

  function toast(message, error = false) {
    const target = el("statusToast"); if (!target) return;
    target.textContent = message; target.style.background = error ? "#8f2d20" : ""; target.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => target.classList.add("hidden"), 4200);
  }
})();
