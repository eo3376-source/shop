const encoder = new TextEncoder();
const SESSION_COOKIE = "shop_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 100000;
const CATEGORIES = new Set(["잡화", "뷰티", "신발", "식품"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });

      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      headers.set("Referrer-Policy", "same-origin");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (cause) {
      console.error("Unhandled request error", cause);
      return json({ error: "요청을 처리하지 못했습니다." }, 500);
    }
  }
};

async function handleApi(request, env, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !isSameOrigin(request, url)) {
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  }

  if (method === "GET" && path === "/api/products") return listProducts(env.DB, url);
  if (method === "GET" && /^\/api\/products\/\d+$/.test(path)) {
    return getProduct(env.DB, Number(path.split("/").pop()));
  }
  if (method === "POST" && path === "/api/auth/signup") return signup(request, env.DB);
  if (method === "POST" && path === "/api/auth/login") return login(request, env.DB, url);
  if (method === "POST" && path === "/api/auth/logout") return logout(request, env.DB, url);
  if (method === "GET" && path === "/api/auth/me") return me(request, env.DB);

  const user = await requireUser(request, env.DB);
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);

  if (method === "GET" && path === "/api/cart") return getCart(env.DB, user.id);
  if (method === "POST" && path === "/api/cart") return addCartItem(request, env.DB, user.id);
  if (method === "PATCH" && /^\/api\/cart\/\d+$/.test(path)) {
    return updateCartItem(request, env.DB, user.id, Number(path.split("/").pop()));
  }
  if (method === "DELETE" && /^\/api\/cart\/\d+$/.test(path)) {
    return deleteCartItem(env.DB, user.id, Number(path.split("/").pop()));
  }
  if (method === "POST" && path === "/api/orders") return createOrder(env.DB, user.id);
  if (method === "GET" && path === "/api/orders") return listOrders(env.DB, user.id);
  if (method === "GET" && path.startsWith("/api/orders/")) {
    return getOrder(env.DB, user.id, decodeURIComponent(path.slice("/api/orders/".length)));
  }

  return json({ error: "요청한 API를 찾을 수 없습니다." }, 404);
}

async function listProducts(db, url) {
  const category = url.searchParams.get("category");
  if (category && !CATEGORIES.has(category)) return json({ error: "올바르지 않은 분류입니다." }, 400);

  const statement = category
    ? db.prepare("SELECT id, name, price, description, category, image_url FROM products WHERE category = ? ORDER BY id").bind(category)
    : db.prepare("SELECT id, name, price, description, category, image_url FROM products ORDER BY id");
  const { results } = await statement.all();
  return json({ products: results });
}

async function getProduct(db, id) {
  const product = await db.prepare("SELECT id, name, price, description, category, image_url FROM products WHERE id = ?").bind(id).first();
  return product ? json({ product }) : json({ error: "상품을 찾을 수 없습니다." }, 404);
}

async function signup(request, db) {
  const body = await readJson(request);
  if (!body) return json({ error: "올바른 JSON 요청이 필요합니다." }, 400);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!email || !isEmail(email)) return json({ error: "올바른 이메일을 입력해주세요." }, 400);
  if (password.length < 8 || password.length > 128) return json({ error: "비밀번호는 8자 이상 128자 이하로 입력해주세요." }, 400);
  if (!name || name.length > 50) return json({ error: "이름은 1자 이상 50자 이하로 입력해주세요." }, 400);

  const exists = await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ error: "이미 가입된 이메일입니다." }, 409);

  const passwordHash = await hashPassword(password);
  try {
    const result = await db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)").bind(email, passwordHash, name).run();
    return json({ user: { id: result.meta.last_row_id, email, name } }, 201);
  } catch (cause) {
    if (String(cause).includes("UNIQUE")) return json({ error: "이미 가입된 이메일입니다." }, 409);
    throw cause;
  }
}

async function login(request, db, url) {
  const body = await readJson(request);
  if (!body) return json({ error: "올바른 JSON 요청이 필요합니다." }, 400);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const user = await db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, 401);
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', ?))")
      .bind(user.id, tokenHash, `+${SESSION_DAYS} days`)
  ]);

  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(token, url.protocol === "https:"));
  return json({ user: publicUser(user) }, 200, headers);
}

async function logout(request, db, url) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(url.protocol === "https:"));
  return json({ ok: true }, 200, headers);
}

async function me(request, db) {
  const user = await requireUser(request, db);
  return json({ user: user ? publicUser(user) : null });
}

