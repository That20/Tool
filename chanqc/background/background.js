// ===========================================================================
// BACKGROUND SERVICE WORKER - My AdBlocker (Manifest V3)
// Đảm bảo hoạt động 100% ổn định, không lỗi API declarativeNetRequest
// ===========================================================================

const RULESET_ADS = "rules_ads";
const RULESET_TRACKERS = "rules_trackers";
const RULESET_POPUPS = "rules_popups";
// Old base IDs kept for reference (no longer used)
const WHITELIST_BASE_ID = 1000;
const CUSTOM_BLOCK_BASE_ID = 2000;

// --------------------------------------------------------------------------
// 1. DEFAULT STATE
// --------------------------------------------------------------------------
const DEFAULTS = {
  enabled: true,
  filterNetwork: true,
  filterTrackers: true,
  filterCosmetic: true,
  whitelistedDomains: [],
  customBlockedDomains: [],
  totalBlocked: 0,
  adsBlocked: 0,
  trackersBlocked: 0,
  // popupsBlocked can be added later if needed
};

// --------------------------------------------------------------------------
// 2. HELPERS – storage & queue
// --------------------------------------------------------------------------
function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (res) => resolve(res));
  });
}

let queue = Promise.resolve();
function enqueue(fn) {
  queue = queue.then(() => fn()).catch((e) => console.error(e));
  return queue;
}

// --------------------------------------------------------------------------
// 3. DOMAIN NORMALISATION
// --------------------------------------------------------------------------
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;
function normalizeDomain(raw) {
  try {
    const s = String(raw).trim();
    const url = new URL(s.includes('://') ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return DOMAIN_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// 4. TAB STATISTICS (session/local storage to survive service‑worker sleep)
// --------------------------------------------------------------------------
async function getTabStats(tabId) {
  try {
    const key = `tab_stats_${tabId}`;
    const storageArea = chrome.storage.session || chrome.storage.local;
    const result = await storageArea.get(key);
    return result[key] || { total: 0, ads: 0, trackers: 0, popups: 0 };
  } catch {
    return { total: 0, ads: 0, trackers: 0, popups: 0 };
  }
}

async function setTabStats(tabId, stats) {
  try {
    const key = `tab_stats_${tabId}`;
    const storageArea = chrome.storage.session || chrome.storage.local;
    await storageArea.set({ [key]: stats });
  } catch (e) {
    console.warn('[My AdBlocker] Không thể lưu tab stats:', e);
  }
}

// --------------------------------------------------------------------------
// 5. APPLY STATE – sync static and dynamic rules
// --------------------------------------------------------------------------
async function applyState() {
  const state = await getState();

  // ----- static rulesets -----
  const desired = [];
  if (state.enabled) {
    if (state.filterNetwork) {
      desired.push(RULESET_ADS, RULESET_POPUPS);
    }
    if (state.filterTrackers) {
      desired.push(RULESET_TRACKERS);
    }
  }
  const currentlyEnabled = await chrome.declarativeNetRequest.getEnabledRulesets();
  const toEnable = desired.filter(id => !currentlyEnabled.includes(id));
  const toDisable = currentlyEnabled.filter(id => !desired.includes(id));
  if (toEnable.length || toDisable.length) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: toEnable,
      disableRulesetIds: toDisable,
    });
  }

  // ----- dynamic rules -----
  const dynamic = [];
  if (state.enabled) {
    // whitelist – allow all requests from domain (main_frame & sub_frame only)
    state.whitelistedDomains.slice(0, 5000).forEach((d, i) => {
      dynamic.push({
        id: 100000 + i,
        priority: 100,
        action: { type: "allowAllRequests" },
        condition: { requestDomains: [d], resourceTypes: ["main_frame", "sub_frame"] },
      });
    });
    // custom block – block every request type from domain
    state.customBlockedDomains.slice(0, 5000).forEach((d, i) => {
      dynamic.push({
        id: 200000 + i,
        priority: 50,
        action: { type: "block" },
        condition: {
          requestDomains: [d],
          resourceTypes: [
            "main_frame",
            "sub_frame",
            "stylesheet",
            "script",
            "image",
            "font",
            "xmlhttprequest",
            "ping",
            "media",
            "other",
          ],
        },
      });
    });
  }
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules: dynamic });
}

// --------------------------------------------------------------------------
// 6. USER‑LEVEL LIST MUTATION
// --------------------------------------------------------------------------
class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserError";
  }
}

async function mutateList(listName, op, raw) {
  const state = await getState();
  const key = listName === "whitelist" ? "whitelistedDomains" : "customBlockedDomains";
  const limit = 5000;
  const list = state[key] || [];
  const domain = normalizeDomain(raw);
  if (!domain) throw new UserError("Tên miền không hợp lệ");
  if (op === "add") {
    if (list.includes(domain)) throw new UserError("Tên miền đã tồn tại trong danh sách");
    if (list.length >= limit) throw new UserError("Đã đạt tối đa 5000 mục");
    const newList = [...list, domain];
    await new Promise(resolve => chrome.storage.local.set({ [key]: newList }, resolve));
    await applyState();
    return newList;
  }
  if (op === "remove") {
    const idx = list.indexOf(domain);
    if (idx === -1) throw new UserError("Tên miền không có trong danh sách");
    const newList = list.slice(0, idx).concat(list.slice(idx + 1));
    await new Promise(resolve => chrome.storage.local.set({ [key]: newList }, resolve));
    await applyState();
    return newList;
  }
  throw new Error("Invalid operation");
}

