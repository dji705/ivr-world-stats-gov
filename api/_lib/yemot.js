function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('en-US') : String(value);
}

function smallNumberWords(n) {
  const ones = ['אפס','אחת','שתיים','שלוש','ארבע','חמש','שש','שבע','שמונה','תשע'];
  const teens = {10:'עשר',11:'אחת עשרה',12:'שתים עשרה',13:'שלוש עשרה',14:'ארבע עשרה',15:'חמש עשרה',16:'שש עשרה',17:'שבע עשרה',18:'שמונה עשרה',19:'תשע עשרה'};
  const tens = {20:'עשרים',30:'שלושים',40:'ארבעים',50:'חמישים',60:'שישים',70:'שבעים',80:'שמונים',90:'תשעים'};
  if (n < 10) return ones[n];
  if (n < 20) return teens[n];
  if (n < 100) return tens[Math.floor(n / 10) * 10] + (n % 10 ? ' ו' + ones[n % 10] : '');
  if (n === 100) return 'מאה';
  if (n < 200) return 'מאה ' + smallNumberWords(n - 100);
  if (n < 300) return 'מאתיים' + (n > 200 ? ' ' + smallNumberWords(n - 200) : '');
  if (n < 400) return 'שלוש מאות' + (n > 300 ? ' ' + smallNumberWords(n - 300) : '');
  if (n < 500) return 'ארבע מאות' + (n > 400 ? ' ' + smallNumberWords(n - 400) : '');
  if (n < 600) return 'חמש מאות' + (n > 500 ? ' ' + smallNumberWords(n - 500) : '');
  if (n < 700) return 'שש מאות' + (n > 600 ? ' ' + smallNumberWords(n - 600) : '');
  if (n < 800) return 'שבע מאות' + (n > 700 ? ' ' + smallNumberWords(n - 700) : '');
  if (n < 900) return 'שמונה מאות' + (n > 800 ? ' ' + smallNumberWords(n - 800) : '');
  return 'תשע מאות' + (n > 900 ? ' ' + smallNumberWords(n - 900) : '');
}

function integerToHebrewWords(value) {
  let n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 1000) return smallNumberWords(n);
  const scales = [
    [1e12, 'טריליון'], [1e9, 'מיליארד'], [1e6, 'מיליון'], [1e3, 'אלף']
  ];
  const parts = [];
  for (const [scale, label] of scales) {
    if (n >= scale) {
      const group = Math.floor(n / scale);
      parts.push(integerToHebrewWords(group) + ' ' + label);
      n %= scale;
    }
  }
  if (n) parts.push(smallNumberWords(n));
  return parts.join(' ');
}

function numberWords(value) {
  const str = String(value);
  if (/^\d{1,4}$/.test(str)) return integerToHebrewWords(Number(str));
  if (/^\d{1,3}(,\d{3})+$/.test(str)) return integerToHebrewWords(Number(str.replace(/,/g, '')));
  if (/^\d+\.\d+$/.test(str)) {
    const [whole, decimal] = str.split('.');
    return integerToHebrewWords(Number(whole)) + ' נקודה ' + decimal.split('').map(d => integerToHebrewWords(Number(d))).join(' ');
  }
  return str;
}

function parentExtension(apiExtension) {
  if (!apiExtension) return '';
  const clean = String(apiExtension).split('^')[0];
  const parts = clean.split('*').filter(Boolean);
  parts.pop();
  return parts.join('*');
}

function readParts(text) {
  const tokens = String(text).match(/\d{1,3}(?:,\d{3})+|\d+\.\d+|\d+|[^\s]+/g) || [];
  return tokens.map(token => `t-${numberWords(token).replace(/[=,]/g, ' ')}`).join('.').replace(/\s+/g, ' ').trim();
}

export { formatNumber, integerToHebrewWords, numberWords, parentExtension, readParts };
