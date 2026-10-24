/* ==========================================================================
   IlmCore AI — dashboard.js
   Chat interface logic + settings panel + narration (browser speechSynthesis)
   ========================================================================== */

/* ---------- AUTH GUARD ---------- */
(function authGuard() {
  const token = localStorage.getItem('ilmcore_token');
  if (!token) window.location.href = 'login.html';
})();

/* ---------- STATE ---------- */
// Every visit starts a fresh chat. Old chats stay in the sidebar and open only when clicked.
localStorage.removeItem('ilmcore_session_id');
const state = {
  sessionId: null,
  sessions: [],
  isSending: false,
};

const el = {
  appShell: document.getElementById('app-shell'),
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  mobileSidebarBtn: document.getElementById('mobile-sidebar-btn'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  newChatBtn: document.getElementById('new-chat-btn'),
  searchChats: document.getElementById('search-chats'),
  sidebarHistory: document.getElementById('sidebar-history'),
  logoutBtn: document.getElementById('logout-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  profileAvatar: document.getElementById('profile-avatar'),
  profileName: document.getElementById('profile-name'),
  profileEmail: document.getElementById('profile-email'),
  chatScroll: document.getElementById('chat-scroll'),
  chatInner: document.getElementById('chat-inner'),
  welcomeScreen: document.getElementById('welcome-screen'),
  currentChatTitle: document.getElementById('current-chat-title'),
  statusPill: document.getElementById('status-pill'),
  statusText: document.getElementById('status-text'),
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  voiceBtn: document.getElementById('voice-btn'),
  attachBtn: document.getElementById('attach-btn'),
  imageUpload: document.getElementById("image-upload"),
};

/* ---------- SETTINGS ---------- */
const SETTINGS_KEY = 'ilmcore_settings';
const OVERRIDE_KEY = 'ilmcore_api_base';

const DEFAULT_SETTINGS = {
  accent: 'blue',
  scale: 'default',
  enterToSend: true,
  sound: false,
  showSources: true,
  autoNarrate: false,
  voiceURI: '',
  voiceRate: 1.0,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (_) {}
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
const settings = loadSettings();

function applySettings() {
  if (settings.accent && settings.accent !== 'blue') {
    document.body.setAttribute('data-accent', settings.accent);
  } else {
    document.body.removeAttribute('data-accent');
  }
  document.documentElement.setAttribute('data-scale', settings.scale || 'default');

  document.querySelectorAll('#swatch-row .swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.accent === settings.accent);
  });
  document.querySelectorAll('#font-size-row .size-btn').forEach(btn => {
    const map = { '0.92': 'small', '1': 'default', '1.1': 'large' };
    btn.classList.toggle('selected', map[btn.dataset.scale] === settings.scale);
  });
  const autoEl = document.getElementById('set-auto-narrate');
  if (autoEl) autoEl.checked = !!settings.autoNarrate;
  const enterEl = document.getElementById('set-enter');
  if (enterEl) enterEl.checked = settings.enterToSend !== false;
  const soundEl = document.getElementById('set-sound');
  if (soundEl) soundEl.checked = !!settings.sound;
  const srcEl = document.getElementById('set-sources');
  if (srcEl) srcEl.checked = settings.showSources !== false;
  const rateEl = document.getElementById('set-voice-rate');
  if (rateEl) rateEl.value = settings.voiceRate;
  const rateLbl = document.getElementById('voice-rate-label');
  if (rateLbl) rateLbl.textContent = settings.voiceRate.toFixed(1) + '×';
  const voiceSel = document.getElementById('set-voice');
  if (voiceSel && settings.voiceURI) voiceSel.value = settings.voiceURI;
}
applySettings();

/* ---------- ATTACHMENTS ---------- */
let selectedImage = null;
let uploadedImageBase64 = null;
let uploadedImageName = null;
let uploadedFile = null;
let uploadedFolder = null;

const TEXT_FILE_EXTENSIONS = [
  '.txt', '.md', '.csv', '.json', '.js', '.jsx', '.ts', '.tsx', '.py', '.html',
  '.css', '.xml', '.log', '.yml', '.yaml', '.sh', '.c', '.cpp', '.h', '.java',
  '.rb', '.php', '.sql',
];

function isLikelyTextFile(file) {
  if (file.type && file.type.startsWith('text/')) return true;
  const name = file.name.toLowerCase();
  return TEXT_FILE_EXTENSIONS.some(ext => name.endsWith(ext));
}

function fileIconFor(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return '📕';
  if (n.endsWith('.doc') || n.endsWith('.docx')) return '📘';
  if (n.endsWith('.xls') || n.endsWith('.xlsx') || n.endsWith('.csv')) return '📊';
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return '📙';
  if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z')) return '🗜️';
  if (n.endsWith('.mp3') || n.endsWith('.wav')) return '🎵';
  if (n.endsWith('.mp4') || n.endsWith('.mov') || n.endsWith('.avi')) return '🎞️';
  if (TEXT_FILE_EXTENSIONS.some(ext => n.endsWith(ext))) return '📝';
  return '📄';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function resizeImageForUpload(file, maxDimension = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function processImageForUpload(file) {
  const SAFE_RAW_BYTES = 1.2 * 1024 * 1024;
  if (file.size <= SAFE_RAW_BYTES) return readFileAsDataURL(file);
  return resizeImageForUpload(file);
}

function renderAttachmentPreview(innerHtml) {
  const container = document.getElementById('image-preview-container');
  container.innerHTML = `
    <div class="image-preview-wrapper">
      ${innerHtml}
      <button class="remove-image" id="remove-image">×</button>
    </div>
  `;
  document.getElementById('remove-image').onclick = () => clearSelectedImage();
  autoresizeInput();
}

async function handleSingleFileSelected(file) {
  if (file.type && file.type.startsWith('image/')) {
    selectedImage = file;
    const dataUrl = await processImageForUpload(file);
    uploadedImageBase64 = dataUrl;
    uploadedImageName = file.name;
    renderAttachmentPreview(`<img class="image-preview" src="${dataUrl}">`);
    return;
  }
  const isText = isLikelyTextFile(file);
  const content = isText ? await readFileAsText(file) : await readFileAsDataURL(file);
  uploadedFile = { name: file.name, icon: fileIconFor(file.name), isText, mime: file.type || '', content };
  renderAttachmentPreview(`
    <div class="file-chip">
      <span class="file-chip-icon">${uploadedFile.icon}</span>
      <span class="file-chip-name">${escapeHtml(file.name)}</span>
    </div>
  `);
}

async function handleFolderSelected(files) {
  const folderName = (files[0].webkitRelativePath || '').split('/')[0] || `Selected files (${files.length})`;
  const entries = [];
  for (const f of files) {
    const isText = isLikelyTextFile(f);
    const content = isText ? await readFileAsText(f) : '';
    entries.push({
      path: f.webkitRelativePath || f.name,
      name: f.name,
      type: isText ? 'text' : 'binary',
      content,
    });
  }
  uploadedFolder = { name: folderName, count: files.length, files: entries };
  renderAttachmentPreview(`
    <div class="file-chip">
      <span class="file-chip-icon">📁</span>
      <span class="file-chip-name">${escapeHtml(folderName)} (${files.length} files)</span>
    </div>
  `);
}

const folderUploadInput = document.createElement('input');
folderUploadInput.type = 'file';
folderUploadInput.id = 'folder-upload';
folderUploadInput.webkitdirectory = true;
folderUploadInput.directory = true;
folderUploadInput.multiple = true;
folderUploadInput.hidden = true;
document.body.appendChild(folderUploadInput);
el.folderUpload = folderUploadInput;

let attachMenuEl = null;
function closeAttachMenu() {
  if (attachMenuEl) {
    attachMenuEl.remove();
    attachMenuEl = null;
    document.removeEventListener('click', handleOutsideAttachMenuClick);
  }
}
function handleOutsideAttachMenuClick(e) {
  if (attachMenuEl && !attachMenuEl.contains(e.target) && e.target !== el.attachBtn) closeAttachMenu();
}
function openAttachMenu() {
  if (attachMenuEl) { closeAttachMenu(); return; }
  const wrap = el.attachBtn.parentElement;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  attachMenuEl = document.createElement('div');
  attachMenuEl.className = 'attach-menu';
  attachMenuEl.style.cssText = `
    position:absolute; bottom:calc(100% + 8px); left:0;
    background:var(--glass-strong, #171c30); border:1px solid var(--glass-border, rgba(255,255,255,0.12));
    border-radius:12px; padding:6px; display:flex; flex-direction:column; gap:2px;
    min-width:180px; box-shadow:0 10px 30px rgba(0,0,0,0.45); z-index:50;
  `;
  attachMenuEl.innerHTML = `
    <button type="button" data-action="file" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:transparent;border:none;color:inherit;font-size:13.5px;cursor:pointer;width:100%;text-align:left;">
      <span style="font-size:16px;">📄</span> Upload file(s)
    </button>
    <button type="button" data-action="folder" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:transparent;border:none;color:inherit;font-size:13.5px;cursor:pointer;width:100%;text-align:left;">
      <span style="font-size:16px;">📁</span> Upload folder
    </button>
  `;
  wrap.appendChild(attachMenuEl);
  attachMenuEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.08)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
  });
  attachMenuEl.querySelector('[data-action="file"]').addEventListener('click', () => {
    closeAttachMenu(); el.imageUpload.click();
  });
  attachMenuEl.querySelector('[data-action="folder"]').addEventListener('click', () => {
    closeAttachMenu(); el.folderUpload.click();
  });
  setTimeout(() => document.addEventListener('click', handleOutsideAttachMenuClick), 0);
}

el.attachBtn.addEventListener("click", (e) => { e.stopPropagation(); openAttachMenu(); });

el.imageUpload.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  try {
    if (files.length > 1) await handleFolderSelected(files);
    else await handleSingleFileSelected(files[0]);
  } catch (err) {
    console.error('[IlmCore] Failed to read attachment:', err);
    showToast('Could not read that file.', 'error');
    clearSelectedImage();
  }
});

