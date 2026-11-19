// ==========================================================================
// DASHBOARD CONTROLLER LOGIC - My AdBlocker
// Quản lý Bảng điều khiển toàn màn hình, Responsive & Adaptive 100%
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
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

  let whitelistedList = [];
  let customBlockedList = [];
  let currentTab = "whitelist"; // 'whitelist' | 'customBlock'

  const isExtensionEnv = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;

  // 1. Hamburger Menu Toggle trên Mobile
  if (dashMenuBtn && dashNavLinks) {
    dashMenuBtn.addEventListener("click", () => {
      const isOpen = dashNavLinks.classList.toggle("is-open");
      dashMenuBtn.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // 2. Khởi tạo dữ liệu
  if (isExtensionEnv && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([
      "enabled",
      "filterNetwork",
      "filterCosmetic",
      "filterTrackers",
      "whitelistedDomains",
      "customBlockedDomains",
      "totalBlocked",
      "adsBlocked",
      "trackersBlocked"
    ], (res) => {
      const isEnabled = res.enabled !== false;
      whitelistedList = res.whitelistedDomains || [];
      customBlockedList = res.customBlockedDomains || [];

      dashMasterToggle.checked = isEnabled;
      updateHeroState(isEnabled);

      dashFilterNetwork.checked = res.filterNetwork !== false;
      dashFilterCosmetic.checked = res.filterCosmetic !== false;
      dashFilterTrackers.checked = res.filterTrackers !== false;

      dashTotalCount.textContent = (res.totalBlocked || 0).toLocaleString();
      dashTrackersCount.textContent = (res.trackersBlocked || 0).toLocaleString();
      dashAdsCount.textContent = (res.adsBlocked || 0).toLocaleString();

      updateCounts();
      renderTable();
    });
  } else {
    // Giá trị mẫu cho môi trường Browser / Preview
    whitelistedList = ["github.com", "google.com"];
    customBlockedList = ["ads-example.com", "popads-bad.net"];
    dashTotalCount.textContent = "1,482";
    dashTrackersCount.textContent = "412";
    dashAdsCount.textContent = "1,070";
    updateCounts();
    renderTable();
  }

  // 3. Xử lý Master Switch
  dashMasterToggle.addEventListener("change", () => {
    const isEnabled = dashMasterToggle.checked;
    updateHeroState(isEnabled);

    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_extension",
        enabled: isEnabled
      });
    }
  });

  // 4. Xử lý các bộ lọc
  dashFilterNetwork.addEventListener("change", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_filter",
        filterName: "filterNetwork",
        value: dashFilterNetwork.checked
      });
    }
  });

  dashFilterCosmetic.addEventListener("change", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_filter",
        filterName: "filterCosmetic",
        value: dashFilterCosmetic.checked
      });
    }
  });

  dashFilterTrackers.addEventListener("change", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_filter",
        filterName: "filterTrackers",
        value: dashFilterTrackers.checked
      });
    }
  });

  // 5. Chuyển Tab Whitelist / Custom Block
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

  // 6. Thêm tên miền
  dashAddDomainBtn.addEventListener("click", handleAdd);
  dashDomainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  });

  function handleAdd() {
    clearError();
    const raw = dashDomainInput.value.trim();
    if (!raw) {
      showError("Vui lòng nhập tên miền.");
      return;
    }

    let domain = raw.toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .trim();

    if (!domain || !domain.includes(".") || domain.length < 3) {
      showError("Tên miền không hợp lệ (ví dụ: dantri.com.vn).");
      return;
    }

    if (currentTab === "whitelist") {
      if (whitelistedList.includes(domain)) {
        showError("Tên miền đã tồn tại trong Whitelist.");
        return;
      }
      whitelistedList.push(domain);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({ action: "update_whitelist", domains: whitelistedList }, () => {
          dashDomainInput.value = "";
          updateCounts();
          renderTable();
        });
      } else {
        dashDomainInput.value = "";
        updateCounts();
        renderTable();
      }
    } else {
      if (customBlockedList.includes(domain)) {
        showError("Tên miền đã tồn tại trong danh sách chặn.");
        return;
      }
      customBlockedList.push(domain);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({ action: "update_custom_blocks", domains: customBlockedList }, () => {
          dashDomainInput.value = "";
          updateCounts();
          renderTable();
        });
      } else {
        dashDomainInput.value = "";
        updateCounts();
        renderTable();
      }
    }
  }

  function showError(msg) {
    dashDomainError.textContent = msg;
    dashDomainError.style.display = "block";
  }

  function clearError() {
    dashDomainError.textContent = "";
    dashDomainError.style.display = "none";
  }

  function updateCounts() {
    dashWhitelistCount.textContent = whitelistedList.length.toString();
    dashCustomBlockCount.textContent = customBlockedList.length.toString();
  }

  function renderTable() {
    dashTableBody.innerHTML = "";
    const list = currentTab === "whitelist" ? whitelistedList : customBlockedList;

    if (list.length === 0) {
      dashEmptyState.style.display = "block";
      return;
    }
    dashEmptyState.style.display = "none";

    list.forEach((domain, idx) => {
      const tr = document.createElement("tr");

      // Column 1: Domain
      const tdDomain = document.createElement("td");
      tdDomain.setAttribute("data-label", "Tên miền");
      tdDomain.style.fontFamily = "var(--font-mono)";
      tdDomain.style.fontWeight = "600";
      tdDomain.textContent = domain;

      // Column 2: Badge
      const tdType = document.createElement("td");
      tdType.setAttribute("data-label", "Phân loại");
      const badge = document.createElement("span");
      badge.className = `domain-badge ${currentTab === "whitelist" ? "whitelist" : "blocked"}`;
      badge.textContent = currentTab === "whitelist" ? "Ngoại lệ (Whitelist)" : "Chặn tùy chỉnh";
      tdType.appendChild(badge);

      // Column 3: Action Description
      const tdActionDesc = document.createElement("td");
      tdActionDesc.setAttribute("data-label", "Hành động");
      tdActionDesc.style.color = "var(--text-mid)";
      tdActionDesc.textContent = currentTab === "whitelist" ? "Bỏ qua mọi bộ lọc chặn" : "Chặn toàn bộ request mạng";

      // Column 4: Delete Button
      const tdAction = document.createElement("td");
      tdAction.setAttribute("data-label", "Thao tác");
      tdAction.style.textAlign = "right";

      const delBtn = document.createElement("button");
      delBtn.className = "footer-btn reset-btn";
      delBtn.style.minHeight = "32px";
      delBtn.style.padding = "4px 10px";
      delBtn.setAttribute("type", "button");
      delBtn.setAttribute("aria-label", `Xóa ${domain}`);
      delBtn.textContent = "Xóa quy tắc";

      delBtn.addEventListener("click", () => {
        deleteRow(domain, idx);
      });

      tdAction.appendChild(delBtn);

      tr.appendChild(tdDomain);
      tr.appendChild(tdType);
      tr.appendChild(tdActionDesc);
      tr.appendChild(tdAction);

      dashTableBody.appendChild(tr);
    });
  }

  function deleteRow(domain, idx) {
    if (currentTab === "whitelist") {
      whitelistedList.splice(idx, 1);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({ action: "update_whitelist", domains: whitelistedList }, () => {
          updateCounts();
          renderTable();
        });
      } else {
        updateCounts();
        renderTable();
      }
    } else {
      customBlockedList.splice(idx, 1);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({ action: "update_custom_blocks", domains: customBlockedList }, () => {
          updateCounts();
          renderTable();
        });
      } else {
        updateCounts();
        renderTable();
      }
    }
  }

  // 7. Xóa toàn bộ thống kê
  dashResetStatsBtn.addEventListener("click", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({ action: "reset_stats" }, () => {
        dashTotalCount.textContent = "0";
        dashTrackersCount.textContent = "0";
        dashAdsCount.textContent = "0";
      });
    } else {
      dashTotalCount.textContent = "0";
      dashTrackersCount.textContent = "0";
      dashAdsCount.textContent = "0";
    }
  });

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
});
