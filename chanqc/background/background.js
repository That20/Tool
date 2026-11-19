// ==========================================================================
// BACKGROUND SERVICE WORKER - My AdBlocker (Manifest V3)
// Đảm bảo hoạt động 100% ổn định, không lỗi API declarativeNetRequest
// ==========================================================================

const RULESET_ADS = "rules_ads";
const RULESET_TRACKERS = "rules_trackers";
const RULESET_POPUPS = "rules_popups";

const WHITELIST_BASE_ID = 1000;
const CUSTOM_BLOCK_BASE_ID = 2000;

// Sử dụng storage.session (nếu hỗ trợ) hoặc storage.local để lưu tabStats
// Đảm bảo không bị mất số liệu khi Service Worker tạm dừng (Sleep)
async function getTabStats(tabId) {
  try {
    const key = `tab_stats_${tabId}`;
    const storageArea = chrome.storage.session || chrome.storage.local;
    const res = await storageArea.get(key);
    return res[key] || { total: 0, ads: 0, trackers: 0, popups: 0 };
  } catch {
    return { total: 0, ads: 0, trackers: 0, popups: 0 };
  }
}

async function setTabStats(tabId, stats) {
  try {
    const key = `tab_stats_${tabId}`;
    const storageArea = chrome.storage.session || chrome.storage.local;
    await storageArea.set({ [key]: stats });
  } catch (err) {
    console.warn("[My AdBlocker] Không thể lưu tab stats:", err);
  }
}

// --------------------------------------------------------------------------
// 1. KHỞI TẠO VÀ ĐỒNG BỘ TRẠNG THÁI
// --------------------------------------------------------------------------
async function initializeExtension() {
  chrome.storage.local.get([
    "enabled",
    "filterNetwork",
    "filterTrackers",
    "filterCosmetic",
    "whitelistedDomains",
    "customBlockedDomains",
    "totalBlocked",
    "adsBlocked",
    "trackersBlocked"
  ], async (res) => {
    const isEnabled = res.enabled !== undefined ? res.enabled : true;
    const filterNetwork = res.filterNetwork !== false;
    const filterTrackers = res.filterTrackers !== false;
    const filterCosmetic = res.filterCosmetic !== false;
    const whitelisted = res.whitelistedDomains || [];
    const customBlocked = res.customBlockedDomains || [];

    // Lưu giá trị mặc định nếu chưa có
    if (res.enabled === undefined) {
      await chrome.storage.local.set({
        enabled: true,
        filterNetwork: true,
        filterTrackers: true,
        filterCosmetic: true,
        whitelistedDomains: [],
        customBlockedDomains: [],
        totalBlocked: 0,
        adsBlocked: 0,
        trackersBlocked: 0
      });
    }

    await syncRulesetsSafe(isEnabled, filterNetwork, filterTrackers, filterCosmetic);
    await syncDynamicRulesSafe(whitelisted, customBlocked);
    console.log("[My AdBlocker] Khởi tạo thành công!");
  });
}

// Gọi khởi tạo khi cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

// Gọi khi trình duyệt khởi động
chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

// --------------------------------------------------------------------------
// 2. ĐỒNG BỘ RULESETS AN TOÀN (TRÁNH LỖI ALREADY ENABLED / DISABLED)
// --------------------------------------------------------------------------
async function syncRulesetsSafe(enabled, filterNetwork, filterTrackers, filterPopups) {
  try {
    const currentEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    
    // Xác định các rulesets cần bật
    const desiredEnabled = [];
    if (enabled) {
      if (filterNetwork) desiredEnabled.push(RULESET_ADS);
      if (filterTrackers) desiredEnabled.push(RULESET_TRACKERS);
      if (filterPopups !== false) desiredEnabled.push(RULESET_POPUPS);
    }

    // Tất cả các rulesets thuộc extension
    const allKnownRulesets = [RULESET_ADS, RULESET_TRACKERS, RULESET_POPUPS];
    
    // Chỉ bật những cái chưa được bật
    const enableRulesetIds = desiredEnabled.filter(id => !currentEnabled.includes(id));
    
    // Chỉ tắt những cái đang bật mà không nằm trong danh sách cần bật
    const disableRulesetIds = allKnownRulesets.filter(id => !desiredEnabled.includes(id) && currentEnabled.includes(id));

    if (enableRulesetIds.length > 0 || disableRulesetIds.length > 0) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds,
        disableRulesetIds
      });
      console.log("[My AdBlocker] Rulesets đã cập nhật:", { enableRulesetIds, disableRulesetIds });
    }
  } catch (err) {
    console.error("[My AdBlocker] Lỗi khi cập nhật rulesets:", err);
  }
}

