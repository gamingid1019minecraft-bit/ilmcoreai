/* ==========================================================================
   IlmCore AI — dashboard.js
   Chat interface logic + settings panel + narration
   ========================================================================== */

/* ---------- AUTH GUARD ---------- */
(function authGuard() {
  const token = localStorage.getItem('ilmcore_token');
  if (!token) window.location.href = 'login.html';
})();

/* ---------- STATE ---------- */
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
  
  // UPDATED: Chip styles to look good floating above the input box
  container.innerHTML = `
    <div class="image-preview-wrapper" style="display:flex; align-items:center; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:6px 10px; position:relative; max-width:250px;">
      ${innerHtml}
      <button class="remove-image" id="remove-image" style="position:absolute; top:-6px; right:-6px; background:#ff4757; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:14px; font-weight:bold; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.3);">×</button>
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
    renderAttachmentPreview(`<img class="image-preview" src="${dataUrl}" style="max-height:40px; border-radius:4px;">`);
    return;
  }
  const isText = isLikelyTextFile(file);
  const content = isText ? await readFileAsText(file) : await readFileAsDataURL(file);
  uploadedFile = { name: file.name, icon: fileIconFor(file.name), isText, mime: file.type || '', content };
  renderAttachmentPreview(`
    <div class="file-chip" style="display:flex; align-items:center; gap:6px;">
      <span class="file-chip-icon" style="font-size:18px;">${uploadedFile.icon}</span>
      <span class="file-chip-name" style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px;">${escapeHtml(file.name)}</span>
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
    <div class="file-chip" style="display:flex; align-items:center; gap:6px;">
      <span class="file-chip-icon" style="font-size:18px;">📁</span>
      <span class="file-chip-name" style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px;">${escapeHtml(folderName)} (${files.length})</span>
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

