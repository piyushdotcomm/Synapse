// Synapse — Background Service Worker
// Handles: message routing, Gemini API calls, context menus

// ============================================================
// Storage Helpers (from browser-extension-builder skill)
// ============================================================
async function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

async function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

// ============================================================
// Extension Lifecycle
// ============================================================
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          apiKey: '',
          theme: 'dark',
          memoryEnabled: true,
          model: 'gemini-2.0-flash'
        }
      });
    }
  });

  // Create context menu
  chrome.contextMenus.create({
    id: 'synapse-ask',
    title: 'Ask Synapse about "%s"',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'synapse-summarize',
    title: 'Summarize this page with Synapse',
    contexts: ['page']
  });
});

// Open side panel on icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Enable side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ============================================================
// Context Menu Handlers
// ============================================================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'synapse-ask') {
    chrome.sidePanel.open({ tabId: tab.id });
    // Small delay to let panel open
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'contextMenuQuery',
        text: info.selectionText,
        type: 'ask'
      });
    }, 500);
  } else if (info.menuItemId === 'synapse-summarize') {
    chrome.sidePanel.open({ tabId: tab.id });
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'contextMenuQuery',
        type: 'summarize'
      });
    }, 500);
  }
});

// ============================================================
// Message Router (SidePanel ↔ Background ↔ Content Script)
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPageContent') {
    // Forward to content script of active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: 'Could not connect to page. Try refreshing.' });
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({ error: 'No active tab found.' });
      }
    });
    return true; // Keep channel open for async
  }

  if (message.action === 'chatWithAI') {
    handleAIChat(message, sendResponse);
    return true;
  }

  if (message.action === 'extractData') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractStructuredData' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: 'Could not connect to page.' });
          } else {
            sendResponse(response);
          }
        });
      }
    });
    return true;
  }

  if (message.action === 'saveNote') {
    saveNote(message.note).then((result) => sendResponse(result));
    return true;
  }

  if (message.action === 'getNotes') {
    getNotes().then((notes) => sendResponse({ notes }));
    return true;
  }

  if (message.action === 'deleteNote') {
    deleteNote(message.noteId).then((result) => sendResponse(result));
    return true;
  }
});

// ============================================================
// Gemini API Integration (FREE)
// ============================================================
async function handleAIChat(message, sendResponse) {
  const { settings } = await getStorage(['settings']);

  if (!settings?.apiKey) {
    sendResponse({ error: 'Please set your Gemini API key in settings.' });
    return;
  }

  const apiKey = settings.apiKey;
  const model = settings.model || 'gemini-2.0-flash';

  // Build the prompt with page context
  const systemPrompt = `You are Synapse, an intelligent AI assistant that lives inside the user's browser. You help users understand web pages, extract information, answer questions, and be productive.

CURRENT PAGE CONTEXT:
- Title: ${message.pageContext?.title || 'Unknown'}
- URL: ${message.pageContext?.url || 'Unknown'}
- Meta Description: ${message.pageContext?.description || 'N/A'}

PAGE CONTENT (truncated):
${(message.pageContext?.content || 'No page content available.').substring(0, 8000)}

${message.pageContext?.selectedText ? `USER'S SELECTED TEXT: ${message.pageContext.selectedText}` : ''}

RULES:
- Be concise and helpful
- Reference specific parts of the page when relevant
- Use markdown formatting for readability
- If asked to extract data, present it in a structured format (tables, lists)
- If the user asks about something not on the page, help them anyway using your knowledge
- Be friendly and conversational`;

  // Build conversation history
  const contents = [];
  
  if (message.history && message.history.length > 0) {
    for (const msg of message.history) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: message.prompt }]
  });

  const requestBody = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      topP: 0.9
    }
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      if (response.status === 429) {
        sendResponse({ error: 'Rate limit reached. Please wait a moment and try again.' });
      } else if (response.status === 400) {
        sendResponse({ error: 'Invalid API key. Please check your settings.' });
      } else {
        sendResponse({ error: `API Error: ${errorData.error?.message || response.statusText}` });
      }
      return;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      // Save to conversation history if memory is enabled
      if (settings.memoryEnabled) {
        await saveConversation(message.prompt, text, message.pageContext?.url);
      }
      sendResponse({ text });
    } else {
      sendResponse({ error: 'No response from AI. Try again.' });
    }
  } catch (error) {
    sendResponse({ error: `Connection error: ${error.message}` });
  }
}

// ============================================================
// Notes System
// ============================================================
async function saveNote(note) {
  const { notes = [] } = await getStorage(['notes']);
  const newNote = {
    id: Date.now().toString(),
    content: note.content,
    pageUrl: note.pageUrl || '',
    pageTitle: note.pageTitle || '',
    timestamp: new Date().toISOString(),
    tags: note.tags || []
  };
  notes.unshift(newNote);
  // Keep max 500 notes to stay within storage limits
  if (notes.length > 500) notes.pop();
  await setStorage({ notes });
  return { success: true, note: newNote };
}

async function getNotes() {
  const { notes = [] } = await getStorage(['notes']);
  return notes;
}

async function deleteNote(noteId) {
  const { notes = [] } = await getStorage(['notes']);
  const filtered = notes.filter(n => n.id !== noteId);
  await setStorage({ notes: filtered });
  return { success: true };
}

// ============================================================
// Conversation Memory
// ============================================================
async function saveConversation(userMsg, aiMsg, url) {
  const { conversations = [] } = await getStorage(['conversations']);
  conversations.unshift({
    id: Date.now().toString(),
    userMessage: userMsg.substring(0, 200),
    aiResponse: aiMsg.substring(0, 500),
    url: url || '',
    timestamp: new Date().toISOString()
  });
  // Keep max 200 conversations
  if (conversations.length > 200) conversations.pop();
  await setStorage({ conversations });
}
