/*
================================================================
KISAN SAATHI — Frontend JavaScript
File : static/js/app.js

This file handles ALL browser-side logic:
  1.  App state (language, conversation history, loading flag)
  2.  Language switching
  3.  Topic chip rendering
  4.  Sending messages to our Flask backend (/api/chat)
  5.  Reading streaming responses (SSE — Server-Sent Events)
  6.  Rendering chat bubbles with Markdown formatting
  7.  Typing indicator, auto-scroll
  8.  Sidebar toggle (mobile)
  9.  Server health check
  10. Clear conversation

HOW FRONTEND ↔ BACKEND COMMUNICATION WORKS:
  Browser sends:  POST /api/chat  { message, history, lang }
  Flask receives it, calls the Groq Cloud API with streaming
  Flask sends back chunks:  data: {"chunk": "Hello"}\n\n
  Browser reads chunks with EventSource / fetch + ReadableStream
  Browser appends each chunk to the active bubble in real time
================================================================
*/


// ── SECTION 1: APP STATE ──────────────────────────────────────
/*
  These variables are the "memory" of the app.
  They persist as long as the browser tab is open.
*/

// Current language: 'hi' (Hindi) or 'en' (English)
let currentLang = 'hi';

/*
  conversationHistory stores all messages for this session.
  We send this with EVERY request so the model has context.
  Format: [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
*/
let conversationHistory = [];

// true = waiting for AI response (blocks new sends)
let isStreaming = false;

// Count of messages this session (shown in sidebar)
let messageCount = 0;


// ── SECTION 2: CONTENT DATA ────────────────────────────────────
// All language-specific text content

const TOPICS = {
  hi: [
    { icon: '🌱', label: 'फसल सलाह',        prompt: 'मेरी फसल के लिए सबसे अच्छी सलाह दो।' },
    { icon: '🌦️', label: 'मौसम सुझाव',      prompt: 'मौसम के हिसाब से खेती की क्या सलाह है?' },
    { icon: '🏛️', label: 'सरकारी योजनाएं',  prompt: 'किसानों के लिए कौन-कौन सी सरकारी योजनाएं हैं? विस्तार से बताओ।' },
    { icon: '💰', label: 'बाजार भाव',        prompt: 'अपनी फसल का सबसे अच्छा दाम कैसे पाएं?' },
    { icon: '🐛', label: 'कीट / रोग',        prompt: 'फसल में कीड़े और बीमारी से कैसे बचाएं? जैविक उपाय बताओ।' },
    { icon: '🌿', label: 'मिट्टी सुधार',     prompt: 'मिट्टी की जांच और सुधार कैसे करें?' },
    { icon: '💧', label: 'सिंचाई',           prompt: 'ड्रिप और स्प्रिंकलर सिंचाई के फायदे और तरीके बताओ।' },
    { icon: '🌾', label: 'जैविक खेती',       prompt: 'जैविक खेती कैसे शुरू करें? क्या फायदे और चुनौतियां हैं?' },
    { icon: '🌻', label: 'बीज चुनाव',        prompt: 'अच्छे और प्रमाणित बीज कैसे चुनें और कहां से खरीदें?' },
    { icon: '📱', label: 'किसान ऐप्स',        prompt: 'किसानों के लिए कौन से मोबाइल ऐप्स सबसे उपयोगी हैं?' },
  ],
  en: [
    { icon: '🌱', label: 'Crop Advice',       prompt: 'Give me the best advice for my crops.' },
    { icon: '🌦️', label: 'Weather Tips',     prompt: 'What farming advice suits the current weather?' },
    { icon: '🏛️', label: 'Govt. Schemes',    prompt: 'What government schemes are available for farmers? Explain in detail.' },
    { icon: '💰', label: 'Market Prices',     prompt: 'How can I get the best price for my crops?' },
    { icon: '🐛', label: 'Pest / Disease',    prompt: 'How to protect crops from pests and disease? Suggest organic methods.' },
    { icon: '🌿', label: 'Soil Health',       prompt: 'How to test and improve my soil?' },
    { icon: '💧', label: 'Irrigation',        prompt: 'Explain drip and sprinkler irrigation benefits and methods.' },
    { icon: '🌾', label: 'Organic Farming',   prompt: 'How to start organic farming? What are benefits and challenges?' },
    { icon: '🌻', label: 'Seed Selection',    prompt: 'How to choose certified quality seeds and where to buy them?' },
    { icon: '📱', label: 'Farmer Apps',       prompt: 'Which mobile apps are most useful for Indian farmers?' },
  ],
};

