// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const state = {
  token: null,
  user: null,
  documents: [], // [{document_id, filename, chunks_indexed, uploadedAt}]
  activeDocumentId: null,
  messages: {},  // {document_id: [{role, content, citations, timestamp, type}]}
  isGenerating: false,
  sidebarCollapsed: false,
  mobileTab: 'docs',
  apiBase: 'https://multimodal-rag-system-oozj.onrender.com'
};

const STORAGE_KEY = 'chatpdf_session';
const DOCS_KEY = 'chatpdf_docs';
const MSGS_KEY = 'chatpdf_msgs';

// ═══════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════
async function apiLogin(email, password) {
  const body = new URLSearchParams();
  body.append('username', email);
  body.append('password', password);

  const res = await fetch(`${state.apiBase}/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  return data;
}

async function apiRegister(payload) {
  const res = await fetch(`${state.apiBase}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Registration failed');
  return data;
}

async function apiUpload(file) {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch(`${state.apiBase}/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.token}` },
    body: fd
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Upload failed');
  return data; // {status, document_id, saved_path, chunks_indexed}
}

async function apiGenerate(query, document_id) {
  const res = await fetch(`${state.apiBase}/generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    },
    body: JSON.stringify({ query, document_id })
  });

  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Server error (${res.status}). The backend may have timed out.`); }
  if (!res.ok) throw new Error(data?.detail || `Generation failed (${res.status})`);
  return data;
}

// ═══════════════════════════════════════════════
// AUTH HANDLERS
// ═══════════════════════════════════════════════
function switchAuthTab(tab) {
  const isLogin = tab === 'login';

  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);

  document.getElementById('tabLogin').className = isLogin
    ? 'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-zinc-700 text-white'
    : 'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-400';

  document.getElementById('tabRegister').className = isLogin
    ? 'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-400'
    : 'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-zinc-700 text-white';
}

function togglePassword(id, btn) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';

  btn.innerHTML = isText
    ? '<i data-lucide="eye" class="w-4 h-4"></i>'
    : '<i data-lucide="eye-off" class="w-4 h-4"></i>';

  lucide.createIcons();
}

function handleLogout() {
  state.token = null;
  state.user = null;
  state.documents = [];
  state.messages = {};
  state.activeDocumentId = null;

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DOCS_KEY);
  localStorage.removeItem(MSGS_KEY);
  localStorage.removeItem('chatpdf_token');
  localStorage.removeItem('chatpdf_api_base');

  showAuth();
}

// ═══════════════════════════════════════════════
// APP VIEWS
// ═══════════════════════════════════════════════
function showAuth() {
  document.getElementById('authScreen').style.removeProperty('display');
  document.getElementById('appShell').style.display = 'none';
  requestAnimationFrame(() => lucide.createIcons());
}

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appShell').style.removeProperty('display');

  saveSession();
  renderSidebar();
  renderDocList();
  renderPDFViewer();
  renderChatHeader();
  renderMessages();
  syncInputState();

  requestAnimationFrame(() => lucide.createIcons());
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.user)             state.user             = s.user;
      if (s.apiBase)          state.apiBase          = s.apiBase;
      if (s.activeDocumentId) state.activeDocumentId = s.activeDocumentId;
    }

    const docs = localStorage.getItem(DOCS_KEY);
    if (docs) state.documents = JSON.parse(docs);

    const msgs = localStorage.getItem(MSGS_KEY);
    if (msgs) state.messages = JSON.parse(msgs);
  } catch {}
}

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    user: state.user,
    apiBase: state.apiBase,
    activeDocumentId: state.activeDocumentId
  }));
  localStorage.setItem(DOCS_KEY, JSON.stringify(state.documents));
  localStorage.setItem(MSGS_KEY, JSON.stringify(state.messages));
}

// ═══════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════
function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;

  const full = document.getElementById('sidebar');
  const collapsed = document.getElementById('sidebarCollapsed');

  if (state.sidebarCollapsed) {
    full.classList.add('hidden');
    collapsed.classList.remove('hidden');
    collapsed.classList.add('flex');
  } else {
    full.classList.remove('hidden');
    full.classList.add('flex');
    collapsed.classList.remove('flex');
    collapsed.classList.add('hidden');
  }

  renderDocList();
  requestAnimationFrame(() => lucide.createIcons());
}

function renderSidebar() {
  const initials = state.user?.first_name
    ? (state.user.first_name[0] + (state.user.last_name?.[0] || '')).toUpperCase()
    : state.user?.email?.[0]?.toUpperCase() || 'U';

  const name = state.user?.first_name
    ? `${state.user.first_name} ${state.user.last_name || ''}`
    : state.user?.email || 'User';

  const setEl = (id, val, prop = 'textContent') => {
    const el = document.getElementById(id);
    if (el) el[prop] = val;
  };

  setEl('userAvatar', initials);
  setEl('userDisplayName', name.trim());
  setEl('userEmail', state.user?.email || '');

  setEl('mobileUserAvatar', initials);
  setEl('mobileUserName', name.trim());
  setEl('mobileUserEmail', state.user?.email || '');
}