/* Paste images (Ctrl+V / screenshot snips) straight into the message box */
el.chatInput.addEventListener('paste', async (e) => {
  const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
  const imgItem = items.find(it => it.kind === 'file' && it.type.startsWith('image/'));
  if (!imgItem) return;                       // normal text paste — leave it alone
  const hasText = items.some(it => it.kind === 'string' && it.type === 'text/plain');
  if (hasText) return;                        // mixed clipboard: keep the text paste
  const blob = imgItem.getAsFile();
  if (!blob) return;
  e.preventDefault();
  try {
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const named = new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: blob.type });
    await handleSingleFileSelected(named);
    showToast('Image pasted', 'success', 1400);
  } catch (err) {
    console.error('[IlmCore] Failed to paste image:', err);
    showToast('Could not paste that image.', 'error');
    clearSelectedImage();
  }
});

el.folderUpload.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  try { await handleFolderSelected(files); }
  catch (err) {
    console.error('[IlmCore] Failed to read folder:', err);
    showToast('Could not read that folder.', 'error');
    clearSelectedImage();
  }
});

function clearSelectedImage() {
  selectedImage = null;
  uploadedImageBase64 = null;
  uploadedImageName = null;
  uploadedFile = null;
  uploadedFolder = null;
  el.imageUpload.value = "";
  el.folderUpload.value = "";
  const previewContainer = document.getElementById("image-preview-container");
  if (previewContainer) previewContainer.innerHTML = "";
}

