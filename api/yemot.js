// שלוחת API לימות המשיח — רכב, תו נכה ומפלס הכינרת
// קובץ יחיד, ללא תלויות חיצוניות. Node.js 18+ / Vercel.

const DATA_GOV = 'https://data.gov.il/api/3/action/datastore_search';
const GOV_TIMEOUT_MS = 8000;
const RESOURCES = {
  vehicleMain: '053cea08-09bc-40ec-8f7a-156f0677aff3',
  vehicleExtra: '0866573c-40cd-4ca8-91d2-9dd2d7a492e5',
  disabled: 'c8b9f9c8-4612-4068-934f-d4acd2e3c06e',
  kinneret: '2de7b543-e13d-4e7e-b4c8-56071bc4d3c8'
};

function send(res, body) {
  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function buildRead(messages, varName, { max = 1, min = 1, secWait = 7, keyboard = 'Digits' } = {}) {
  return \`read=\${messages.join('.')}=\${varName},no,\${max},\${min},\${secWait},\${keyboard}\`;
}
function buildSay(messages) {
  return \`id_list_message=\${messages.join('.')}\`;
}
const MENU_MAIN = [
  't-שלום וברוכים הבאים למערכת המידע הטלפונית',
  't-לבדיקת פרטי רכב הקישו.n-1',
  't-לבדיקת תו נכה הקישו.n-2',
  't-למפלס הכינרת העדכני הקישו.n-3',
  't-לסיום הקישו.n-0'
];
const MENU_SHORT = [
  't-לבדיקה נוספת לרכב הקישו.n-1',
  't-לתו נכה הקישו.n-2',
  't-למפלס הכינרת הקישו.n-3',
  't-לסיום הקישו.n-0'
];
function menuRead(prefix = []) {
  return buildRead([...prefix, ...MENU_MAIN], 'nav', { max: 1, min: 1, secWait: 7 });
}
function shortMenuRead(prefix = []) {
  return buildRead([...prefix, ...MENU_SHORT], 'nav', { max: 1, min: 1, secWait: 7 });
}
function carNumberRead(prefix = []) {
  return buildRead([...prefix, 't-הקלידו את מספר הרישוי וסיימו בסולמית'], 'car', {
    max: 9, min: 5, secWait: 10, keyboard: 'Digits'
  });
}
function pick(value) {
  if (Array.isArray(value)) return pick(value[value.length - 1]);
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
async function govQuery(resourceId, { filters, sort } = {}) {
  const url = new URL(DATA_GOV);
  url.searchParams.set('resource_id', resourceId);
  url.searchParams.set('limit', '1');
  if (filters) url.searchParams.set('filters', JSON.stringify(filters));
  if (sort) url.searchParams.set('sort', sort);
  const response = await fetch(url, { signal: AbortSignal.timeout(GOV_TIMEOUT_MS) });
  if (!response.ok) throw new Error(\`data.gov.il HTTP \${response.status}\`);
  const data = await response.json();
  if (!data.success || !data.result) throw new Error('Invalid data.gov.il response');
  return data.result.records?.[0] || null;
}
function toYemotDate(value) {
  if (!value) return null;
  const s = String(value);
  let y, m, d;
  if (/^\d{8}$/.test(s)) {
    y = s.slice(0, 4); m = s.slice(4, 6); d = s.slice(6, 8);
  } else {
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    [, y, m, d] = match;
  }
  return \`\${d}/\${m}/\${y}\`;
}
function isValidPlate(car) { return /^\d{5,9}$/.test(car); }
function plateDigits(car) {
  const words = ['אפס','אחת','שתיים','שלוש','ארבע','חמש','שש','שבע','שמונה','תשע'];
  return String(car).split('').map(d => \`t-\${words[Number(d)]}\`);
}
function decimalSpeech(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return [\`t-\${String(value)}\`];
  const parts = [];
  if (n < 0) parts.push('t-מינוס');
  const [whole, fractionRaw = ''] = Math.abs(n).toString().split('.');
  parts.push(\`n-\${whole}\`);
  const fraction = fractionRaw.replace(/0+$/, '');
  if (fraction) parts.push('t-נקודה', ...fraction.split('').map(d => \`n-\${d}\`));
  return parts;
}
function dateSpeech(value) {
  const date = toYemotDate(value);
  return date ? [\`date-\${date}\`] : [];
}
async function vehicleResponse(car) {
  if (!isValidPlate(car)) return carNumberRead(['t-מספר הרישוי שהוקש אינו תקין']);
  let record;
  try {
    record = await govQuery(RESOURCES.vehicleMain, { filters: { mispar_rechev: Number(car) } });
    if (!record) record = await govQuery(RESOURCES.vehicleExtra, { filters: { mispar_rechev: Number(car) } });
  } catch {
    return shortMenuRead(['t-לא ניתן לקבל כרגע את נתוני הרכב. אפשר לנסות שוב מאוחר יותר']);
  }
  if (!record) return shortMenuRead(['t-לא נמצא רכב שמספרו', ...plateDigits(car)]);
  const messages = ['t-תוצאות הבדיקה למספר רישוי', ...plateDigits(car)];
  if (record.tozeret_nm) messages.push(\`t-יצרן.t-\${record.tozeret_nm}\`);
  const model = record.kinuy_mishari || record.degem_nm;
  if (model) messages.push(\`t-דגם.t-\${model}\`);
  if (record.shnat_yitzur) messages.push(\`t-שנת ייצור.n-\${record.shnat_yitzur}\`);
  if (record.tzeva_rechev) messages.push(\`t-צבע.t-\${record.tzeva_rechev}\`);
  if (record.sug_delek_nm) messages.push(\`t-סוג דלק.t-\${record.sug_delek_nm}\`);
  if (record.baalut) messages.push(\`t-בעלות.t-\${record.baalut}\`);
  const expiry = dateSpeech(record.tokef_dt);
  if (expiry.length) messages.push('t-תוקף רישיון עד', ...expiry);
  const test = dateSpeech(record.mivchan_acharon_dt);
  if (test.length) messages.push('t-מבחן רישוי אחרון', ...test);
  if (record.grira_nm) messages.push(\`t-וו גרירה.t-\${record.grira_nm}\`);
  return shortMenuRead(messages);
}
async function disabledResponse(car) {
  if (!isValidPlate(car)) return carNumberRead(['t-מספר הרישוי שהוקש אינו תקין']);
  let record;
  try {
    record = await govQuery(RESOURCES.disabled, { filters: { 'MISPAR RECHEV': Number(car) } });
  } catch {
    return shortMenuRead(['t-לא ניתן לקבל כרגע את נתוני תו הנכה. אפשר לנסות שוב מאוחר יותר']);
  }
  if (!record) return shortMenuRead(['t-לא נמצא תו נכה לרכב שמספרו', ...plateDigits(car)]);
  const messages = ['t-נמצא תו נכה לרכב מספר', ...plateDigits(car)];
  const issued = dateSpeech(record['TAARICH HAFAKAT TAG']);
  if (issued.length) messages.push('t-התו הופק בתאריך', ...issued);
  return shortMenuRead(messages);
}
async function kinneretResponse() {
  let record;
  try {
    record = await govQuery(RESOURCES.kinneret, { sort: 'Survey_Date desc' });
  } catch {
    return shortMenuRead(['t-לא ניתן לקבל כרגע את מפלס הכינרת. אפשר לנסות שוב מאוחר יותר']);
  }
  if (!record || record.Kinneret_Level === null || record.Kinneret_Level === undefined) {
    return shortMenuRead(['t-לא נמצאה מדידה עדכנית של מפלס הכינרת']);
  }
  const messages = ['t-מפלס הכינרת במדידה האחרונה הוא', ...decimalSpeech(record.Kinneret_Level), 't-מטר'];
  const surveyDate = dateSpeech(record.Survey_Date);
  if (surveyDate.length) messages.push('t-המדידה מיום', ...surveyDate);
  return shortMenuRead(messages);
}

export default async function handler(req, res) {
  try {
    const query = { ...(req.query || {}), ...(req.body || {}) };
    const nav = pick(query.nav);
    const car = pick(query.car).replace(/\D/g, '');
    if (car && (nav === '1' || nav === '2')) {
      return send(res, nav === '1' ? await vehicleResponse(car) : await disabledResponse(car));
    }
    if (nav === '1' || nav === '2') return send(res, carNumberRead());
    if (nav === '3') return send(res, await kinneretResponse());
    if (nav === '0') return send(res, buildSay(['t-תודה שהתקשרתם. להתראות']));
    if ('nav' in query && nav === '') return send(res, buildSay(['t-לא התקבלה בחירה. תודה שהתקשרתם ולהתראות']));
    if (nav !== '') return send(res, shortMenuRead(['t-לא זיהיתי את הבחירה']));
    return send(res, menuRead());
  } catch {
    return send(res, buildSay(['t-אירעה תקלה זמנית. אנא נסו שוב מאוחר יותר']));
  }
}
