import { getWorldStats } from './_lib/worldstats.js';
import { integerToHebrewWords, parentExtension, readParts } from './_lib/yemot.js';

const OPTIONS = [
  ['population_now', 'אוכלוסיית העולם המשוערת'],
  ['births_today', 'לידות היום'],
  ['births_this_year', 'לידות השנה'],
  ['deaths_today', 'מקרי מוות היום'],
  ['deaths_this_year', 'מקרי מוות השנה'],
  ['growth_today', 'גידול האוכלוסייה היום'],
  ['growth_this_year', 'גידול האוכלוסייה השנה']
];

function send(res, text, back = '') {
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const navigation = back ? `,go_to_folder=${back}` : '';
  res.end(`read=${readParts(text)}=wm_nav,no,1,1,5,Digits,no,no,,,1,Ok${navigation}`);
}
function menu() {
  return 'ברוכים הבאים לסטטיסטיקת העולם. הקישו 1 לאוכלוסיית העולם. הקישו 2 למספר הלידות היום. הקישו 3 למספר הלידות השנה. הקישו 4 למספר מקרי המוות היום. הקישו 5 למספר מקרי המוות השנה. הקישו 6 לגידול האוכלוסייה היום. הקישו 7 לגידול האוכלוסייה השנה. הקישו 8 להקראת כל הנתונים.';
}
function spokenCounter(counter) {
  return `${counter.label}. ${integerToHebrewWords(counter.value)}. ${counter.as_of_text}. שימו לב, זהו אומדן המבוסס על נתונים שנתיים רשמיים ולא ספירה מדויקת בזמן אמת.`;
}
export default async function handler(request, response) {
  const url = new URL(request.url || '/', `https://${request.headers?.host || 'localhost'}`);
  const digits = String(url.searchParams.get('Digits') || '').trim();
  const choice = String(url.searchParams.get('choice') || url.searchParams.get('menu') || '').trim();
  const back = parentExtension(url.searchParams.get('ApiExtension'));
  const selected = choice || digits;
  if (!selected) return send(response, menu(), back);
  if (!/^[1-8]$/.test(selected)) return send(response, 'בחירה לא תקינה. ' + menu(), back);
  try {
    const stats = await getWorldStats();
    if (selected === '8') {
      const limitRaw = Number(url.searchParams.get('limit') || OPTIONS.length);
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, OPTIONS.length) : OPTIONS.length;
      const lines = stats.counters.slice(0, limit).map(spokenCounter);
      return send(response, 'סטטיסטיקת העולם. ' + lines.join('. '), back);
    }
    const [id] = OPTIONS[Number(selected) - 1];
    const counter = stats.counters.find(item => item.id === id);
    if (!counter) return send(response, 'לא נמצא הנתון המבוקש. ' + menu(), back);
    return send(response, spokenCounter(counter), back);
  } catch (error) {
    return send(response, error?.name === 'AbortError'
      ? 'מקור הנתונים לא הגיב בזמן. נא לנסות שוב מאוחר יותר.'
      : 'לא ניתן לקבל כרגע את נתוני העולם. נא לנסות שוב מאוחר יותר.', back);
  }
}
