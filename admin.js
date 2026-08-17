(function () {
  const state = {
    session: null,
    products: [],
    orders: [],
    editingId: "",
    imageData: "",
  };

  const authPanel = document.getElementById("adminAuthPanel");
  const dashboard = document.getElementById("adminDashboard");
  const toast = document.getElementById("adminStatusToast");
  const productForm = document.getElementById("productForm");
  const productList = document.getElementById("adminProductList");
  const ordersList = document.getElementById("adminOrdersList");
  const imagePreview = document.getElementById("imagePreview");

  document.addEventListener("DOMContentLoaded", initialize);

  async function initialize() {
    bindEvents();
    await refreshPage();
  }

  function bindEvents() {
    document.getElementById("adminLoginForm").addEventListener("submit", handleLogin);
    document.getElementById("adminLogoutButton").addEventListener("click", handleLogout);
    document.getElementById("resetProductButton").addEventListener("click", resetProductForm);
    document.getElementById("productImageFile").addEventListener("change", handleImageChange);
    productForm.addEventListener("submit", saveProduct);
  }

  async function refreshPage() {
    try {
      const response = await fetch("./api/bootstrap");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load admin session.");
      }

      state.session = payload.session || null;
      if (!state.session?.user?.isAdmin) {
        showLoggedOut();
        return;
      }

      document.getElementById("adminWelcome").textContent = `${state.session.user.fullName} is managing the catalog.`;
      authPanel.classList.add("hidden");
      dashboard.classList.remove("hidden");
      await Promise.all([loadProducts(), loadOrders()]);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function showLoggedOut() {
    authPanel.classList.remove("hidden");
    dashboard.classList.add("hidden");
  }

  async function handleLogin(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    await authRequest("./api/auth/login", body, "Admin signed in.");
  }

  async function handleLogout() {
    await authRequest("./api/auth/logout", {}, "Signed out.");
  }

  async function authRequest(url, body, successMessage) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
      }
      showToast(successMessage);
      await refreshPage();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function loadProducts() {
    const response = await fetch("./api/admin/products");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load products.");
    }
    state.products = payload.products || [];
    renderProducts();
  }

  async function loadOrders() {
    const response = await fetch("./api/admin/orders");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load orders.");
    }
    state.orders = payload.orders || [];
    renderOrders();
  }

  function renderProducts() {
    if (!state.products.length) {
      productList.innerHTML = `<div class="empty-state">No products yet. Use the form to add the first one.</div>`;
      return;
    }

    productList.innerHTML = state.products
      .map((product) => {
        const image = product.imageData
          ? `<img src="${product.imageData}" alt="${escapeHtml(product.name)}" />`
          : `<div class="placeholder-art">${escapeHtml(product.name)}</div>`;
        return `
          <article class="admin-product-card">
            <div class="mini-image">${image}</div>
            <div class="cart-row">
              <strong>${escapeHtml(product.name)}</strong>
              <span class="order-meta">${product.isActive ? "Visible" : "Hidden"}</span>
            </div>
            <div class="order-meta">${escapeHtml(product.category || "Uncategorised")} · $${product.priceLabel}</div>
            <div class="order-meta">Sizes: ${escapeHtml(product.sizeOptions.join(", ") || "None")}</div>
            <div class="order-meta">Colours: ${escapeHtml(product.colorOptions.join(", ") || "None")}</div>
            <div class="admin-card-actions">
              <button class="primary-button" data-edit-product="${product.id}" type="button">Edit</button>
              <button class="ghost-button" data-toggle-product="${product.id}" type="button">
                ${product.isActive ? "Hide" : "Show"}
              </button>
              <button class="ghost-button" data-delete-product="${product.id}" type="button">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");

    productList.querySelectorAll("[data-edit-product]").forEach((button) => {
      button.addEventListener("click", () => editProduct(button.dataset.editProduct));
    });

    productList.querySelectorAll("[data-toggle-product]").forEach((button) => {
      button.addEventListener("click", () => toggleProduct(button.dataset.toggleProduct));
    });

    productList.querySelectorAll("[data-delete-product]").forEach((button) => {
      button.addEventListener("click", () => deleteProduct(button.dataset.deleteProduct));
    });
  }

  function renderOrders() {
    if (!state.orders.length) {
      ordersList.innerHTML = `<div class="empty-state">No orders yet. Once checkout is used, the order list will appear here.</div>`;
      return;
    }

    ordersList.innerHTML = state.orders
      .map(
        (order) => `
          <article class="order-card">
            <div class="cart-row">
              <strong>${escapeHtml(order.orderNumber)}</strong>
              <span class="order-meta">${escapeHtml(order.paymentStatus)}</span>
            </div>
            <div class="order-meta">${escapeHtml(order.customerName)} · ${escapeHtml(order.customerEmail)}</div>
            <div class="order-meta">${escapeHtml(order.addressLine1)}, ${escapeHtml(order.suburb)}, ${escapeHtml(order.state)} ${escapeHtml(order.postcode)}</div>
            <div class="order-meta">${order.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")}</div>
            <div class="cart-row">
              <span>${escapeHtml(order.deliveryMethod)}</span>
              <strong>$${order.totalLabel}</strong>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function editProduct(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    state.editingId = product.id;
    state.imageData = product.imageData || "";
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("productPrice").value = (product.priceCents / 100).toFixed(2);
    document.getElementById("productDescription").value = product.description || "";
    document.getElementById("productSizes").value = product.sizeOptions.join(", ");
    document.getElementById("productColors").value = product.colorOptions.join(", ");
    document.getElementById("productCustomText").checked = product.customTextEnabled;
    document.getElementById("productActive").checked = product.isActive;
    renderImagePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleProduct(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    const body = {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.priceCents / 100,
      description: product.description,
      sizeOptions: product.sizeOptions,
      colorOptions: product.colorOptions,
      customTextEnabled: product.customTextEnabled,
      isActive: !product.isActive,
      imageData: product.imageData,
    };

    await saveProductRequest(body, "PUT", product.isActive ? "Product hidden." : "Product visible.");
  }

  async function deleteProduct(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    const confirmed = window.confirm(`Delete "${product.name}" permanently?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`./api/admin/products?id=${encodeURIComponent(product.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not delete product.");
      }
      showToast("Product deleted.");
      await loadProducts();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    const body = {
      id: state.editingId || undefined,
      name: document.getElementById("productName").value,
      category: document.getElementById("productCategory").value,
      price: document.getElementById("productPrice").value,
      description: document.getElementById("productDescription").value,
      sizeOptions: document.getElementById("productSizes").value,
      colorOptions: document.getElementById("productColors").value,
      customTextEnabled: document.getElementById("productCustomText").checked,
      isActive: document.getElementById("productActive").checked,
      imageData: state.imageData,
    };

    await saveProductRequest(body, state.editingId ? "PUT" : "POST", state.editingId ? "Product updated." : "Product created.");
  }

  async function saveProductRequest(body, method, successMessage) {
    try {
      const response = await fetch("./api/admin/products", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not save product.");
      }
      showToast(successMessage);
      resetProductForm();
      await loadProducts();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function resetProductForm() {
    productForm.reset();
    state.editingId = "";
    state.imageData = "";
    document.getElementById("productActive").checked = true;
    renderImagePreview();
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      state.imageData = "";
      renderImagePreview();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      state.imageData = typeof reader.result === "string" ? reader.result : "";
      renderImagePreview();
    };
    reader.readAsDataURL(file);
  }

  function renderImagePreview() {
    imagePreview.innerHTML = state.imageData
      ? `<img src="${state.imageData}" alt="Product preview" />`
      : `<div class="placeholder-art">Product image preview</div>`;
  }

  function showToast(message, isError = false, duration = 3000) {
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