// ============================================================================
// THE MAGIC PASTE LISTENER
// If text is longer than 500 chars, wrap it in a File object and attach it.
// ============================================================================
el.chatInput.addEventListener('paste', async (e) => {
  const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
  
  // 1. Handle pasted images
  const imgItem = items.find(it => it.kind === 'file' && it.type.startsWith('image/'));
  if (imgItem) {
    const hasText = items.some(it => it.kind === 'string' && it.type === 'text/plain');
    if (hasText) return;
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
    return;
  }

  // 2. Handle massive text pastes
  const textData = e.clipboardData.getData('text/plain');
  if (textData && textData.length > 500) {
    e.preventDefault(); // Stop the text from going into the textarea
    
    // Guess the file extension based on the content
    let ext = 'txt';
    if (textData.includes('import React') || textData.includes('function ') || textData.includes('const ')) ext = 'js';
    else if (textData.includes('def ') || textData.includes('import os')) ext = 'py';
    else if (textData.includes('public class ')) ext = 'java';
    else if (textData.includes('<html>') || textData.includes('<!DOCTYPE html>')) ext = 'html';
    else if (textData.includes('{') && textData.includes('}')) ext = 'json';

    const file = new File([textData], `pasted-text-${Date.now()}.${ext}`, { type: 'text/plain' });
    await handleSingleFileSelected(file);
    showToast('Long text converted to a file attachment 📄', 'success', 3000);
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

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { }
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

/* ---------- DOWNLOADABLE FILE CARDS ([FILE: path] ... [/FILE]) ---------- */
const FILE_BLOCK_RE = /\[FILE:\s*([^\]\n]+?)\s*\]\s*\n?([\s\S]*?)\[\/FILE\]/g;

function cleanFileBody(body) {
  let b = (body || '').replace(/^\n/, '');
  const fenced = b.match(/^\s*```[\w+-]*\n([\s\S]*?)\n?```\s*$/);
  if (fenced) b = fenced[1];
  return b.replace(/\s+$/, '');
}

function extractFileBlocks(text) {
  const files = [];
  const mark = '\n\n\u0000FILEGROUP\u0000\n\n';
  let out = text.replace(FILE_BLOCK_RE, (_, path, body) => {
    files.push({ path: path.trim(), content: cleanFileBody(body), done: true });
    return files.length === 1 ? mark : '';
  });
  const open = out.match(/\[FILE:\s*([^\]\n]+?)\s*\]\s*\n?([\s\S]*)$/);
  if (open) {
    const body = open[2].replace(/\[\/?F?I?L?E?\]?$/, '');
    files.push({ path: open[1].trim(), content: body.replace(/^\n/, ''), done: false });
    out = out.slice(0, open.index) + (files.length === 1 ? mark : '');
  } else {
    out = out.replace(/\[FILE:?[^\]\n]*$/, '');
  }
  return { text: out, files };
}

const FILE_TYPES = {
  py: 'Python', js: 'JavaScript', mjs: 'JavaScript', jsx: 'React JSX', ts: 'TypeScript', tsx: 'React TSX',
  html: 'HTML', htm: 'HTML', css: 'CSS', json: 'JSON', md: 'Markdown', txt: 'Text', csv: 'CSV', xml: 'XML',
  yml: 'YAML', yaml: 'YAML', sh: 'Shell', bat: 'Batch', java: 'Java', c: 'C', cpp: 'C++', h: 'C Header',
  cs: 'C#', go: 'Go', rs: 'Rust', php: 'PHP', rb: 'Ruby', swift: 'Swift', kt: 'Kotlin', dart: 'Dart',
  lua: 'Lua', luau: 'Luau', sql: 'SQL', env: 'Env', toml: 'TOML', ini: 'Config', gitignore: 'Git ignore'
};
function fileTypeLabel(path) {
  const name = (path.split('/').pop() || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : name.replace(/^\./, '');
  return FILE_TYPES[ext] || (ext ? ext.toUpperCase() : 'File');
}

function renderFileGroup(files) {
  const cards = files.map(f => {
    const lines = f.content ? f.content.split('\n').length : 0;
    const type = fileTypeLabel(f.path);
    const meta = f.done ? `${type} · ${lines} ${lines === 1 ? 'line' : 'lines'}` : `${type} · Writing…`;
    return `<div class="file-card${f.done ? '' : ' is-writing'}" ${f.done ? 'role="button" tabindex="0"' : ''} data-path="${escapeHtml(f.path)}" data-code="${encodeURIComponent(f.content)}">
      <span class="file-card-icon" aria-hidden="true">📄</span>
      <div class="file-card-text">
        <div class="file-card-name" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>
        <div class="file-card-meta">${escapeHtml(meta)}</div>
      </div>
      <span class="file-card-open" aria-hidden="true">${f.done ? 'Open ›' : '<span class="file-spinner"></span>'}</span>
    </div>`;
  }).join('');
  const zipBtn = files.length > 1 && files.every(f => f.done)
    ? `<button type="button" class="file-btn file-btn-primary file-zip">Download all (.zip)</button>` : '';
  return `<div class="file-group">${cards}${zipBtn ? `<div class="file-group-foot">${zipBtn}</div>` : ''}</div>`;
}

const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const nameB = enc.encode(f.path.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, ''));
    const data = enc.encode(f.content);
    const crc = _crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true);
    parts.push(lh.buffer, nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameB);
    offset += 30 + nameB.length + data.length;
  });
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

async function readZip(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const files = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + compSize);
    let bytes;
    if (method === 0) bytes = raw;
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else continue;
    files.push({ path: name, content: dec.decode(bytes).replace(/\s+$/, ''), done: true });
  }
  return files;
}

function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function _flashBtn(btn, text) {
  if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
  btn.textContent = text;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.orig; }, 1400);
}

/* ---------- In-page file viewer (opens on the same page, no navigation) ---------- */
let _fileViewer = null;
let _viewerFile = null;

function getFileViewer() {
  if (_fileViewer) return _fileViewer;
  const v = document.createElement('div');
  v.className = 'file-viewer';
  v.hidden = true;
  v.innerHTML = `
    <div class="file-viewer-backdrop" data-fv-close></div>
    <div class="file-viewer-panel" role="dialog" aria-modal="true" aria-label="File viewer">
      <div class="file-viewer-head">
        <div class="fv-left">
          <svg class="fv-panel-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16"/></svg>
          <div class="fv-title"><span class="fv-name"></span><span class="fv-type"></span></div>
        </div>
        <div class="fv-right">
          <div class="fv-split">
            <button type="button" class="fv-copy-main" data-fv-copy>Copy</button>
            <button type="button" class="fv-chevron" data-fv-menu aria-label="More options" aria-haspopup="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="fv-menu" hidden>
              <button type="button" data-fv-copy>Copy</button>
              <button type="button" data-fv-download>Download</button>
            </div>
          </div>
          <button type="button" class="fv-close" data-fv-close aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="fv-code"></div>
    </div>`;
  document.body.appendChild(v);
  _fileViewer = v;
  return v;
}

