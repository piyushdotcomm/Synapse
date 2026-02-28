// Synapse — Side Panel Main Logic
// Handles: Chat, Notes, Extract tabs + Settings

// ============================================================
// State
// ============================================================
let chatHistory = [];
let pageContext = null;
let isProcessing = false;

// ============================================================
// DOM Elements
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Tabs
const tabBtns = $$('.tab-btn');
const tabPanels = $$('.tab-panel');

// Chat
const chatMessages = $('#chat-messages');
const chatInput = $('#chat-input');
const btnSend = $('#btn-send');
const btnClearChat = $('#btn-clear-chat');

// Notes
const notesSearch = $('#notes-search');
const notesList = $('#notes-list');
const noteForm = $('#note-form');
const noteInput = $('#note-input');
const btnAddNote = $('#btn-add-note');
const btnSaveNote = $('#btn-save-note');
const btnCancelNote = $('#btn-cancel-note');

// Extract
const btnScanPage = $('#btn-scan-page');
const btnExportCsv = $('#btn-export-csv');
const extractResults = $('#extract-results');

// Settings
const settingsModal = $('#settings-modal');
const btnSettings = $('#btn-settings');
const btnCloseSettings = $('#btn-close-settings');
const apiKeyInput = $('#api-key-input');
const btnToggleKey = $('#btn-toggle-key');
const modelSelect = $('#model-select');
const memoryToggle = $('#memory-toggle');
const btnSaveSettings = $('#btn-save-settings');

// Page context
const pageContextBar = $('#page-context-bar');
const pageContextText = $('#page-context-text');

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadPageContext();
  setupEventListeners();
  loadNotes();
});

// Listen for context menu queries
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'contextMenuQuery') {
    if (message.type === 'ask' && message.text) {
      switchTab('chat');
      chatInput.value = message.text;
      sendMessage();
    } else if (message.type === 'summarize') {
      switchTab('chat');
      chatInput.value = 'Summarize this page';
      sendMessage();
    }
  }
});

// ============================================================
// Tab Navigation
// ============================================================
function setupEventListeners() {
  // Tabs
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Chat
  chatInput.addEventListener('input', handleInputChange);
  chatInput.addEventListener('keydown', handleInputKeydown);
  btnSend.addEventListener('click', sendMessage);
  btnClearChat.addEventListener('click', clearChat);

  // Quick actions
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.prompt;
      sendMessage();
    });
  });

  // Notes
  btnAddNote.addEventListener('click', toggleNoteForm);
  btnSaveNote.addEventListener('click', saveNote);
  btnCancelNote.addEventListener('click', () => {
    noteForm.classList.add('hidden');
    noteInput.value = '';
  });
  notesSearch.addEventListener('input', filterNotes);

  // Extract
  btnScanPage.addEventListener('click', scanPage);
  btnExportCsv.addEventListener('click', exportCsv);

  // Settings
  btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  $('.modal-backdrop').addEventListener('click', () => settingsModal.classList.add('hidden'));
  btnToggleKey.addEventListener('click', toggleKeyVisibility);
  btnSaveSettings.addEventListener('click', saveSettings);

  // Connect tab
  setupConnectTab();
}

function switchTab(tabName) {
  tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  tabPanels.forEach(panel => {
    const panelTab = panel.id.replace('-panel', '');
    panel.classList.toggle('active', panelTab === tabName);
  });
}

// ============================================================
// Page Context
// ============================================================
async function loadPageContext() {
  try {
    pageContextBar.classList.remove('hidden');
    pageContextText.textContent = 'Reading page...';

    const response = await sendToBackground({ action: 'getPageContent' });
    if (response && !response.error) {
      pageContext = response;
      pageContextText.textContent = truncate(response.title || response.url, 50);
    } else {
      pageContextText.textContent = 'No page context available';
    }
  } catch (err) {
    pageContextText.textContent = 'Could not read page';
  }
}

// ============================================================
// Chat
// ============================================================
function handleInputChange() {
  btnSend.disabled = !chatInput.value.trim() || isProcessing;
  autoResizeTextarea();
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (chatInput.value.trim() && !isProcessing) {
      sendMessage();
    }
  }
}

