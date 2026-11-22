// Shared API helper for Chrome extension messaging
// Provides Promise‑based wrappers around chrome.runtime.sendMessage

const api = {
  send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  },
  state() {
    return this.send({ action: 'get_state' });
  },
  setFlag(name, value) {
    return this.send({ action: 'set_flag', name, value });
  },
  listAdd(list, domain) {
    return this.send({ action: 'list_add', list, domain });
  },
  listRemove(list, domain) {
    return this.send({ action: 'list_remove', list, domain });
  },
  // Helper to match a hostname against a list (whitelist/customBlock)
  matchEntry(host, list) {
    return list.find(d => host === d || host.endsWith('.' + d));
  },
  // Render domain list into a <ul> element
  renderDomainList(ul, items, onRemove) {
    // Clear
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    items.forEach((domain) => {
      const li = document.createElement('li');
      li.className = 'domain-item';
      const span = document.createElement('span');
      span.textContent = domain;
      span.className = 'domain-item-text';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'domain-item-del';
      btn.setAttribute('aria-label', `Xóa ${domain}`);
      btn.textContent = '×';
      btn.addEventListener('click', () => onRemove(domain));
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  },
};

// Export to global (used via <script>)
window.api = api;