function highlightToLines(code) {
  const html = highlightCode(code);
  const open = [];
  return html.split('\n').map(line => {
    const prefix = open.join('');
    const re = /<span class="([^"]*)">|<\/span>/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m[0] === '</span>') open.pop(); else open.push(m[0]);
    }
    return prefix + line + '</span>'.repeat(open.length);
  });
}

function openFileViewer(path, content) {
  const v = getFileViewer();
  _viewerFile = { path, content };
  const base = path.split('/').pop() || 'file';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  const nameEl = v.querySelector('.fv-name');
  nameEl.textContent = stem.charAt(0).toUpperCase() + stem.slice(1);
  nameEl.title = path;
  v.querySelector('.fv-type').textContent = ext ? ' · ' + ext.toUpperCase() : '';
  v.querySelector('.fv-code').innerHTML = highlightToLines(content)
    .map((l, i) => `<div class="fv-line"><span class="fv-ln">${i + 1}</span><span class="fv-lc">${l || ' '}</span></div>`)
    .join('');
  v.querySelector('.fv-code').scrollTop = 0;
  v.querySelector('.fv-menu').hidden = true;
  v.hidden = false;
  document.body.classList.add('file-viewer-open');
}
function closeFileViewer() {
  if (_fileViewer) _fileViewer.hidden = true;
  document.body.classList.remove('file-viewer-open');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _fileViewer && !_fileViewer.hidden) { closeFileViewer(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('file-card') && !e.target.classList.contains('is-writing')) {
    e.preventDefault();
    e.target.click();
  }
});

document.addEventListener('click', async (e) => {
  const closeBtn = e.target.closest('[data-fv-close]');
  if (closeBtn) { closeFileViewer(); return; }

  if (_fileViewer && !_fileViewer.hidden) {
    const menu = _fileViewer.querySelector('.fv-menu');
    if (e.target.closest('[data-fv-menu]')) { menu.hidden = !menu.hidden; return; }
    const fvCopy = e.target.closest('[data-fv-copy]');
    if (fvCopy && _viewerFile) {
      const ok = await copyText(_viewerFile.content);
      menu.hidden = true;
      _flashBtn(_fileViewer.querySelector('.fv-copy-main'), ok ? 'Copied!' : 'Copy failed');
      return;
    }
    const fvDl = e.target.closest('[data-fv-download]');
    if (fvDl && _viewerFile) {
      downloadBlob(_viewerFile.path.split('/').pop() || 'file.txt', new Blob([_viewerFile.content], { type: 'text/plain;charset=utf-8' }));
      menu.hidden = true;
      _flashBtn(_fileViewer.querySelector('.fv-copy-main'), 'Downloaded!');
      return;
    }
    if (!e.target.closest('.fv-split')) menu.hidden = true;
  }

  const zipBtn = e.target.closest('.file-zip');
  if (zipBtn) {
    e.preventDefault();
    const group = zipBtn.closest('.file-group');
    const files = [...group.querySelectorAll('.file-card')].map(c => ({
      path: c.dataset.path, content: decodeURIComponent(c.dataset.code || '')
    }));
    downloadBlob('project.zip', buildZip(files));
    _flashBtn(zipBtn, 'Downloaded!');
    return;
  }

  const card = e.target.closest('.file-card');
  if (card && !card.classList.contains('is-writing')) {
    let code = '';
    try { code = decodeURIComponent(card.dataset.code || ''); } catch (_) {}
    openFileViewer(card.dataset.path, code);
  }
});

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

  const fileExtract = extractFileBlocks(text0);
  const blocks = [];
  let src = fileExtract.text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
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
    if (/\u0000FILEGROUP\u0000/.test(chunk.trim())) return chunk;
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

  if (fileExtract.files.length) src = src.replace(/\u0000FILEGROUP\u0000/g, () => renderFileGroup(fileExtract.files));
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

/* ==========================================================================
   NARRATION (browser speechSynthesis)
   ========================================================================== */