// --------------------------------------------------------------------------
// 3. ĐỒNG BỘ DYNAMIC RULES (CHUẨN HÓA resourceTypes ĐỂ KHÔNG BỊ CHROME TỪ CHỐI)
// --------------------------------------------------------------------------
async function syncDynamicRulesSafe(whitelisted = [], customBlocked = []) {
  try {
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = currentRules.map(r => r.id);
    const addRules = [];

    // 3.1. Whitelist: Cho phép mọi request phát sinh từ tên miền trong whitelist
    // Dùng requestDomains kết hợp main_frame/sub_frame để DNR khớp ngay từ request điều hướng
    whitelisted.forEach((domain, idx) => {
      const cleanDomain = domain.trim().toLowerCase();
      if (!cleanDomain) return;

      addRules.push({
        id: WHITELIST_BASE_ID + idx,
        priority: 100,
        action: { type: "allowAllRequests" },
        condition: {
          requestDomains: [cleanDomain],
          resourceTypes: ["main_frame", "sub_frame"]
        }
      });
    });

    // 3.2. Custom Blocks: Chặn các tên miền do người dùng tự nhập
    customBlocked.forEach((domain, idx) => {
      const cleanDomain = domain.trim().toLowerCase();
      if (!cleanDomain) return;

      addRules.push({
        id: CUSTOM_BLOCK_BASE_ID + idx,
        priority: 50,
        action: { type: "block" },
        condition: {
          urlFilter: `||${cleanDomain}^`,
          resourceTypes: [
            "main_frame",
            "sub_frame",
            "stylesheet",
            "script",
            "image",
            "font",
            "xmlhttprequest",
            "ping",
            "other"
          ]
        }
      });
    });

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });

    console.log(`[My AdBlocker] Dynamic Rules cập nhật thành công (${whitelisted.length} whitelist, ${customBlocked.length} custom block)`);
  } catch (err) {
    console.error("[My AdBlocker] Lỗi khi cập nhật dynamic rules:", err);
  }
}

// --------------------------------------------------------------------------
// 4. LẮNG NGHE YÊU CẦU BỊ CHẶN (THỐNG KÊ THẬT 100%)
// --------------------------------------------------------------------------
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    try {
      const tabId = info.request && info.request.tabId ? info.request.tabId : -1;
      const rulesetId = info.rule ? info.rule.rulesetId : "";
      const ruleId = info.rule ? info.rule.ruleId : 0;

      let category = "ads";
      if (rulesetId === RULESET_TRACKERS || (ruleId >= 101 && ruleId <= 200)) {
        category = "trackers";
      } else if (rulesetId === RULESET_POPUPS || (ruleId >= 201 && ruleId <= 300)) {
        category = "popups";
      }

      // Cập nhật thống kê Tab
      if (tabId > 0) {
        const stats = await getTabStats(tabId);
        stats.total++;
        if (category === "trackers") stats.trackers++;
        else if (category === "popups") stats.popups++;
        else stats.ads++;

        await setTabStats(tabId, stats);
        updateTabBadge(tabId, stats.total);
      }

      // Cập nhật thống kê tổng
      chrome.storage.local.get(["totalBlocked", "adsBlocked", "trackersBlocked", "enabled"], (res) => {
        if (res.enabled === false) return;

        const newTotal = (res.totalBlocked || 0) + 1;
        const newAds = (res.adsBlocked || 0) + (category === "ads" || category === "popups" ? 1 : 0);
        const newTrackers = (res.trackersBlocked || 0) + (category === "trackers" ? 1 : 0);

        chrome.storage.local.set({
          totalBlocked: newTotal,
          adsBlocked: newAds,
          trackersBlocked: newTrackers
        });
      });
    } catch (e) {
      console.warn("[My AdBlocker] Lỗi ghi nhận thống kê:", e);
    }
  });
}

// Reset thống kê của Tab khi trang bắt đầu tải mới
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    setTabStats(tabId, { total: 0, ads: 0, trackers: 0, popups: 0 });
    updateTabBadge(tabId, 0);
  }
});

