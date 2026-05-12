/* =============================================
   ChatMyPDF — app.js
   API Base: https://emxelux-chatmypdf.hf.space
   Endpoints:
     GET  /               → health check
     POST /upload_pdf     → multipart file upload
     POST /ask?query=...  → ask a question
   ============================================= */

const API_BASE = 'https://emxelux-chatmypdf.hf.space';

// ── DOM refs ──────────────────────────────────
const uploadZone   = document.getElementById('uploadZone');
const fileInput    = document.getElementById('fileInput');
const browseBtn    = document.getElementById('browseBtn');
const uploadStatus = document.getElementById('uploadStatus');
const fileName     = document.getElementById('fileName');
const fileState    = document.getElementById('fileState');
const fileBadge    = document.getElementById('fileBadge');
const progressWrap = document.getElementById('progressWrap');
const progressBar  = document.getElementById('progressBar');
const newChatBtn   = document.getElementById('newChatBtn');
const statusDot    = document.getElementById('statusDot');
const statusLabel  = document.getElementById('statusLabel');

const emptyState   = document.getElementById('emptyState');
const messages     = document.getElementById('messages');
const exampleChips = document.getElementById('exampleChips');

const queryInput   = document.getElementById('queryInput');
const sendBtn      = document.getElementById('sendBtn');
const toast        = document.getElementById('toast');

// ── State ─────────────────────────────────────
let documentReady = false;
let isWaiting     = false;

// ── Toast ─────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}

// ── Auto-resize textarea ──────────────────────
queryInput.addEventListener('input', () => {
  queryInput.style.height = 'auto';
  queryInput.style.height = Math.min(queryInput.scrollHeight, 160) + 'px';
});

// ── Drag & drop ───────────────────────────────
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});
uploadZone.addEventListener('click', e => {
  if (e.target !== browseBtn) fileInput.click();
});
browseBtn.addEventListener('click', e => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
  fileInput.value = '';
});

// ── File validation & upload ──────────────────
function handleFileSelect(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF file.', 'error');
    return;
  }
  uploadFile(file);
}

async function uploadFile(file) {
  // Show status card
  fileName.textContent = file.name;
  fileState.textContent = 'Uploading…';
  fileBadge.className = 'file-badge loading';
  uploadStatus.hidden = false;
  progressWrap.hidden = false;
  setProgress(0);

  // Disable input while uploading
  documentReady = false;
  setDocumentReady(false);

  // Simulate upload progress (fake until server responds)
  const fakeProgress = animateProgress(0, 70, 1200);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/upload_pdf`, {
      method: 'POST',
      body: formData,
    });

    clearInterval(fakeProgress);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed.' }));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    await res.json();
    setProgress(100);

    fileState.textContent = 'Ready to chat';
    fileBadge.className = 'file-badge success';
    progressWrap.hidden = true;

    setDocumentReady(true);
    showToast(`"${file.name}" processed successfully!`, 'success');

  } catch (err) {
    clearInterval(fakeProgress);
    setProgress(0);
    fileState.textContent = 'Upload failed';
    fileBadge.className = 'file-badge error';
    progressWrap.hidden = true;
    showToast(err.message || 'Upload failed. Try again.', 'error');
  }
}

function setProgress(pct) {
  progressBar.style.width = `${pct}%`;
}

function animateProgress(from, to, duration) {
  const start = performance.now();
  return setInterval(() => {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    setProgress(from + (to - from) * eased);
    if (t >= 1) clearInterval(this);
  }, 16);
}

function setDocumentReady(ready) {
  documentReady = ready;
  queryInput.disabled = !ready;
  sendBtn.disabled = !ready || isWaiting;
  newChatBtn.disabled = !ready;

  // Example chips
  document.querySelectorAll('.eq-chip').forEach(c => {
    c.disabled = !ready;
  });

  if (ready) {
    statusDot.classList.add('active');
    statusLabel.textContent = 'Document loaded';
  } else {
    statusDot.classList.remove('active');
    statusLabel.textContent = 'No document loaded';
  }
}

// ── New chat ──────────────────────────────────
newChatBtn.addEventListener('click', () => {
  messages.innerHTML = '';
  messages.hidden = true;
  emptyState.hidden = false;
  queryInput.value = '';
  queryInput.style.height = 'auto';
  showToast('Chat cleared. Same document is still active.');
});

// ── Send message ──────────────────────────────
async function sendMessage(text) {
  text = text.trim();
  if (!text || !documentReady || isWaiting) return;

  // Switch to chat view
  emptyState.hidden = true;
  messages.hidden = false;

  // Add user bubble
  appendMessage('user', text);

  // Clear input
  queryInput.value = '';
  queryInput.style.height = 'auto';

  // Show typing indicator
  const typingEl = appendTyping();

  // Lock UI
  isWaiting = true;
  sendBtn.disabled = true;
  queryInput.disabled = true;

  try {
    const url = `${API_BASE}/ask?query=${encodeURIComponent(text)}`;
    const res = await fetch(url, { method: 'POST' });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Request failed.' }));
      throw new Error(err.detail || `Error ${res.status}`);
    }

    const data = await res.json();
    typingEl.remove();
    appendMessage('assistant', data.response || 'No response received.');

  } catch (err) {
    typingEl.remove();
    appendMessage('assistant', `⚠️ ${err.message || 'Something went wrong. Please try again.'}`);
  } finally {
    isWaiting = false;
    if (documentReady) {
      sendBtn.disabled = false;
      queryInput.disabled = false;
      queryInput.focus();
    }
  }
}

// ── Message rendering ─────────────────────────
function appendMessage(role, text) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'U' : '⬡';

  const content = document.createElement('div');
  content.className = 'message-content';

  const roleEl = document.createElement('div');
  roleEl.className = 'message-role';
  roleEl.textContent = role === 'user' ? 'You' : 'ChatMyPDF';

  const textEl = document.createElement('div');
  textEl.className = 'message-text';
  textEl.textContent = text;

  content.appendChild(roleEl);
  content.appendChild(textEl);

  if (role === 'user') {
    wrap.appendChild(content);
    wrap.appendChild(avatar);
  } else {
    wrap.appendChild(avatar);
    wrap.appendChild(content);
  }

  messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function appendTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '⬡';

  const content = document.createElement('div');
  content.className = 'message-content';

  const roleEl = document.createElement('div');
  roleEl.className = 'message-role';
  roleEl.textContent = 'ChatMyPDF';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'typing-dot';
    indicator.appendChild(dot);
  }

  content.appendChild(roleEl);
  content.appendChild(indicator);
  wrap.appendChild(avatar);
  wrap.appendChild(content);

  messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function scrollToBottom() {
  messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
}

// ── Send triggers ─────────────────────────────
sendBtn.addEventListener('click', () => sendMessage(queryInput.value));

queryInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(queryInput.value);
  }
});

// ── Example chips ─────────────────────────────
exampleChips.addEventListener('click', e => {
  const chip = e.target.closest('.eq-chip');
  if (chip && documentReady && !isWaiting) {
    sendMessage(chip.dataset.q);
  } else if (chip && !documentReady) {
    showToast('Upload a PDF first!', 'error');
  }
});

// ── Health check on load ──────────────────────
(async () => {
  try {
    const res = await fetch(`${API_BASE}/`);
    if (res.ok) {
      console.log('API is live ✓');
    }
  } catch {
    console.warn('API may be cold-starting. First request may be slow.');
  }
})();
