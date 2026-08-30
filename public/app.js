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
    sort: new URL(location.href).searchParams.get("sort") || "featured",
    activeColor: (new URL(location.href).searchParams.get("color") || "").trim().toLowerCase(),
    maxPrice: Number(new URL(location.href).searchParams.get("maxPrice") || 150),
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
    const menuButton = document.querySelector(".menu-button");
    const nav = document.querySelector(".main-nav");
    if (menuButton && nav) menuButton.addEventListener("click", () => nav.classList.toggle("open"));

    el("cartPill")?.addEventListener("click", () => el("checkout")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    el("closeProductDialog")?.addEventListener("click", () => el("productDialog")?.close());
    el("productOptionForm")?.addEventListener("submit", (e) => { e.preventDefault(); if (!e.currentTarget.reportValidity()) return; addCurrentProduct(); });
    el("signinForm")?.addEventListener("submit", signIn);
    el("signupForm")?.addEventListener("submit", signUp);
    el("logoutButton")?.addEventListener("click", logout);
    el("previewOrderButton")?.addEventListener("click", saveDraft);
    el("priceRange")?.addEventListener("input", updatePriceRange);
    el("shopSort")?.addEventListener("change", updateSort);
    document.querySelectorAll("[data-search-form]").forEach((form) => form.addEventListener("submit", submitSearch));
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
    renderColorFilters();
    syncSearchInputs();
    renderProducts();
    renderShopControls();
    renderCart();
    renderShipping();
    renderAccount();
    const hc = el("headerCartCount"); if (hc) hc.textContent = String(cartCount());
  }

  function renderCategories() {
    const targets = [el("categoryChips"), el("categorySidebar")].filter(Boolean);
    if (!targets.length) return;
    const all = [{ slug: "all", label: "All Prints" }, ...categories];
    const counts = new Map(all.map((category) => [category.slug, countProductsForCategory(category.slug)]));
    const markup = all.map((category) => `<button type="button" class="category-link ${state.activeCategory === category.slug ? "active" : ""}" data-category="${esc(category.slug)}"><span>${esc(category.label)}</span><b>${counts.get(category.slug) || 0}</b></button>`).join("");
    targets.forEach((target) => { target.innerHTML = markup; });
    document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      const u = new URL(location.href);
      if (state.activeCategory === "all") u.searchParams.delete("category"); else u.searchParams.set("category", state.activeCategory);
      history.replaceState({}, "", u);
      scrollToCatalog();
      renderCategories(); renderProducts();
    }));
  }

  function renderColorFilters() {
    const buttons = document.querySelectorAll("[data-color-chip]");
    if (!buttons.length) return;
    buttons.forEach((button) => {
      const value = String(button.dataset.colorChip || "").trim().toLowerCase();
      button.classList.toggle("is-active", value === state.activeColor);
      button.onclick = () => {
        state.activeColor = value;
        const u = new URL(location.href);
        if (!state.activeColor) u.searchParams.delete("color"); else u.searchParams.set("color", state.activeColor);
        history.replaceState({}, "", u);
        scrollToCatalog();
        renderColorFilters();
        renderProducts();
      };
    });
  }

  function countProductsForCategory(slug) {
    if (slug === "all") return state.products.length;
    const category = categories.find((item) => item.slug === slug);
    if (!category) return 0;
    return state.products.filter((product) => category.matches.some((match) => String(product.category || "").toLowerCase() === match.toLowerCase())).length;
  }

  function productMatches(product) {
    const category = categories.find((c) => c.slug === state.activeCategory);
    const catOk = !category || state.activeCategory === "all" || category.matches.some((m) => String(product.category || "").toLowerCase() === m.toLowerCase());
    const q = state.query;
    const qOk = !q || [product.name, product.category, product.description].join(" ").toLowerCase().includes(q);
    const colors = Array.isArray(product.colorOptions) ? product.colorOptions : [];
    const colorOk = !state.activeColor || colors.some((value) => String(value).toLowerCase().includes(state.activeColor));
    const priceOk = Number(product.priceCents || 0) <= state.maxPrice * 100;
    return catOk && qOk && colorOk && priceOk;
  }

  function renderProducts() {
    const target = el("productsGrid"); if (!target) return;
    const products = sortProducts(state.products.filter(productMatches));
    renderShopResults(products.length, state.products.length);
    if (!products.length) {
      target.innerHTML = `<div class="empty-state">No products match this view right now. Try another filter or use the enquiry form below.</div>`;
      return;
    }
    target.innerHTML = products.map((p, index) => {
      const media = p.imageData ? `<img src="${p.imageData}" alt="${esc(p.name)}">` : `<div class="placeholder-art">${esc(p.name)}</div>`;
      const badge = index % 3 === 1 ? "Popular" : "New";
      return `<article class="product-card catalog-card">
        <div class="product-card-media catalog-media">
          <span class="product-badge ${badge === "Popular" ? "hot" : ""}">${badge}</span>
          <button class="catalog-heart" type="button" aria-label="Save item">♡</button>
          ${media}
        </div>
        <div class="product-card-body catalog-body">
          <div class="catalog-swatches">${renderSwatches(p.colorOptions || [])}</div>
          <h3>${esc(p.name)}</h3>
          <p class="card-copy">${esc((p.description || "Custom 3D printed product").slice(0, 72))}</p>
          <div class="product-card-footer">
            <p class="product-price">$${esc(p.priceLabel || money(p.priceCents))}</p>
            <button class="ghost-button catalog-action" type="button" data-open-product="${esc(p.id)}">${p.customTextEnabled ? "Customise" : "View"} →</button>
          </div>
        </div>
      </article>`;
    }).join("");
    target.querySelectorAll("[data-open-product]").forEach((button) => button.addEventListener("click", () => openProduct(button.dataset.openProduct)));
  }

  function renderSwatches(colors) {
    const palette = [];
    colors.forEach((value) => String(value).split(/[+,/]/).forEach((part) => {
      const key = part.trim().toLowerCase();
      const color = COLOR_MAP[key];
      if (color && !palette.includes(color)) palette.push(color);
    }));
    return (palette.slice(0, 4).length ? palette.slice(0, 4) : ["#0b6e73", "#f26722"]).map((color) => `<span class="swatch" style="background:${color}"></span>`).join("");
  }

  function sortProducts(products) {
    const copy = [...products];
    if (state.sort === "price-asc") copy.sort((a, b) => Number(a.priceCents || 0) - Number(b.priceCents || 0));
    if (state.sort === "price-desc") copy.sort((a, b) => Number(b.priceCents || 0) - Number(a.priceCents || 0));
    if (state.sort === "name-asc") copy.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return copy;
  }

  function renderShopResults(filteredCount, totalCount) {
    const target = el("shopResultsText");
    if (!target) return;
    target.textContent = `Showing ${filteredCount} of ${totalCount} products`;
  }

  function renderShopControls() {
    const range = el("priceRange");
    const label = el("priceRangeValue");
    const sort = el("shopSort");
    if (range) range.value = String(state.maxPrice);
    if (label) label.textContent = `$10 to $${state.maxPrice}`;
    if (sort) sort.value = state.sort;
  }

  function syncSearchInputs() {
    document.querySelectorAll('[data-search-form] input[type="search"]').forEach((input) => {
      input.value = state.query;
    });
  }

  function submitSearch(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input[type="search"]');
    state.query = String(input?.value || "").trim().toLowerCase();
    const u = new URL(location.href);
    if (state.query) u.searchParams.set("q", state.query); else u.searchParams.delete("q");
    history.replaceState({}, "", u);
    syncSearchInputs();
    scrollToCatalog();
    renderProducts();
  }

  function updatePriceRange(event) {
    state.maxPrice = Number(event.currentTarget.value || 150);
    const u = new URL(location.href);
    u.searchParams.set("maxPrice", String(state.maxPrice));
    history.replaceState({}, "", u);
    renderShopControls();
    renderProducts();
  }

  function updateSort(event) {
    state.sort = event.currentTarget.value;
    const u = new URL(location.href);
    if (state.sort === "featured") u.searchParams.delete("sort"); else u.searchParams.set("sort", state.sort);
    history.replaceState({}, "", u);
    renderProducts();
  }

  function scrollToCatalog() {
    el("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function describeColorSetup(product) {
    const count = Number(product.colorSlotCount || 1);
    return count > 1 ? `${count} colour build` : "Single colour";
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
    renderColorFields(p);
    el("textField")?.classList.toggle("hidden", !p.customTextEnabled);
    populateSelect("textColorField", "dialogTextColor", p.customTextEnabled ? (p.textColorOptions || []) : [], "Choose text colour");
    if (el("dialogText")) el("dialogText").value = "";
    if (el("dialogTextColor")) el("dialogTextColor").value = "";
    if (el("dialogQuantity")) el("dialogQuantity").value = 1;
    el("productDialog")?.showModal();
    const u = new URL(location.href); u.searchParams.set("product", p.id); history.replaceState({}, "", u);
  }

  function populateSelect(fieldId, selectId, values, placeholder = "") {
    const field = el(fieldId), select = el(selectId); if (!field || !select) return;
    field.classList.toggle("hidden", !values.length);
    if (!values.length) { select.innerHTML = ""; return; }
    const options = placeholder ? [`<option value="">${esc(placeholder)}</option>`] : [];
    options.push(...values.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`));
    select.innerHTML = options.join("");
    if (placeholder) select.value = "";
  }

  function renderColorFields(product) {
    const target = el("colorFields"); if (!target) return;
    const options = product.colorOptions || [];
    const count = Math.max(1, Number(product.colorSlotCount || 1));
    if (!options.length) {
      target.innerHTML = "";
      target.classList.add("hidden");
      return;
    }
    target.classList.remove("hidden");
    target.innerHTML = Array.from({ length: count }, (_, index) => `<label>${esc(colorSlotLabel(index, count))}<select data-color-slot="${index}" required><option value="">Choose a colour</option>${options.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select></label>`).join("");
  }

  function colorSlotLabel(index, total) {
    if (total === 1) return "Colour";
    if (index === 0) return "Primary colour";
    if (index === 1) return "Secondary colour";
    return `Colour ${index + 1}`;
  }

  function openDeepLink() {
    const id = new URL(location.href).searchParams.get("product"); if (id) openProduct(id);
  }

  function addCurrentProduct() {
    const p = state.currentProduct; if (!p) return;
    const colorChoices = Array.from(document.querySelectorAll("#colorFields select")).map((select) => select.value).filter(Boolean);
    const customText = el("textField")?.classList.contains("hidden") ? "" : (el("dialogText")?.value || "").trim();
    const textColorRequired = !el("textColorField")?.classList.contains("hidden") && Boolean(customText);
    const textColorChoice = textColorRequired ? (el("dialogTextColor")?.value || "") : "";
    if (textColorRequired && !textColorChoice) {
      toast("Choose a text colour for the custom text.", true);
      el("dialogTextColor")?.focus();
      return;
    }
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      productId: p.id,
      name: p.name,
      priceCents: p.priceCents,
      quantity: Math.max(1, Number(el("dialogQuantity")?.value || 1)),
      sizeChoice: el("sizeField")?.classList.contains("hidden") ? "" : (el("dialogSize")?.value || ""),
      colorChoices,
      colorChoice: colorChoices.join(" / "),
      customText,
      textColorChoice,
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
    target.innerHTML = state.cart.map((item) => `<article class="cart-item"><div class="cart-row"><strong>${esc(item.name)}</strong><span class="cart-qty-badge">Qty ${item.quantity}</span></div><div class="cart-meta">${esc(item.sizeChoice || "Default")} · ${esc((item.colorChoices?.length ? item.colorChoices.join(" / ") : item.colorChoice) || "Default")}</div>${item.customText ? `<div class="cart-meta">Text: ${esc(item.customText)}${item.textColorChoice ? ` · ${esc(item.textColorChoice)}` : ""}</div>` : ""}<div class="cart-row"><strong>$${money(item.priceCents * item.quantity)}</strong><button class="ghost-button" data-remove="${esc(item.id)}" type="button">Remove</button></div></article>`).join("");
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
      items: state.cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        sizeChoice: i.sizeChoice,
        colorChoice: i.colorChoice,
        colorChoices: i.colorChoices || [],
        customText: i.customText,
        textColorChoice: i.textColorChoice || "",
      })),
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

  const COLOR_MAP = {
    black: "#111111",
    white: "#f6f6f2",
    silver: "#c5c9d1",
    grey: "#a5a9b0",
    gray: "#a5a9b0",
    teal: "#0b6e73",
    orange: "#f26722",
    gold: "#f2b34a",
    yellow: "#f0c642",
    navy: "#224567",
    blue: "#2f74d6",
    pink: "#d46ea0",
    purple: "#7f58c8",
    red: "#d53535",
    cream: "#f0e5cd",
    clear: "#eceff2",
  };
})();
