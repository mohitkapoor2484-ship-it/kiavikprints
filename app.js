(function () {
  const state = {
    bootstrap: null,
    products: [],
    cart: loadCart(),
    activeCategory: "All",
    paypalScriptLoaded: false,
    localOrderId: "",
  };

  const toast = document.getElementById("statusToast");
  const productDialog = document.getElementById("productDialog");
  const productsGrid = document.getElementById("productsGrid");
  const categoryChips = document.getElementById("categoryChips");
  const cartItems = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const cartSubtotal = document.getElementById("cartSubtotal");
  const checkoutForm = document.getElementById("checkoutForm");
  const shippingOptions = document.getElementById("shippingOptions");
  const paypalShell = document.getElementById("paypalShell");
  const paypalButtons = document.getElementById("paypalButtons");
  const previewOrderButton = document.getElementById("previewOrderButton");
  const paypalNotice = document.getElementById("paypalNotice");
  const accountSummary = document.getElementById("accountSummary");
  const accountAuth = document.getElementById("accountAuth");
  const signedInName = document.getElementById("signedInName");
  const signedInEmail = document.getElementById("signedInEmail");
  const ordersList = document.getElementById("ordersList");

  document.addEventListener("DOMContentLoaded", initialize);

  async function initialize() {
    bindGlobalEvents();
    await refreshBootstrap();
  }

  function bindGlobalEvents() {
    document.getElementById("cartPill").addEventListener("click", () => {
      document.getElementById("checkout").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.getElementById("closeProductDialog").addEventListener("click", closeProductDialog);
    productDialog.addEventListener("close", () => {
      const current = new URL(window.location.href);
      current.searchParams.delete("product");
      window.history.replaceState({}, "", current);
    });

    document.getElementById("productOptionForm").addEventListener("submit", (event) => {
      event.preventDefault();
      addCurrentProductToCart();
    });

    document.getElementById("signinForm").addEventListener("submit", handleSignin);
    document.getElementById("signupForm").addEventListener("submit", handleSignup);
    document.getElementById("logoutButton").addEventListener("click", handleLogout);
    previewOrderButton.addEventListener("click", handlePreviewOrder);

    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
    });
  }

  async function refreshBootstrap() {
    try {
      const response = await fetch("./api/bootstrap");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load store data.");
      }

      state.bootstrap = payload;
      state.products = payload.products || [];
      renderEverything();
      hydrateCheckout();
      handleProductDeepLink();
      await setupPaypalIfNeeded();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function renderEverything() {
    renderStoreMetrics();
    renderCategories();
    renderProducts();
    renderCart();
    renderShippingOptions();
    renderAccount();
  }

  function renderStoreMetrics() {
    const productCount = state.products.length;
    const categoryCount = new Set(state.products.map((product) => product.category).filter(Boolean)).size;
    const productMetric = document.getElementById("heroProductCount");
    const categoryMetric = document.getElementById("heroCategoryCount");

    if (productMetric) {
      productMetric.textContent = String(productCount);
    }

    if (categoryMetric) {
      categoryMetric.textContent = String(categoryCount);
    }
  }

  function renderCategories() {
    const categories = ["All", ...new Set(state.products.map((product) => product.category).filter(Boolean))];
    categoryChips.innerHTML = categories
      .map(
        (category) => `
          <button
            class="tab-button ${category === state.activeCategory ? "active" : ""}"
            data-category="${escapeHtml(category)}"
            type="button"
          >
            ${escapeHtml(category)}
          </button>
        `,
      )
      .join("");

    categoryChips.querySelectorAll("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeCategory = button.dataset.category;
        renderProducts();
        renderCategories();
      });
    });
  }

  function renderProducts() {
    const filtered = state.activeCategory === "All"
      ? state.products
      : state.products.filter((product) => product.category === state.activeCategory);

    if (!filtered.length) {
      productsGrid.innerHTML = `<div class="empty-state">No products in this category yet.</div>`;
      return;
    }

    productsGrid.innerHTML = filtered
      .map((product) => {
        const media = product.imageData
          ? `<img src="${product.imageData}" alt="${escapeHtml(product.name)}" />`
          : `<div class="placeholder-art">${escapeHtml(product.name)}</div>`;
        const productPills = [
          product.customTextEnabled ? "Personalised" : "Ready made",
          product.sizeOptions.length ? `${product.sizeOptions.length} sizes` : "Single size",
          product.colorOptions.length ? `${product.colorOptions.length} colours` : "Single colour",
        ];
        const description = product.description
          ? escapeHtml(product.description.length > 105 ? `${product.description.slice(0, 102)}...` : product.description)
          : "Custom 3D printed product";
        return `
          <article class="product-card">
            <div class="product-card-media">${media}</div>
            <div class="product-card-body">
              <div class="product-topline">
                <span class="product-category">${escapeHtml(product.category || "Custom Product")}</span>
                <span class="product-status">Made to order</span>
              </div>
              <h3>${escapeHtml(product.name)}</h3>
              <p class="card-copy">${description}</p>
              <div class="product-pill-row">
                ${productPills.map((pill) => `<span class="product-pill">${escapeHtml(pill)}</span>`).join("")}
              </div>
              <div class="product-card-footer">
                <p class="product-price"><span>From</span>$${product.priceLabel}</p>
                <button class="primary-button" data-open-product="${product.id}" type="button">Customize</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    productsGrid.querySelectorAll("[data-open-product]").forEach((button) => {
      button.addEventListener("click", () => openProductDialog(button.dataset.openProduct));
    });
  }

  function renderCart() {
    const subtotalCents = state.cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

    cartCount.textContent = String(itemCount);
    cartSubtotal.textContent = `$${money(subtotalCents)}`;

    if (!state.cart.length) {
      cartItems.innerHTML = `<div class="empty-state">Your cart is empty. Add a product to start the checkout flow.</div>`;
      return;
    }

    cartItems.innerHTML = state.cart
      .map(
        (item) => `
          <article class="cart-item">
            <div class="cart-row">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="cart-qty-badge">Qty ${item.quantity}</span>
            </div>
            <div class="cart-meta">
              ${escapeHtml(item.sizeChoice || "Default")} · ${escapeHtml(item.colorChoice || "Default")}
            </div>
            ${item.customText ? `<div class="cart-meta">Text: ${escapeHtml(item.customText)}</div>` : ""}
            <div class="cart-row">
              <span class="cart-meta">$${money(item.priceCents)} each</span>
              <div class="cart-row">
                <strong>$${money(item.priceCents * item.quantity)}</strong>
                <button class="ghost-button" data-remove-item="${item.id}" type="button">Remove</button>
              </div>
            </div>
          </article>
        `,
      )
      .join("");

    cartItems.querySelectorAll("[data-remove-item]").forEach((button) => {
      button.addEventListener("click", () => {
        state.cart = state.cart.filter((item) => item.id !== button.dataset.removeItem);
        saveCart();
        renderCart();
      });
    });
  }

  function renderShippingOptions() {
    const options = state.bootstrap?.shop?.shippingOptions || [];
    shippingOptions.innerHTML = options
      .map(
        (option, index) => `
          <label class="shipping-choice">
            <input
              type="radio"
              name="deliveryMethod"
              value="${escapeHtml(option.code)}"
              ${index === 0 ? "checked" : ""}
            />
            <span>${escapeHtml(option.label)} · $${money(option.amountCents)}</span>
          </label>
        `,
      )
      .join("");
  }

  function renderAccount() {
    const session = state.bootstrap?.session;
    if (!session) {
      accountAuth.classList.remove("hidden");
      accountSummary.classList.add("hidden");
      ordersList.innerHTML = "";
      return;
    }

    accountAuth.classList.add("hidden");
    accountSummary.classList.remove("hidden");
    signedInName.textContent = session.user.fullName;
    signedInEmail.textContent = session.user.email;

    if (!session.orders.length) {
      ordersList.innerHTML = `<div class="empty-state">No saved orders yet. Once you check out while signed in, they will appear here.</div>`;
      return;
    }

    ordersList.innerHTML = session.orders
      .map(
        (order) => `
          <article class="order-card">
            <div class="order-meta-row">
              <strong>${escapeHtml(order.orderNumber)}</strong>
              <span class="product-status">${escapeHtml(order.paymentStatus)}</span>
            </div>
            <div class="order-meta">${new Date(order.createdAt).toLocaleString()}</div>
            <div class="order-meta">${order.items.length} item(s)</div>
            <div class="order-meta-row">
              <span>${escapeHtml(order.deliveryMethod)}</span>
              <strong>$${order.totalLabel}</strong>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function hydrateCheckout() {
    const session = state.bootstrap?.session;
    if (!session) {
      return;
    }

    setField("customerName", session.user.fullName);
    setField("customerEmail", session.user.email);
    setField("shippingName", session.user.fullName);
  }

  function openProductDialog(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    document.getElementById("dialogProductId").value = product.id;
    document.getElementById("dialogCategory").textContent = product.category || "Product";
    document.getElementById("dialogName").textContent = product.name;
    document.getElementById("dialogPrice").textContent = `$${product.priceLabel}`;
    document.getElementById("dialogDescription").textContent = product.description || "";
    document.getElementById("dialogMedia").innerHTML = product.imageData
      ? `<img src="${product.imageData}" alt="${escapeHtml(product.name)}" />`
      : `<div class="placeholder-art">${escapeHtml(product.name)}</div>`;

    populateSelect("dialogSize", product.sizeOptions, "Select size");
    populateSelect("dialogColor", product.colorOptions, "Select colour");
    document.getElementById("sizeField").classList.toggle("hidden", !product.sizeOptions.length);
    document.getElementById("colorField").classList.toggle("hidden", !product.colorOptions.length);
    document.getElementById("textField").classList.toggle("hidden", !product.customTextEnabled);
    document.getElementById("dialogText").value = "";
    document.getElementById("dialogQuantity").value = "1";

    const current = new URL(window.location.href);
    current.searchParams.set("product", product.slug);
    window.history.replaceState({}, "", current);
    productDialog.showModal();
  }

  function closeProductDialog() {
    if (productDialog.open) {
      productDialog.close();
    }
  }

  function handleProductDeepLink() {
    const current = new URL(window.location.href);
    const slug = current.searchParams.get("product");
    if (!slug || productDialog.open) {
      return;
    }
    const product = state.products.find((item) => item.slug === slug);
    if (product) {
      openProductDialog(product.id);
    }
  }

  function addCurrentProductToCart() {
    const productId = document.getElementById("dialogProductId").value;
    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    const quantity = Math.max(1, Math.min(99, Number(document.getElementById("dialogQuantity").value || 1)));
    const sizeChoice = document.getElementById("dialogSize").value;
    const colorChoice = document.getElementById("dialogColor").value;
    const customText = document.getElementById("dialogText").value.trim();

    const cartItem = {
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      quantity,
      sizeChoice,
      colorChoice,
      customText,
    };

    state.cart.unshift(cartItem);
    saveCart();
    renderCart();
    closeProductDialog();
    showToast(`${product.name} added to cart.`);
  }

  function buildCheckoutPayload() {
    if (!state.cart.length) {
      throw new Error("Add at least one product to the cart first.");
    }

    const formData = new FormData(checkoutForm);
    const deliveryMethod = checkoutForm.querySelector('input[name="deliveryMethod"]:checked')?.value || "delivery";
    const payload = Object.fromEntries(formData.entries());
    payload.deliveryMethod = deliveryMethod;
    payload.items = state.cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      sizeChoice: item.sizeChoice,
      colorChoice: item.colorChoice,
      customText: item.customText,
    }));
    return payload;
  }

  async function handlePreviewOrder() {
    try {
      previewOrderButton.disabled = true;
      const response = await fetch("./api/orders/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCheckoutPayload()),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not create preview order.");
      }
      finishOrder(payload.order, "Preview order created and saved locally.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      previewOrderButton.disabled = false;
    }
  }

  async function setupPaypalIfNeeded() {
    const config = state.bootstrap?.config;
    if (!config?.paypalConfigured) {
      paypalShell.classList.add("hidden");
      paypalNotice.classList.remove("hidden");
      return;
    }

    paypalNotice.classList.add("hidden");
    paypalShell.classList.remove("hidden");

    if (!state.paypalScriptLoaded) {
      await loadPaypalScript(config.paypalClientId, state.bootstrap.shop.currencyCode, config.paypalEnv);
      state.paypalScriptLoaded = true;
    }

    if (!window.paypal || paypalButtons.dataset.rendered === "true") {
      return;
    }

    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          shape: "pill",
          label: "paypal",
        },
        createOrder: async () => {
          const response = await fetch("./api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildCheckoutPayload()),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "PayPal order setup failed.");
          }
          state.localOrderId = payload.order.id;
          return payload.paypalOrderId;
        },
        onApprove: async (data) => {
          const response = await fetch("./api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              localOrderId: state.localOrderId,
              paypalOrderId: data.orderID,
            }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "PayPal capture failed.");
          }
          finishOrder(payload.order, "Payment captured and order saved.");
        },
        onError: (error) => {
          showToast(error.message || "PayPal checkout failed.", true);
        },
      })
      .render("#paypalButtons");

    paypalButtons.dataset.rendered = "true";
  }

  function finishOrder(order, message) {
    state.cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
    setField("country", "Australia");
    showToast(`${message} Order ${order.orderNumber} is ready.`, false, 5500);
    refreshBootstrap();
  }

  async function handleSignin(event) {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
    await authRequest("./api/auth/login", formData, "Signed in.");
  }

  async function handleSignup(event) {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
    await authRequest("./api/auth/signup", formData, "Account created.");
  }

  async function handleLogout() {
    await authRequest("./api/auth/logout", {}, "Signed out.", "POST");
  }

  async function authRequest(url, body, successMessage, method = "POST") {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
      }
      showToast(successMessage);
      await refreshBootstrap();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function switchAuthTab(tab) {
    const signIn = document.getElementById("signinForm");
    const signUp = document.getElementById("signupForm");
    signIn.classList.toggle("hidden", tab !== "signin");
    signUp.classList.toggle("hidden", tab !== "signup");
    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authTab === tab);
    });
  }

  function loadPaypalScript(clientId, currencyCode, env) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const clientParam = encodeURIComponent(clientId);
      const currencyParam = encodeURIComponent(currencyCode);
      const intentParam = encodeURIComponent("capture");
      const dataEnv = env === "live" ? "production" : "sandbox";
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientParam}&currency=${currencyParam}&intent=${intentParam}`;
      script.dataset.namespace = "paypal";
      script.dataset.env = dataEnv;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the PayPal SDK."));
      document.head.appendChild(script);
    });
  }

  function populateSelect(id, values, placeholder) {
    const select = document.getElementById(id);
    if (!values.length) {
      select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
      return;
    }

    select.innerHTML = values
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
  }

  function saveCart() {
    localStorage.setItem("kiavik-cart", JSON.stringify(state.cart));
  }

  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem("kiavik-cart") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setField(name, value) {
    const input = checkoutForm.elements.namedItem(name);
    if (input) {
      input.value = value;
    }
  }

  function money(cents) {
    return (Number(cents || 0) / 100).toFixed(2);
  }

  function showToast(message, isError = false, duration = 2800) {
    toast.textContent = message;
    toast.style.background = isError ? "rgba(151, 37, 37, 0.95)" : "rgba(20, 32, 46, 0.95)";
    toast.classList.remove("hidden");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => toast.classList.add("hidden"), duration);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