/* ---------- USER PROFILE ---------- */
function renderProfile() {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('ilmcore_user') || 'null'); } catch (_) {}
  if (user) {
    el.profileName.textContent = user.name || 'Signed in';
    el.profileEmail.textContent = user.email || '';
    if (user.picture) el.profileAvatar.src = user.picture;
  }
}
renderProfile();

/* ---------- SIDEBAR ---------- */
function isMobile() { return window.innerWidth <= 900; }
function setSidebarCollapsed(collapsed) {
  el.appShell.classList.toggle('collapsed', collapsed);
  localStorage.setItem('ilmcore_sidebar_collapsed', collapsed ? '1' : '0');
}
(function initSidebarState() {
  if (isMobile()) {
    setSidebarCollapsed(true);
    el.mobileSidebarBtn.style.display = 'flex';
  } else {
    setSidebarCollapsed(localStorage.getItem('ilmcore_sidebar_collapsed') === '1');
  }
})();
el.sidebarToggle.addEventListener('click', () => setSidebarCollapsed(!el.appShell.classList.contains('collapsed')));
el.mobileSidebarBtn.addEventListener('click', () => setSidebarCollapsed(false));
el.sidebarBackdrop.addEventListener('click', () => setSidebarCollapsed(true));
window.addEventListener('resize', () => { el.mobileSidebarBtn.style.display = isMobile() ? 'flex' : 'none'; });

/* ---------- HEALTH CHECK ---------- */
async function checkHealth() {
  try {
    await IlmAPI.health();
    el.statusPill.classList.remove('offline');
    el.statusText.textContent = 'Online';
  } catch (_) {
    el.statusPill.classList.add('offline');
    el.statusText.textContent = 'Backend offline';
  }
}
checkHealth();
setInterval(checkHealth, 30000);

/* ---------- SESSIONS ---------- */
function renderSessions(filter = '') {
  const list = state.sessions.filter(s =>
    !filter || (s.title || '').toLowerCase().includes(filter.toLowerCase())
  );
  if (list.length === 0) {
    el.sidebarHistory.innerHTML = `<div class="sidebar-empty">${filter ? 'No matching chats' : 'No conversations yet'}</div>`;
    return;
  }
  el.sidebarHistory.innerHTML = '';
  list.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sidebar-item' + (s.id === state.sessionId ? ' active' : '');
    item.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="chat-title label-fade">${escapeHtml(s.title || 'Untitled chat')}</span>
      <button class="chat-delete label-fade" title="Delete chat" data-id="${s.id}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-delete')) return;
      loadSession(s.id);
    });
    item.querySelector('.chat-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteSessionById(s.id);
    });
    el.sidebarHistory.appendChild(item);
  });
}

async function loadSessionsList() {
  try {
    const data = await IlmAPI.getSessions();
    state.sessions = (data && (data.sessions || data)) || [];
    renderSessions(el.searchChats.value.trim());
  } catch (err) {
    console.error('[IlmCore] Failed to load chat history sidebar:', err);
  }
}
loadSessionsList();
el.searchChats.addEventListener('input', () => renderSessions(el.searchChats.value.trim()));

async function deleteSessionById(id) {
  try {
    await IlmAPI.deleteSession(id);
    state.sessions = state.sessions.filter(s => s.id !== id);
    renderSessions(el.searchChats.value.trim());
    if (state.sessionId === id) startNewChat();
    showToast('Chat deleted', 'success', 1800);
  } catch (err) {
    showToast(err.message || 'Could not delete chat', 'error');
  }
}

async function loadSession(id) {
  state.sessionId = id;
  localStorage.setItem('ilmcore_session_id', id);
  renderSessions(el.searchChats.value.trim());
  clearChat(false);
  try {
    const data = await IlmAPI.getMessages(id);
    const messages = (data && (data.messages || data)) || [];
    if (messages.length === 0) { showWelcome(); return; }
    hideWelcome();
    messages.forEach(m => {
      const role = m.role || (m.is_user ? 'user' : 'assistant');
      appendMessage(role, m.content || m.message || m.reply || '', m.created_at || m.timestamp, false);
    });
    scrollToBottom();
    const active = state.sessions.find(s => s.id === id);
    el.currentChatTitle.textContent = (active && active.title) || 'Conversation';
  } catch (err) {
    showToast(err.message || 'Could not load conversation', 'error');
  }
}

/* ---------- NEW CHAT ---------- */
function startNewChat() {
  state.sessionId = null;
  localStorage.removeItem('ilmcore_session_id');
  el.currentChatTitle.textContent = 'New conversation';
  clearChat(true);
  renderSessions(el.searchChats.value.trim());
  if (isMobile()) setSidebarCollapsed(true);
}
el.newChatBtn.addEventListener('click', startNewChat);
// Coming back via the browser's back/forward cache must also start fresh
window.addEventListener('pageshow', (e) => { if (e.persisted) startNewChat(); });

function clearChat(showWelcomeScreen) {
  el.chatInner.querySelectorAll('.msg-row').forEach(n => n.remove());
  if (showWelcomeScreen) showWelcome(); else hideWelcome();
}
function showWelcome() { el.welcomeScreen.style.display = 'flex'; }
function hideWelcome() { el.welcomeScreen.style.display = 'none'; }

