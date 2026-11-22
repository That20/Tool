// ===========================================================================
// POPUP CONTROLLER LOGIC - My AdBlocker (Manifest V3)
// Refactored to use Shared API (Single Source of Truth) as per Phase 1.
// ===========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  // ==== DOM ELEMENTS ========================================================
  const masterToggle = document.getElementById("masterToggle");
  const heroSection = document.getElementById("heroSection");
  const headerStatusBadge = document.getElementById("headerStatusBadge");
  const statusHeadline = document.getElementById("statusHeadline");
  const statusSubtext = document.getElementById("statusSubtext");

  const pageBlockedCount = document.getElementById("pageBlockedCount");
  const totalBlockedCount = document.getElementById("totalBlockedCount");
  const trackerStatsCount = document.getElementById("trackerStatsCount");

  const currentSiteDomain = document.getElementById("currentSiteDomain");
  const siteProtectionText = document.getElementById("siteProtectionText");
  const toggleSiteBtn = document.getElementById("toggleSiteBtn");
  const siteActionText = document.getElementById("siteActionText");

  const filterNetwork = document.getElementById("filterNetwork");
  const filterCosmetic = document.getElementById("filterCosmetic");
  const filterTrackers = document.getElementById("filterTrackers");

  const toggleDomainsManagerBtn = document.getElementById("toggleDomainsManagerBtn");
  const domainsManagerBody = document.getElementById("domainsManagerBody");
  const tabWhitelistBtn = document.getElementById("tabWhitelistBtn");
  const tabCustomBlockBtn = document.getElementById("tabCustomBlockBtn");
  const whitelistCount = document.getElementById("whitelistCount");
  const customBlockCount = document.getElementById("customBlockCount");
  const domainInput = document.getElementById("domainInput");
  const addDomainBtn = document.getElementById("addDomainBtn");
  const domainInputError = document.getElementById("domainInputError");
  const domainItemsList = document.getElementById("domainItemsList");
  const domainEmptyState = document.getElementById("domainEmptyState");

  const reloadPageBtn = document.getElementById("reloadPageBtn");
  const resetCounterBtn = document.getElementById("resetCounterBtn");
  const openDashboardBtn = document.getElementById("openDashboardBtn");

  // ==== ENV CHECK ==========================================================
  const isExtensionEnv = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;

  // ==== STATE ==============================================================
  let currentTab = null;
  let currentHostname = "";
  let whitelistedList = [];
  let customBlockedList = [];
  let currentDomainTab = "whitelist"; // 'whitelist' | 'customBlock'

  // Helper: refresh UI from full state object returned by background.
  async function refreshUI() {
    const resp = await api.state();
    if (!resp.success) {
      console.error("Failed to get state:", resp.error);
      return;
    }
    const st = resp.state;
    // Flags
    masterToggle.checked = st.enabled;
    filterNetwork.checked = st.filterNetwork;
    filterCosmetic.checked = st.filterCosmetic;
    filterTrackers.checked = st.filterTrackers;
    // Lists
    whitelistedList = st.whitelistedDomains || [];
    customBlockedList = st.customBlockedDomains || [];
    // UI updates
    updateHeroUI(st.enabled);
    updateSiteStatusUI();
    updateDomainCounts();
    renderDomainList();
    // Stats (real-time per‑tab stats are requested separately)
    requestRealStats();
  }

  // ==== INITIALISE =========================================================
  // 1. Load current tab info (hostname)
  if (isExtensionEnv && chrome.tabs) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].url) {
        const urlObj = new URL(tabs[0].url);
        if (urlObj.protocol.startsWith("http")) {
          currentHostname = urlObj.hostname.toLowerCase();
          currentSiteDomain.textContent = currentHostname;
        } else {
          currentHostname = "";
          currentSiteDomain.textContent = "Trang hệ thống";
          siteProtectionText.textContent = "Không áp dụng bộ lọc";
          toggleSiteBtn.style.display = "none";
        }
      }
    } catch (e) {
      console.warn("[My AdBlocker] Không thể truy cập tab:", e);
      currentSiteDomain.textContent = "Không xác định";
    }
  } else {
    // Preview mode – use a placeholder domain
    currentHostname = "vnexpress.net";
    currentSiteDomain.textContent = currentHostname;
  }

  // 2. Load full extension state via shared API
  await refreshUI();

  // ==== STORAGE CHANGE LISTENER (sync UI across popup & dashboard) ========
  if (isExtensionEnv && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        // Re‑fetch the whole state to stay consistent.
        refreshUI();
      }
    });
  }

  // ==== UI HELPERS =========================================================

