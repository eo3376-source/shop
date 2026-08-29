import { api, currency, escapeHtml, renderHeader, setMessage } from "/shared.js";

const categories = ["전체", "잡화", "뷰티", "신발", "식품"];
const categoryTarget = document.querySelector("[data-categories]");
const productTarget = document.querySelector("[data-products]");
const messageTarget = document.querySelector("[data-message]");
let selected = new URLSearchParams(location.search).get("category") || "전체";
if (!categories.includes(selected)) selected = "전체";

await renderHeader();
renderCategories();
await loadProducts();

function renderCategories() {
  categoryTarget.innerHTML = categories.map((category) => `
    <button type="button" role="tab" aria-selected="${category === selected}" data-category="${category}">${category}</button>
  `).join("");
  categoryTarget.querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
    selected = button.dataset.category;
    const url = selected === "전체" ? "/" : `/?category=${encodeURIComponent(selected)}`;
    history.replaceState(null, "", url);
    renderCategories();
    await loadProducts();
  }));
}

async function loadProducts() {
  setMessage(messageTarget);
  productTarget.innerHTML = "";
  try {
    const query = selected === "전체" ? "" : `?category=${encodeURIComponent(selected)}`;
    const { products } = await api(`/api/products${query}`);
    productTarget.innerHTML = products.map((product) => `
      <article class="product-card">
        <a href="/product.html?id=${product.id}">
          <img class="product-card-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">
          <h2 class="product-card-name">${escapeHtml(product.name)}</h2>
          <p class="product-price">${currency(product.price).replace("원", '<span class="price-unit">원</span>')}</p>
        </a>
      </article>
    `).join("");
  } catch (error) {
    setMessage(messageTarget, error.message);
  }
}