document.querySelectorAll('.suggested-prompt').forEach(btn => {
  btn.addEventListener('click', () => {
    el.chatInput.value = btn.dataset.prompt;
    autoresizeInput();
    sendMessage();
  });
});

/* ---------- MARKDOWN + SYNTAX HIGHLIGHTING ---------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const _HL_KW = new Set(['function','const','let','var','return','if','else','for','while','import','from','export','class','def','elif','try','except','catch','finally','new','async','await','public','static','void','int','float','double','string','bool','true','false','null','None','True','False','self','this','print','console','switch','case','break','continue','struct','interface','implements','extends']);
function highlightCode(code) {
  // Single pass over the RAW code so we never run regexes over our own <span> markup.
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|^[ \t]*#(?!include|define)[^\n]*)|("(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/gm;
  let out = '', last = 0, m;
  while ((m = re.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    const e = escapeHtml(m[0]);
    if (m[1] !== undefined) out += `<span class="tok-com">${e}</span>`;
    else if (m[2] !== undefined) out += `<span class="tok-str">${e}</span>`;
    else if (m[3] !== undefined) out += `<span class="tok-num">${e}</span>`;
    else if (_HL_KW.has(m[0])) out += `<span class="tok-kw">${e}</span>`;
    else if (code[re.lastIndex] === '(') out += `<span class="tok-fn">${e}</span>`;
    else out += e;
    last = re.lastIndex;
  }
  return out + escapeHtml(code.slice(last));
}

/* ---------- CLIPBOARD (works on HTTPS, falls back for older/blocked contexts) ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}

// Event delegation: survives innerHTML re-renders (streaming, history reload, regenerate)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.code-copy-btn');
  if (!btn) return;
  e.preventDefault();
  let code = '';
  try { code = decodeURIComponent(btn.dataset.code || ''); } catch (_) {}
  if (!code) {
    const pre = btn.closest('.code-block') && btn.closest('.code-block').querySelector('pre');
    code = pre ? pre.textContent : '';
  }
  const ok = await copyText(code);
  if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
  btn.textContent = ok ? 'Copied!' : 'Copy failed';
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.innerHTML = btn.dataset.originalHtml; }, 1400);
});

function buildSourceCards(urls) {
  const cards = urls.map(url => {
    const clean = url.replace(/[)\].,]+$/, '');
    let hostname = clean;
    try { hostname = new URL(clean).hostname.replace(/^www\./, ''); } catch (_) {}
    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
    return `<a class="source-card" href="${escapeHtml(clean)}" target="_blank" rel="noopener">
      <img class="source-favicon" src="${favicon}" alt="" width="20" height="20" />
      <span class="source-info">
        <span class="source-title">${escapeHtml(hostname)}</span>
        <span class="source-url">${escapeHtml(clean)}</span>
      </span>
    </a>`;
  }).join('');
  return `<div class="sources-block"><div class="sources-label">Sources</div><div class="sources-list">${cards}</div></div>`;
}

function renderMarkdown(text) {
  if (!text) return '';
  const sourceBlocks = [];
  const text0 = text.replace(
    /(?:^|\n)(?:-{3,}\s*\n)?\s*\*{0,2}Sources:?\*{0,2}\s*\n+((?:(?:\d+\.|[-*])\s*https?:\/\/\S+\s*\n?)+)/gi,
    (_, list) => {
      const urls = [...list.matchAll(/https?:\/\/\S+/g)].map(m => m[0]);
      sourceBlocks.push(buildSourceCards(urls));
      return `\n\n\u0000SOURCEBLOCK${sourceBlocks.length - 1}\u0000\n\n`;
    }
  );

  const blocks = [];
  let src = text0.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push({ lang: (lang || 'text').trim(), code: code.replace(/\n$/, '') });
    return `\u0000CODEBLOCK${blocks.length - 1}\u0000`;
  });

  const mathBlocks = [];
  const extractMath = (re) => {
    src = src.replace(re, (m) => {
      mathBlocks.push(m);
      return `\u0000MATHBLOCK${mathBlocks.length - 1}\u0000`;
    });
  };
  extractMath(/\$\$[\s\S]+?\$\$/g);
  extractMath(/\\\[[\s\S]+?\\\]/g);
  extractMath(/\$[^\n$]+?\$/g);
  extractMath(/\\\([\s\S]+?\\\)/g);

  src = escapeHtml(src);
  src = src.replace(/^### (.*)$/gm, '<h4>$1</h4>');
  src = src.replace(/^## (.*)$/gm, '<h3>$1</h3>');
  src = src.replace(/^# (.*)$/gm, '<h2>$1</h2>');
  src = src.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  src = src.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>');
  src = src.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  src = src.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Auto-link bare URLs (not already inside an <a>), opening in a new tab
  src = src.replace(/(?<![">=])(https?:\/\/[^\s<]+)/g, (m, url) => {
    const tail = url.match(/[.,;:!?)\]]+$/);
    const clean = tail ? url.slice(0, -tail[0].length) : url;
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail ? tail[0] : ''}`;
  });
  src = src.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

  src = src.replace(/(?:^|\n)((?:[-*] .*(?:\n|$))+)/g, (m) => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[-*]\s+/, '')}</li>`).join('');
    return `\n<ul>${items}</ul>\n`;
  });

  src = src.replace(/((?:\|.+\|\n)+)/g, (table) => {
    const rows = table.trim().split("\n");
    if (rows.length < 2) return table;
    let html = "<table>";
    rows.forEach((row, i) => {
      if (i === 1) return;
      const tag = i === 0 ? "th" : "td";
      html += "<tr>";
      row.split("|").slice(1, -1).forEach(cell => {
        html += `<${tag}>${cell.trim()}</${tag}>`;
      });
      html += "</tr>";
    });
    html += "</table>";
    return html;
  });

  src = src.replace(/(?:^|\n)((?:\d+\. .*(?:\n|$))+)/g, (m) => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\.\s+/, '')}</li>`).join('');
    return `\n<ol>${items}</ol>\n`;
  });

  src = src.split(/\n{2,}/).map(chunk => {
    if (/^<(h2|h3|h4|ul|ol|blockquote)/.test(chunk.trim())) return chunk;
    if (/\u0000CODEBLOCK\d+\u0000/.test(chunk.trim())) return chunk;
    if (/\u0000MATHBLOCK\d+\u0000/.test(chunk.trim())) return chunk;
    if (/\u0000SOURCEBLOCK\d+\u0000/.test(chunk.trim())) return chunk;
    const withBreaks = chunk.trim().replace(/\n/g, '<br>');
    return withBreaks ? `<p>${withBreaks}</p>` : '';
  }).join('\n');

  src = src.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => {
    const b = blocks[Number(i)];
    const highlighted = highlightCode(b.code);
    return `<div class="code-block">
      <div class="code-block-header">
        <span>${escapeHtml(b.lang)}</span>
        <button class="code-copy-btn" data-code="${encodeURIComponent(b.code)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
      <pre>${highlighted}</pre>
    </div>`;
  });

  src = src.replace(/\u0000MATHBLOCK(\d+)\u0000/g, (_, i) => mathBlocks[Number(i)]);
  src = src.replace(/\u0000SOURCEBLOCK(\d+)\u0000/g, (_, i) => sourceBlocks[Number(i)]);

  if (!settings.showSources) {
    src = src.replace(/<div class="sources-block">[\s\S]*?<\/div>\s*<\/div>/g, '');
  }

  return src;
}

/* ---------- MESSAGE RENDERING ---------- */
function formatTimestamp(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function scrollToBottom(smooth = true) {
  el.chatScroll.scrollTo({ top: el.chatScroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}
function renderMath(target) {
  if (!target || !window.renderMathInElement) return;
  try {
    renderMathInElement(target, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  } catch (_) {}
}

function appendMessage(role, content, timestamp, animate = true, attachment = null) {
  hideWelcome();
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  if (!animate) row.style.animation = 'none';

  const avatarSrc = role === 'user' ? 'assets/user.png' : 'assets/ai.png';

  let attachmentHtml = '';
  if (attachment && attachment.image) {
    attachmentHtml = `
      <div class="msg-attached-file" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);border-radius:10px;padding:8px 12px;margin-bottom:8px;max-width:260px;">
        <span style="font-size:20px;">🖼️</span>
        <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(attachment.image.name || 'image')}</span>
      </div>`;
  } else if (attachment && attachment.file) {
    attachmentHtml = `
      <div class="msg-attached-file" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);border-radius:10px;padding:8px 12px;margin-bottom:8px;max-width:260px;">
        <span style="font-size:20px;">${attachment.file.icon}</span>
        <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(attachment.file.name)}</span>
      </div>`;
  } else if (attachment && attachment.folder) {
    attachmentHtml = `
      <div class="msg-attached-file" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);border-radius:10px;padding:8px 12px;margin-bottom:8px;max-width:260px;">
        <span style="font-size:20px;">📁</span>
        <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(attachment.folder.name)} (${attachment.folder.count} files)</span>
      </div>`;
  }

  row.innerHTML = `
    <img class="msg-avatar" src="${avatarSrc}" alt="${role}" />
    <div class="msg-body">
      <div class="msg-bubble">${attachmentHtml}${renderMarkdown(content)}</div>
      <div class="msg-meta">
        <span>${formatTimestamp(timestamp)}</span>
        ${role === 'assistant' ? `
        <div class="msg-actions">
          <button class="msg-action-btn action-copy" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="msg-action-btn action-narrate" title="Read aloud">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          </button>
          <button class="msg-action-btn action-regenerate" title="Regenerate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button class="msg-action-btn action-like" title="Good response">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>
          </button>
          <button class="msg-action-btn action-dislike" title="Bad response">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/></svg>
          </button>
        </div>` : ''}
      </div>
    </div>
  `;
  el.chatInner.appendChild(row);
  wireMessageActions(row, content);
  renderMath(row);
  scrollToBottom();
  return row;
}

function wireMessageActions(row, rawContent) {
  const copyBtn = row.querySelector('.action-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(rawContent);
      showToast(ok ? 'Copied to clipboard' : 'Could not copy', ok ? 'success' : 'error', 1500);
    });
  }
  const narrateBtn = row.querySelector('.action-narrate');
  if (narrateBtn) narrateBtn.addEventListener('click', () => toggleNarration(rawContent, narrateBtn));

  const regenBtn = row.querySelector('.action-regenerate');
  if (regenBtn) regenBtn.addEventListener('click', () => regenerateFrom(row));

  const likeBtn = row.querySelector('.action-like');
  const dislikeBtn = row.querySelector('.action-dislike');
  if (likeBtn) likeBtn.addEventListener('click', () => {
    likeBtn.classList.toggle('liked');
    dislikeBtn.classList.remove('disliked');
  });
  if (dislikeBtn) dislikeBtn.addEventListener('click', () => {
    dislikeBtn.classList.toggle('disliked');
    likeBtn.classList.remove('liked');
  });

}

function appendTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.id = 'typing-row';
  row.innerHTML = `
    <img class="msg-avatar" src="assets/ai.png" alt="assistant" />
    <div class="msg-body">
      <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
    </div>
  `;
  el.chatInner.appendChild(row);
  scrollToBottom();
  return row;
}

function streamReplyInto(bubbleEl, fullText, onDone) {
  const words = fullText.split(' ');
  let i = 0;
  bubbleEl.innerHTML = '<span class="streaming-cursor"></span>';
  const interval = setInterval(() => {
    i++;
    let partial = words.slice(0, i).join(' ');
    if ((partial.match(/```/g) || []).length % 2 === 1) partial += '\n```';
    bubbleEl.innerHTML = renderMarkdown(partial) + '<span class="streaming-cursor"></span>';
    scrollToBottom(false);
    if (i >= words.length) {
      clearInterval(interval);
      bubbleEl.innerHTML = renderMarkdown(fullText);
      renderMath(bubbleEl);
      if (onDone) onDone();
    }
  }, 28);
}

/* ==========================================================================
   NARRATION (browser speechSynthesis)
   ========================================================================== */
let _currentUtterance = null;
let _activeNarrateBtn = null;

/* ---------- AUDIO UNLOCK ----------
   Chrome silently drops the FIRST speechSynthesis.speak() call after a page
   loads unless there's been a prior successful audio interaction. Playing
   an empty utterance on the very first user click "unlocks" the engine for
   the rest of the session. Without this, the first narration click does
   nothing, and only the second click onward works — which was the exact
   symptom we were debugging. */
let _audioUnlocked = false;
function unlockSpeechEngine() {
  if (_audioUnlocked || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    u.rate = 1;
    speechSynthesis.speak(u);
    _audioUnlocked = true;
    console.log('[IlmCore] Speech engine unlocked');
  } catch (_) {}
}
// Unlock on the first click / touch / key press anywhere on the page
['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, unlockSpeechEngine, { once: true, passive: true });
});

function stopNarration() {
  try { window.speechSynthesis.cancel(); } catch (_) {}
  if (_activeNarrateBtn) {
    _activeNarrateBtn.classList.remove('narrating');
    _activeNarrateBtn = null;
  }
  _currentUtterance = null;
}

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (settings.voiceURI) {
    const match = voices.find(v => v.voiceURI === settings.voiceURI);
    if (match) return match;
  }
  const preferred = voices.find(v => /google/i.test(v.name) && /en[-_]/i.test(v.lang));
  if (preferred) return preferred;
  const enVoice = voices.find(v => /en[-_]/i.test(v.lang));
  if (enVoice) return enVoice;
  return voices[0];
}

function cleanTextForSpeech(text) {
  if (!text) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' equation ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' equation ')
    .replace(/\$[^$\n]+\$/g, ' math ')
    .replace(/\\\([\s\S]*?\\\)/g, ' math ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

function speakText(text, onDone) {
  if (!('speechSynthesis' in window)) {
    showToast('Text-to-speech is not supported in this browser.', 'error');
    return;
  }
  const clean = cleanTextForSpeech(text);
  if (!clean) return;

  // Ensure the audio engine is unlocked before we try to speak.
  unlockSpeechEngine();

  stopNarration();

  const utter = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.rate = settings.voiceRate || 1;
  utter.pitch = 1;
  utter.volume = 1;

  utter.onstart = () => console.log('[IlmCore] Narration started');
  utter.onend = () => {
    console.log('[IlmCore] Narration ended');
    if (_activeNarrateBtn) {
      _activeNarrateBtn.classList.remove('narrating');
      _activeNarrateBtn = null;
    }
    _currentUtterance = null;
    if (typeof onDone === 'function') onDone();
  };
  utter.onerror = (e) => {
    console.error('[IlmCore] Narration error:', e.error);
    if (_activeNarrateBtn) _activeNarrateBtn.classList.remove('narrating');
    _activeNarrateBtn = null;
    _currentUtterance = null;
  };

  _currentUtterance = utter;
  window.speechSynthesis.speak(utter);

  // Chrome sometimes silently drops the first utterance even after unlocking.
  // If speaking is still false 400ms later, cancel and try again.
  setTimeout(() => {
    if (!window.speechSynthesis.speaking && _currentUtterance === utter) {
      console.warn('[IlmCore] Chrome dropped utterance — retrying once');
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    }
  }, 400);
}

function toggleNarration(text, btn) {
  if (_activeNarrateBtn === btn) {
    stopNarration();
    return;
  }
  stopNarration();
  _activeNarrateBtn = btn;
  btn.classList.add('narrating');
  speakText(text);
}

/* ---------- SEND MESSAGE ---------- */
function autoresizeInput() {
  el.chatInput.style.height = 'auto';
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 200) + 'px';
  const hasAttachment = !!(uploadedImageBase64 || uploadedFile || uploadedFolder);
  el.sendBtn.disabled = (el.chatInput.value.trim().length === 0 && !hasAttachment) || state.isSending;
}
el.chatInput.addEventListener('input', autoresizeInput);
el.sendBtn.addEventListener('click', sendMessage);

el.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) {
    e.preventDefault();
    sendMessage();
  }
});

