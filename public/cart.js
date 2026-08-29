import { api, currency, escapeHtml, renderHeader, requireLogin, setMessage } from "/shared.js";

const listTarget = document.querySelector("[data-cart-list]");
const summaryTarget = document.querySelector("[data-summary]");
const totalTarget = document.querySelector("[data-total]");
const orderButton = document.querySelector("[data-order]");
const messageTarget = document.querySelector("[data-message]");

await renderHeader();
await loadCart();

async function loadCart() {
  try {
    const cart = await api("/api/cart");
    renderCart(cart);
  } catch (error) {
    if (!requireLogin(error)) setMessage(messageTarget, error.message);
  }
}

function renderCart(cart) {
  summaryTarget.textContent = currency(cart.total);
  totalTarget.textContent = currency(cart.total);
  orderButton.disabled = cart.items.length === 0;
  if (!cart.items.length) {
    listTarget.innerHTML = '<div class="empty-card">장바구니가 비어 있습니다.</div>';
    return;
  }
  listTarget.innerHTML = cart.items.map((item) => `
    <article class="cart-item">
      <img class="cart-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">
      <div>
        <h2 class="cart-name"><a href="/product.html?id=${item.product_id}">${escapeHtml(item.name)}</a></h2>
        <p class="cart-description">${escapeHtml(item.description)}</p>
        <p class="cart-price">${currency(item.subtotal)}</p>
        <div class="quantity-control" aria-label="${escapeHtml(item.name)} 수량">
          <button type="button" data-change="-1" data-id="${item.product_id}" aria-label="수량 줄이기">−</button>
          <input type="number" min="1" max="99" value="${item.qty}" data-qty data-id="${item.product_id}" aria-label="수량">
          <button type="button" data-change="1" data-id="${item.product_id}" aria-label="수량 늘리기">＋</button>
        </div>
      </div>
      <button class="delete-action" type="button" data-delete="${item.product_id}">삭제</button>
    </article>`).join("");

  listTarget.querySelectorAll("[data-change]").forEach((button) => button.addEventListener("click", async () => {
    const input = listTarget.querySelector(`[data-qty][data-id="${button.dataset.id}"]`);
    await changeQuantity(Number(button.dataset.id), Number(input.value) + Number(button.dataset.change));
  }));
  listTarget.querySelectorAll("[data-qty]").forEach((input) => input.addEventListener("change", async () => {
    await changeQuantity(Number(input.dataset.id), Number(input.value));
  }));
  listTarget.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    setMessage(messageTarget);
    try {
      renderCart(await api(`/api/cart/${button.dataset.delete}`, { method: "DELETE" }));
    } catch (error) {
      setMessage(messageTarget, error.message);
      await loadCart();
    }
  }));
}

async function changeQuantity(productId, qty) {
  setMessage(messageTarget);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    setMessage(messageTarget, "수량은 1–99 사이여야 합니다.");
    await loadCart();
    return;
  }
  try {
    renderCart(await api(`/api/cart/${productId}`, { method: "PATCH", body: JSON.stringify({ qty }) }));
  } catch (error) {
    setMessage(messageTarget, error.message);
    await loadCart();
  }
}

orderButton.addEventListener("click", async () => {
  setMessage(messageTarget);
  orderButton.disabled = true;
  try {
    const { order } = await api("/api/orders", { method: "POST", body: "{}" });
    location.href = `/checkout.html?id=${encodeURIComponent(order.id)}`;
  } catch (error) {
    setMessage(messageTarget, error.message);
    await loadCart();
  }
});
