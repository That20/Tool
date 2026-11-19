// ==========================================================================
// CONTENT SCRIPT - My AdBlocker
// Kiểm tra trạng thái Whitelist và Bộ lọc Cosmetic trên từng trang web
// ==========================================================================

(function () {
  const currentHost = window.location.hostname.toLowerCase();

  function applyCosmeticState() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get([
      "enabled",
      "filterCosmetic",
      "whitelistedDomains"
    ], (res) => {
      const isEnabled = res.enabled !== false;
      const isCosmeticActive = res.filterCosmetic !== false;
      const whitelisted = res.whitelistedDomains || [];
      const isSiteWhitelisted = whitelisted.some(d => currentHost === d || currentHost.endsWith("." + d));

      if (!isEnabled || !isCosmeticActive || isSiteWhitelisted) {
        document.documentElement.setAttribute("data-adblock-disabled", "true");
      } else {
        document.documentElement.removeAttribute("data-adblock-disabled");
      }
    });
  }

  // Áp dụng ngay khi DOM sẵn sàng
  applyCosmeticState();

  // Lắng nghe khi storage thay đổi (ví dụ: người dùng vừa bấm Tạm dừng trong popup)
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        applyCosmeticState();
      }
    });
  }
})();
