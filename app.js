const STORAGE_KEY = 'relay-conversations-v1';
const MAX_HISTORY = 40;

const elements = {
  chatScroll: document.querySelector('#chatScroll'),
  welcomeView: document.querySelector('#welcomeView'),
  messageList: document.querySelector('#messageList'),
  form: document.querySelector('#chatForm'),
  input: document.querySelector('#messageInput'),
  sendButton: document.querySelector('#sendButton'),
  charCount: document.querySelector('#charCount'),
  conversationList: document.querySelector('#conversationList'),
  emptyHistory: document.querySelector('#emptyHistory'),
  pageTitle: document.querySelector('#pageTitle'),
  toast: document.querySelector('#toast'),
  dialog: document.querySelector('#confirmDialog'),
};

let conversations = loadConversations();
let activeId = null;
let busy = false;
let toastTimer;

function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && Array.isArray(item.messages)) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    showToast('Could not save conversations in this browser.');
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function titleFromMessage(content) {
  const line = content.trim().replace(/\s+/g, ' ');
  return line.length > 34 ? `${line.slice(0, 34).trimEnd()}...` : line;
}

function createConversation() {
  const conversation = { id: makeId(), title: 'New conversation', messages: [], updatedAt: Date.now() };
  conversations.unshift(conversation);
  activeId = conversation.id;
  persist();
  renderAll();
  elements.input.focus();
}

function currentConversation() {
  return conversations.find((item) => item.id === activeId);
}

function renderAll() {
  renderSidebar();
  renderMessages();
}

function renderSidebar() {
  elements.conversationList.replaceChildren();
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_HISTORY);
  elements.emptyHistory.hidden = sorted.length > 0;
  for (const conversation of sorted) {
    const row = document.createElement('div');
    row.className = `conversation-item${conversation.id === activeId ? ' active' : ''}`;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-current', conversation.id === activeId ? 'page' : 'false');
    row.title = conversation.title;

    const icon = document.createElement('i');
    icon.dataset.lucide = 'messages-square';
    const label = document.createElement('span');
    label.textContent = conversation.title;
    const remove = document.createElement('button');
    remove.className = 'delete-conversation';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${conversation.title}`);
    remove.title = 'Delete conversation';
    const removeIcon = document.createElement('i');
    removeIcon.dataset.lucide = 'x';
    remove.append(removeIcon);

    row.append(icon, label, remove);
    row.addEventListener('click', (event) => {
      if (event.target.closest('.delete-conversation')) return;
      activeId = conversation.id;
      renderAll();
      closeSidebar();
    });
    row.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === row) {
        event.preventDefault();
        activeId = conversation.id;
        renderAll();
        closeSidebar();
      }
    });
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteConversation(conversation.id);
    });
    elements.conversationList.append(row);
  }
  refreshIcons();
}

function renderMessages() {
  const conversation = currentConversation();
  const messages = conversation?.messages || [];
  elements.welcomeView.hidden = messages.length > 0;
  elements.messageList.replaceChildren();
  elements.pageTitle.textContent = conversation?.title || 'New conversation';

  for (const message of messages) {
    elements.messageList.append(createMessageElement(message));
  }
  refreshIcons();
  scrollToBottom();
}

function createMessageElement(message) {
  const article = document.createElement('article');
  article.className = `message ${message.role}`;

  if (message.role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'message-body';
    bubble.textContent = message.content;
    article.append(bubble);
    return article;
  }

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  const avatarIcon = document.createElement('i');
  avatarIcon.dataset.lucide = 'audio-lines';
  avatar.append(avatarIcon);

  const body = document.createElement('div');
  body.className = 'message-body';
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = 'Relay';
  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerHTML = renderMarkdown(message.content);
  const tools = document.createElement('div');
  tools.className = 'message-tools';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.title = 'Copy response';
  copyButton.setAttribute('aria-label', 'Copy response');
  const copyIcon = document.createElement('i');
  copyIcon.dataset.lucide = 'copy';
  copyButton.append(copyIcon, document.createTextNode('Copy'));
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      showToast('Response copied.');
    } catch {
      showToast('Clipboard access is unavailable in this browser.');
    }
  });
  tools.append(copyButton);
  body.append(label, content, tools);
  article.append(avatar, body);
  return article;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function renderMarkdown(source) {
  const codeBlocks = [];
  let text = escapeHtml(source).replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${code.trimEnd()}</code></pre>`) - 1;
    return `@@CODE${index}@@`;
  });
  text = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(?:<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`)
    .split(/\n{2,}/)
    .map((block) => block.startsWith('<h') || block.startsWith('<ul>') || block.startsWith('@@CODE')
      ? block
      : `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return text.replace(/@@CODE(\d+)@@/g, (_, index) => codeBlocks[Number(index)]);
}

