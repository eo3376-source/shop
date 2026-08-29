import { api, renderHeader } from "/shared.js";
await renderHeader();
const query = new URLSearchParams(location.search);
const paymentKey = query.get("paymentKey") || "";
const orderId = query.get("orderId") || "";
const amount = query.get("amount") || "";
try {
  const { order } = await api("/api/payments/confirm", { method: "POST", body: JSON.stringify({ paymentKey, orderId, amount }) });
  location.href = `/order-complete.html?id=${encodeURIComponent(order.id)}`;
} catch (error) {
  document.querySelector("[data-message]").textContent = error.message || "결제 승인에 실패했습니다.";
}