function renderDocList() {
  const list = document.getElementById('docList');
  const iconList = document.getElementById('docIconList');
  const mobileList = document.getElementById('mobileDocList');

  if (!state.documents.length) {
    const emptyHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-center">
        <div class="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center mb-3">
          <i data-lucide="file-plus" class="w-5 h-5 text-zinc-600"></i>
        </div>
        <p class="text-xs text-zinc-600">No documents yet</p>
        <p class="text-xs text-zinc-700 mt-1">Upload a PDF to get started</p>
      </div>`;

    if (list) list.innerHTML = emptyHTML;
    if (mobileList) mobileList.innerHTML = emptyHTML;
    if (iconList) iconList.innerHTML = '';

    requestAnimationFrame(() => lucide.createIcons());
    return;
  }

  const docItemHTML = (doc, isMobile = false) => {
    const isActive = state.activeDocumentId === doc.document_id;
    const name = doc.filename.replace(/\.pdf$/i, '');
    const date = new Date(doc.uploadedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    return `
      <div class="doc-item ${isActive ? 'active' : ''} flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer border border-transparent transition-all duration-150 group"
           onclick="selectDocument('${doc.document_id}', ${isMobile})">
        <div class="w-7 h-7 ${isActive ? 'bg-indigo-600' : 'bg-zinc-800'} rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
          <i data-lucide="file-text" class="w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-500'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium ${isActive ? 'text-indigo-300' : 'text-zinc-300'} truncate">${escapeHTML(name)}</p>
          <p class="text-xs text-zinc-600">${doc.chunks_indexed} chunks · ${date}</p>
        </div>
        <button onclick="deleteDocument(event, '${doc.document_id}')"
          class="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1 rounded-md hover:bg-red-400/10">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>`;
  };

  if (list) list.innerHTML = state.documents.map(d => docItemHTML(d, false)).join('');
  if (mobileList) mobileList.innerHTML = state.documents.map(d => docItemHTML(d, true)).join('');

  if (iconList) {
    iconList.innerHTML = state.documents.map(doc => {
      const isActive = state.activeDocumentId === doc.document_id;
      return `
        <button onclick="selectDocument('${doc.document_id}')" title="${escapeHTML(doc.filename)}"
          class="w-9 h-9 ${isActive ? 'bg-indigo-600' : 'bg-zinc-800 hover:bg-zinc-700'} rounded-lg flex items-center justify-center transition-colors">
          <i data-lucide="file-text" class="w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500'}"></i>
        </button>`;
    }).join('');
  }

  requestAnimationFrame(() => lucide.createIcons());
}

function selectDocument(docId, switchToChat = false) {
  state.activeDocumentId = docId;
  try { renderDocList(); }    catch (_) {}
  try { renderPDFViewer(); }  catch (_) {}
  try { renderChatHeader(); } catch (_) {}
  try { renderMessages(); }   catch (_) {}
  syncInputState();
  if (switchToChat) switchMobileTab('chat');
  try { saveSession(); } catch (_) {}
}

function deleteDocument(e, docId) {
  e.stopPropagation();

  state.documents = state.documents.filter(d => d.document_id !== docId);

  if (state.activeDocumentId === docId) {
    state.activeDocumentId = state.documents[0]?.document_id || null;
  }

  delete state.messages[docId];

  renderDocList();
  renderPDFViewer();
  renderChatHeader();
  renderMessages();
  syncInputState();
  saveSession();

  showToast('Document removed', 'info');
}

// ═══════════════════════════════════════════════
// PDF VIEWER
// ═══════════════════════════════════════════════
function renderPDFViewer() {
  const doc = state.documents.find(d => d.document_id === state.activeDocumentId);

  const content = document.getElementById('pdfContent');
  const mobileContent = document.getElementById('mobilePdfContent');
  const pdfDocBadge = document.getElementById('pdfDocBadge');
  const pdfNoBadge = document.getElementById('pdfNoBadge');
  const pdfActionBar = document.getElementById('pdfActionBar');
  const pdfDocName = document.getElementById('pdfDocName');
  const pdfChunkCount = document.getElementById('pdfChunkCount');

  if (!doc) {
    if (pdfDocBadge) pdfDocBadge.classList.add('hidden');
    if (pdfNoBadge) pdfNoBadge.classList.remove('hidden');
    if (pdfActionBar) pdfActionBar.style.setProperty('display', 'none', 'important');

    if (content) content.innerHTML = renderPDFEmptyState();
    if (mobileContent) mobileContent.innerHTML = renderPDFEmptyState();

    const mobilePdfDocName = document.getElementById('mobilePdfDocName');
    if (mobilePdfDocName) mobilePdfDocName.textContent = 'No document selected';

    requestAnimationFrame(() => lucide.createIcons());
    return;
  }

  if (pdfDocBadge) pdfDocBadge.classList.remove('hidden');
  if (pdfNoBadge) pdfNoBadge.classList.add('hidden');
  if (pdfActionBar) pdfActionBar.style.removeProperty('display');
  if (pdfDocName) pdfDocName.textContent = doc.filename;
  if (pdfChunkCount) pdfChunkCount.textContent = `${doc.chunks_indexed} chunks`;

  const mobilePdfDocName = document.getElementById('mobilePdfDocName');
  if (mobilePdfDocName) mobilePdfDocName.textContent = doc.filename;

  const viewerHTML = renderPDFContent(doc);
  if (content) content.innerHTML = viewerHTML;
  if (mobileContent) mobileContent.innerHTML = viewerHTML;

  requestAnimationFrame(() => lucide.createIcons());
}

function renderPDFEmptyState() {
  return `
    <div class="flex flex-col items-center justify-center h-full py-20 text-center">
      <div class="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-4">
        <i data-lucide="file-search" class="w-7 h-7 text-zinc-700"></i>
      </div>
      <h3 class="text-sm font-medium text-zinc-500 mb-1">No document open</h3>
      <p class="text-xs text-zinc-700 max-w-[200px] leading-relaxed">Select a document from the sidebar or upload a new PDF</p>
    </div>`;
}

function renderPDFContent(doc) {
  const name = doc.filename.replace(/\.pdf$/i, '');
  const date = new Date(doc.uploadedAt).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <div class="max-w-2xl mx-auto space-y-4 animate-slideUp">
      <!-- Doc header card -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div class="flex items-start gap-4">
          <div class="w-12 h-14 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <i data-lucide="file-text" class="w-6 h-6 text-indigo-400"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-sm font-semibold text-zinc-100 mb-1 truncate">${escapeHTML(name)}</h2>
            <p class="text-xs text-zinc-500 mb-3">Uploaded ${date}</p>
            <div class="flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
                <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Indexed
              </span>
              <span class="inline-flex items-center gap-1 text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">
                <i data-lucide="layers" class="w-3 h-3"></i>${doc.chunks_indexed} chunks
              </span>
              <span class="inline-flex items-center gap-1 text-xs bg-violet-500/10 text-violet-400 px-2.5 py-1 rounded-full">
                <i data-lucide="cpu" class="w-3 h-3"></i>Gemini Embedded
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Simulated Content: Text Block -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-3 border-b border-zinc-800 bg-zinc-900">
          <i data-lucide="text" class="w-3.5 h-3.5 text-zinc-500"></i>
          <span class="text-xs font-medium text-zinc-500 uppercase tracking-wide">Text Content — Extracted</span>
          <span class="ml-auto text-xs text-zinc-700">Page 1</span>
        </div>
        <div class="p-5 space-y-3">
          <div class="space-y-2">
            <div class="h-3 bg-zinc-800 rounded-md w-full"></div>
            <div class="h-3 bg-zinc-800 rounded-md w-11/12"></div>
            <div class="h-3 bg-zinc-800 rounded-md w-full"></div>
            <div class="h-3 bg-zinc-800 rounded-md w-4/5"></div>
          </div>
          <div class="space-y-2 pt-1">
            <div class="h-3 bg-zinc-800 rounded-md w-full"></div>
            <div class="h-3 bg-zinc-800 rounded-md w-9/12"></div>
            <div class="h-3 bg-zinc-800 rounded-md w-full"></div>
          </div>
          <p class="text-xs text-zinc-600 pt-1">Document content has been chunked and embedded into the vector database. Use the chat to query this document.</p>
        </div>
      </div>

      <!-- Simulated Content: Extracted Table -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-3 border-b border-zinc-800">
          <i data-lucide="table" class="w-3.5 h-3.5 text-violet-400"></i>
          <span class="text-xs font-medium text-zinc-500 uppercase tracking-wide">Extracted Table — Vector Indexed</span>
          <span class="ml-auto text-xs bg-violet-500/10 text-violet-400 px-2 py-0.5 rounded-full">Multi-modal</span>
        </div>
        <div class="overflow-x-auto">
          <table class="pdf-table">
            <thead>
              <tr>
                <th>Chunk ID</th>
                <th>Section</th>
                <th>Tokens</th>
                <th>Similarity Score</th>
              </tr>
            </thead>
            <tbody>
              ${[1,2,3,4].map(i => `
              <tr>
                <td class="font-mono text-indigo-400">chunk-${String(i).padStart(3,'0')}</td>
                <td>Section ${i}.${i}</td>
                <td>${Math.floor(Math.random() * 300 + 100)}</td>
                <td><span class="text-emerald-400 font-medium">0.${Math.floor(Math.random() * 20 + 75)}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Simulated Content: Figure / Image Block -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-3 border-b border-zinc-800">
          <i data-lucide="image" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span class="text-xs font-medium text-zinc-500 uppercase tracking-wide">Visual Content — Detected</span>
        </div>
        <div class="p-5">
          <div class="flex gap-4">
            <div class="w-24 h-20 bg-zinc-800 rounded-xl border border-zinc-700 flex flex-col items-center justify-center gap-1 flex-shrink-0">
              <i data-lucide="bar-chart-2" class="w-6 h-6 text-zinc-600"></i>
              <span class="text-xs text-zinc-700">Figure</span>
            </div>
            <div class="flex-1 space-y-2">
              <p class="text-xs text-zinc-400 font-medium">Detected visual element on page 2</p>
              <p class="text-xs text-zinc-600 leading-relaxed">This document contains figures or diagrams. The system has detected visual content. Ask about figures in the chat to get descriptions from the context.</p>
              <div class="flex gap-2">
                <span class="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">Figure 1</span>
                <span class="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">Chart</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Prompt cue -->
      <div class="bg-indigo-600/5 border border-indigo-500/20 rounded-2xl p-4 flex items-center gap-3">
        <i data-lucide="arrow-right-circle" class="w-5 h-5 text-indigo-400 flex-shrink-0"></i>
        <p class="text-xs text-indigo-300">This document is ready. Open the <strong>Chat</strong> panel and ask anything about its content.</p>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════
function renderChatHeader() {
  const doc = state.documents.find(d => d.document_id === state.activeDocumentId);
  const indicator = document.getElementById('chatDocIndicator');
  const clearBtn = document.getElementById('clearChatBtn');

  if (indicator) {
    indicator.textContent = doc
      ? `Chatting with: ${doc.filename}`
      : 'Select a document to begin';
  }

  if (clearBtn) {
    const msgs = state.messages[state.activeDocumentId];
    clearBtn.classList.toggle('hidden', !msgs?.length);
  }
}

function renderMessages() {
  const msgs = state.messages[state.activeDocumentId] || [];
  const container = document.getElementById('messages');
  const mobileContainer = document.getElementById('mobileMessages');
  const empty = document.getElementById('chatEmpty');

  const html = msgs.length ? msgs.map(renderMessage).join('') : '';

  if (container) {
    container.innerHTML = html || '';
    if (empty) {
      empty.style.display = msgs.length ? 'none' : 'flex';
      if (!msgs.length) container.appendChild(empty);
    }
  }

  if (mobileContainer) {
    mobileContainer.innerHTML = html;
  }

  // Scroll to bottom
  setTimeout(() => {
    if (container) container.scrollTop = container.scrollHeight;
    if (mobileContainer) mobileContainer.scrollTop = mobileContainer.scrollHeight;
  }, 50);

  requestAnimationFrame(() => lucide.createIcons());
}

function renderMessage(msg) {
  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  if (msg.role === 'user') {
    return `
      <div class="flex justify-end gap-2 animate-slideUp">
        <div class="flex flex-col items-end gap-1 max-w-[85%]">
          <div class="bg-indigo-600 rounded-2xl rounded-tr-md px-4 py-2.5">
            <p class="text-sm text-white leading-relaxed">${escapeHTML(msg.content)}</p>
          </div>
          <span class="text-xs text-zinc-700 px-1">${time}</span>
        </div>
        <div class="w-7 h-7 bg-indigo-700 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">
          ${state.user?.first_name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>`;
  }

  if (msg.type === 'loading') {
    return `
      <div class="flex gap-2.5 animate-slideUp" id="loadingMsg">
        <div class="w-7 h-7 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#6366f1" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div class="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%]">
          <div class="flex items-center gap-1.5 mb-3">
            <div class="skeleton h-3 w-24 rounded"></div>
          </div>
          <div class="space-y-2">
            <div class="skeleton h-2.5 w-full rounded"></div>
            <div class="skeleton h-2.5 w-4/5 rounded"></div>
            <div class="skeleton h-2.5 w-3/5 rounded"></div>
          </div>
          <div class="flex items-center gap-1 mt-3">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      </div>`;
  }

  const hasCitations = msg.citations?.length > 0;
  const lc = typeof msg.content === 'string' ? msg.content.toLowerCase() : '';
  const hasTable = lc.includes('table') && hasCitations;
  const hasImage = lc.includes('figure') || lc.includes('image') || lc.includes('chart');

  let extraContent = '';

  if (hasTable) {
    extraContent += `
      <div class="mt-3 border border-zinc-700 rounded-xl overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 bg-zinc-800/80 border-b border-zinc-700">
          <i data-lucide="table" class="w-3 h-3 text-violet-400"></i>
          <span class="text-xs text-zinc-400 font-medium">Referenced Table</span>
        </div>
        <table class="chat-table">
          <thead>
            <tr><th>Source</th><th>Page</th><th>Relevance</th></tr>
          </thead>
          <tbody>
            ${(msg.citations || []).map(c => `
            <tr>
              <td class="text-zinc-300">${escapeHTML(c.source_name || '')}</td>
              <td>${c.page ?? '—'}</td>
              <td><span class="text-emerald-400 text-xs">High</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  if (hasImage) {
    extraContent += `
      <div class="mt-3 flex items-center gap-3 bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-3">
        <div class="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
          <i data-lucide="image" class="w-4 h-4 text-emerald-400"></i>
        </div>
        <div>
          <p class="text-xs font-medium text-zinc-300">Visual content detected</p>
          <p class="text-xs text-zinc-600">A figure or chart was referenced on this page</p>
        </div>
      </div>`;
  }

  return `
    <div class="flex gap-2.5 animate-slideUp">
      <div class="w-7 h-7 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#6366f1" stroke-width="2.2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0 max-w-[92%]">
        <div class="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-tl-md px-4 py-3 relative group">
          <div class="msg-content text-sm text-zinc-200 leading-relaxed">${formatMarkdown(msg.content)}</div>
          ${extraContent}
          <button onclick="copyToClipboard(this, ${JSON.stringify(msg.content)})"
            class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all p-1.5 rounded-lg hover:bg-zinc-700">
            <i data-lucide="copy" class="w-3 h-3"></i>
          </button>
        </div>
        ${hasCitations ? `
        <div class="flex flex-wrap gap-1.5 mt-2 px-1">
          ${msg.citations.map(c => `
            <span class="inline-flex items-center gap-1 text-xs bg-zinc-800 border border-zinc-700 text-zinc-500 px-2 py-0.5 rounded-full hover:border-indigo-500/40 hover:text-zinc-400 transition-colors cursor-default"
              title="Page: ${c.page ?? 'N/A'}">
              <i data-lucide="bookmark" class="w-2.5 h-2.5"></i>
              ${escapeHTML(c.chunk_label)} · p.${c.page ?? '?'}
            </span>`).join('')}
        </div>` : ''}
        <span class="text-xs text-zinc-700 px-1 mt-1 inline-block">${time}</span>
      </div>
    </div>`;
}

function addMessage(role, content, citations = [], docId, type = 'text') {
  if (!state.messages[docId]) state.messages[docId] = [];
  state.messages[docId].push({
    role,
    content,
    citations,
    timestamp: Date.now(),
    type
  });
}

// ─── Fast in-place DOM helpers ───────────────────────────────────────────────
// Previously sendMessage() called renderMessages() twice per exchange,
// nuking and rebuilding the entire messages innerHTML and running a
// full-document lucide.createIcons() scan both times.  With many messages
// that reflow cost is what makes the response feel slow even after the
// network has already returned the answer.
//
// These helpers append / replace individual nodes directly, touching only
// the new element — no prior messages are re-rendered.
// ─────────────────────────────────────────────────────────────────────────────

function _msgNode(msg) {
  const tmp = document.createElement('div');
  tmp.innerHTML = renderMessage(msg).trim();
  return tmp.firstElementChild;
}

function appendChatMsg(msg) {
  for (const id of ['messages', 'mobileMessages']) {
    const c = document.getElementById(id);
    if (!c) continue;
    const empty = document.getElementById('chatEmpty');
    if (empty && c.contains(empty)) empty.style.display = 'none';
    const el = _msgNode(msg);
    if (!el) continue;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
  }
  requestAnimationFrame(() => lucide.createIcons());
}

function replaceLoadingMsg(answer, citations) {
  const msgData = {
    role:'assistant', content:answer, citations,
    timestamp:Date.now(), type:'text'
  };
  for (const id of ['messages', 'mobileMessages']) {
    const c = document.getElementById(id);
    if (!c) continue;
    const old = c.querySelector('#loadingMsg');
    if (!old) continue;
    const el = _msgNode(msgData);
    if (el) { old.replaceWith(el); c.scrollTop = c.scrollHeight; }
  }
  requestAnimationFrame(() => lucide.createIcons());
}

function _normaliseAnswer(raw) {
  // langchain-google-genai can return response.content as a list of
  // content blocks on newer SDK versions instead of a plain string.
  if (Array.isArray(raw))
    return raw.map(b => typeof b === 'string' ? b : (b?.text ?? '')).join('');
  if (typeof raw !== 'string')
    return raw != null ? String(raw) : 'No answer returned.';
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const query = input.value.trim();
  if (!query || !state.activeDocumentId || state.isGenerating) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('charCount').textContent = '0';
  input.dispatchEvent(new Event('input'));

  const docId = state.activeDocumentId;
  const userMsg = { role:'user', content:query, citations:[], timestamp:Date.now(), type:'text' };
  const loadMsg = { role:'assistant', content:'', citations:[], timestamp:Date.now(), type:'loading' };
  if (!state.messages[docId]) state.messages[docId] = [];
  state.messages[docId].push(userMsg, loadMsg);

  appendChatMsg(userMsg);
  appendChatMsg(loadMsg);

  state.isGenerating = true;
  document.getElementById('sendBtn').disabled = true;

  try {
    const res    = await apiGenerate(query, docId);
    const answer = _normaliseAnswer(res.answer);
    const cites  = res.citations || [];

    const idx = state.messages[docId]?.findLastIndex(m => m.type === 'loading');
    if (idx !== -1)
      state.messages[docId][idx] = {
        role:'assistant', content:answer,
        citations:cites, timestamp:Date.now(), type:'text'
      };

    replaceLoadingMsg(answer, cites);

  } catch (err) {
    const errText = `Error: ${err.message}`;
    const idx = state.messages[docId]?.findLastIndex(m => m.type === 'loading');
    if (idx !== -1)
      state.messages[docId][idx] = {
        role:'assistant', content:errText,
        citations:[], timestamp:Date.now(), type:'text'
      };
    replaceLoadingMsg(errText, []);
    showToast(err.message, 'error');
  } finally {
    state.isGenerating = false;
    document.getElementById('sendBtn').disabled = false;
    renderChatHeader();
    try { saveSession(); } catch (_) {}
  }
}

async function sendMobileMessage() {
  const input = document.getElementById('mobileChatInput');
  const query = input.value.trim();
  if (!query || !state.activeDocumentId || state.isGenerating) return;
  input.value = ''; input.style.height = 'auto';
  await sendMessageWithQuery(query);
}

async function sendMessageWithQuery(query) {
  const docId   = state.activeDocumentId;
  const userMsg = { role:'user', content:query, citations:[], timestamp:Date.now(), type:'text' };
  const loadMsg = { role:'assistant', content:'', citations:[], timestamp:Date.now(), type:'loading' };
  if (!state.messages[docId]) state.messages[docId] = [];
  state.messages[docId].push(userMsg, loadMsg);

  appendChatMsg(userMsg);
  appendChatMsg(loadMsg);

  state.isGenerating = true;
  document.getElementById('mobileSendBtn').disabled = true;
  document.getElementById('sendBtn').disabled = true;

  try {
    const res    = await apiGenerate(query, docId);
    const answer = _normaliseAnswer(res.answer);
    const cites  = res.citations || [];

    const idx = state.messages[docId]?.findLastIndex(m => m.type === 'loading');
    if (idx !== -1)
      state.messages[docId][idx] = {
        role:'assistant', content:answer,
        citations:cites, timestamp:Date.now(), type:'text'
      };

    replaceLoadingMsg(answer, cites);

  } catch (err) {
    const errText = `Error: ${err.message}`;
    const idx = state.messages[docId]?.findLastIndex(m => m.type === 'loading');
    if (idx !== -1)
      state.messages[docId][idx] = {
        role:'assistant', content:errText,
        citations:[], timestamp:Date.now(), type:'text'
      };
    replaceLoadingMsg(errText, []);
    showToast(err.message, 'error');
  } finally {
    state.isGenerating = false;
    document.getElementById('mobileSendBtn').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    renderChatHeader();
    try { saveSession(); } catch (_) {}
  }
}

function clearChat() {
  if (!state.activeDocumentId) return;
  state.messages[state.activeDocumentId] = [];
  saveSession();
  renderMessages();
  renderChatHeader();
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  document.getElementById('charCount').textContent = e.target.value.length;
}

function handleMobileChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMobileMessage();
  }
}

function syncInputState() {
  const hasDoc = !!state.activeDocumentId;

  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const mobileInput = document.getElementById('mobileChatInput');
  const mobileSend = document.getElementById('mobileSendBtn');

  if (chatInput) chatInput.disabled = !hasDoc;
  if (sendBtn) sendBtn.disabled = !hasDoc;
  if (mobileInput) mobileInput.disabled = !hasDoc;
  if (mobileSend) mobileSend.disabled = !hasDoc;
}

// ═══════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════
function triggerUpload() {
  document.getElementById('uploadInput').click();
}

async function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Only PDF files are supported', 'error');
    return;
  }

  const prog = document.getElementById('uploadProgress');
  const mobProg = document.getElementById('mobileUploadProgress');
  const fn = document.getElementById('uploadFilename');
  const mobFn = document.getElementById('mobileUploadFilename');
  const bar = document.getElementById('uploadBar');

  if (prog) prog.classList.remove('hidden');
  if (mobProg) mobProg.classList.remove('hidden');
  if (fn) fn.textContent = file.name;
  if (mobFn) mobFn.textContent = file.name;
  if (bar) {
    bar.style.width = '5%';
    bar.className = 'h-full bg-indigo-500 rounded-full upload-bar';
  }

  try {
    const res = await apiUpload(file);

    const doc = {
      document_id: res.document_id,
      filename: file.name,
      chunks_indexed: res.chunks_indexed,
      uploadedAt: Date.now()
    };

    state.documents.unshift(doc);
    state.activeDocumentId = doc.document_id;

    if (bar) bar.style.width = '100%';

    saveSession();
    showToast(`"${file.name}" indexed — ${res.chunks_indexed} chunks`, 'success');

    await new Promise(r => setTimeout(r, 500));

    renderDocList();
    renderPDFViewer();
    renderChatHeader();
    renderMessages();
    syncInputState();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setTimeout(() => {
      if (prog) prog.classList.add('hidden');
      if (mobProg) mobProg.classList.add('hidden');
    }, 600);

    requestAnimationFrame(() => lucide.createIcons());
  }
}