function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

async function sendMessage() {
  const prompt = chatInput.value.trim();
  if (!prompt || isProcessing) return;

  isProcessing = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  btnSend.disabled = true;

  // Remove welcome if first message
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Add user message
  addMessage('user', prompt);

  // Add typing indicator
  const typingEl = addTypingIndicator();

  // Refresh page context
  try {
    const freshContext = await sendToBackground({ action: 'getPageContent' });
    if (freshContext && !freshContext.error) {
      pageContext = freshContext;
      pageContextText.textContent = truncate(freshContext.title || freshContext.url, 50);
    }
  } catch (e) {
    // Use existing context
  }

  // Build history (last 10 messages for context)
  const historyForAPI = chatHistory.slice(-10).map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  // Send to AI
  try {
    const response = await sendToBackground({
      action: 'chatWithAI',
      prompt: prompt,
      pageContext: pageContext,
      history: historyForAPI
    });

    typingEl.remove();

    if (response?.error) {
      addMessage('error', response.error);
    } else if (response?.text) {
      addMessage('ai', response.text);
      chatHistory.push({ role: 'user', content: prompt });
      chatHistory.push({ role: 'model', content: response.text });
    } else {
      addMessage('error', 'No response received. Check your API key in settings.');
    }
  } catch (error) {
    typingEl.remove();
    addMessage('error', `Error: ${error.message}`);
  }

  isProcessing = false;
  btnSend.disabled = !chatInput.value.trim();
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessage(type, content) {
  const msgEl = document.createElement('div');
  msgEl.className = `message message-${type}`;

  if (type === 'user') {
    msgEl.innerHTML = `
      <div class="message-bubble">${escapeHtml(content)}</div>
    `;
  } else if (type === 'ai') {
    msgEl.innerHTML = `
      <div class="ai-avatar">🧠</div>
      <div class="message-bubble">${renderMarkdown(content)}</div>
    `;
  } else if (type === 'error') {
    msgEl.innerHTML = `
      <div class="ai-avatar">⚠️</div>
      <div class="message-bubble">${escapeHtml(content)}</div>
    `;
  }

  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msgEl;
}

function addTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'message message-ai';
  el.innerHTML = `
    <div class="ai-avatar">🧠</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

function clearChat() {
  chatHistory = [];
  chatMessages.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">🧠</div>
      <h2>Hey! I'm Synapse</h2>
      <p>Your AI copilot for the browser. I can read the page you're on and help you with anything.</p>
      <div class="quick-actions">
        <button class="quick-btn" data-prompt="Summarize this page">📝 Summarize page</button>
        <button class="quick-btn" data-prompt="What are the key takeaways from this page?">💡 Key takeaways</button>
        <button class="quick-btn" data-prompt="Extract all important data from this page">📊 Extract data</button>
        <button class="quick-btn" data-prompt="Explain this page like I'm 5">🎯 ELI5</button>
      </div>
    </div>
  `;
  // Re-bind quick actions
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.prompt;
      sendMessage();
    });
  });
}

// ============================================================
// Notes
// ============================================================
function toggleNoteForm() {
  noteForm.classList.toggle('hidden');
  if (!noteForm.classList.contains('hidden')) {
    noteInput.focus();
  }
}

async function saveNote() {
  const content = noteInput.value.trim();
  if (!content) return;

  const note = {
    content,
    pageUrl: pageContext?.url || '',
    pageTitle: pageContext?.title || ''
  };

  await sendToBackground({ action: 'saveNote', note });
  noteInput.value = '';
  noteForm.classList.add('hidden');
  loadNotes();
}

async function loadNotes() {
  const response = await sendToBackground({ action: 'getNotes' });
  const notes = response?.notes || [];
  renderNotes(notes);
}

