import { api, currency, escapeHtml, renderHeader, requireLogin, setMessage } from "/shared.js";

const target = document.querySelector("[data-detail]");
const messageTarget = document.querySelector("[data-message]");
const id = Number(new URLSearchParams(location.search).get("id"));

await renderHeader();
if (!Number.isInteger(id) || id < 1) {
  setMessage(messageTarget, "상품을 찾을 수 없습니다.");
} else {
  try {
    const { product } = await api(`/api/products/${id}`);
    document.title = product.name;
    target.insertAdjacentHTML("beforeend", `
      <div class="detail-layout">
        <div class="detail-image-wrap"><img class="detail-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}"></div>
        <div class="detail-info">
          <div class="detail-category">${escapeHtml(product.category)}</div>
          <h1 class="detail-name">${escapeHtml(product.name)}</h1>
          <p class="detail-description">${escapeHtml(product.description)}</p>
          <button class="english-action" type="button" data-english>English</button>
          <div class="english-panel" data-english-panel hidden>
            <p class="english-label">English description</p>
            <p class="english-description" data-english-text aria-live="polite"></p>
          </div>
          <p class="product-price detail-price">${currency(product.price).replace("원", '<span class="price-unit">원</span>')}</p>
          <div class="purchase-row">
            <div class="quantity-control" aria-label="수량 선택">
              <button type="button" data-decrease aria-label="수량 줄이기">−</button>
              <input type="number" min="1" max="99" value="1" data-qty aria-label="수량">
              <button type="button" data-increase aria-label="수량 늘리기">＋</button>
            </div>
            <button class="primary-action" type="button" data-add>장바구니 담기</button>
          </div>
          <p class="message" data-purchase-message hidden></p>
        </div>
      </div>`);

    const quantity = target.querySelector("[data-qty]");
    const englishButton = target.querySelector("[data-english]");
    const englishPanel = target.querySelector("[data-english-panel]");
    const englishText = target.querySelector("[data-english-text]");
    englishButton.addEventListener("click", async () => {
      const wasHidden = englishPanel.hidden;
      const previousText = englishText.textContent;
      englishPanel.hidden = false;
      englishText.textContent = "불러오는 중...";
      englishButton.disabled = true;
      try {
        const result = await api(`/api/products/${product.id}/english`, { method: "POST", body: "{}" });
        if (!result.description) throw new Error("영어 소개를 만들지 못했습니다.");
        englishText.textContent = result.description;
      } catch (error) {
        englishPanel.hidden = wasHidden;
        englishText.textContent = previousText;
        console.error(error);
      } finally {
        englishButton.disabled = false;
      }
    });
    target.querySelector("[data-decrease]").addEventListener("click", () => setQuantity(Number(quantity.value) - 1));
    target.querySelector("[data-increase]").addEventListener("click", () => setQuantity(Number(quantity.value) + 1));
    quantity.addEventListener("change", () => setQuantity(Number(quantity.value)));
    target.querySelector("[data-add]").addEventListener("click", async () => {
      const purchaseMessage = target.querySelector("[data-purchase-message]");
      setMessage(purchaseMessage);
      try {
        await api("/api/cart", { method: "POST", body: JSON.stringify({ productId: product.id, qty: Number(quantity.value) }) });
        setMessage(purchaseMessage, "장바구니에 담았습니다.");
      } catch (error) {
        if (!requireLogin(error)) setMessage(purchaseMessage, error.message);
      }
    });

    function setQuantity(value) {
      quantity.value = String(Math.min(99, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1)));
    }
  } catch (error) {
    setMessage(messageTarget, error.message);
  }
}