// ═══════════════════════════════════════════════
// MOBILE TABS
// ═══════════════════════════════════════════════
function switchMobileTab(tab) {
  state.mobileTab = tab;

  const panels = {
    docs: 'mobileDocsPanel',
    pdf: 'mobilePdfPanel',
    chat: 'mobileChatPanel'
  };

  const tabBtns = {
    docs: 'tabDocs',
    pdf: 'tabPdf',
    chat: 'tabChat'
  };

  Object.entries(panels).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (key === tab) {
      el.classList.remove('hidden');
      el.classList.add('flex');
    } else {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  });

  Object.entries(tabBtns).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    if (key === tab) {
      btn.classList.add('tab-active');
      btn.style.color = '#818cf8';
    } else {
      btn.classList.remove('tab-active');
      btn.style.color = '';
    }
  });

  if (tab === 'chat') {
    setTimeout(() => {
      const mc = document.getElementById('mobileMessages');
      if (mc) mc.scrollTop = mc.scrollHeight;
    }, 100);
  }
}

// ═══════════════════════════════════════════════
// PROMPT SUGGESTIONS
// ═══════════════════════════════════════════════
const PROMPTS = [
  'Summarize this document',
  'What are the key findings?',
  'List the main topics covered',
  'What tables are in this document?',
  'Explain the methodology used',
  'What are the conclusions?',
  'Are there any figures or charts?',
  'What is the document about?'
];

