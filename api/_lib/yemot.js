function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('he-IL') : String(value);
}

function parentExtension(apiExtension) {
  if (!apiExtension) return '';
  const clean = String(apiExtension).split('^')[0];
  const parts = clean.split('*').filter(Boolean);
  parts.pop();
  return parts.join('*');
}

function readParts(text) {
  return String(text).replace(/[=,]/g, ' ').trim().split(/\s+/).filter(Boolean).map(word => `t-${word}`).join('.');
}

export { formatNumber, parentExtension, readParts };
