export function currency(value) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export function safeNext(value, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const destination = new URL(value, location.origin);
    if (destination.origin !== location.origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export function requireLogin(error) {
  if (error?.status !== 401) return false;
  const next = `${location.pathname}${location.search}`;
  location.href = `/login.html?next=${encodeURIComponent(next)}`;
  return true;
}

export async function renderHeader() {
  const target = document.querySelector("[data-header]");
  if (!target) return null;

  let user = null;
  try {
    user = (await api("/api/auth/me")).user;
  } catch (error) {
    console.error(error);
  }

  target.innerHTML = `
    <header class="site-header">
      <div class="shell header-inner">
        <a class="header-home" href="/">상품 목록</a>
        <nav class="header-nav" aria-label="사용자 메뉴">
          ${user ? `<span class="header-user">${escapeHtml(user.name)}님</span><a href="/mypage.html">마이페이지</a><button type="button" data-logout>로그아웃</button>` : '<a href="/login.html">로그인</a><a href="/signup.html">회원가입</a>'}
          <a href="/cart.html">장바구니</a>
        </nav>
      </div>
    </header>`;

  target.querySelector("[data-logout]")?.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      location.href = "/";
    } catch (error) {
      console.error(error);
    }
  });
  return user;
}

export function setMessage(target, message = "") {
  target.textContent = message;
  target.hidden = !message;
}
