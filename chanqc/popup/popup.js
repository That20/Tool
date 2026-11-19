// ==========================================================================
// POPUP CONTROLLER LOGIC - My AdBlocker (Manifest V3)
// Quản lý giao diện, kết nối với Chrome APIs, xử lý lỗi an toàn
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  // 1. DOM Elements
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

  if (openDashboardBtn) {
    openDashboardBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("dashboard.html", "_blank");
      }
    });
  }

  // 2. Trạng thái cục bộ
  let currentTab = null;
  let currentHostname = "";
  let whitelistedList = [];
  let customBlockedList = [];
  let currentDomainTab = "whitelist"; // 'whitelist' | 'customBlock'

  // Kiểm tra môi trường Chrome Extension
  const isExtensionEnv = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;

  // 3. Lấy thông tin Tab đang duyệt
  if (isExtensionEnv && chrome.tabs) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        currentTab = tabs[0];
        if (currentTab.url) {
          try {
            const urlObj = new URL(currentTab.url);
            if (urlObj.protocol.startsWith("http")) {
              currentHostname = urlObj.hostname.toLowerCase();
              currentSiteDomain.textContent = currentHostname;
            } else {
              currentHostname = "";
              currentSiteDomain.textContent = "Trang hệ thống";
              siteProtectionText.textContent = "Không áp dụng bộ lọc";
              toggleSiteBtn.style.display = "none";
            }
          } catch {
            currentHostname = "";
            currentSiteDomain.textContent = "Trang cục bộ";
          }
        }
      }
    } catch (err) {
      console.warn("[My AdBlocker] Không thể truy cập tab:", err);
      currentSiteDomain.textContent = "Không xác định";
    }
  } else {
    // Môi trường xem trước cục bộ (Preview)
    currentHostname = "vnexpress.net";
    currentSiteDomain.textContent = currentHostname;
  }

  // 4. Lấy dữ liệu từ Storage và Background
  if (isExtensionEnv && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([
      "enabled",
      "filterNetwork",
      "filterCosmetic",
      "filterTrackers",
      "whitelistedDomains",
      "customBlockedDomains"
    ], (res) => {
      const isEnabled = res.enabled !== undefined ? res.enabled : true;
      whitelistedList = res.whitelistedDomains || [];
      customBlockedList = res.customBlockedDomains || [];

      // Gán trạng thái công tắc Master
      masterToggle.checked = isEnabled;
      updateHeroUI(isEnabled);

      // Gán trạng thái các bộ lọc
      filterNetwork.checked = res.filterNetwork !== false;
      filterCosmetic.checked = res.filterCosmetic !== false;
      filterTrackers.checked = res.filterTrackers !== false;

      // Cập nhật trạng thái trang hiện tại
      if (currentHostname) {
        const isSiteWhitelisted = whitelistedList.includes(currentHostname);
        updateSiteStatusUI(isSiteWhitelisted);
      }

      // Cập nhật giao diện quản lý domain
      updateDomainCounts();
      renderDomainList();

      // Lấy số liệu thống kê THỰC TẾ từ background
      requestRealStats();
    });
  } else {
    // Giá trị giả lập cho preview tĩnh
    masterToggle.checked = true;
    updateHeroUI(true);
    whitelistedList = ["github.com", "google.com"];
    customBlockedList = ["ads-example.com"];
    updateDomainCounts();
    renderDomainList();
  }

  // 5. Hàm yêu cầu dữ liệu thống kê thực tế từ Service Worker
  function requestRealStats() {
    if (!isExtensionEnv || !currentTab || !currentTab.id) return;

    chrome.runtime.sendMessage({
      action: "get_stats",
      tabId: currentTab.id
    }, (stats) => {
      if (chrome.runtime.lastError || !stats) {
        return;
      }

      // Hiển thị số liệu thực tế đo đạc được
      animateNumber(pageBlockedCount, stats.pageBlocked || 0);
      animateNumber(totalBlockedCount, stats.totalBlocked || 0);
      if (trackerStatsCount) {
        trackerStatsCount.textContent = (stats.trackersBlocked || 0).toString();
      }
    });
  }

  // 6. Xử lý công tắc Master (Bật / Tắt toàn bộ)
  masterToggle.addEventListener("change", () => {
    const isEnabled = masterToggle.checked;
    updateHeroUI(isEnabled);

    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_extension",
        enabled: isEnabled
      }, () => {
        requestRealStats();
      });
    }
  });

  // 7. Xử lý các bộ lọc chi tiết
  filterNetwork.addEventListener("change", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_filter",
        filterName: "filterNetwork",
        value: filterNetwork.checked
      });
    }
  });

  filterCosmetic.addEventListener("change", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_filter",
        filterName: "filterCosmetic",
        value: filterCosmetic.checked
      });
    }
  });

  filterTrackers.addEventListener("change", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "toggle_filter",
        filterName: "filterTrackers",
        value: filterTrackers.checked
      });
    }
  });

  // 8. Tạm dừng / Kích hoạt nhanh trên trang web đang mở
  toggleSiteBtn.addEventListener("click", () => {
    if (!currentHostname) return;

    const index = whitelistedList.indexOf(currentHostname);
    let isNowWhitelisted = false;

    if (index > -1) {
      whitelistedList.splice(index, 1);
      isNowWhitelisted = false;
    } else {
      whitelistedList.push(currentHostname);
      isNowWhitelisted = true;
    }

    if (isExtensionEnv) {
      chrome.runtime.sendMessage({
        action: "update_whitelist",
        domains: whitelistedList
      }, () => {
        updateSiteStatusUI(isNowWhitelisted);
        updateDomainCounts();
        if (currentDomainTab === "whitelist") {
          renderDomainList();
        }
      });
    } else {
      updateSiteStatusUI(isNowWhitelisted);
      updateDomainCounts();
      if (currentDomainTab === "whitelist") {
        renderDomainList();
      }
    }
  });

  // 9. Quản lý danh sách tên miền (Thu gọn / Mở rộng)
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

  // Chuyển Tab Whitelist / Custom Block
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

  // Thêm tên miền vào danh sách
  addDomainBtn.addEventListener("click", handleAddDomain);
  domainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddDomain();
    }
  });

  function handleAddDomain() {
    clearDomainError();
    const rawVal = domainInput.value.trim();
    if (!rawVal) {
      showDomainError("Vui lòng nhập tên miền.");
      return;
    }

    // Chuẩn hóa tên miền (loại bỏ http://, https://, www., path)
    let domain = rawVal.toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .trim();

    if (!domain || !domain.includes(".") || domain.length < 3) {
      showDomainError("Tên miền không hợp lệ (ví dụ: dantri.com.vn).");
      return;
    }

    if (currentDomainTab === "whitelist") {
      if (whitelistedList.includes(domain)) {
        showDomainError("Tên miền này đã có trong Whitelist.");
        return;
      }
      whitelistedList.push(domain);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({
          action: "update_whitelist",
          domains: whitelistedList
        }, () => {
          domainInput.value = "";
          updateDomainCounts();
          renderDomainList();
          if (currentHostname === domain) {
            updateSiteStatusUI(true);
          }
        });
      } else {
        domainInput.value = "";
        updateDomainCounts();
        renderDomainList();
      }
    } else {
      if (customBlockedList.includes(domain)) {
        showDomainError("Tên miền này đã có trong danh sách chặn.");
        return;
      }
      customBlockedList.push(domain);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({
          action: "update_custom_blocks",
          domains: customBlockedList
        }, () => {
          domainInput.value = "";
          updateDomainCounts();
          renderDomainList();
        });
      } else {
        domainInput.value = "";
        updateDomainCounts();
        renderDomainList();
      }
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

  function updateDomainCounts() {
    whitelistCount.textContent = whitelistedList.length.toString();
    customBlockCount.textContent = customBlockedList.length.toString();
  }

  function renderDomainList() {
    domainItemsList.innerHTML = "";
    const list = currentDomainTab === "whitelist" ? whitelistedList : customBlockedList;

    if (list.length === 0) {
      domainEmptyState.style.display = "block";
      domainItemsList.style.display = "none";
      return;
    }

    domainEmptyState.style.display = "none";
    domainItemsList.style.display = "flex";

    list.forEach((domain, idx) => {
      const li = document.createElement("li");
      li.className = "domain-item";

      const span = document.createElement("span");
      span.className = "domain-item-text";
      span.textContent = domain;

      const delBtn = document.createElement("button");
      delBtn.className = "domain-item-del";
      delBtn.setAttribute("type", "button");
      delBtn.setAttribute("aria-label", `Xóa ${domain}`);
      delBtn.innerHTML = "&times;";

      delBtn.addEventListener("click", () => {
        deleteDomain(domain, idx);
      });

      li.appendChild(span);
      li.appendChild(delBtn);
      domainItemsList.appendChild(li);
    });
  }

  function deleteDomain(domain, idx) {
    if (currentDomainTab === "whitelist") {
      whitelistedList.splice(idx, 1);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({
          action: "update_whitelist",
          domains: whitelistedList
        }, () => {
          updateDomainCounts();
          renderDomainList();
          if (currentHostname === domain) {
            updateSiteStatusUI(false);
          }
        });
      } else {
        updateDomainCounts();
        renderDomainList();
      }
    } else {
      customBlockedList.splice(idx, 1);
      if (isExtensionEnv) {
        chrome.runtime.sendMessage({
          action: "update_custom_blocks",
          domains: customBlockedList
        }, () => {
          updateDomainCounts();
          renderDomainList();
        });
      } else {
        updateDomainCounts();
        renderDomainList();
      }
    }
  }

  // 10. Nút Tải lại trang
  reloadPageBtn.addEventListener("click", () => {
    if (isExtensionEnv && currentTab && currentTab.id) {
      chrome.tabs.reload(currentTab.id);
      window.close();
    } else {
      location.reload();
    }
  });

  // 11. Nút Xóa thống kê
  resetCounterBtn.addEventListener("click", () => {
    if (isExtensionEnv) {
      chrome.runtime.sendMessage({ action: "reset_stats" }, () => {
        animateNumber(pageBlockedCount, 0);
        animateNumber(totalBlockedCount, 0);
        if (trackerStatsCount) {
          trackerStatsCount.textContent = "0";
        }
      });
    } else {
      animateNumber(pageBlockedCount, 0);
      animateNumber(totalBlockedCount, 0);
      if (trackerStatsCount) {
        trackerStatsCount.textContent = "0";
      }
    }
  });

  // 12. Cập nhật giao diện Trạng thái tổng (Hero Section)
  function updateHeroUI(isEnabled) {
    if (isEnabled) {
      heroSection.classList.remove("is-paused");
      headerStatusBadge.classList.remove("is-paused");
      headerStatusBadge.textContent = "Đang chạy";
      statusHeadline.textContent = "Bảo vệ đang bật";
      statusSubtext.textContent = "Tất cả bộ lọc mạng và quảng cáo đang hoạt động";
    } else {
      heroSection.classList.add("is-paused");
      headerStatusBadge.classList.add("is-paused");
      headerStatusBadge.textContent = "Tạm dừng";
      statusHeadline.textContent = "Đã tạm dừng bảo vệ";
      statusSubtext.textContent = "Các yêu cầu quảng cáo sẽ không bị chặn";
    }
  }

  function updateSiteStatusUI(isWhitelisted) {
    if (isWhitelisted) {
      siteProtectionText.textContent = "Đã tạm dừng trên trang này";
      siteProtectionText.classList.add("is-whitelisted");
      siteActionText.textContent = "Kích hoạt lại";
      toggleSiteBtn.classList.add("is-active-resume");
      toggleSiteBtn.setAttribute("aria-label", "Kích hoạt lại bảo vệ trên trang này");
    } else {
      siteProtectionText.textContent = "Được bảo vệ trên trang này";
      siteProtectionText.classList.remove("is-whitelisted");
      siteActionText.textContent = "Tạm dừng";
      toggleSiteBtn.classList.remove("is-active-resume");
      toggleSiteBtn.setAttribute("aria-label", "Tạm dừng bảo vệ trên trang này");
    }
  }

  function animateNumber(element, target) {
    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      element.textContent = target.toString();
      return;
    }

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
  }
});
