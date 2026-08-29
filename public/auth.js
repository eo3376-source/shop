import { api, renderHeader, safeNext, setMessage } from "/shared.js";

await renderHeader();
const form = document.querySelector("[data-auth-form]");
const messageTarget = document.querySelector("[data-message]");
const mode = form.dataset.mode;
const next = safeNext(new URLSearchParams(location.search).get("next"), mode === "login" ? "/" : "/login.html");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(messageTarget);
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  try {
    if (mode === "signup") {
      await api("/api/auth/signup", { method: "POST", body: JSON.stringify(values) });
      location.href = `/login.html?next=${encodeURIComponent(next)}`;
    } else {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
      location.href = next;
    }
  } catch (error) {
    setMessage(messageTarget, error.message);
    submit.disabled = false;
  }
});