let _currentUtterance = null;
let _activeNarrateBtn = null;

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

  unlockSpeechEngine();
  stopNarration();

  const utter = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.rate = settings.voiceRate || 1;
  utter.pitch = 1;
  utter.volume = 1;

  utter.onend = () => {
    if (_activeNarrateBtn) {
      _activeNarrateBtn.classList.remove('narrating');
      _activeNarrateBtn = null;
    }
    _currentUtterance = null;
    if (typeof onDone === 'function') onDone();
  };
  utter.onerror = () => {
    if (_activeNarrateBtn) _activeNarrateBtn.classList.remove('narrating');
    _activeNarrateBtn = null;
    _currentUtterance = null;
  };

  _currentUtterance = utter;
  window.speechSynthesis.speak(utter);

  setTimeout(() => {
    if (!window.speechSynthesis.speaking && _currentUtterance === utter) {
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
    const response = await IlmAPI.chat(text, state.sessionId, image, file, folder);
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP Error: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    
    // Backend handles Identity overrides as standard JSON
    if (contentType && contentType.includes("application/json")) {
        const jsonData = await response.json();
        typingRow.remove();
        const row = appendMessage('assistant', jsonData.reply, new Date());
        state.isSending = false;
        autoresizeInput();
        if (settings.sound) playChime();
        if (settings.autoNarrate) {
          const narrateBtn = row.querySelector('.action-narrate');
          if (narrateBtn) toggleNarration(jsonData.reply, narrateBtn);
        }
        return;
    }

    // Otherwise, it's an SSE stream
    typingRow.remove();
    const row = appendMessage('assistant', '', new Date());
    const bubble = row.querySelector('.msg-bubble');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullReply = "";
    
    bubble.innerHTML = '<span class="streaming-cursor"></span>';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.replace("data: ", "").trim();
          if (!dataStr) continue;
          
          let data;
          try { data = JSON.parse(dataStr); } catch(e) { continue; }

          if (data.type === "meta") {
            if (data.content.session_id !== undefined && data.content.session_id !== null) {
              const isNewSession = String(state.sessionId) !== String(data.content.session_id);
              state.sessionId = data.content.session_id;
              localStorage.setItem('ilmcore_session_id', state.sessionId);
              if (isNewSession) {
                el.currentChatTitle.textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
              }
              loadSessionsList();
            }
          } 
          else if (data.type === "chunk") {
            fullReply += data.content;
            bubble.innerHTML = renderMarkdown(fullReply) + '<span class="streaming-cursor"></span>';
            scrollToBottom(false);
          } 
          else if (data.type === "file") {
            // Handle the new file event from the advanced backend
            bubble.innerHTML = renderMarkdown(data.content.text);
            const fileCardHtml = `<div style="margin-top: 10px;"><a href="${data.content.url}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.08);border:1px solid var(--glass-border);border-radius:10px;text-decoration:none;color:inherit;font-weight:500;">📥 Download ${data.content.name}</a></div>`;
            bubble.insertAdjacentHTML('beforeend', fileCardHtml);
            fullReply = data.content.text; // Update full reply so it doesn't re-render the [FILE] block
            scrollToBottom(false);
          }
          else if (data.type === "done") {
            bubble.innerHTML = renderMarkdown(fullReply);
            renderMath(bubble);
          }
        }
      }
    }

    state.isSending = false;
    autoresizeInput();
    if (settings.sound) playChime();

    if (settings.autoNarrate) {
      const narrateBtn = row.querySelector('.action-narrate');
      if (narrateBtn) toggleNarration(fullReply, narrateBtn);
    }

  } catch (err) {
    typingRow.remove();
    appendMessage('assistant', `I couldn't reach the backend: **${escapeHtml(err.message || 'unknown error')}**. Please try again.`, new Date());
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

document.querySelectorAll('#swatch-row .swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    settings.accent = sw.dataset.accent;
    saveSettings();
    applySettings();
    showToast(`Accent: ${sw.dataset.accent}`, 'success', 1400);
  });
});

document.querySelectorAll('#font-size-row .size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const map = { '0.92': 'small', '1': 'default', '1.1': 'large' };
    settings.scale = map[btn.dataset.scale] || 'default';
    saveSettings();
    applySettings();
    showToast(`Text size: ${settings.scale}`, 'success', 1400);
  });
});

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
  
  const previewText = "Hello! This is how I sound.";
  stopNarration();
  const utter = new SpeechSynthesisUtterance(previewText);
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = voices.find(v => v.voiceURI === settings.voiceURI);
  if (selectedVoice) utter.voice = selectedVoice;
  utter.rate = settings.voiceRate || 1;
  window.speechSynthesis.speak(utter);
});

const voiceRate = document.getElementById('set-voice-rate');
if (voiceRate) voiceRate.addEventListener('input', () => {
  settings.voiceRate = parseFloat(voiceRate.value);
  document.getElementById('voice-rate-label').textContent = settings.voiceRate.toFixed(1) + '×';
  saveSettings();
});

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
