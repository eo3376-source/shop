import { api, currency, escapeHtml, renderHeader, requireLogin, setMessage } from "/shared.js";

const profileTarget = document.querySelector("[data-profile]");
const ordersTarget = document.querySelector("[data-orders]");
const messageTarget = document.querySelector("[data-message]");

const headerUser = await renderHeader();
if (!headerUser) {
  location.href = `/login.html?next=${encodeURIComponent("/mypage.html")}`;
} else {
  try {
    const [{ user }, { orders }] = await Promise.all([api("/api/auth/me"), api("/api/orders")]);
    profileTarget.innerHTML = `<h2 class="profile-name">${escapeHtml(user.name)}</h2><p class="profile-email">${escapeHtml(user.email)}</p>`;
    ordersTarget.innerHTML = orders.length ? orders.map((order) => `
      <a class="order-link" href="/order-complete.html?id=${encodeURIComponent(order.id)}">
        <span>${escapeHtml(order.id)}</span><strong>${currency(order.total)}</strong><span class="status-text">${order.status === "paid" ? "결제 완료" : "결제 대기"}</span>
      </a>`).join("") : '<div class="empty-card">주문 내역이 없습니다.</div>';
  } catch (error) {
    if (!requireLogin(error)) setMessage(messageTarget, error.message);
  }
}
