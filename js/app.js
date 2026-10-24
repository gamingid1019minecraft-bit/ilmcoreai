/* ==========================================================================
   IlmCore AI — app.js
   Shared engine: animated background, ripples, toasts, page transitions,
   and the API client used by every page.
   ========================================================================== */

const IlmAPI = (() => {
  const PRODUCTION_API_URL = 'https://ilmcoreback.vercel.app';
  const OVERRIDE_KEY = 'ilmcore_api_base';
  const BACKEND_PORT = 5000;

  function getBaseURL() {
    const override = (localStorage.getItem(OVERRIDE_KEY) || '').trim();
    if (override) return override.replace(/\/$/, '');
    if (PRODUCTION_API_URL) return PRODUCTION_API_URL.replace(/\/$/, '');
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
  }

  async function request(path, options = {}) {
    const token = localStorage.getItem('ilmcore_token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${getBaseURL()}${path}`, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      const isAuthEndpoint = path.startsWith('/auth/');
      const isHealthEndpoint = path.startsWith('/health');
      if (res.status === 401 && !isAuthEndpoint && !isHealthEndpoint) {
        console.warn('[IlmAPI] 401 — token invalid on current backend. Clearing + redirecting.');
        localStorage.removeItem('ilmcore_token');
        localStorage.removeItem('ilmcore_user');
        localStorage.removeItem('ilmcore_session_id');
        setTimeout(() => { window.location.href = 'login.html'; }, 200);
      }
      const message = (data && (data.error || data.message)) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    get BASE_URL() { return getBaseURL(); },
    get DEFAULT_BASE_URL() { return PRODUCTION_API_URL; },
    OVERRIDE_KEY,

    health: () => request('/health'),
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (name, email, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
    googleAuth: (idToken) => request('/auth/google', { method: 'POST', body: JSON.stringify({ id_token: idToken }) }),
    chat: (message, sessionId, image, file, folder) => request('/chat', { method: 'POST', body: JSON.stringify({ message, session_id: sessionId, image: image || null, file: file || null, folder: folder || null }) }),
    getSessions: () => request('/sessions'),
    getMessages: (sessionId) => request(`/sessions/${sessionId}/messages`),
    deleteSession: (sessionId) => request(`/sessions/${sessionId}`, { method: 'DELETE' }),

    async testUrl(url) {
      const clean = (url || '').trim().replace(/\/$/, '');
      if (!clean) throw new Error('Empty URL');
      const res = await fetch(`${clean}/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (!data || data.status !== 'ok') throw new Error('Unexpected response');
      return data;
    },
  };
})();

function showToast(message, type = 'success', duration = 3200) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 280);
  }, duration);
}
window.showToast = showToast;
window.IlmAPI = IlmAPI;

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('ilmcore_token');
  const page = window.location.pathname.split('/').pop();
  if (token && (page === '' || page === 'index.html')) {
    window.location.href = 'dashboard.html';
  }
});

/* Page fade — only on app pages, never on the landing page (prevents CLS) */
document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const isAppPage = ['dashboard.html', 'login.html', 'register.html'].includes(page);
  if (isAppPage) {
    document.body.classList.add('page-fade');
  }
  document.querySelectorAll('a[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      e.preventDefault();
      document.body.classList.remove('page-fade');
      document.body.classList.add('page-leaving');
      setTimeout(() => { window.location.href = href; }, 260);
    });
  });
});

/* Click ripple — caches the position check to prevent forced reflows */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn, .btn-icon, .btn-google, .suggested-prompt, .sidebar-item');
  if (!btn) return;
  if (!btn.dataset.rippleReady) {
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.style.overflow = btn.style.overflow || 'hidden';
    btn.dataset.rippleReady = '1';
  }
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  ripple.className = 'click-ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 620);
});

window.addEventListener('load', function initBackground() {
  const mount = () => {
    if (document.getElementById('bg-layer')) return;
    const layer = document.createElement('div');
    layer.id = 'bg-layer';
    layer.innerHTML = `
      <div class="aurora"></div>
      <div class="wave-layer"></div>
      <canvas id="stars-canvas"></canvas>
      <canvas id="bubbles-canvas"></canvas>
      <canvas id="particles-canvas"></canvas>
    `;
    document.body.prepend(layer);
  };
  mount();

  const starsCanvas = document.getElementById('stars-canvas');
  const bubblesCanvas = document.getElementById('bubbles-canvas');
  const particlesCanvas = document.getElementById('particles-canvas');
  const starsCtx = starsCanvas.getContext('2d');
  const bubblesCtx = bubblesCanvas.getContext('2d');
  const particlesCtx = particlesCanvas.getContext('2d');

  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    [starsCanvas, bubblesCanvas, particlesCanvas].forEach(c => {
      c.width = W * DPR;
      c.height = H * DPR;
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    });
    starsCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bubblesCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    particlesCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);

  const STAR_COUNT = Math.floor((W * H) / 9000);
  const stars = Array.from({ length: Math.max(STAR_COUNT, 90) }, () => ({
    x: rand(0, W), y: rand(0, H), r: rand(0.4, 1.6),
    baseAlpha: rand(0.15, 0.9), phase: rand(0, Math.PI * 2), speed: rand(0.4, 1.4),
    sparkle: Math.random() < 0.08,
  }));

  const BUBBLE_COUNT = Math.min(Math.floor((W * H) / 5200), 260);
  function makeBubble(initial) {
    const r = rand(2, 9);
    return {
      x: rand(0, W),
      y: initial ? rand(0, H) : H + r + rand(0, 60),
      r,
      speed: rand(0.18, 0.65) * (r < 5 ? 1.3 : 0.8),
      sway: rand(0.3, 1.2),
      swayPhase: rand(0, Math.PI * 2),
      hue: Math.random() < 0.5 ? 'blue' : 'purple',
      alpha: rand(0.12, 0.42),
    };
  }
  let bubbles = Array.from({ length: BUBBLE_COUNT }, () => makeBubble(true));

  const PARTICLE_COUNT = Math.min(Math.floor((W * H) / 9000), 140);
  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: rand(0, W), y: rand(0, H),
    vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25),
    r: rand(0.8, 2.6),
    hue: Math.random() < 0.5 ? '99,102,241' : '168,85,247',
    alpha: rand(0.25, 0.7),
  }));

  const mouse = { x: W / 2, y: H / 2, active: false };
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    spawnRipple(e.clientX, e.clientY);
  });
  window.addEventListener('mouseleave', () => { mouse.active = false; });

  let lastRipple = 0;
  function spawnRipple(x, y) {
    const now = performance.now();
    if (now - lastRipple < 90) return;
    lastRipple = now;
    const el = document.createElement('div');
    el.className = 'ripple';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  window.addEventListener('click', (e) => {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => spawnRipple(e.clientX, e.clientY), i * 70);
    }
  });

  function drawStars() {
    starsCtx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.phase += 0.02 * s.speed;
      const a = s.baseAlpha * (0.55 + 0.45 * Math.sin(s.phase));
      starsCtx.beginPath();
      starsCtx.fillStyle = `rgba(255,255,255,${a})`;
      starsCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      starsCtx.fill();
      if (s.sparkle && a > 0.7) {
        starsCtx.strokeStyle = `rgba(200,210,255,${a * 0.6})`;
        starsCtx.lineWidth = 0.6;
        starsCtx.beginPath();
        starsCtx.moveTo(s.x - s.r * 3, s.y);
        starsCtx.lineTo(s.x + s.r * 3, s.y);
        starsCtx.moveTo(s.x, s.y - s.r * 3);
        starsCtx.lineTo(s.x, s.y + s.r * 3);
        starsCtx.stroke();
      }
    }
  }

  function drawBubbles() {
    bubblesCtx.clearRect(0, 0, W, H);
    for (const b of bubbles) {
      b.y -= b.speed;
      b.swayPhase += 0.01 * b.sway;
      b.x += Math.sin(b.swayPhase) * 0.35;

      const color = b.hue === 'blue' ? '91,140,255' : '168,85,247';
      const grad = bubblesCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4);
      grad.addColorStop(0, `rgba(${color},${b.alpha})`);
      grad.addColorStop(0.5, `rgba(${color},${b.alpha * 0.35})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      bubblesCtx.fillStyle = grad;
      bubblesCtx.beginPath();
      bubblesCtx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2);
      bubblesCtx.fill();

      bubblesCtx.beginPath();
      bubblesCtx.fillStyle = `rgba(${color},${Math.min(b.alpha + 0.25, 0.9)})`;
      bubblesCtx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
      bubblesCtx.fill();

      if (b.y + b.r * 4 < 0) Object.assign(b, makeBubble(false));
    }
  }

  function drawParticles() {
    particlesCtx.clearRect(0, 0, W, H);
    for (const p of particles) {
      if (mouse.active) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          const force = (140 - dist) / 140;
          p.vx -= (dx / dist) * force * 0.03;
          p.vy -= (dy / dist) * force * 0.03;
        }
      }
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy;

      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;

      particlesCtx.beginPath();
      particlesCtx.fillStyle = `rgba(${p.hue},${p.alpha})`;
      particlesCtx.shadowColor = `rgba(${p.hue},0.9)`;
      particlesCtx.shadowBlur = 6;
      particlesCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      particlesCtx.fill();
      particlesCtx.shadowBlur = 0;
    }
  }

  function loop() {
    drawStars();
    drawBubbles();
    drawParticles();
    requestAnimationFrame(loop);
  }
  loop();
});