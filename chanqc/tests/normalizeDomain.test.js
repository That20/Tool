// normalizeDomain.test.js
// Node script without external libraries
// Re-implementation of normalizeDomain from background.js for testing purposes
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

const tests = [
  {input: 'dantri.com.vn', expect: 'dantri.com.vn'},
  {input: 'HTTPS://WWW.Example.COM/path?x=1', expect: 'example.com'},
  {input: 'example.com:8080', expect: 'example.com'},
  {input: '*.com', expect: null},
  {input: 'a|b.com', expect: null},
  {input: 'localhost', expect: null},
  {input: '192.168.1.1', expect: null},
  {input: 'foo..com', expect: null},
  {input: '-bad.com', expect: null},
];
let passed = 0;
for (const {input, expect} of tests) {
  const result = normalizeDomain(input);
  const ok = result === expect;
  console.log(`${ok ? 'PASS' : 'FAIL'}: '${input}' => ${result}`);
  if (ok) passed++;
}
console.log(`\n${passed}/${tests.length} tests passed.`);
