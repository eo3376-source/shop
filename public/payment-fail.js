import { renderHeader } from "/shared.js";
await renderHeader();
const query = new URLSearchParams(location.search);
document.querySelector("[data-message]").textContent = query.get("message") || "결제가 완료되지 않았습니다. 주문 상태는 결제 대기로 유지됩니다.";