function showPromptSuggestions() {
  const el = document.getElementById('promptSuggestions');
  if (!el) return;

  el.innerHTML =
    `<p class="text-xs text-zinc-500 font-medium px-2 py-1 mb-1">Quick prompts</p>` +
    PROMPTS.map(p => `
      <button onclick="insertPrompt('${p.replace(/'/g, "\\'")}')"
        class="w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 px-3 py-2 rounded-xl transition-colors">
        ${p}
      </button>`).join('');

  el.classList.toggle('hidden');

  const inputRect = document.getElementById('chatInput').getBoundingClientRect();
  el.style.bottom = (window.innerHeight - inputRect.top + 8) + 'px';
  el.style.right = '16px';

  const close = (e) => {
    if (!el.contains(e.target)) {
      el.classList.add('hidden');
      document.removeEventListener('click', close);
    }
  };

  setTimeout(() => document.addEventListener('click', close), 100);
}

function insertPrompt(text) {
  const input = document.getElementById('chatInput');
  input.value = text;
  input.focus();
  autoResize(input);
  document.getElementById('charCount').textContent = text.length;
  document.getElementById('promptSuggestions').classList.add('hidden');
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _inline(text) {
  if (!text) return '';
  let t = _esc(text);
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  t = t.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  t = t.replace(/__(.+?)__/g,         '<strong>$1</strong>');
  t = t.replace(/_([^_\s][^_]*)_/g,   '<em>$1</em>');
  t = t.replace(/`([^`]+)`/g,         '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" class="md-link">$1</a>');
  return t;
}

function _parseTable(lines) {
  const parseRow = l => l.split('|').slice(1,-1).map(c => c.trim());
  const isSep    = l => /^\|[\s\-:|]+\|$/.test(l.trim());
  const rows     = lines.filter(l => !isSep(l));
  if (rows.length < 1) return lines.map(_esc).join('<br>');
  const [hdr, ...body] = rows;
  const thHTML = parseRow(hdr).map(h => `<th>${_inline(h)}</th>`).join('');
  const tbHTML = body.map(r =>
    `<tr>${parseRow(r).map(c => `<td>${_inline(c)}</td>`).join('')}</tr>`
  ).join('');
  return `<div class="md-table-wrap"><table class="md-table">` +
    `<thead><tr>${thHTML}</tr></thead><tbody>${tbHTML}</tbody></table></div>`;
}

function formatMarkdown(raw) {
  if (!raw || typeof raw !== 'string') return '';

  const lines  = raw.split('\n');
  const out    = [];
  let   i      = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* ── fenced code block ─────────────────────────── */
    if (line.startsWith('```')) {
      const lang  = _esc(line.slice(3).trim());
      const code  = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(_esc(lines[i]));
        i++;
      }
      const label = lang
        ? `<span class="code-lang">${lang}</span>` : '';
      out.push(
        `<div class="code-block-wrap">${label}` +
        `<pre><code>${code.join('\n')}</code></pre></div>`
      );
      i++; continue;
    }

    /* ── GFM table ─────────────────────────────────── */
    if (line.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tbl.push(lines[i]); i++;
      }
      out.push(_parseTable(tbl));
      continue;
    }

    /* ── ATX heading ───────────────────────────────── */
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl} class="md-h${lvl}">${_inline(hm[2])}</h${lvl}>`);
      i++; continue;
    }

    /* ── blockquote ────────────────────────────────── */
    if (line.startsWith('> ')) {
      const bq = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        bq.push(_inline(lines[i].slice(2))); i++;
      }
      out.push(`<blockquote class="md-quote">${bq.join('<br>')}</blockquote>`);
      continue;
    }

    /* ── unordered list ────────────────────────────── */
    if (/^(\s*)[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^(\s*)[-*+] /.test(lines[i])) {
        items.push(`<li>${_inline(lines[i].replace(/^\s*[-*+] /, ''))}</li>`);
        i++;
      }
      out.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }

    /* ── ordered list ──────────────────────────────── */
    if (/^\d+[.)]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(`<li>${_inline(lines[i].replace(/^\d+[.)]\s/, ''))}</li>`);
        i++;
      }
      out.push(`<ol class="md-ol">${items.join('')}</ol>`);
      continue;
    }

    /* ── horizontal rule ───────────────────────────── */
    if (/^[-*_]{3,}\s*$/.test(line)) {
      out.push('<hr class="md-hr">'); i++; continue;
    }

    /* ── blank line ────────────────────────────────── */
    if (line.trim() === '') {
      i++; continue;
    }

    /* ── paragraph ─────────────────────────────────── */
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#')  &&
      !lines[i].startsWith('|')  &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !/^(\s*)[-*+] /.test(lines[i]) &&
      !/^\d+[.)]\s/.test(lines[i]) &&
      !/^[-*_]{3,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]); i++;
    }
    if (para.length) {
      out.push(`<p>${para.map(_inline).join('<br>')}</p>`);
    }
  }

  return out.join('\n');
}



function copyToClipboard(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i>';
    lucide.createIcons();

    setTimeout(() => {
      btn.innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i>';
      lucide.createIcons();
    }, 1500);
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');

  const colors = {
    success: 'bg-emerald-900/90 border-emerald-700 text-emerald-100',
    error: 'bg-red-900/90 border-red-700 text-red-100',
    info: 'bg-zinc-800 border-zinc-700 text-zinc-200'
  };

  const icons = {
    success: 'check-circle',
    error: 'x-circle',
    info: 'info'
  };

  const el = document.createElement('div');
  el.className = `toast flex items-center gap-2.5 px-4 py-3 rounded-xl border ${colors[type]} text-sm max-w-xs shadow-xl backdrop-blur-sm`;
  el.innerHTML = `<i data-lucide="${icons[type]}" class="w-4 h-4 flex-shrink-0"></i><span>${escapeHTML(message)}</span>`;

  container.appendChild(el);
  lucide.createIcons();

  setTimeout(() => {
    el.classList.add('exit');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
function init() {
  const savedToken = localStorage.getItem('chatpdf_token');
  const savedBase = localStorage.getItem('chatpdf_api_base');

  if (savedBase) state.apiBase = savedBase;

  if (savedToken) {
    state.token = savedToken;
    loadSession();
    showApp();
  } else {
    showAuth();
  }

  // Save token to localStorage when available
  const tokenObserver = setInterval(() => {
    if (state.token) {
      localStorage.setItem('chatpdf_token', state.token);
      localStorage.setItem('chatpdf_api_base', state.apiBase);
      clearInterval(tokenObserver);
    }
  }, 500);

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      document.getElementById('charCount').textContent = chatInput.value.length;
    });
  }

  const apiInput = document.getElementById('apiBaseInput');
  if (apiInput && state.apiBase) {
    apiInput.value = state.apiBase;
  }

  lucide.createIcons();
}

// ═══════════════════════════════════════════════
// FINAL AUTH FUNCTIONS (keep these only)
// ═══════════════════════════════════════════════
async function handleLogin(e) {
  e.preventDefault();

  state.apiBase = document.getElementById('apiBaseInput').value.trim() || 'https://multimodal-rag-system-oozj.onrender.com';

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const res = await apiLogin(email, password);
    state.token = res.access_token;
    state.user = { email };

    localStorage.setItem('chatpdf_token', state.token);
    localStorage.setItem('chatpdf_api_base', state.apiBase);

    loadSession();
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();

  state.apiBase = document.getElementById('apiBaseInput').value.trim() || 'https://multimodal-rag-system-oozj.onrender.comge';

  const payload = {
    first_name: document.getElementById('regFirstName').value,
    last_name: document.getElementById('regLastName').value,
    email: document.getElementById('regEmail').value,
    phone_number: document.getElementById('regPhone').value,
    password: document.getElementById('regPassword').value
  };

  const btn = document.getElementById('registerBtn');
  const errEl = document.getElementById('registerError');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    await apiRegister(payload);
    showToast('Account created! Please sign in.', 'success');
    switchAuthTab('login');
    document.getElementById('loginEmail').value = payload.email;
  } catch (err) {
    const msg = typeof err.message === 'string' ? err.message : 'Registration failed';
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

window.addEventListener('DOMContentLoaded', init);