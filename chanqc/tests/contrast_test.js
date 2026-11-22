// contrast_test.js
// Simple WCAG contrast checker for key CSS variable pairs
const fs = require('fs');
const css = fs.readFileSync('C:/tool/chanqc/popup/popup.css', 'utf8');
function getVar(name) {
  const regex = new RegExp(`\\${name}:\\s*([^;]+);`);
  const m = css.match(regex);
  return m ? m[1].trim() : null;
}
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const int = parseInt(hex, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}
function lum({r,g,b}) {
  const srgb = [r,g,b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  });
  return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
}
function contrast(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const L1 = lum(rgb1);
  const L2 = lum(rgb2);
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  return ratio.toFixed(2);
}
const pairs = [
  {bg: getVar('--bg-surface'), txt: getVar('--text-dim'), name: 'surface vs dim text'},
  {bg: getVar('--bg-app'), txt: getVar('--text-dim'), name: 'app vs dim text'},
];
for (const p of pairs) {
  if (p.bg && p.txt) {
    console.log(`${p.name}: ${contrast(p.bg, p.txt)}:1`);
  }
}
