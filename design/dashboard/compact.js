// Narrow window (under half the screen, e.g. the Electron shell's un-maximized widget) → chat-only mode.
(() => {
  const chat = document.getElementById('chat');
  let was = null;
  const apply = () => {
    const w = Math.min(document.documentElement.clientWidth || innerWidth, window.visualViewport?.width || innerWidth);
    const on = w < Math.max(560, (screen.availWidth || 1440) / 2);
    if (on === was) return; was = on;
    document.body.classList.toggle('compact', on);
    if (on) { chat.classList.add('open'); setTimeout(() => document.getElementById('chatInput')?.focus(), 50); }
  };
  window.addEventListener('resize', apply);
  apply();
})();