// --------------------------------------------------------------------------
// 7. MESSAGE HANDLER – new contract
// --------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) {
    return false; // ignore external callers
  }
  const handle = async () => {
    switch (msg.action) {
      case "get_state": {
        const state = await getState();
        return { success: true, state };
      }
      case "set_flag": {
        const { name, value } = msg;
        if (!["enabled", "filterNetwork", "filterTrackers", "filterCosmetic"].includes(name)) {
          return { success: false, error: "Tên cờ không hợp lệ" };
        }
        if (typeof value !== "boolean") {
          return { success: false, error: "Giá trị phải là boolean" };
        }
        await new Promise(resolve => chrome.storage.local.set({ [name]: value }, resolve));
        await applyState();
        return { success: true };
      }
      case "list_add": {
        const { list, domain } = msg;
        if (!["whitelist", "customBlock"].includes(list)) {
          return { success: false, error: "Danh sách không hợp lệ" };
        }
        try {
          const newList = await mutateList(list, "add", domain);
          return { success: true, domains: newList };
        } catch (e) {
          if (e instanceof UserError) return { success: false, error: e.message };
          console.error(e);
          return { success: false, error: "Lỗi hệ thống" };
        }
      }
      case "list_remove": {
        const { list, domain } = msg;
        if (!["whitelist", "customBlock"].includes(list)) {
          return { success: false, error: "Danh sách không hợp lệ" };
        }
        try {
          const newList = await mutateList(list, "remove", domain);
          return { success: true, domains: newList };
        } catch (e) {
          if (e instanceof UserError) return { success: false, error: e.message };
          console.error(e);
          return { success: false, error: "Lỗi hệ thống" };
        }
      }
      case "get_stats": {
        const { tabId } = msg;
        if (typeof tabId !== "number") return { success: false, error: "tabId missing" };
        const stats = await getTabStats(tabId);
        const totals = await new Promise(resolve => chrome.storage.local.get(["totalBlocked", "adsBlocked", "trackersBlocked"], resolve));
        return {
          success: true,
          pageBlocked: stats.total,
          pageAds: stats.ads,
          pageTrackers: stats.trackers,
          pagePopups: stats.popups,
          totalBlocked: totals.totalBlocked || 0,
          adsBlocked: totals.adsBlocked || 0,
          trackersBlocked: totals.trackersBlocked || 0,
        };
      }
      case "reset_stats": {
        const storageArea = chrome.storage.session || chrome.storage.local;
        // clear per‑tab stats
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(t => storageArea.remove(`tab_stats_${t.id}`));
        });
        await new Promise(resolve => chrome.storage.local.set({ totalBlocked: 0, adsBlocked: 0, trackersBlocked: 0 }, resolve));
        return { success: true };
      }
      default:
        return { success: false, error: "Hành động không hỗ trợ" };
    }
  };
  handle().then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
  return true; // async response
});

// --------------------------------------------------------------------------
// 8. INITIALISE – install / startup
// --------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => enqueue(applyState));
chrome.runtime.onStartup.addListener(() => enqueue(applyState));

// --------------------------------------------------------------------------
// 9. STATISTICS – rule‑matched debug (if available)
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
      if (tabId > 0) {
        const stats = await getTabStats(tabId);
        stats.total++;
        if (category === "trackers") stats.trackers++;
        else if (category === "popups") stats.popups++;
        else stats.ads++;
        await setTabStats(tabId, stats);
        const total = stats.total;
        if (total > 0) {
          chrome.action.setBadgeText({ tabId, text: total > 999 ? "999+" : total.toString() });
          chrome.action.setBadgeBackgroundColor({ tabId, color: "#00E5A3" });
        } else {
          chrome.action.setBadgeText({ tabId, text: "" });
        }
      }
      // global counters
      const inc = await new Promise(resolve => chrome.storage.local.get(["totalBlocked", "adsBlocked", "trackersBlocked"], resolve));
      const upd = {};
      upd.totalBlocked = (inc.totalBlocked || 0) + 1;
      if (category === "trackers") upd.trackersBlocked = (inc.trackersBlocked || 0) + 1;
      else if (category === "ads") upd.adsBlocked = (inc.adsBlocked || 0) + 1;
      await new Promise(resolve => chrome.storage.local.set(upd, resolve));
    } catch (e) {
      console.warn("[My AdBlocker] Lỗi ghi nhận thống kê:", e);
    }
  });
}

// --------------------------------------------------------------------------
// 10. CLEAN‑UP – tab navigation & removal
// --------------------------------------------------------------------------
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    setTabStats(tabId, { total: 0, ads: 0, trackers: 0, popups: 0 });
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const storageArea = chrome.storage.session || chrome.storage.local;
  storageArea.remove(`tab_stats_${tabId}`).catch(() => {});
});
