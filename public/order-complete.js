import { api, currency, escapeHtml, renderHeader, requireLogin, setMessage } from "/shared.js";

const target = document.querySelector("[data-order]");
const messageTarget = document.querySelector("[data-message]");
const orderId = new URLSearchParams(location.search).get("id") || "";

await renderHeader();
if (!orderId) {
  setMessage(messageTarget, "주문 번호가 없습니다.");
} else {
  try {
    const { order } = await api(`/api/orders/${encodeURIComponent(orderId)}`);
    target.innerHTML = `
      <h2 class="summary-title">주문 정보</h2>
      <p class="order-number">주문 번호 ${escapeHtml(order.id)}</p>
      <p class="order-meta">${order.status === "paid" ? "결제 완료" : "결제 대기"}</p>
      <div class="order-items">
        ${order.items.map((item) => `<div class="order-item">
          <img class="order-item-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">
          <div><div>${escapeHtml(item.name)}</div><div class="order-meta">수량 ${item.qty}</div></div>
          <strong>${currency(item.subtotal)}</strong>
        </div>`).join("")}
      </div>
      <div class="order-total">${currency(order.total)}</div>`;
  } catch (error) {
    if (!requireLogin(error)) setMessage(messageTarget, error.message);
  }
}