const WELCOME = {
  hi: {
    title: '🙏 नमस्ते! मैं किसान साथी हूं।',
    body:  'आपकी खेती की हर समस्या में मदद करूंगा — फसल सलाह, सरकारी योजनाएं, कीट रोग, बाजार भाव, सिंचाई और बहुत कुछ। ऊपर दिए बटन दबाएं या नीचे अपना सवाल लिखें।',
  },
  en: {
    title: '🙏 Hello! I am Kisan Saathi.',
    body:  'I am here to help with all your farming questions — crop advice, government schemes, pest & disease, market prices, irrigation and much more. Tap a topic above or type your question below.',
  },
};

const UI = {
  hi: {
    placeholder:      'अपना सवाल लिखें...',
    hint:             'Enter दबाएं भेजने के लिए • Shift+Enter नई लाइन के लिए',
    topbarStatus:     'Online • मदद के लिए तैयार',
    topbarThinking:   'सोच रहा हूं...',
    serverOk:         'Server चल रहा है ✅',
    serverFail:       'Server बंद है — python app.py चलाएं',
    msgCount:         'संदेश',
    linksLabel:       'उपयोगी लिंक',
    clearBtn:         'बातचीत मिटाएं',
    statMsgs:         'संदेश',
    statModel:        'मॉडल',
    errorMsg:         '❌ माफ करना, कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।',
    serverError:      '❌ Server से जुड़ नहीं पाया। क्या आपने python app.py चलाया?',
  },
  en: {
    placeholder:      'Type your question...',
    hint:             'Press Enter to send • Shift+Enter for new line',
    topbarStatus:     'Online • Ready to help',
    topbarThinking:   'Thinking...',
    serverOk:         'Server running ✅',
    serverFail:       'Server offline — run python app.py',
    msgCount:         'Messages',
    linksLabel:       'Useful Links',
    clearBtn:         'Clear Chat',
    statMsgs:         'Messages',
    statModel:        'Model',
    errorMsg:         '❌ Sorry, something went wrong. Please try again.',
    serverError:      '❌ Cannot reach server. Did you run python app.py?',
  },
};


// ── SECTION 3: LANGUAGE SYSTEM ────────────────────────────────

/**
 * Switch the entire UI to the selected language.
 * Updates buttons, placeholders, and re-renders chips.
 * @param {string} lang - 'hi' or 'en'
 */
function setLanguage(lang) {
  currentLang = lang;

  // Update all four language buttons (2 in topbar + 2 in sidebar)
  ['btn-hi', 'sidebar-btn-hi'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', lang === 'hi');
  });
  ['btn-en', 'sidebar-btn-en'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', lang === 'en');
  });

  // Update the text input placeholder
  document.getElementById('user-input').placeholder = UI[lang].placeholder;
  document.getElementById('input-hint').textContent  = UI[lang].hint;

  // Update status and hint texts
  document.getElementById('topbar-status').textContent = UI[lang].topbarStatus;
  document.getElementById('stat-label-msgs').textContent = UI[lang].statMsgs;
  document.getElementById('stat-label-model').textContent = UI[lang].statModel;
  document.getElementById('links-label').textContent = UI[lang].linksLabel;
  document.getElementById('clear-btn-text').textContent = UI[lang].clearBtn;
  document.getElementById('model-badge').textContent = 'llama-3.3-70b-versatile';

  // Re-render topic chips in new language
  renderTopicChips();
}


// ── SECTION 4: TOPIC CHIPS ────────────────────────────────────

/**
 * Fill the topics bar with shortcut buttons.
 * Clicking a chip pre-fills and sends the prompt automatically.
 */
function renderTopicChips() {
  const bar = document.getElementById('topics-bar');
  bar.innerHTML = '';

  TOPICS[currentLang].forEach(topic => {
    const btn = document.createElement('button');
    btn.className = 'topic-chip';
    btn.textContent = `${topic.icon} ${topic.label}`;

    btn.addEventListener('click', () => {
      if (isStreaming) return;
      document.getElementById('user-input').value = topic.prompt;
      sendMessage();
    });

    bar.appendChild(btn);
  });
}


