import { RESOURCES, VEHICLE_FIELDS, requestUrl, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts, digitsToHebrewWords } from './_lib/yemot.js';

function sendYemot(res, text, goTo = '', mode = 'menu') {
  const navigation = goTo ? `,go_to_folder=${goTo}` : '';
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const inputCommand = mode === 'combined'
    ? 'wm_nav,no,1,1,10,Digits,no,no,#,,1,Ok'
    : 'wm_nav,no,1,1,1,Digits,no,no,,,1,Ok';
  res.end(`read=${readParts(text)}=${inputCommand}${navigation}`);
}

function menuText() {
  return 'שלום וברוכים הבאים למערכת המידע הטלפונית. לבדיקת פרטי רכב הקישו 1, לאחר מכן הקלידו את מספר הרישוי וסיימו בסולמית. לבדיקת תו נכה לרכב הקישו 2, לאחר מכן הקלידו את מספר הרישוי וסיימו בסולמית. לקבלת מפלס הכינרת העדכני הקישו 3 וסולמית. בכל שלב ניתן להתחיל מחדש באמצעות הקשה על כוכבית.';
}

function hebrewDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('he-IL');
}

export default async function handler(request, res) {
  const url = requestUrl(request);
  const rawDigits = url.searchParams.get('Digits') || url.searchParams.get('plate') || '';
  const digits = String(rawDigits).replace(/[^0-9]/g, '');
  const back = parentExtension(url.searchParams.get('ApiExtension'));

  if (!digits) return sendYemot(res, menuText(), back, 'combined');

  const service = digits[0];
  const plate = digits.slice(1);

  if (service === '3' && digits === '3') {
    try {
      const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
      const record = result.records?.[0];
      if (!record) return sendYemot(res, 'לא נמצאה מדידה עדכנית של מפלס הכינרת.', back, 'menu');
      const level = Number(record.Kinneret_Level);
      const levelText = Number.isFinite(level) ? formatNumber(level) : String(record.Kinneret_Level);
      return sendYemot(res, `מפלס הכינרת במדידה מתאריך ${hebrewDate(record.Survey_Date)} הוא ${levelText} מטרים.`, back, 'menu');
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני מפלס הכינרת. אפשר לנסות שוב.', back, 'menu');
    }
  }

  if (service !== '1' && service !== '2') {
    return sendYemot(res, 'לא זיהיתי את הבחירה. ' + menuText(), back, 'menu');
  }

  if (!validatePlate(plate)) {
    const instructions = service === '1'
      ? 'לבדיקת פרטי רכב יש להקיש 1, אחריו מספר רישוי בן 5 עד 9 ספרות, ולסיים בסולמית.'
      : 'לבדיקת תו נכה יש להקיש 2, אחריו מספר רישוי בן 5 עד 9 ספרות, ולסיים בסולמית.';
    return sendYemot(res, instructions, back, 'combined');
  }

  try {
    if (service === '2') {
      const record = await findRecord(RESOURCES.disability, plate);
      return sendYemot(res, record
        ? `נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`
        : `לא נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`, back, 'menu');
    }

    const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
    const record = Object.assign({}, ...records.filter(Boolean));
    if (!Object.keys(record).length) return sendYemot(res, `לא נמצא רכב שמספרו ${digitsToHebrewWords(plate)}.`, back, 'menu');

    const details = VEHICLE_FIELDS
      .filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
      .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key])}`)
      .join('. ');

    return sendYemot(res, `תוצאות הבדיקה. ${details}`, back, 'menu');
  } catch (_) {
    return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני הרכב. אפשר לנסות שוב מאוחר יותר.', back, 'menu');
  }
}
