(function () {
  const $ = (selector, context = document) => context.querySelector(selector);

  document.addEventListener("DOMContentLoaded", async () => {
    const menuButton = $(".menu-button");
    const nav = $(".main-nav");
    bindMenu(menuButton, nav);

    document.querySelectorAll("[data-select-party-pack]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = Array.from(document.querySelectorAll('input[name="favour_type"]')).find((item) => item.value === button.dataset.selectPartyPack);
        if (!input) return;
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelectorAll("[data-select-party-pack]").forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
        document.getElementById("party-request")?.scrollIntoView({ behavior: "smooth", block: "start" });
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      });
    });

    const count = JSON.parse(localStorage.getItem("kiavik_cart") || "[]").reduce((sum, item) => sum + (item.quantity || 1), 0);
    const headerCart = $("#headerCartCount");
    if (headerCart) headerCart.textContent = count;

    const home = $("#homeProducts");
    if (!home) return;

    try {
      const response = await fetch("/api/bootstrap");
      const payload = await response.json();
      const requestedLimit = Number(home.dataset.homeLimit || 4);
      const products = (payload.products || []).slice(0, Number.isFinite(requestedLimit) ? requestedLimit : 4);
      home.innerHTML = products.map((product, index) => renderHomeProduct(product, index)).join("") || "<p>Products are being added now.</p>";
    } catch {
      home.innerHTML = renderHomeFallback();
    }
  });

  function renderHomeProduct(product, index) {
    const media = product.imageData
      ? `<img src="${product.imageData}" alt="${esc(product.name)}">`
      : `<div class="placeholder-art">${esc(product.name)}</div>`;
    const badge = index % 2 === 0 ? "New" : "Popular";
    const action = product.customTextEnabled ? "Customise" : "View";
    const destination = product.customTextEnabled ? "/personalise/" : "/shop/";
    return `<article class="product-card home-catalog-card">
      <div class="product-card-media">
        <span class="product-badge ${badge === "Popular" ? "hot" : ""}">${badge}</span>
        ${media}
      </div>
      <div class="product-card-body">
        <div class="product-topline">
          <span class="product-category">${esc(product.category || "3DReimagined")}</span>
          <span class="product-status">Made to order</span>
        </div>
        <h3>${esc(product.name)}</h3>
        <p class="card-copy">${esc((product.description || "Custom 3D printed product").slice(0, 92))}</p>
        <div class="product-card-footer">
          <p class="product-price"><span>From</span>$${esc(product.priceLabel || "0.00")}</p>
          <a class="ghost-button product-link" href="${destination}?product=${encodeURIComponent(product.id)}">${action} →</a>
        </div>
      </div>
    </article>`;
  }

  function renderHomeFallback() {
    const collections = [
      { name: "Fidget favourites", category: "Toys & Fidgets", image: "/assets/kiavik-hero-fidgets-480.webp", href: "/shop/?category=toys-fidgets" },
      { name: "Desk-ready prints", category: "Desk & Home", image: "/assets/products/desk-organiser.jpg", href: "/shop/?category=home-decor" },
      { name: "Made personal", category: "Personalised", image: "/assets/products/name-tag.jpg", href: "/personalise/" },
      { name: "Party-ready gifts", category: "Party Favours", image: "/assets/products/octopus.jpg", href: "/party-favours/" },
    ];
    return collections.map((collection) => `<article class="product-card home-catalog-card home-fallback-card">
      <div class="product-card-media"><img src="${collection.image}" alt="${esc(collection.name)}"></div>
      <div class="product-card-body">
        <div class="product-topline"><span class="product-category">${esc(collection.category)}</span><span class="product-status">Explore</span></div>
        <h3>${esc(collection.name)}</h3>
        <div class="product-card-footer"><p class="product-price"><span>Made to order</span>Discover more</p><a class="ghost-button product-link" href="${collection.href}">Browse &rarr;</a></div>
      </div>
    </article>`).join("");
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

  function bindMenu(menuButton, nav) {
    if (!menuButton || !nav) return;
    const closeMenu = () => {
      nav.classList.remove("open");
      document.body.classList.remove("menu-open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open menu");
    };
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      document.body.classList.toggle("menu-open", open);
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    nav.addEventListener("click", (event) => { if (event.target.closest("a")) closeMenu(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
  }
})();
