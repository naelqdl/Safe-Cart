// Where the agent and SafeShop live. Local runs keep the local ports; the hosted demo uses the Render services.
// ?api=<agent url> still overrides (read in app.js / landing.js).
(() => {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  window.SAFECART_CONFIG = local
    ? { api: 'http://localhost:8000', shop: 'http://localhost:3300/' }
    : { api: 'https://safecart-demo-agent.onrender.com', shop: 'https://safecart-demo-shop.onrender.com/' };
})();