// ── SECTION 5: SEND MESSAGE + STREAMING ───────────────────────

/**
 * Main function called when user presses Send or hits Enter.
 * 
 * FLOW:
 *   1. Read & validate input
 *   2. Show user bubble
 *   3. Call Flask backend with fetch()
 *   4. Read streamed chunks with ReadableStream
 *   5. Append each chunk to a bot bubble in real time
 *   6. Save full response to history
 */
async function sendMessage() {
  if (isStreaming) return;

  const inputEl = document.getElementById('user-input');
  const text = inputEl.value.trim();
  if (!text) return;

  // Clear & reset textarea
  inputEl.value = '';
  autoResize(inputEl);

  // Show user's message on screen
  addUserBubble(text);

  // Add to conversation history
  conversationHistory.push({ role: 'user', content: text });

  // Update session message counter
  messageCount++;
  document.getElementById('msg-count').textContent = messageCount;

  // Lock UI while waiting
  isStreaming = true;
  setTopbarStatus('thinking');
  setServerDot('thinking');
  document.getElementById('send-btn').disabled = true;

  // Create an empty bot bubble that will fill as chunks arrive
  // Returns the bubble element so we can append text to it
  const { bubble, row } = createEmptyBotBubble();

  // Accumulate the full response text
  let fullResponse = '';

  try {
    /*
      fetch() sends an HTTP POST request to our Flask backend.
      We pass the message text, full history, and language.
      Flask responds with a stream of SSE events.
    */
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(-20), // send last 20 turns (to limit size)
        lang:    currentLang,
      }),
    });

    if (!response.ok) {
      // HTTP error (e.g. 500 Internal Server Error)
      throw new Error(`Server returned ${response.status}`);
    }

    /*
      READING THE STREAM:
      
      response.body is a ReadableStream — a continuous flow of bytes.
      We use a "reader" to pull chunks one at a time.
      
      Each chunk is a Uint8Array (raw bytes). We decode it to text with
      TextDecoder, then parse the SSE lines.
      
      SSE format from our Flask server:
        data: {"chunk": "Hello"}\n\n
        data: {"chunk": " farmer"}\n\n
        data: [DONE]\n\n
    */
    const reader  = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    // Add blinking cursor to show streaming is active
    bubble.classList.add('streaming-cursor');

    while (true) {
      // Pull the next chunk from the stream
      // done=true means stream has ended
      const { done, value } = await reader.read();
      if (done) break;

      // Convert raw bytes to a string
      const chunkText = decoder.decode(value, { stream: true });

      // Split on double-newline (SSE event separator)
      const lines = chunkText.split('\n');

      for (const line of lines) {
        // SSE lines begin with "data: "
        if (!line.startsWith('data: ')) continue;

        // Extract the JSON payload after "data: "
        const payload = line.slice(6).trim();

        // "[DONE]" signals end of stream
        if (payload === '[DONE]') break;

        try {
          // Parse the JSON: { chunk: "..." } or { error: "..." }
          const parsed = JSON.parse(payload);

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.chunk) {
            // Accumulate the text
            fullResponse += parsed.chunk;

            // Render Markdown → HTML and update the bubble live
            bubble.innerHTML = markdownToHTML(fullResponse);

            // Auto-scroll to keep latest text visible
            scrollToBottom();
          }
        } catch (parseErr) {
          // Ignore malformed JSON chunks (can happen mid-stream)
          console.warn('Chunk parse error:', parseErr.message);
        }
      }
    }

    // Remove blinking cursor when done
    bubble.classList.remove('streaming-cursor');

    // Save full bot response to history for context in next turn
    if (fullResponse) {
      conversationHistory.push({ role: 'assistant', content: fullResponse });
    }

  } catch (err) {
    /*
      Error handling: network failure, server error, etc.
      Remove the empty streaming bubble and show an error bubble.
    */
    console.error('Streaming error:', err);
    row.remove();   // Remove the empty/partial bubble

    // Distinguish between "server not running" and other errors
    const isNetworkError = err.message.includes('fetch') || err.message.includes('Failed to fetch');
    const errorMsg = isNetworkError
      ? UI[currentLang].serverError
      : UI[currentLang].errorMsg;

    addBotBubble(errorMsg, 'error');
    setServerDot('offline');
  }

  // Re-enable UI
  isStreaming = false;
  setTopbarStatus('online');
  setServerDot('online');
  document.getElementById('send-btn').disabled = false;

  // Return focus to input
  document.getElementById('user-input').focus();
}