function renderNotes(notes) {
  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📝</span>
        <p>No notes yet</p>
        <p class="sub">Click + to save your first note</p>
      </div>
    `;
    return;
  }

  notesList.innerHTML = notes.map(note => `
    <div class="note-card" data-id="${note.id}">
      <div class="note-card-header">
        <div class="note-card-meta">${formatDate(note.timestamp)}</div>
        <button class="note-delete-btn" data-id="${note.id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="note-card-content">${escapeHtml(note.content)}</div>
      ${note.pageTitle ? `
        <div class="note-card-page">
          📄 <a href="${escapeHtml(note.pageUrl)}" target="_blank">${escapeHtml(truncate(note.pageTitle, 40))}</a>
        </div>
      ` : ''}
    </div>
  `).join('');

  // Bind delete buttons
  $$('.note-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendToBackground({ action: 'deleteNote', noteId: btn.dataset.id });
      loadNotes();
    });
  });
}

function filterNotes() {
  const query = notesSearch.value.toLowerCase();
  $$('.note-card').forEach(card => {
    const content = card.querySelector('.note-card-content').textContent.toLowerCase();
    card.style.display = content.includes(query) ? '' : 'none';
  });
}

// ============================================================
// Data Extraction
// ============================================================
let extractedData = null;

async function scanPage() {
  btnScanPage.disabled = true;
  btnScanPage.innerHTML = `
    <svg class="loading" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    Scanning...
  `;

  try {
    const response = await sendToBackground({ action: 'extractData' });

    if (response?.error) {
      extractResults.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚠️</span>
          <p>${escapeHtml(response.error)}</p>
        </div>
      `;
    } else {
      extractedData = response;
      renderExtractResults(response);
    }
  } catch (error) {
    extractResults.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <p>Error scanning page</p>
        <p class="sub">${escapeHtml(error.message)}</p>
      </div>
    `;
  }

  btnScanPage.disabled = false;
  btnScanPage.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    Scan Page
  `;
}

