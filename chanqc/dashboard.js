// ===========================================================================
// DASHBOARD CONTROLLER LOGIC - My AdBlocker (Manifest V3)
// Refactored to use Shared API (Single Source of Truth) as per Phase 1.
// ===========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  // ==== DOM ELEMENTS ========================================================
  const dashMenuBtn = document.getElementById("dashMenuBtn");
  const dashNavLinks = document.getElementById("dashNavLinks");
  const dashStatusBadge = document.getElementById("dashStatusBadge");
  const dashResetStatsBtn = document.getElementById("dashResetStatsBtn");

  const dashHero = document.getElementById("dashHero");
  const dashHeadline = document.getElementById("dashHeadline");
  const dashSubtext = document.getElementById("dashSubtext");
  const dashMasterToggle = document.getElementById("dashMasterToggle");

  const dashFilterNetwork = document.getElementById("dashFilterNetwork");
  const dashFilterCosmetic = document.getElementById("dashFilterCosmetic");
  const dashFilterTrackers = document.getElementById("dashFilterTrackers");

  const dashTotalCount = document.getElementById("dashTotalCount");
  const dashTrackersCount = document.getElementById("dashTrackersCount");
  const dashAdsCount = document.getElementById("dashAdsCount");

  const dashTabWhitelistBtn = document.getElementById("dashTabWhitelistBtn");
  const dashTabCustomBlockBtn = document.getElementById("dashTabCustomBlockBtn");
  const dashWhitelistCount = document.getElementById("dashWhitelistCount");
  const dashCustomBlockCount = document.getElementById("dashCustomBlockCount");

  const dashDomainInput = document.getElementById("dashDomainInput");
  const dashAddDomainBtn = document.getElementById("dashAddDomainBtn");
  const dashDomainError = document.getElementById("dashDomainError");
  const dashTableBody = document.getElementById("dashTableBody");
  const dashEmptyState = document.getElementById("dashEmptyState");

  // ==== ENV CHECK ==========================================================
  const isExtensionEnv = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;

  // ==== STATE ==============================================================
  let whitelistedList = [];
  let customBlockedList = [];
  let currentTab = "whitelist"; // 'whitelist' | 'customBlock'

  // ==== UI HELPERS =========================================================
  async function refreshUI() {
    const resp = await api.state();
    if (!resp.success) {
      console.error("Failed to fetch state:", resp.error);
      return;
    }
    const st = resp.state;
    // Flags
    dashMasterToggle.checked = st.enabled;
    dashFilterNetwork.checked = st.filterNetwork;
    dashFilterCosmetic.checked = st.filterCosmetic;
    dashFilterTrackers.checked = st.filterTrackers;
    // Lists
    whitelistedList = st.whitelistedDomains || [];
    customBlockedList = st.customBlockedDomains || [];
    // Stats
    dashTotalCount.textContent = (st.totalBlocked || 0).toLocaleString();
    dashTrackersCount.textContent = (st.trackersBlocked || 0).toLocaleString();
    dashAdsCount.textContent = (st.adsBlocked || 0).toLocaleString();
    // UI updates
    updateHeroState(st.enabled);
    updateCounts();
    renderTable();
  }

  function updateHeroState(isEnabled) {
    if (isEnabled) {
      dashHero.classList.remove("is-paused");
      dashStatusBadge.classList.remove("is-paused");
      dashStatusBadge.textContent = "Đang chạy";
      dashHeadline.textContent = "Bảo vệ đang bật";
      dashSubtext.textContent = "Tất cả bộ lọc mạng và quảng cáo đang hoạt động";
    } else {
      dashHero.classList.add("is-paused");
      dashStatusBadge.classList.add("is-paused");
      dashStatusBadge.textContent = "Tạm dừng";
      dashHeadline.textContent = "Đã tạm dừng bảo vệ";
      dashSubtext.textContent = "Các yêu cầu quảng cáo sẽ không bị chặn";
    }
  }

  function updateCounts() {
    dashWhitelistCount.textContent = whitelistedList.length.toString();
    dashCustomBlockCount.textContent = customBlockedList.length.toString();
  }

  function renderTable() {
    // Clear current rows
    dashTableBody.innerHTML = "";
    const list = currentTab === "whitelist" ? whitelistedList : customBlockedList;
    if (list.length === 0) {
      dashEmptyState.style.display = "block";
      return;
    }
    dashEmptyState.style.display = "none";
    list.forEach((domain, idx) => {
      const tr = document.createElement("tr");

      const tdDomain = document.createElement("td");
      tdDomain.setAttribute("data-label", "Tên miền");
      tdDomain.style.fontFamily = "var(--font-mono)";
      tdDomain.style.fontWeight = "600";
      tdDomain.textContent = domain;

      const tdType = document.createElement("td");
      tdType.setAttribute("data-label", "Phân loại");
      const badge = document.createElement("span");
      badge.className = `domain-badge ${currentTab === "whitelist" ? "whitelist" : "blocked"}`;
      badge.textContent = currentTab === "whitelist" ? "Ngoại lệ (Whitelist)" : "Chặn tùy chỉnh";
      tdType.appendChild(badge);

      const tdActionDesc = document.createElement("td");
      tdActionDesc.setAttribute("data-label", "Hành động");
      tdActionDesc.style.color = "var(--text-mid)";
      tdActionDesc.textContent = currentTab === "whitelist" ? "Bỏ qua mọi bộ lọc chặn" : "Chặn toàn bộ request mạng";

      const tdAction = document.createElement("td");
      tdAction.setAttribute("data-label", "Thao tác");
      tdAction.style.textAlign = "right";
      const delBtn = document.createElement("button");
      delBtn.className = "footer-btn reset-btn";
      delBtn.style.minHeight = "32px";
      delBtn.style.padding = "4px 10px";
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", `Xóa ${domain}`);
      delBtn.textContent = "Xóa quy tắc";
      delBtn.addEventListener("click", () => deleteRow(domain, idx));
      tdAction.appendChild(delBtn);

      tr.appendChild(tdDomain);
      tr.appendChild(tdType);
      tr.appendChild(tdActionDesc);
      tr.appendChild(tdAction);
      dashTableBody.appendChild(tr);
    });
  }

  function showError(msg) {
    dashDomainError.textContent = msg;
    dashDomainError.style.display = "block";
  }
  function clearError() {
    dashDomainError.textContent = "";
    dashDomainError.style.display = "none";
  }

  // ==== INITIALISE =========================================================
  // Hamburger menu (mobile)
  if (dashMenuBtn && dashNavLinks) {
    dashMenuBtn.addEventListener("click", () => {
      const isOpen = dashNavLinks.classList.toggle("is-open");
      dashMenuBtn.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Load full state
  await refreshUI();

  // ==== STORAGE CHANGE LISTENER (sync across popup/dashboard) ===============
  if (isExtensionEnv && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        refreshUI();
      }
    });
  }

  // ==== EVENT HANDLERS =====================================================
  // Master toggle
  dashMasterToggle.addEventListener("change", async () => {
    const isEnabled = dashMasterToggle.checked;
    await api.setFlag("enabled", isEnabled);
    updateHeroState(isEnabled);
  });

  // Filters
  dashFilterNetwork.addEventListener("change", () => api.setFlag("filterNetwork", dashFilterNetwork.checked));
  dashFilterCosmetic.addEventListener("change", () => api.setFlag("filterCosmetic", dashFilterCosmetic.checked));
  dashFilterTrackers.addEventListener("change", () => api.setFlag("filterTrackers", dashFilterTrackers.checked));

  // Tab switch
  dashTabWhitelistBtn.addEventListener("click", () => {
    currentTab = "whitelist";
    dashTabWhitelistBtn.classList.add("is-active");
    dashTabCustomBlockBtn.classList.remove("is-active");
    dashDomainInput.placeholder = "Nhập tên miền Whitelist (vd: dantri.com.vn)…";
    clearError();
    renderTable();
  });
  dashTabCustomBlockBtn.addEventListener("click", () => {
    currentTab = "customBlock";
    dashTabCustomBlockBtn.classList.add("is-active");
    dashTabWhitelistBtn.classList.remove("is-active");
    dashDomainInput.placeholder = "Nhập tên miền cần chặn (vd: bad-site.com)…";
    clearError();
    renderTable();
  });

  // Add domain
  dashAddDomainBtn.addEventListener("click", handleAdd);
  dashDomainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  });

  async function handleAdd() {
    clearError();
    const raw = dashDomainInput.value.trim();
    if (!raw) return showError("Vui lòng nhập tên miền.");
    const domain = raw.toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
    if (!domain || !domain.includes(".") || domain.length < 3) {
      return showError("Tên miền không hợp lệ (ví dụ: dantri.com.vn).");
    }
    const listName = currentTab === "whitelist" ? "whitelist" : "customBlock";
    const resp = await api.listAdd(listName, domain);
    if (!resp.success) {
      return showError(resp.error || "Lỗi khi thêm tên miền");
    }
    if (listName === "whitelist") {
      whitelistedList = resp.domains;
    } else {
      customBlockedList = resp.domains;
    }
    dashDomainInput.value = "";
    updateCounts();
    renderTable();
  }

  // Delete row
  async function deleteRow(domain, idx) {
    const listName = currentTab === "whitelist" ? "whitelist" : "customBlock";
    const resp = await api.listRemove(listName, domain);
    if (!resp.success) {
      return showError(resp.error || "Lỗi khi xóa tên miền");
    }
    if (listName === "whitelist") {
      whitelistedList = resp.domains;
    } else {
      customBlockedList = resp.domains;
    }
    updateCounts();
    renderTable();
  }

  // Reset stats button
  if (dashResetStatsBtn) {
    dashResetStatsBtn.addEventListener("click", () => {
      api.send({ action: "reset_stats" }).then(() => {
        dashTotalCount.textContent = "0";
        dashTrackersCount.textContent = "0";
        dashAdsCount.textContent = "0";
      });
    });
  }
});