let lastUserMessage = '';

async function sendMessage() {
  const text = el.chatInput.value.trim();
  const hasAttachment = !!(uploadedImageBase64 || uploadedFile || uploadedFolder);
  if ((!text && !hasAttachment) || state.isSending) return;

  const imageForThisMessage = uploadedImageBase64;
  const imageNameForThisMessage = uploadedImageName;
  const fileForThisMessage = uploadedFile;
  const folderForThisMessage = uploadedFolder;

  lastUserMessage = text;
  hideWelcome();
  appendMessage('user', text, new Date(), true, {
    image: imageForThisMessage ? { name: imageNameForThisMessage } : null,
    file: fileForThisMessage,
    folder: folderForThisMessage,
  });
  el.chatInput.value = '';
  autoresizeInput();

  await requestAssistantReply(text, imageForThisMessage, fileForThisMessage, folderForThisMessage);
}

async function requestAssistantReply(text, image, file, folder) {
  state.isSending = true;
  el.sendBtn.disabled = true;
  const typingRow = appendTypingIndicator();
  clearSelectedImage();

  try {
    const data = await IlmAPI.chat(text, state.sessionId, image, file, folder);
    const reply = (data && (data.reply || data.message)) || '...';
    if (data && data.session_id !== undefined && data.session_id !== null) {
      const isNewSession = String(state.sessionId) !== String(data.session_id);
      state.sessionId = data.session_id;
      localStorage.setItem('ilmcore_session_id', state.sessionId);
      if (isNewSession) {
        el.currentChatTitle.textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
      }
      loadSessionsList();
    }

    typingRow.remove();
    const row = appendMessage('assistant', '', new Date());
    const bubble = row.querySelector('.msg-bubble');
    streamReplyInto(bubble, reply, () => {
      state.isSending = false;
      autoresizeInput();

      if (settings.sound) playChime();

      if (data && data.image_url) {
        const img = document.createElement('img');
        img.src = data.image_url;
        img.alt = 'Generated image';
        img.style.cssText = 'max-width:320px;max-height:320px;border-radius:12px;display:block;margin-top:10px;';
        bubble.appendChild(img);
        scrollToBottom();
      }

      if (data && data.file_url) {
        const card = document.createElement('a');
        card.href = IlmAPI.BASE_URL + data.file_url;
        card.download = data.file_label || 'download.zip';
        card.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid var(--glass-border, rgba(255,255,255,0.12));text-decoration:none;color:inherit;max-width:260px;';
        card.innerHTML = `<span style="font-size:20px;">📦</span><span style="font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(data.file_label || 'Download')}</span>`;
        bubble.appendChild(card);
        scrollToBottom();
      }

      if (settings.autoNarrate) {
        const narrateBtn = row.querySelector('.action-narrate');
        if (narrateBtn) toggleNarration(reply, narrateBtn);
      }
    });
  } catch (err) {
    typingRow.remove();
    appendMessage('assistant', `I couldn't reach the backend: **${escapeHtml(err.message || 'unknown error')}**. The current backend URL is \`${IlmAPI.BASE_URL}\`.`, new Date());
    state.isSending = false;
    autoresizeInput();
    showToast('Message failed to send', 'error');
  }
}