const animateTimers = new WeakMap();

function animateNumber(element, target) {
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    element.textContent = target.toString();
    return;
  }
  // Clear previous timer if any
  const prev = animateTimers.get(element);
  if (prev) clearInterval(prev);

  const current = parseInt(element.textContent, 10) || 0;
  if (current === target) {
    element.textContent = target.toString();
    return;
  }
  const diff = target - current;
  const step = Math.ceil(Math.abs(diff) / 10) * (diff > 0 ? 1 : -1);
  let val = current;
  const interval = setInterval(() => {
    val += step;
    if ((step > 0 && val >= target) || (step < 0 && val <= target)) {
      val = target;
      clearInterval(interval);
    }
    element.textContent = val.toString();
  }, 25);
  animateTimers.set(element, interval);
}
  function updateHeroUI(isEnabled) {
    if (isEnabled) {
      heroSection.classList.remove("is-paused");
      headerStatusBadge.classList.remove("is-paused");
      headerStatusBadge.textContent = "Đang chạy";
    } else {
      heroSection.classList.add("is-paused");
      headerStatusBadge.classList.add("is-paused");
      headerStatusBadge.textContent = "Tạm dừng";
    }
  }

  function updateSiteStatusUI() {
    const isWhitelisted = api.matchEntry(currentHostname, whitelistedList);
    if (isWhitelisted) {
      siteProtectionText.textContent = "Đã tạm dừng trên trang này";
      toggleSiteBtn.textContent = "Bỏ tạm dừng";
    } else {
      siteProtectionText.textContent = "Đang bảo vệ";
      toggleSiteBtn.textContent = "Tạm dừng trang này";
    }
  }

  function updateDomainCounts() {
    whitelistCount.textContent = whitelistedList.length.toString();
    customBlockCount.textContent = customBlockedList.length.toString();
  }

  function renderDomainList() {
    // Use shared API helper for consistency.
    api.renderDomainList(domainItemsList,
      currentDomainTab === "whitelist" ? whitelistedList : customBlockedList,
      (domain) => {
        // Delete handler – delegate to background.
        api.listRemove(currentDomainTab, domain).then((res) => {
          if (!res.success) {
            domainInputError.textContent = res.error || "Lỗi khi xóa tên miền";
            domainInputError.style.display = "block";
            return;
          }
          if (currentDomainTab === "whitelist") {
            whitelistedList = res.domains;
          } else {
            customBlockedList = res.domains;
          }
          updateDomainCounts();
          renderDomainList();
        });
      }
    );
    // Empty state handling
    if ((currentDomainTab === "whitelist" ? whitelistedList : customBlockedList).length === 0) {
      domainEmptyState.style.display = "block";
      domainItemsList.style.display = "none";
    } else {
      domainEmptyState.style.display = "none";
      domainItemsList.style.display = "flex";
    }
  }

  function showDomainError(msg) {
    domainInputError.textContent = msg;
    domainInputError.style.display = "block";
  }
  function clearDomainError() {
    domainInputError.textContent = "";
    domainInputError.style.display = "none";
  }

  function requestRealStats() {
    if (!isExtensionEnv || !currentTab || !currentTab.id) return;
    api.send({ action: "get_stats", tabId: currentTab.id }).then((stats) => {
      if (!stats) return; // background may return undefined on error
      pageBlockedCount && animateNumber(pageBlockedCount, stats.pageBlocked || 0);
      totalBlockedCount && animateNumber(totalBlockedCount, stats.totalBlocked || 0);
      if (trackerStatsCount) trackerStatsCount.textContent = (stats.trackersBlocked || 0).toString();
    });
  }

  // ==== EVENT HANDLERS =====================================================
  // Master toggle
  masterToggle.addEventListener("change", async () => {
    const isEnabled = masterToggle.checked;
    updateHeroUI(isEnabled);
    await api.setFlag("enabled", isEnabled);
    requestRealStats();
  });

  // Filter checkboxes
  filterNetwork.addEventListener("change", () => api.setFlag("filterNetwork", filterNetwork.checked));
  filterCosmetic.addEventListener("change", () => api.setFlag("filterCosmetic", filterCosmetic.checked));
  filterTrackers.addEventListener("change", () => api.setFlag("filterTrackers", filterTrackers.checked));

  // Toggle site (whitelist / un‑whitelist)
  toggleSiteBtn.addEventListener("click", async () => {
    if (!currentHostname) return;
    const alreadyWhitelisted = api.matchEntry(currentHostname, whitelistedList);
    if (alreadyWhitelisted) {
      const resp = await api.listRemove("whitelist", currentHostname);
      if (resp.success) {
        whitelistedList = resp.domains;
        updateSiteStatusUI();
        updateDomainCounts();
        if (currentDomainTab === "whitelist") renderDomainList();
      } else {
        showDomainError(resp.error || "Lỗi khi bỏ whitelist");
      }
    } else {
      const resp = await api.listAdd("whitelist", currentHostname);
      if (resp.success) {
        whitelistedList = resp.domains;
        updateSiteStatusUI();
        updateDomainCounts();
        if (currentDomainTab === "whitelist") renderDomainList();
      } else {
        showDomainError(resp.error || "Lỗi khi thêm whitelist");
      }
    }
  });

  // Domains manager UI toggle
  toggleDomainsManagerBtn.addEventListener("click", () => {
    const isExpanded = toggleDomainsManagerBtn.getAttribute("aria-expanded") === "true";
    toggleDomainsManagerBtn.setAttribute("aria-expanded", String(!isExpanded));
    domainsManagerBody.style.display = isExpanded ? "none" : "block";
  });
  toggleDomainsManagerBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleDomainsManagerBtn.click();
    }
  });

  // Tab switch between whitelist / custom block
  tabWhitelistBtn.addEventListener("click", () => {
    currentDomainTab = "whitelist";
    tabWhitelistBtn.classList.add("is-active");
    tabCustomBlockBtn.classList.remove("is-active");
    domainInput.placeholder = "Nhập domain Whitelist (vd: example.com)…";
    clearDomainError();
    renderDomainList();
  });
  tabCustomBlockBtn.addEventListener("click", () => {
    currentDomainTab = "customBlock";
    tabCustomBlockBtn.classList.add("is-active");
    tabWhitelistBtn.classList.remove("is-active");
    domainInput.placeholder = "Nhập domain cần chặn (vd: bad-ads.com)…";
    clearDomainError();
    renderDomainList();
  });

  // Add domain button
  addDomainBtn.addEventListener("click", handleAddDomain);
  domainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddDomain();
    }
  });

  async function handleAddDomain() {
    clearDomainError();
    const raw = domainInput.value.trim();
    if (!raw) {
      showDomainError("Vui lòng nhập tên miền.");
      return;
    }
    // Simple normalisation – background will validate.
    const domain = raw.toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
    if (!domain || !domain.includes(".") || domain.length < 3) {
      showDomainError("Tên miền không hợp lệ (ví dụ: dantri.com.vn).",
      );
      return;
    }
    const listName = currentDomainTab === "whitelist" ? "whitelist" : "customBlock";
    const resp = await api.listAdd(listName, domain);
    if (!resp.success) {
      showDomainError(resp.error || "Lỗi khi thêm tên miền");
      return;
    }
    if (listName === "whitelist") {
      whitelistedList = resp.domains;
    } else {
      customBlockedList = resp.domains;
    }
    domainInput.value = "";
    updateDomainCounts();
    renderDomainList();
    if (currentHostname === domain && listName === "whitelist") {
      updateSiteStatusUI();
    }
  }

  // Reload page button – kept for convenience
  if (reloadPageBtn) {
    reloadPageBtn.addEventListener("click", () => {
      if (isExtensionEnv && chrome.tabs && currentTab && currentTab.id) {
        chrome.tabs.reload(currentTab.id);
      }
    });
  }

  // Reset counter button – delegates to background directly.
  if (resetCounterBtn) {
    resetCounterBtn.addEventListener("click", () => {
      api.send({ action: "reset_stats" }).then(() => {
        totalBlockedCount.textContent = "0";
        pageBlockedCount.textContent = "0";
        trackerStatsCount && (trackerStatsCount.textContent = "0");
      });
    });
  }

  // Open dashboard – unchanged.
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("dashboard.html", "_blank");
      }
    });
  }
});
