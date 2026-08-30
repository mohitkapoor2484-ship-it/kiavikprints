(function () {
  const $ = (selector, context = document) => context.querySelector(selector);

  document.addEventListener("DOMContentLoaded", async () => {
    const menuButton = $(".menu-button");
    const nav = $(".main-nav");
    if (menuButton && nav) menuButton.onclick = () => nav.classList.toggle("open");

    const count = JSON.parse(localStorage.getItem("kiavik_cart") || "[]").reduce((sum, item) => sum + (item.quantity || 1), 0);
    const headerCart = $("#headerCartCount");
    if (headerCart) headerCart.textContent = count;

    const home = $("#homeProducts");
    if (!home) return;

    try {
      const response = await fetch("/api/bootstrap");
      const payload = await response.json();
      const products = (payload.products || []).slice(0, 6);
      home.innerHTML = products.map((product, index) => renderHomeProduct(product, index)).join("") || "<p>Products are being added now.</p>";
    } catch {
      home.innerHTML = "<p>Visit the shop to see the current catalogue.</p>";
    }
  });

  function renderHomeProduct(product, index) {
    const media = product.imageData
      ? `<img src="${product.imageData}" alt="${esc(product.name)}">`
      : `<div class="placeholder-art">${esc(product.name)}</div>`;
    const badge = index % 2 === 0 ? "New" : "Popular";
    const action = product.customTextEnabled ? "Customise" : "View";
    return `<article class="product-card home-catalog-card">
      <div class="product-card-media">
        <span class="product-badge ${badge === "Popular" ? "hot" : ""}">${badge}</span>
        ${media}
      </div>
      <div class="product-card-body">
        <div class="product-topline">
          <span class="product-category">${esc(product.category || "Kiavik")}</span>
          <span class="product-status">Made to order</span>
        </div>
        <h3>${esc(product.name)}</h3>
        <p class="card-copy">${esc((product.description || "Custom 3D printed product").slice(0, 92))}</p>
        <div class="product-card-footer">
          <p class="product-price"><span>From</span>$${esc(product.priceLabel || "0.00")}</p>
          <a class="ghost-button product-link" href="/shop/?product=${encodeURIComponent(product.id)}">${action} →</a>
        </div>
      </div>
    </article>`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }
})();