async function requireUser(request, db) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return db.prepare(`
    SELECT users.id, users.email, users.name
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now')
  `).bind(await sha256(token)).first();
}

async function getCart(db, userId) {
  const { results } = await db.prepare(`
    SELECT cart_items.product_id, cart_items.qty, products.name, products.price,
           products.description, products.category, products.image_url,
           cart_items.qty * products.price AS subtotal
    FROM cart_items JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.user_id = ? ORDER BY cart_items.id
  `).bind(userId).all();
  const total = results.reduce((sum, item) => sum + Number(item.subtotal), 0);
  return json({ items: results, total });
}

async function addCartItem(request, db, userId) {
  const body = await readJson(request);
  const productId = toPositiveInteger(body?.productId);
  const qty = toQuantity(body?.qty);
  if (!productId || !qty) return json({ error: "상품과 1–99 사이 수량을 입력해주세요." }, 400);

  const product = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) return json({ error: "상품을 찾을 수 없습니다." }, 404);
  const current = await db.prepare("SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?").bind(userId, productId).first();
  const nextQty = Number(current?.qty || 0) + qty;
  if (nextQty > 99) return json({ error: "상품 수량은 99개를 넘을 수 없습니다." }, 400);

  await db.prepare(`
    INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET qty = excluded.qty
  `).bind(userId, productId, nextQty).run();
  return getCart(db, userId);
}

async function updateCartItem(request, db, userId, productId) {
  const body = await readJson(request);
  const qty = toQuantity(body?.qty);
  if (!qty) return json({ error: "수량은 1–99 사이여야 합니다." }, 400);
  const result = await db.prepare("UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?").bind(qty, userId, productId).run();
  if (!result.meta.changes) return json({ error: "장바구니 상품을 찾을 수 없습니다." }, 404);
  return getCart(db, userId);
}

async function deleteCartItem(db, userId, productId) {
  const result = await db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").bind(userId, productId).run();
  if (!result.meta.changes) return json({ error: "장바구니 상품을 찾을 수 없습니다." }, 404);
  return getCart(db, userId);
}

async function createOrder(db, userId) {
  const { results: items } = await db.prepare(`
    SELECT cart_items.product_id, cart_items.qty, products.price
    FROM cart_items JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.user_id = ? ORDER BY cart_items.id
  `).bind(userId).all();
  if (!items.length) return json({ error: "장바구니가 비어 있습니다." }, 409);

  const total = items.reduce((sum, item) => sum + Number(item.qty) * Number(item.price), 0);
  const orderId = crypto.randomUUID();
  const statements = [
    db.prepare("INSERT INTO orders (id, user_id, total, status) VALUES (?, ?, ?, 'pending')").bind(orderId, userId, total),
    ...items.map((item) => db.prepare("INSERT INTO order_items (order_id, product_id, qty, price) VALUES (?, ?, ?, ?)")
      .bind(orderId, item.product_id, item.qty, item.price)),
    db.prepare("DELETE FROM cart_items WHERE user_id = ?").bind(userId)
  ];
  await db.batch(statements);
  return json({ order: { id: orderId, total, status: "pending" } }, 201);
}

async function listOrders(db, userId) {
  const { results } = await db.prepare("SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
  return json({ orders: results });
}

async function getOrder(db, userId, orderId) {
  if (!orderId || orderId.length > 64) return json({ error: "올바르지 않은 주문 번호입니다." }, 400);
  const order = await db.prepare("SELECT id, total, status, created_at FROM orders WHERE id = ? AND user_id = ?").bind(orderId, userId).first();
  if (!order) return json({ error: "주문을 찾을 수 없습니다." }, 404);
  const { results: items } = await db.prepare(`
    SELECT order_items.product_id, order_items.qty, order_items.price,
           products.name, products.image_url,
           order_items.qty * order_items.price AS subtotal
    FROM order_items JOIN products ON products.id = order_items.product_id
    WHERE order_items.order_id = ? ORDER BY order_items.id
  `).bind(orderId).all();
  return json({ order: { ...order, items } });
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 16384) return null;
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isSameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toQuantity(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterationsText, saltText, hashText] = String(stored).split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) return false;
  const actual = await derivePassword(password, fromBase64(saltText), iterations);
  const expected = fromBase64(hashText);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function randomToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value) {
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function sessionCookie(token, secure) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function json(data, status = 200, extraHeaders = new Headers()) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers });
}
