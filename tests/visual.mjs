import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const cdpBase = process.env.CDP_URL || "http://127.0.0.1:9222";
const appBase = process.env.BASE_URL || "http://127.0.0.1:8787";
const target = await fetch(`${cdpBase}/json/new?${encodeURIComponent(appBase)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
let sequence = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push(message.params.entry.text);
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    errors.push(message.params.args.map((argument) => argument.value || argument.description || "console error").join(" "));
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function navigate(path, width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${appBase}${path}` });
  await wait(1300);
  await evaluate("scrollTo(0, 0)");
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(`artifacts/${name}.png`, Buffer.from(result.data, "base64"));
}

await mkdir("artifacts", { recursive: true });
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

await navigate("/", 1106, 797);
await screenshot("home");
await navigate("/product.html?id=1", 1270, 831);
await screenshot("detail");

const marker = Date.now();
const authResult = await evaluate(`(async () => {
  const email = "visual-${marker}@example.com";
  const headers = { "Content-Type": "application/json" };
  const password = "Visual-" + crypto.randomUUID() + "-9a";
  const signup = await fetch("/api/auth/signup", { method: "POST", headers, body: JSON.stringify({ email, password, name: "화면확인" }) });
  const login = await fetch("/api/auth/login", { method: "POST", headers, body: JSON.stringify({ email, password }) });
  const cart = await fetch("/api/cart", { method: "POST", headers, body: JSON.stringify({ productId: 1, qty: 1 }) });
  return { signup: signup.status, login: login.status, cart: cart.status };
})()`);
assert.deepEqual(authResult, { signup: 201, login: 200, cart: 200 });

await navigate("/cart.html", 1288, 847);
await screenshot("cart");

assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
socket.close();
console.log("Visual screenshots captured without browser console errors.");