function renderExtractResults(data) {
  let html = '';

  // Metadata
  if (data.metadata) {
    html += `
      <div class="extract-section">
        <div class="extract-section-title">📄 Page Info</div>
        <table class="extract-table">
          <tr><th>Title</th><td>${escapeHtml(data.metadata.title || 'N/A')}</td></tr>
          <tr><th>URL</th><td style="word-break:break-all">${escapeHtml(data.metadata.url || 'N/A')}</td></tr>
          ${data.metadata.author ? `<tr><th>Author</th><td>${escapeHtml(data.metadata.author)}</td></tr>` : ''}
          ${data.metadata.date ? `<tr><th>Date</th><td>${escapeHtml(data.metadata.date)}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  // Tables
  if (data.tables && data.tables.length > 0) {
    data.tables.forEach((table, i) => {
      html += `
        <div class="extract-section">
          <div class="extract-section-title">📊 Table ${i + 1} (${table.rows.length} rows)</div>
          <div style="overflow-x:auto">
            <table class="extract-table">
              ${table.headers.length > 0 ? `
                <thead><tr>${table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
              ` : ''}
              <tbody>
                ${table.rows.slice(0, 50).map(row =>
        `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
      ).join('')}
              </tbody>
            </table>
          </div>
          ${table.rows.length > 50 ? `<p class="sub" style="margin-top:4px">${table.rows.length - 50} more rows...</p>` : ''}
        </div>
      `;
    });
    btnExportCsv.disabled = false;
  }

  // Lists
  if (data.lists && data.lists.length > 0) {
    data.lists.forEach((list, i) => {
      const items = list.items || [];
      if (list.type === 'definition') {
        html += `
          <div class="extract-section">
            <div class="extract-section-title">📋 Key-Value Data ${i + 1}</div>
            <table class="extract-table">
              ${items.map(item => `<tr><th>${escapeHtml(item.key)}</th><td>${escapeHtml(item.value)}</td></tr>`).join('')}
            </table>
          </div>
        `;
      } else {
        html += `
          <div class="extract-section">
            <div class="extract-section-title">📋 List ${i + 1} (${items.length} items)</div>
            <ul class="extract-list">
              ${items.slice(0, 30).map(item => `<li>${escapeHtml(typeof item === 'string' ? item : item.text || '')}</li>`).join('')}
            </ul>
          </div>
        `;
      }
    });
  }

  if (!html) {
    html = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <p>No structured data found</p>
        <p class="sub">This page doesn't have tables or structured lists</p>
      </div>
    `;
  }

  extractResults.innerHTML = html;
}

function exportCsv() {
  if (!extractedData?.tables?.length) return;

  const table = extractedData.tables[0]; // Export first table
  let csv = '';

  if (table.headers.length > 0) {
    csv += table.headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
  }

  table.rows.forEach(row => {
    csv += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `synapse-extract-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Settings
// ============================================================
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.model) modelSelect.value = settings.model;
  if (settings.memoryEnabled !== undefined) memoryToggle.checked = settings.memoryEnabled;
}

async function saveSettings() {
  const settings = {
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    memoryEnabled: memoryToggle.checked,
    theme: 'dark'
  };

  await chrome.storage.local.set({ settings });
  settingsModal.classList.add('hidden');

  // Show brief confirmation
  const btn = btnSaveSettings;
  btn.textContent = '✓ Saved!';
  btn.style.background = 'var(--success)';
  setTimeout(() => {
    btn.textContent = 'Save Settings';
    btn.style.background = '';
  }, 1500);
}

function toggleKeyVisibility() {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
}

// ============================================================
// Connect Tab
// ============================================================
function setupConnectTab() {
  // App open buttons
  $$('.app-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });

  // Quick actions
  const qaActions = {
    'qa-compose-email': () => {
      // Scroll to compose form in Connect tab
      switchTab('connect');
      setTimeout(() => {
        $('#compose-to')?.focus();
        $('#compose-to')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    },
    'qa-calendar': () => chrome.tabs.create({ url: 'https://calendar.google.com' }),
    'qa-search': () => chrome.tabs.create({ url: 'https://www.google.com' }),
    'qa-drive': () => chrome.tabs.create({ url: 'https://drive.google.com' })
  };

  Object.entries(qaActions).forEach(([id, handler]) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('click', handler);
  });

  // LinkedIn scanner
  const btnScanLinkedin = $('#btn-scan-linkedin');
  if (btnScanLinkedin) {
    btnScanLinkedin.addEventListener('click', scanLinkedInProfile);
  }

  // Compose email
  const btnOpenGmail = $('#btn-open-gmail');
  if (btnOpenGmail) {
    btnOpenGmail.addEventListener('click', openInGmail);
  }

  // AI Draft
  const btnAiDraft = $('#btn-ai-draft');
  if (btnAiDraft) {
    btnAiDraft.addEventListener('click', aiDraftEmail);
  }
}

// LinkedIn Profile Scanner
async function scanLinkedInProfile() {
  const btn = $('#btn-scan-linkedin');
  const resultDiv = $('#linkedin-result');

  btn.disabled = true;
  btn.textContent = 'Scanning...';
  resultDiv.classList.add('hidden');

  try {
    // Get page content from content script
    const response = await sendToBackground({ action: 'getPageContent' });

    if (!response || response.error) {
      resultDiv.innerHTML = '<p style="color:var(--error)">Could not read page. Make sure you\'re on a LinkedIn profile.</p>';
      resultDiv.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Scan Current LinkedIn Profile';
      return;
    }

    const url = response.url || '';
    if (!url.includes('linkedin.com')) {
      resultDiv.innerHTML = '<p style="color:var(--warning)">⚠️ This doesn\'t seem to be a LinkedIn page. Navigate to a LinkedIn profile first.</p>';
      resultDiv.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Scan Current LinkedIn Profile';
      return;
    }

    // Use AI to extract profile info from the page content
    const aiResponse = await sendToBackground({
      action: 'chatWithAI',
      prompt: `Extract the LinkedIn profile information from this page. Return ONLY in this exact format:
Name: [full name]
Headline: [headline/title]
Location: [location]
About: [first 2 sentences of about section]
Current Role: [current job title and company]
Experience: [list top 3 roles]
Education: [list schools]
Skills: [list top 5 skills if visible]

If a field is not found, write "N/A".`,
      pageContext: response,
      history: []
    });

    if (aiResponse?.text) {
      // Parse the AI response into fields
      const lines = aiResponse.text.split('\n').filter(l => l.trim());
      let html = '<h4>📋 Profile Extracted</h4>';

      lines.forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const label = line.substring(0, colonIdx).trim();
          const value = line.substring(colonIdx + 1).trim();
          if (label && value) {
            html += `<div class="li-field"><span class="li-label">${escapeHtml(label)}</span><span class="li-value">${escapeHtml(value)}</span></div>`;
          }
        }
      });

      html += `<div style="margin-top:8px; display:flex; gap:6px;">
                <button class="ghost-btn" onclick="copyLinkedInData()">📋 Copy</button>
                <button class="ghost-btn" onclick="saveLinkedInAsNote()">📝 Save as Note</button>
            </div>`;

      resultDiv.innerHTML = html;
      resultDiv.classList.remove('hidden');

      // Store for copy/save
      window._lastLinkedInData = aiResponse.text;
    } else {
      resultDiv.innerHTML = `<p style="color:var(--error)">${escapeHtml(aiResponse?.error || 'Could not extract profile. Check your API key.')}</p>`;
      resultDiv.classList.remove('hidden');
    }
  } catch (error) {
    resultDiv.innerHTML = `<p style="color:var(--error)">Error: ${escapeHtml(error.message)}</p>`;
    resultDiv.classList.remove('hidden');
  }

  btn.disabled = false;
  btn.textContent = 'Scan Current LinkedIn Profile';
}

// Copy LinkedIn data to clipboard
window.copyLinkedInData = function () {
  if (window._lastLinkedInData) {
    navigator.clipboard.writeText(window._lastLinkedInData);
    // Brief visual feedback
    const btn = document.querySelector('#linkedin-result .ghost-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    }
  }
};

// Save LinkedIn data as note
window.saveLinkedInAsNote = async function () {
  if (window._lastLinkedInData) {
    await sendToBackground({
      action: 'saveNote',
      note: {
        content: window._lastLinkedInData,
        pageUrl: pageContext?.url || '',
        pageTitle: 'LinkedIn Profile'
      }
    });
    const btns = document.querySelectorAll('#linkedin-result .ghost-btn');
    if (btns[1]) {
      const orig = btns[1].textContent;
      btns[1].textContent = '✓ Saved!';
      setTimeout(() => btns[1].textContent = orig, 1500);
    }
  }
};

// Open compose in Gmail
function openInGmail() {
  const to = $('#compose-to')?.value?.trim() || '';
  const subject = $('#compose-subject')?.value?.trim() || '';
  const body = $('#compose-body')?.value?.trim() || '';

  const params = new URLSearchParams();
  if (to) params.set('to', to);
  if (subject) params.set('su', subject);
  if (body) params.set('body', body);

  const gmailUrl = `https://mail.google.com/mail/?view=cm&${params.toString()}`;
  chrome.tabs.create({ url: gmailUrl });
}

// AI Draft for email
async function aiDraftEmail() {
  const btn = $('#btn-ai-draft');
  const to = $('#compose-to')?.value?.trim() || '';
  const subject = $('#compose-subject')?.value?.trim() || '';
  const body = $('#compose-body')?.value?.trim() || '';

  if (!subject && !body) {
    $('#compose-subject')?.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = '🧠 Drafting...';

  try {
    const prompt = `Write a professional email draft based on these details:
To: ${to || 'unspecified'}
Subject: ${subject || 'unspecified'}
Context/Notes: ${body || 'No additional context'}

Write ONLY the email body text. Be professional, concise, and friendly. Do not include subject line or "Dear" — start directly with the greeting.`;

    const response = await sendToBackground({
      action: 'chatWithAI',
      prompt: prompt,
      pageContext: pageContext,
      history: []
    });

    if (response?.text) {
      $('#compose-body').value = response.text;
    } else {
      $('#compose-body').value = body + '\n\n[AI Draft failed — check API key in settings]';
    }
  } catch (err) {
    console.error('AI Draft error:', err);
  }

  btn.disabled = false;
  btn.textContent = '🧠 AI Draft';
}

// ============================================================
// Utilities
// ============================================================
function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Line breaks / paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