function regenerateFrom(row) {
  if (state.isSending || !lastUserMessage) return;
  row.remove();
  requestAssistantReply(lastUserMessage);
}

/* ---------- SOUND CHIME ---------- */
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

/* ---------- LOGOUT ---------- */
function doLogout() {
  stopNarration();
  localStorage.clear();
  showToast('Logged out', 'success', 1000);
  setTimeout(() => { window.location.href = 'login.html'; }, 300);
}
el.logoutBtn.addEventListener('click', doLogout);

/* ==========================================================================
   SETTINGS PANEL
   ========================================================================== */
const settingsModal = document.getElementById('settings-modal');

function openSettingsPanel() {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('ilmcore_user') || 'null'); } catch (_) {}
  const nameEl = document.getElementById('settings-name');
  const emailEl = document.getElementById('settings-email');
  const avatarEl = document.getElementById('settings-avatar');
  if (user) {
    nameEl.textContent = user.name || 'Signed in';
    emailEl.textContent = user.email || '';
    if (user.picture) avatarEl.src = user.picture;
  } else {
    nameEl.textContent = 'Guest';
    emailEl.textContent = 'Not signed in';
  }

  const apiInput = document.getElementById('api-base-input');
  apiInput.value = localStorage.getItem(OVERRIDE_KEY) || '';
  apiInput.placeholder = IlmAPI.DEFAULT_BASE_URL || 'https://ilmcoreback.vercel.app';

  const conn = document.getElementById('connection-status');
  conn.hidden = true;
  conn.className = 'connection-status';
  conn.textContent = '';

  populateVoiceList();
  applySettings();
  settingsModal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSettingsPanel() {
  settingsModal.hidden = true;
  document.body.style.overflow = '';
}