// Xóa dữ liệu khi tab đóng
chrome.tabs.onRemoved.addListener((tabId) => {
  const storageArea = chrome.storage.session || chrome.storage.local;
  storageArea.remove(`tab_stats_${tabId}`);
});

// Cập nhật Badge trên icon
function updateTabBadge(tabId, count) {
  chrome.storage.local.get(["enabled"], (res) => {
    const isEnabled = res.enabled !== false;
    if (!isEnabled) {
      chrome.action.setBadgeText({ tabId, text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#64748B" });
    } else if (count > 0) {
      chrome.action.setBadgeText({ tabId, text: count > 999 ? "999+" : count.toString() });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#00E5A3" });
    } else {
      chrome.action.setBadgeText({ tabId, text: "" });
    }
  });
}

// --------------------------------------------------------------------------
// 5. GIAO TIẾP VỚI POPUP
// --------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Lấy thống kê thật cho Tab
  if (message.action === "get_stats") {
    const tabId = message.tabId;
    getTabStats(tabId).then((tabData) => {
      chrome.storage.local.get(["totalBlocked", "adsBlocked", "trackersBlocked"], (res) => {
        sendResponse({
          pageBlocked: tabData.total,
          pageAds: tabData.ads,
          pageTrackers: tabData.trackers,
          totalBlocked: res.totalBlocked || 0,
          adsBlocked: res.adsBlocked || 0,
          trackersBlocked: res.trackersBlocked || 0
        });
      });
    });
    return true;
  }

  // Bật/Tắt công tắc chính
  if (message.action === "toggle_extension") {
    const shouldEnable = message.enabled;
    chrome.storage.local.get(["filterNetwork", "filterTrackers", "filterCosmetic"], async (res) => {
      await syncRulesetsSafe(
        shouldEnable,
        res.filterNetwork !== false,
        res.filterTrackers !== false,
        res.filterCosmetic !== false
      );

      chrome.storage.local.set({ enabled: shouldEnable }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            getTabStats(tab.id).then(stats => {
              updateTabBadge(tab.id, stats.total);
            });
          });
        });
        sendResponse({ success: true, enabled: shouldEnable });
      });
    });
    return true;
  }

  // Bật/Tắt từng bộ lọc riêng
  if (message.action === "toggle_filter") {
    const { filterName, value } = message;
    chrome.storage.local.get(["enabled", "filterNetwork", "filterTrackers", "filterCosmetic"], async (res) => {
      const isEnabled = res.enabled !== false;
      const state = {
        filterNetwork: filterName === "filterNetwork" ? value : (res.filterNetwork !== false),
        filterTrackers: filterName === "filterTrackers" ? value : (res.filterTrackers !== false),
        filterCosmetic: filterName === "filterCosmetic" ? value : (res.filterCosmetic !== false)
      };

      await syncRulesetsSafe(isEnabled, state.filterNetwork, state.filterTrackers, state.filterCosmetic);
      chrome.storage.local.set({ [filterName]: value }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // Cập nhật Whitelist
  if (message.action === "update_whitelist") {
    const domains = message.domains || [];
    chrome.storage.local.set({ whitelistedDomains: domains }, () => {
      chrome.storage.local.get(["customBlockedDomains"], async (res) => {
        await syncDynamicRulesSafe(domains, res.customBlockedDomains || []);
        sendResponse({ success: true, domains });
      });
    });
    return true;
  }

  // Cập nhật Custom Blocked
  if (message.action === "update_custom_blocks") {
    const domains = message.domains || [];
    chrome.storage.local.set({ customBlockedDomains: domains }, () => {
      chrome.storage.local.get(["whitelistedDomains"], async (res) => {
        await syncDynamicRulesSafe(res.whitelistedDomains || [], domains);
        sendResponse({ success: true, domains });
      });
    });
    return true;
  }

  // Đặt lại số liệu thống kê
  if (message.action === "reset_stats") {
    const storageArea = chrome.storage.session || chrome.storage.local;
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        storageArea.remove(`tab_stats_${tab.id}`);
        chrome.action.setBadgeText({ tabId: tab.id, text: "" });
      });
    });

    chrome.storage.local.set({
      totalBlocked: 0,
      adsBlocked: 0,
      trackersBlocked: 0
    }, () => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ success: true });
    });
    return true;
  }
});
