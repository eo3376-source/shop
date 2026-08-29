import { api, currency, renderHeader, requireLogin, setMessage } from "/shared.js";

const params = new URLSearchParams(location.search);
const orderId = params.get("id") || "";
const totalTarget = document.querySelector("[data-total]");
const payButton = document.querySelector("[data-pay]");
const messageTarget = document.querySelector("[data-message]");
const clientKey = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

await renderHeader();
if (!orderId) {
  setMessage(messageTarget, "주문 번호가 없습니다.");
} else {
  try {
    const { order } = await api(`/api/orders/${encodeURIComponent(orderId)}`);
    if (order.status === "paid") {
      location.href = `/order-complete.html?id=${encodeURIComponent(order.id)}`;
    } else {
      await setupPayment(order);
    }
  } catch (error) {
    if (!requireLogin(error)) setMessage(messageTarget, error.message);
  }
}

async function setupPayment(order) {
  totalTarget.textContent = currency(order.total);
  if (!window.TossPayments) throw new Error("결제 모듈을 불러오지 못했습니다.");
  const tossPayments = TossPayments(clientKey);
  const widgets = tossPayments.widgets({ customerKey: crypto.randomUUID() });
  await widgets.setAmount({ currency: "KRW", value: Number(order.total) });
  await Promise.all([
    widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
    widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" })
  ]);
  payButton.disabled = false;
  payButton.addEventListener("click", async () => {
    payButton.disabled = true;
    try {
      await widgets.requestPayment({
        orderId: order.id,
        orderName: order.items.length > 1 ? `${order.items[0].name} 외 ${order.items.length - 1}건` : order.items[0].name,
        successUrl: `${location.origin}/payment-success.html`,
        failUrl: `${location.origin}/payment-fail.html`,
        customerName: "구매자"
      });
    } catch (error) {
      payButton.disabled = false;
      setMessage(messageTarget, error.message || "결제를 시작하지 못했습니다.");
    }
  });
}