el.settingsBtn.addEventListener('click', openSettingsPanel);
document.getElementById('settings-close').addEventListener('click', closeSettingsPanel);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsPanel();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.hidden) closeSettingsPanel();
});

/* Accent swatches */
document.querySelectorAll('#swatch-row .swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    settings.accent = sw.dataset.accent;
    saveSettings();
    applySettings();
    showToast(`Accent: ${sw.dataset.accent}`, 'success', 1400);
  });
});

/* Font size */
document.querySelectorAll('#font-size-row .size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const map = { '0.92': 'small', '1': 'default', '1.1': 'large' };
    settings.scale = map[btn.dataset.scale] || 'default';
    saveSettings();
    applySettings();
    showToast(`Text size: ${settings.scale}`, 'success', 1400);
  });
});

/* Toggles */
const autoNarrateEl = document.getElementById('set-auto-narrate');
if (autoNarrateEl) autoNarrateEl.addEventListener('change', () => {
  settings.autoNarrate = autoNarrateEl.checked;
  saveSettings();
  if (!settings.autoNarrate) stopNarration();
  showToast(`Auto-narrate: ${settings.autoNarrate ? 'ON' : 'OFF'}`, 'success', 1400);
});

const enterToggle = document.getElementById('set-enter');
if (enterToggle) enterToggle.addEventListener('change', () => {
  settings.enterToSend = enterToggle.checked;
  saveSettings();
});

