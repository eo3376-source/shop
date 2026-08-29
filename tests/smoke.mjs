import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8787";
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const testPassword = `Test-${crypto.randomUUID()}-9a`;

async function request(path, options = {}, cookie = "") {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  if (!["GET", "HEAD"].includes(options.method || "GET")) headers.set("Origin", baseUrl);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  const data = response.headers.get("Content-Type")?.includes("application/json") ? await response.json() : null;
  return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie };
}

async function signupAndLogin(label) {
  const email = `${label}-${marker}@example.com`;
  let result = await request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: testPassword, name: label }) });
  assert.equal(result.response.status, 201);
  result = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: testPassword }) });
  assert.equal(result.response.status, 200);
  assert.ok(result.cookie.startsWith("shop_session="));
  return result.cookie;
}

const products = await request("/api/products");
assert.equal(products.response.status, 200);
assert.equal(products.data.products.length, 8);

const unsafeProductId = await request("/api/products/999999999999999999999999");
assert.equal(unsafeProductId.response.status, 400);

const missingOrigin = await fetch(`${baseUrl}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `no-origin-${marker}@example.com`, password: testPassword, name: "origin" })
});
assert.equal(missingOrigin.status, 403);

let validation = await request("/api/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email: `control-${marker}@example.com`, password: testPassword, name: "bad\nname" })
});
assert.equal(validation.response.status, 400);

validation = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "not-an-email", password: "x".repeat(129) })
});
assert.equal(validation.response.status, 401);

validation = await request("/api/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email: `large-${marker}@example.com`, password: "x".repeat(17000), name: "large" })
});
assert.equal(validation.response.status, 400);

const food = await request(`/api/products?category=${encodeURIComponent("식품")}`);
assert.equal(food.response.status, 200);
assert.equal(food.data.products.length, 2);

const guestCart = await request("/api/cart");
assert.equal(guestCart.response.status, 401);
const guestOrder = await request("/api/orders");
assert.equal(guestOrder.response.status, 401);

const firstCookie = await signupAndLogin("첫사용자");
const secondCookie = await signupAndLogin("둘째사용자");

const firstProfile = await request("/api/auth/me", {}, firstCookie);
const secondProfile = await request("/api/auth/me", {}, secondCookie);
assert.equal(firstProfile.data.user.name, "첫사용자");
assert.equal(secondProfile.data.user.name, "둘째사용자");
assert.notEqual(firstProfile.data.user.id, secondProfile.data.user.id);

let result = await request("/api/cart", { method: "POST", body: JSON.stringify({ productId: 1, qty: 1 }) }, firstCookie);
assert.equal(result.response.status, 200);
assert.equal(result.data.total, 89000);

result = await request("/api/cart/1", { method: "PATCH", body: JSON.stringify({ qty: 2 }) }, secondCookie);
assert.equal(result.response.status, 404);
result = await request("/api/cart", {}, secondCookie);
assert.equal(result.data.items.length, 0);

result = await request("/api/cart", { method: "POST", body: JSON.stringify({ productId: "1", qty: 1 }) }, firstCookie);
assert.equal(result.response.status, 400);

result = await request("/api/cart/1", { method: "PATCH", body: JSON.stringify({ qty: 99 }) }, firstCookie);
assert.equal(result.response.status, 200);
assert.equal(result.data.total, 8811000);

result = await request("/api/cart/1", { method: "PATCH", body: JSON.stringify({ qty: 0 }) }, firstCookie);
assert.equal(result.response.status, 400);
result = await request("/api/cart/1", { method: "PATCH", body: JSON.stringify({ qty: 100 }) }, firstCookie);
assert.equal(result.response.status, 400);

result = await request("/api/cart/1", { method: "PATCH", body: JSON.stringify({ qty: 2 }) }, firstCookie);
assert.equal(result.response.status, 200);
assert.equal(result.data.total, 178000);

const created = await request("/api/orders", { method: "POST", body: "{}" }, firstCookie);
assert.equal(created.response.status, 201);
assert.equal(created.data.order.total, 178000);
const orderId = created.data.order.id;

result = await request("/api/cart", {}, firstCookie);
assert.equal(result.data.items.length, 0);

result = await request(`/api/orders/${orderId}`, {}, secondCookie);
assert.equal(result.response.status, 404);

result = await request("/api/orders/not-a-valid-order", {}, firstCookie);
assert.equal(result.response.status, 400);

result = await request("/api/payments/confirm", {
  method: "POST",
  body: JSON.stringify({ paymentKey: "test_payment_key", orderId, amount: 178000 })
}, secondCookie);
assert.equal(result.response.status, 404);

result = await request(`/api/orders/${orderId}`, {}, firstCookie);
assert.equal(result.response.status, 200);
assert.equal(result.data.order.items[0].price, 89000);

result = await request("/api/auth/logout", { method: "POST", body: "{}" }, firstCookie);
assert.equal(result.response.status, 200);
result = await request("/api/cart", {}, firstCookie);
assert.equal(result.response.status, 401);

console.log(`Smoke tests passed against ${baseUrl}`);