function renderTyping() {
  const article = document.createElement('article');
  article.className = 'message assistant typing-message';
  article.innerHTML = '<div class="message-avatar"><i data-lucide="audio-lines"></i></div><div class="message-body"><div class="message-label">Relay is thinking</div><div class="typing-indicator" aria-label="Assistant is responding"><span></span><span></span><span></span></div></div>';
  elements.messageList.append(article);
  refreshIcons();
  scrollToBottom();
  return article;
}

function scrollToBottom() {
  requestAnimationFrame(() => { elements.chatScroll.scrollTop = elements.chatScroll.scrollHeight; });
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2800);
}

function setBusy(value) {
  busy = value;
  elements.sendButton.disabled = value;
  elements.sendButton.innerHTML = value ? '<i data-lucide="loader-circle"></i>' : '<i data-lucide="arrow-up"></i>';
  if (value) elements.sendButton.querySelector('svg')?.classList.add('spin');
  refreshIcons();
}

async function sendMessage(content) {
  const text = content.trim();
  if (!text || busy) return;
  if (!currentConversation()) createConversation();
  const conversation = currentConversation();
  conversation.messages.push({ role: 'user', content: text });
  if (conversation.messages.filter((message) => message.role === 'user').length === 1) {
    conversation.title = titleFromMessage(text);
  }
  conversation.updatedAt = Date.now();
  persist();
  renderAll();
  elements.input.value = '';
  updateInput();

  setBusy(true);
  const typing = renderTyping();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation.messages }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The message could not be sent.');
    conversation.messages.push({ role: 'assistant', content: result.content });
    conversation.updatedAt = Date.now();
    persist();
  } catch (error) {
    conversation.messages.push({ role: 'assistant', content: `**I couldn’t get a reply.** ${error.message}` });
    conversation.updatedAt = Date.now();
    persist();
  } finally {
    typing.remove();
    setBusy(false);
    renderAll();
    elements.input.focus();
  }
}

function updateInput() {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 160)}px`;
  const count = elements.input.value.length;
  elements.charCount.textContent = count > 10000 ? `${count.toLocaleString()} / 12,000` : '';
}

function deleteConversation(id) {
  conversations = conversations.filter((conversation) => conversation.id !== id);
  if (activeId === id) activeId = null;
  persist();
  renderAll();
}

function openSidebar() {
  document.querySelector('#sidebar').classList.add('open');
  document.querySelector('#mobileBackdrop').classList.add('visible');
}

function closeSidebar() {
  document.querySelector('#sidebar').classList.remove('open');
  document.querySelector('#mobileBackdrop').classList.remove('visible');
}

async function checkConnection() {
  const dot = document.querySelector('#statusDot');
  const title = document.querySelector('#connectionTitle');
  const detail = document.querySelector('#connectionDetail');
  try {
    const response = await fetch('/api/health');
    const health = await response.json();
    dot.className = `status-dot ${health.configured ? 'online' : 'offline'}`;
    title.textContent = health.configured ? 'Groq is ready' : 'API key needed';
    detail.textContent = health.configured ? 'Qwen 3.8 · Groq' : 'Add your Groq key to connect';
  } catch {
    dot.className = 'status-dot offline';
    title.textContent = 'Connection unavailable';
    detail.textContent = 'Could not reach the local server';
  }
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage(elements.input.value);
});
elements.input.addEventListener('input', updateInput);
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});
document.querySelector('#newChat').addEventListener('click', () => { createConversation(); closeSidebar(); });
document.querySelector('#clearChat').addEventListener('click', () => {
  if (!currentConversation()) return showToast('There is no active conversation to clear.');
  deleteConversation(activeId);
  showToast('Conversation cleared.');
});
document.querySelector('#clearHistory').addEventListener('click', () => {
  if (!conversations.length) return showToast('There are no saved conversations.');
  elements.dialog.showModal();
});
document.querySelector('#confirmClear').addEventListener('click', (event) => {
  if (event.submitter?.value === 'cancel') return;
  conversations = [];
  activeId = null;
  persist();
  renderAll();
  showToast('All conversations cleared.');
});
document.querySelector('#promptGrid').addEventListener('click', (event) => {
  const card = event.target.closest('[data-prompt]');
  if (card) sendMessage(card.dataset.prompt);
});
document.querySelector('#openSidebar').addEventListener('click', openSidebar);
document.querySelector('#closeSidebar').addEventListener('click', closeSidebar);
document.querySelector('#mobileBackdrop').addEventListener('click', closeSidebar);
document.querySelector('#connectionInfo').addEventListener('click', () => {
  showToast('Your Groq API key stays on this server. Chats are saved only in this browser.');
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    createConversation();
  }
  if (event.key === 'Escape') closeSidebar();
});

function initialize() {
  const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  activeId = latest?.id || null;
  renderAll();
  refreshIcons();
  checkConnection();
}

initialize();