const soundToggle = document.getElementById('set-sound');
if (soundToggle) soundToggle.addEventListener('change', () => {
  settings.sound = soundToggle.checked;
  saveSettings();
  if (settings.sound) playChime();
});

const sourcesToggle = document.getElementById('set-sources');
if (sourcesToggle) sourcesToggle.addEventListener('change', () => {
  settings.showSources = sourcesToggle.checked;
  saveSettings();
  document.querySelectorAll('.sources-block').forEach(b => {
    b.style.display = settings.showSources ? '' : 'none';
  });
});

/* Voice picker + rate */
function populateVoiceList() {
  if (!('speechSynthesis' in window)) return;
  const sel = document.getElementById('set-voice');
  if (!sel) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    sel.innerHTML = '<option value="">(loading voices…)</option>';
    return;
  }
  const current = settings.voiceURI;
  sel.innerHTML = '<option value="">Browser default</option>';
  voices.filter(v => /^en/i.test(v.lang)).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} — ${v.lang}`;
    if (v.voiceURI === current) opt.selected = true;
    sel.appendChild(opt);
  });
  const nonEn = voices.filter(v => !/^en/i.test(v.lang));
  if (nonEn.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Other languages';
    nonEn.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} — ${v.lang}`;
      if (v.voiceURI === current) opt.selected = true;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
}
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = populateVoiceList;
  populateVoiceList();
}

const voiceSel = document.getElementById('set-voice');
if (voiceSel) voiceSel.addEventListener('change', () => {
  settings.voiceURI = voiceSel.value;
  saveSettings();
});

const voiceRate = document.getElementById('set-voice-rate');
if (voiceRate) voiceRate.addEventListener('input', () => {
  settings.voiceRate = parseFloat(voiceRate.value);
  document.getElementById('voice-rate-label').textContent = settings.voiceRate.toFixed(1) + '×';
  saveSettings();
});

/* Advanced: API base URL */
document.getElementById('advanced-toggle').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const body = document.getElementById('advanced-body');
  const isOpen = !body.hidden;
  body.hidden = isOpen;
  btn.setAttribute('aria-expanded', String(!isOpen));
});

document.getElementById('api-save').addEventListener('click', () => {
  const val = document.getElementById('api-base-input').value.trim();
  if (val) {
    localStorage.setItem(OVERRIDE_KEY, val.replace(/\/$/, ''));
    showToast('Backend URL saved. Reloading…', 'success', 1600);
  } else {
    localStorage.removeItem(OVERRIDE_KEY);
    showToast('Reverted to default. Reloading…', 'success', 1600);
  }
  localStorage.removeItem('ilmcore_session_id');
  state.sessionId = null;
  setTimeout(() => window.location.reload(), 500);
});

document.getElementById('api-reset').addEventListener('click', () => {
  localStorage.removeItem(OVERRIDE_KEY);
  localStorage.removeItem('ilmcore_session_id');
  document.getElementById('api-base-input').value = '';
  state.sessionId = null;
  showToast('Reset to default. Reloading…', 'success', 1600);
  setTimeout(() => window.location.reload(), 500);
});

document.getElementById('api-test').addEventListener('click', async () => {
  const url = document.getElementById('api-base-input').value.trim();
  const status = document.getElementById('connection-status');
  status.hidden = false;
  status.className = 'connection-status testing';
  status.textContent = 'Testing connection…';
  try {
    await IlmAPI.testUrl(url);
    status.className = 'connection-status ok';
    status.textContent = '✅ Connection successful — backend is online.';
  } catch (err) {
    status.className = 'connection-status fail';
    status.textContent = `❌ ${err.message || 'Connection failed'}. Check the URL and that the backend is running.`;
  }
});

document.getElementById('clear-all-data').addEventListener('click', () => {
  if (!confirm('This clears all local data and signs you out. Continue?')) return;
  localStorage.clear();
  window.location.href = 'login.html';
});

document.getElementById('settings-logout').addEventListener('click', doLogout);

/* ---------- VOICE INPUT (mic) ---------- */
(function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    el.voiceBtn.addEventListener('click', () => {
      showToast("Voice input isn't supported in this browser. Try Chrome, Edge, or Safari.", 'error', 3800);
    });
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let isRecording = false;
  let baseText = '';

  recognition.addEventListener('start', () => {
    isRecording = true;
    baseText = el.chatInput.value.trim() ? el.chatInput.value.trim() + ' ' : '';
    el.voiceBtn.classList.add('recording');
    showToast('Listening… speak now', 'success', 1800);
  });

  recognition.addEventListener('result', (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    el.chatInput.value = (baseText + final + interim).trim();
    autoresizeInput();
  });

  recognition.addEventListener('error', (event) => {
    isRecording = false;
    el.voiceBtn.classList.remove('recording');
    if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
      showToast('Microphone access was blocked. Allow microphone permission in your browser settings and try again.', 'error', 4200);
    } else if (event.error === 'no-speech') {
      showToast('No speech detected. Try again.', 'error', 2200);
    } else if (event.error !== 'aborted') {
      showToast(`Voice input error: ${event.error}`, 'error');
    }
  });

  recognition.addEventListener('end', () => {
    isRecording = false;
    el.voiceBtn.classList.remove('recording');
    el.chatInput.focus();
  });

  el.voiceBtn.addEventListener('click', () => {
    if (isRecording) { recognition.stop(); return; }
    try { recognition.start(); } catch (_) {}
  });
})();
