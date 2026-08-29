import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8787";
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
  let result = await request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: "testing1234", name: label }) });
  assert.equal(result.response.status, 201);
  result = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "testing1234" }) });
  assert.equal(result.response.status, 200);
  assert.ok(result.cookie.startsWith("shop_session="));
  return result.cookie;
}

const products = await request("/api/products");
assert.equal(products.response.status, 200);
assert.equal(products.data.products.length, 8);

const food = await request(`/api/products?category=${encodeURIComponent("식품")}`);
assert.equal(food.response.status, 200);
assert.equal(food.data.products.length, 2);

const firstCookie = await signupAndLogin("첫사용자");
const secondCookie = await signupAndLogin("둘째사용자");

let result = await request("/api/cart", { method: "POST", body: JSON.stringify({ productId: 1, qty: 1 }) }, firstCookie);
assert.equal(result.response.status, 200);
assert.equal(result.data.total, 89000);

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

result = await request(`/api/orders/${orderId}`, {}, firstCookie);
assert.equal(result.response.status, 200);
assert.equal(result.data.order.items[0].price, 89000);

console.log(`Smoke tests passed against ${baseUrl}`);
