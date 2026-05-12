
const BASE = 'https://emxeluxe-chatpdf.hf.space';

let currentFile = null;
let isUploaded = false;
let isThinking = false;

// ── DOM refs ──
const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const fileCard    = document.getElementById('file-card');
const fileName    = document.getElementById('file-name');
const fileMeta    = document.getElementById('file-meta');
const fileRemove  = document.getElementById('file-remove');
const uploadBtn   = document.getElementById('upload-btn');
const messagesEl  = document.getElementById('messages');
const emptyState  = document.getElementById('empty-state');
const chatInput   = document.getElementById('chat-input');
const sendBtn     = document.getElementById('send-btn');
const statusDot   = document.getElementById('status-dot');
const statusLabel = document.getElementById('status-label');
const lockedNote  = document.getElementById('locked-note');
const charCount   = document.getElementById('char-count');

// ── File handling ──
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) pickFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') pickFile(f);
  else toast('Please drop a PDF file', 'error');
});

function pickFile(f) {
  currentFile = f;
  isUploaded = false;
  fileName.textContent = f.name;
  fileMeta.textContent = formatBytes(f.size) + ' · PDF';
  fileCard.classList.add('visible');
  uploadBtn.classList.add('visible');
  dropZone.style.display = 'none';
  setStatus('idle');
}

fileRemove.addEventListener('click', () => {
  currentFile = null; isUploaded = false;
  fileCard.classList.remove('visible');
  uploadBtn.classList.remove('visible');
  dropZone.style.display = '';
  fileInput.value = '';
  lockChat();
  setStatus('idle');
});

uploadBtn.addEventListener('click', uploadFile);

async function uploadFile() {
  if (!currentFile) return;
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = `<span style="font-size:12px">Uploading…</span>`;
  setStatus('loading');

  const form = new FormData();
  form.append('file', currentFile);

  try {
    const res = await fetch(`${BASE}/upload/`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    isUploaded = true;
    unlockChat();
    setStatus('active');
    toast('PDF processed — start chatting!', 'success');
    uploadBtn.innerHTML = `✓ Ready`;
    uploadBtn.style.background = 'rgba(93,202,165,0.15)';
    uploadBtn.style.color = 'var(--success)';
    uploadBtn.style.border = '1px solid rgba(93,202,165,0.3)';
    uploadBtn.style.borderRadius = '8px';
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = 'Upload & Process';
    setStatus('idle');
  }
}

// ── Chat ──
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
  charCount.textContent = chatInput.value.length > 0 ? chatInput.value.length + ' chars' : '';
  sendBtn.disabled = !chatInput.value.trim() || isThinking;
});

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
  const q = chatInput.value.trim();
  if (!q || isThinking || !isUploaded) return;

  hideEmpty();
  addMessage('user', q);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  charCount.textContent = '';
  sendBtn.disabled = true;
  isThinking = true;

  const typingMsg = addTyping();

  try {
    const res = await fetch(`${BASE}/ask/?question=${encodeURIComponent(q)}`, {
      method: 'POST',
      headers: { 'accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    removeTyping(typingMsg);
    const answer = typeof data === 'string' ? data : (data.answer || data.response || data.message || JSON.stringify(data));
    addMessage('ai', answer);
  } catch (err) {
    removeTyping(typingMsg);
    addMessage('ai', 'Sorry, something went wrong: ' + err.message);
    toast('Request failed', 'error');
  } finally {
    isThinking = false;
    sendBtn.disabled = !chatInput.value.trim();
  }
}

function addMessage(role, text) {
  const wrap = document.createElement('div');
  wrap.className = 'message ' + (role === 'user' ? 'user' : 'ai');

  const av = document.createElement('div');
  av.className = 'avatar ' + (role === 'user' ? 'user-av' : 'ai-av');
  av.textContent = role === 'user' ? 'U' : 'AI';

  const bub = document.createElement('div');
  bub.className = 'bubble';
  bub.innerHTML = formatText(text);

  wrap.appendChild(av);
  wrap.appendChild(bub);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'message ai';
  wrap.innerHTML = `
    <div class="avatar ai-av">AI</div>
    <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}
function removeTyping(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

function formatText(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
}

function fillInput(text) {
  if (!isUploaded) { toast('Upload a PDF first', 'error'); return; }
  chatInput.value = text;
  chatInput.dispatchEvent(new Event('input'));
  chatInput.focus();
}

// ── UI helpers ──
function unlockChat() {
  chatInput.disabled = false;
  chatInput.placeholder = 'Ask anything about your PDF…';
  sendBtn.disabled = true;
  lockedNote.style.display = 'none';
}
function lockChat() {
  chatInput.disabled = true;
  sendBtn.disabled = true;
  lockedNote.style.display = 'flex';
}
function hideEmpty() {
  if (emptyState && emptyState.parentNode) emptyState.parentNode.removeChild(emptyState);
}
function setStatus(state) {
  if (state === 'active') {
    statusDot.classList.add('active');
    statusLabel.textContent = currentFile ? currentFile.name.replace(/\.pdf$/i,'') : 'Document ready';
  } else if (state === 'loading') {
    statusDot.classList.remove('active');
    statusLabel.textContent = 'Processing…';
  } else {
    statusDot.classList.remove('active');
    statusLabel.textContent = 'No document loaded';
  }
}

let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 3000);
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/(1024*1024)).toFixed(1) + ' MB';
}