// ── SECTION 6: MESSAGE RENDERING ──────────────────────────────

/**
 * Add a user message bubble (green, right side).
 * @param {string} text - Plain text message
 */
function addUserBubble(text) {
  const container = document.getElementById('messages');

  const row = document.createElement('div');
  row.className = 'msg-row user';

  const avatar = createAvatar('user');
  const bubble = document.createElement('div');
  bubble.className = 'bubble user-bubble';
  bubble.textContent = text;  // textContent (not innerHTML) prevents XSS

  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollToBottom();
}

/**
 * Add a complete bot bubble with HTML content.
 * Used for welcome messages and error messages.
 * @param {string} html   - HTML content to display
 * @param {string} type   - 'normal' | 'error'
 */
function addBotBubble(html, type = 'normal') {
  const container = document.getElementById('messages');

  const row = document.createElement('div');
  row.className = 'msg-row bot';

  const avatar = createAvatar('bot');
  const bubble = document.createElement('div');
  bubble.className = 'bubble bot-bubble' + (type === 'error' ? ' error-bubble' : '');
  bubble.innerHTML = html;   // innerHTML safe here — our own content

  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollToBottom();
}

/**
 * Create an empty bot bubble for streaming into.
 * Returns both the row (for removal on error) and bubble (to fill).
 * @returns {{ row: HTMLElement, bubble: HTMLElement }}
 */
