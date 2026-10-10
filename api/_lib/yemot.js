function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value);
}

function digitsToHebrewWords(value) {
  const digits = { '0':'אפס', '1':'אחת', '2':'שתיים', '3':'שלוש', '4':'ארבע', '5':'חמש', '6':'שש', '7':'שבע', '8':'שמונה', '9':'תשע' };
  return String(value).replace(/\D/g, '').split('').map(digit => digits[digit]).join(' ');
}

function parentExtension(apiExtension) {
  if (!apiExtension) return '';
  const clean = String(apiExtension).split('^')[0];
  const parts = clean.split('*').filter(Boolean);
  parts.pop();
  return parts.join('*');
}

function numericParts(raw) {
  const normalized = String(raw).replace(/,/g, '');
  if (normalized.includes('.')) {
    const [whole, fraction] = normalized.split('.');
    return [...numericParts(whole), 't-נקודה', ...fraction.split('').map(digit => `n-${digit}`)];
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 0) return [`t-${raw}`];
  if (value <= 2147483647) return [`n-${value}`];
  const scales = [[1e9, 'מיליארד'], [1e6, 'מיליון'], [1e3, 'אלף']];
  let remainder = value;
  const parts = [];
  for (const [scale, label] of scales) {
    const group = Math.floor(remainder / scale);
    if (group > 0) {
      parts.push(`n-${group}`, `t-${label}`);
      remainder %= scale;
    }
  }
  if (remainder > 0) parts.push(`n-${remainder}`);
  return parts;
}

function readParts(text) {
  const input = String(text).replace(/[=;!?]/g, ' ').replace(/\.(?!\d)/g, ' ');
  const pattern = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  const parts = [];
  let cursor = 0;
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0;
    const phrase = input.slice(cursor, index).trim();
    if (phrase) parts.push(`t-${phrase.replace(/\s+/g, ' ')}`);
    parts.push(...numericParts(match[0]));
    cursor = index + match[0].length;
  }
  const tail = input.slice(cursor).trim();
  if (tail) parts.push(`t-${tail.replace(/\s+/g, ' ')}`);
  return parts.join('.');
}

export { formatNumber, digitsToHebrewWords, parentExtension, readParts };
