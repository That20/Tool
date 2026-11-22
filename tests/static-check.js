// static-check.js
// Node script – no external dependencies – performs static validation for the My AdBlocker extension.
// Prints PASS/FAIL for each requirement as requested.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function printResult(name, ok, msg) {
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}${msg ? ' - ' + msg : ''}`);
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

// 1. Manifest validation
let manifestPath = path.resolve('C:/tool/chanqc/manifest.json');
let manifest = null;
let manifestOk = false;
if (!fileExists(manifestPath)) {
  printResult('1.ManifestExists', false, 'manifest.json missing');
} else {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifestOk = true;
    printResult('1.ManifestJSON', true);
  } catch (e) {
    printResult('1.ManifestJSON', false, e.message);
  }
}

function checkRefExists(refPath, description) {
  let full = path.resolve('C:/tool/chanqc', refPath);
  if (fileExists(full)) return true;
  printResult('1.Ref.' + description, false, `${refPath} missing`);
  return false;
}

if (manifestOk) {
  // service worker
  if (manifest.background && manifest.background.service_worker) {
    checkRefExists(manifest.background.service_worker, 'service_worker');
  }
  // rule resources
  if (manifest.declarative_net_request && manifest.declarative_net_request.rule_resources) {
    manifest.declarative_net_request.rule_resources.forEach(r => {
      if (r.path) checkRefExists(r.path, `rule_${r.id}`);
    });
  }
  // content scripts
  if (Array.isArray(manifest.content_scripts)) {
    manifest.content_scripts.forEach((cs, idx) => {
      (cs.js || []).forEach(js => checkRefExists(js, `content_js_${idx}`));
      (cs.css || []).forEach(css => checkRefExists(css, `content_css_${idx}`));
    });
  }
  // default popup
  if (manifest.action && manifest.action.default_popup) {
    checkRefExists(manifest.action.default_popup, 'default_popup');
  }
  // options UI page
  if (manifest.options_ui && manifest.options_ui.page) {
    checkRefExists(manifest.options_ui.page, 'options_ui');
  }
  // icons
  if (manifest.icons) {
    Object.values(manifest.icons).forEach(iconPath => {
      checkRefExists(iconPath, 'icon');
    });
  }
}

// 2. Rules files validation
let rulesDir = path.resolve('C:/tool/chanqc/rules');
let ruleFiles = [];
if (dirExists(rulesDir)) {
  ruleFiles = fs.readdirSync(rulesDir).filter(f => f.startsWith('rules_') && f.endsWith('.json'));
}
let allRulesOk = true;
ruleFiles.forEach(file => {
  let full = path.join(rulesDir, file);
  try {
    let data = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(data)) throw new Error('not an array');
    let ids = new Set();
    data.forEach((r, i) => {
      if (!('id' in r) || !('priority' in r) || !('action' in r) || !('condition' in r)) {
        throw new Error(`missing fields in rule index ${i}`);
      }
      if (ids.has(r.id)) throw new Error(`duplicate id ${r.id}`);
      ids.add(r.id);
    });
    printResult(`2.Rules.${file}`, true);
  } catch (e) {
    allRulesOk = false;
    printResult(`2.Rules.${file}`, false, e.message);
  }
});
if (ruleFiles.length === 0) {
  printResult('2.RulesPresence', false, 'no rule files found');
}

// 3. Syntax check for all .js files (excluding _metadata)
function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(name => {
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (name === '_metadata') return; // skip
      results = results.concat(getAllJsFiles(filePath));
    } else if (name.endsWith('.js')) {
      results.push(filePath);
    }
  });
  return results;
}
let jsFiles = getAllJsFiles(path.resolve('C:/tool/chanqc'));
let syntaxAllOk = true;
jsFiles.forEach(fp => {
  try {
    execSync(`node --check "${fp}"`, { stdio: 'ignore' });
    // no output means success
  } catch (e) {
    syntaxAllOk = false;
    printResult('3.Syntax.' + path.relative('C:/tool/chanqc', fp), false, e.message);
  }
});
if (syntaxAllOk) printResult('3.SyntaxAll', true);

// Helper to extract <script src> order
function getScriptSrcs(htmlPath) {
  const content = fs.readFileSync(htmlPath, 'utf8');
  const regex = /<script\s+src=["']([^"']+)["'][^>]*><\/script>/gi;
  let match, arr = [];
  while ((match = regex.exec(content)) !== null) {
    arr.push(match[1]);
  }
  return arr;
}

// 4. HTML script checks
['popup/popup.html', 'dashboard.html'].forEach(rel => {
  const htmlPath = path.resolve('C:/tool/chanqc', rel);
  if (!fileExists(htmlPath)) {
    printResult(`4.HTML.${rel}`, false, 'file missing');
    return;
  }
  const srcs = getScriptSrcs(htmlPath);
  // existence
  srcs.forEach(src => {
    const full = path.resolve('C:/tool/chanqc', src);
    if (!fileExists(full)) {
      printResult(`4.ScriptExist.${rel}.${src}`, false, 'script file missing');
    }
  });
  // ordering: shared/api.js before popup.js or dashboard.js
  const sharedIdx = srcs.findIndex(s => s.includes('shared/api.js'));
  const target = rel.includes('popup') ? 'popup.js' : 'dashboard.js';
  const targetIdx = srcs.findIndex(s => s.endsWith(target));
  if (sharedIdx === -1) {
    printResult(`4.Order.${rel}`, false, 'shared/api.js not found');
  } else if (targetIdx === -1) {
    printResult(`4.Order.${rel}`, false, target + ' not found');
  } else if (sharedIdx < targetIdx) {
    printResult(`4.Order.${rel}`, true);
  } else {
    printResult(`4.Order.${rel}`, false, 'shared/api.js after target');
  }
});

// 5. Action mapping between UI scripts and background
function collectActionsFromFile(fp) {
  const txt = fs.readFileSync(fp, 'utf8');
  const regex = /action\s*[:=]\s*['"]([^'\"]+)['"]/g;
  let m, set = new Set();
  while ((m = regex.exec(txt)) !== null) {
    set.add(m[1]);
  }
  return set;
}
const uiFiles = ['popup/popup.js', 'dashboard.js', 'shared/api.js'].map(p => path.resolve('C:/tool/chanqc', p));
let uiActions = new Set();
uiFiles.forEach(fp => {
  if (fileExists(fp)) {
    const set = collectActionsFromFile(fp);
    set.forEach(a => uiActions.add(a));
  }
});
// Background handlers
const bgPath = path.resolve('C:/tool/chanqc/background/background.js');
let bgHandlers = new Set();
if (fileExists(bgPath)) {
  const bgTxt = fs.readFileSync(bgPath, 'utf8');
  const caseRegex = /case\s+['"]([^'\"]+)['"]:/g;
  let m;
  while ((m = caseRegex.exec(bgTxt)) !== null) {
    bgHandlers.add(m[1]);
  }
}
// Actions sent but not handled
let missingHandlers = [];
uiActions.forEach(a => {
  if (!bgHandlers.has(a)) missingHandlers.push(a);
});
if (missingHandlers.length === 0) {
  printResult('5.HandlersMissing', true);
} else {
  printResult('5.HandlersMissing', false, missingHandlers.join(', '));
}
// Handlers defined but never called
let unusedHandlers = [];
bgHandlers.forEach(a => {
  if (!uiActions.has(a)) unusedHandlers.push(a);
});
if (unusedHandlers.length === 0) {
  printResult('5.HandlersUnused', true);
} else {
  printResult('5.HandlersUnused', false, unusedHandlers.join(', '));
}

// 6. normalizeDomain behavior
function loadNormalizeDomain() {
  const bgTxt = fs.readFileSync(bgPath, 'utf8');
  const fnMatch = bgTxt.match(/function\s+normalizeDomain\s*\([^)]*\)\s*{[\s\S]*?}/);
  if (!fnMatch) return null;
  const fnBody = fnMatch[0];
  // Create sandbox environment with URL global
  const sandbox = { URL, console: { log: () => {} } };
  const wrapper = `(function(){ const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i; ${fnBody} return normalizeDomain; })()`;
  const norm = eval(wrapper);
  return norm;
}
let normFn = null;
try { normFn = loadNormalizeDomain(); } catch (e) { }
if (typeof normFn !== 'function') {
  printResult('6.normalizeDomain', false, 'function not found');
} else {
  const tests = [
    {in: 'dantri.com.vn', ok: true, out: 'dantri.com.vn'},
    {in: 'HTTPS://WWW.Example.COM/path?x=1', ok: true, out: 'example.com'},
    {in: 'example.com:8080', ok: true, out: 'example.com'},
    {in: '*.com', ok: false},
    {in: 'a|b.com', ok: false},
    {in: 'localhost', ok: false},
    {in: '192.168.1.1', ok: false},
    {in: 'foo..com', ok: false},
    {in: '-bad.com', ok: false},
  ];
  let allOk = true;
  tests.forEach(t => {
    let res;
    try { res = normFn(t.in); } catch (e) { res = null; }
    const passed = (t.ok && res === t.out) || (!t.ok && res === null);
    if (!passed) {
      allOk = false;
      printResult('6.normalizeDomain', false, `input ${t.in} gave ${res}`);
    }
  });
  if (allOk) printResult('6.normalizeDomain', true);
}

// 7. Definitions used in popup.js and dashboard.js
function checkDefinitions(fileRel, symbols) {
  const fp = path.resolve('C:/tool/chanqc', fileRel);
  if (!fileExists(fp)) { printResult(`7.Defs.${fileRel}`, false, 'file missing'); return; }
  const txt = fs.readFileSync(fp, 'utf8');
  symbols.forEach(sym => {
    const regex = new RegExp('\\b' + sym + '\\b');
    const found = regex.test(txt);
    if (found) {
      // special cases for api, animateNumber etc.
      if (sym === 'api') {
        // should be defined globally via shared/api.js; we check that file contains window.api assignment
        const apiPath = path.resolve('C:/tool/chanqc/shared/api.js');
        if (fileExists(apiPath)) {
          const apiTxt = fs.readFileSync(apiPath, 'utf8');
          const defined = /window\.api\s*=/.test(apiTxt);
          printResult(`7.Defs.${sym}.${fileRel}`, defined, defined ? '' : 'api not exported');
        } else {
          printResult(`7.Defs.${sym}.${fileRel}`, false, 'shared/api.js missing');
        }
      } else if (sym === 'animateNumber') {
        // look for function definition in any .js file (excluding popup/dashboard themselves)
        const allJs = getAllJsFiles(path.resolve('C:/tool/chanqc'));
        const foundDef = allJs.some(p => /function\s+animateNumber\b/.test(fs.readFileSync(p, 'utf8')));
        printResult(`7.Defs.${sym}.${fileRel}`, foundDef, foundDef ? '' : 'function not defined');
      } else if (sym === 'matchEntry' || sym === 'renderDomainList') {
        // these are in shared/api.js
        const apiPath = path.resolve('C:/tool/chanqc/shared/api.js');
        if (fileExists(apiPath)) {
          const apiTxt = fs.readFileSync(apiPath, 'utf8');
          const defined = new RegExp('function\s+' + sym + '\b').test(apiTxt) || new RegExp(sym + '\s*:\s*function').test(apiTxt);
          printResult(`7.Defs.${sym}.${fileRel}`, defined, defined ? '' : 'function not defined in api.js');
        } else {
          printResult(`7.Defs.${sym}.${fileRel}`, false, 'shared/api.js missing');
        }
      } else {
        // generic: assume defined somewhere
        printResult(`7.Defs.${sym}.${fileRel}`, true);
      }
    } else {
      printResult(`7.Defs.${sym}.${fileRel}`, false, 'symbol not used/not found');
    }
  });
}

checkDefinitions('popup/popup.js', ['api', 'animateNumber', 'matchEntry', 'renderDomainList']);
checkDefinitions('dashboard.js', ['api', 'animateNumber', 'matchEntry', 'renderDomainList']);

// End of script