function createEmptyBotBubble() {
  const container = document.getElementById('messages');

  const row = document.createElement('div');
  row.className = 'msg-row bot';

  const avatar = createAvatar('bot');
  const bubble = document.createElement('div');
  bubble.className = 'bubble bot-bubble';

  // Start with animated typing dots while first chunk loads
  const typingHTML = `
    <div class="typing-indicator" aria-label="Kisan Saathi is typing">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  bubble.innerHTML = typingHTML;

  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollToBottom();

  return { row, bubble };
}

/**
 * Create an avatar element for bot or user.
 * @param {'bot'|'user'} type
 * @returns {HTMLElement}
 */
function createAvatar(type) {
  const el = document.createElement('div');
  el.className = `avatar ${type}-avatar`;
  el.textContent = type === 'bot' ? '🌾' : '👨‍🌾';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * Build HTML for the initial welcome message card.
 * @returns {string} HTML string
 */
function buildWelcomeHTML() {
  const w = WELCOME[currentLang];
  return `
    <div class="welcome-card">
      <span class="welcome-title">${w.title}</span>
      <span class="welcome-body">${w.body}</span>
    </div>`;
}


// ── SECTION 7: MARKDOWN → HTML CONVERTER ─────────────────────
/*
  The model responds with simple Markdown:
    **bold**, *italic*, - bullet lists, numbered lists

  We convert this to HTML for rendering in the browser.
  This is a lightweight custom converter (no library needed).
*/

/**
 * Convert Markdown text to safe HTML.
 * @param {string} text - Markdown from the model
 * @returns {string} - HTML string
 */
function markdownToHTML(text) {
  if (!text) return '';

  // Step 1: Escape raw HTML (security — prevent injection)
  let h = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Step 2: Bold **text** → <strong>
  h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Step 3: Italic *text* → <em> (skip **)
  h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // Step 4: Bullet list lines → <li>
  h = h.replace(/^[\-•]\s+(.+)$/gm, '<li>$1</li>');

  // Step 5: Numbered list lines → <li>
  h = h.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Step 6: Wrap <li> groups in <ul>
  h = h.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => `<ul>${match}</ul>`);

  // Step 7: Double newlines → paragraph break
  h = h.replace(/\n\n/g, '<br><br>');

  // Step 8: Single newlines → <br>
  h = h.replace(/\n/g, '<br>');

  return h;
}


// ── SECTION 8: UI HELPERS ─────────────────────────────────────

/**
 * Set the topbar status text.
 * @param {'online'|'thinking'} state
 */
function setTopbarStatus(state) {
  const el = document.getElementById('topbar-status');
  if (!el) return;
  el.textContent = state === 'thinking'
    ? UI[currentLang].topbarThinking
    : UI[currentLang].topbarStatus;
}

/**
 * Update the server status dot color.
 * @param {'online'|'thinking'|'offline'} state
 */
function setServerDot(state) {
  const dot  = document.getElementById('server-dot');
  const text = document.getElementById('server-status-text');
  if (!dot) return;

  dot.className = 'status-dot ' + (state === 'online' ? '' : state);
  if (state === 'online') {
    text.textContent = UI[currentLang].serverOk;
  } else if (state === 'thinking') {
    text.textContent = UI[currentLang].topbarThinking;
  } else {
    text.textContent = UI[currentLang].serverFail;
  }
}

/**
 * Smoothly scroll the messages container to the bottom.
 */
function scrollToBottom() {
  const container = document.getElementById('messages');
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

/**
 * Auto-resize the textarea as the user types.
 * Textarea grows up to max-height then starts scrolling.
 * @param {HTMLTextAreaElement} el
 */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/**
 * Handle keydown in the textarea.
 * Enter → send | Shift+Enter → new line
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();  // prevent actual newline
    sendMessage();
  }
}

/**
 * Toggle the sidebar on mobile (open/close).
 */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');

  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('visible', !isOpen);
}

/**
 * Clear all messages and reset conversation.
 * Also calls the /api/clear endpoint for logging.
 */
async function clearConversation() {
  // Reset state
  conversationHistory = [];
  messageCount = 0;
  document.getElementById('msg-count').textContent = '0';

  // Clear the messages container
  document.getElementById('messages').innerHTML = '';

  // Show fresh welcome message
  addBotBubble(buildWelcomeHTML());

  // Notify backend (optional — for logging purposes)
  try {
    await fetch('/api/clear', { method: 'POST' });
  } catch (_) {
    // Ignore — clearing is client-side anyway
  }

  // Close sidebar on mobile after clearing
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}


// ── SECTION 9: SERVER HEALTH CHECK ────────────────────────────

/**
 * On startup, ping the Flask health endpoint to verify
 * the server is running and the API key is configured.
 * Updates the sidebar server status accordingly.
 */
async function checkServerHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();

    if (data.status === 'ok') {
      setServerDot('online');
      if (data.model) {
        document.getElementById('model-badge').textContent = data.model;
      }

      // Warn if API key isn't configured on the server
      if (!data.api_key_set) {
        const msg = currentLang === 'hi'
          ? '⚠️ Server चल रहा है लेकिन GROQ_API_KEY .env में नहीं है!'
          : '⚠️ Server is running but GROQ_API_KEY is not set in .env!';
        addBotBubble(msg, 'error');
      }
    }
  } catch (_) {
    // Server not running
    setServerDot('offline');
    const msg = currentLang === 'hi'
      ? '⚠️ Server नहीं मिला। VS Code terminal में <strong>python app.py</strong> चलाएं।'
      : '⚠️ Server not found. Run <strong>python app.py</strong> in the VS Code terminal.';
    addBotBubble(msg, 'error');
  }
}


// ── SECTION 10: INITIALIZATION ────────────────────────────────
/*
  DOMContentLoaded fires once the browser has fully parsed the HTML.
  It's safe to access all elements at this point.
*/
document.addEventListener('DOMContentLoaded', () => {

  // 1. Render quick topic chips (default: Hindi)
  renderTopicChips();

  // 2. Show welcome message
  addBotBubble(buildWelcomeHTML());

  // 3. Check if Flask server is healthy
  checkServerHealth();

  // 4. Set initial UI text
  setLanguage('hi');

  // 5. Focus the input
  setTimeout(() => {
    document.getElementById('user-input').focus();
  }, 300);

  console.log('✅ Kisan Saathi frontend ready!');
  console.log('📡 Backend: http://localhost:8080/api/chat');
  console.log('🌾 Language:', currentLang);
});
