import { RESOURCES, VEHICLE_FIELDS, requestUrl, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts, digitsToHebrewWords } from './_lib/yemot.js';

function sendYemot(res, text, goTo = '') {
  const navigation = goTo ? `,go_to_folder=${goTo}` : '';
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // קליטת מקשים בימות המשיח. מספרי רכב נשארים ספרות, ללא המרת T9 לאותיות.
  const inputCommand = 'wm_nav,no,1,1,5,Digits,no,no,,,1,Ok';
  res.end(`read=${readParts(text)}=${inputCommand}${navigation}`);
}

function menuText() {
  return 'ברוכים הבאים למערכת המידע הטלפונית. לבדיקת פרטי רכב הקישו 1. לבדיקת תו נכה הקישו 2. לקבלת מפלס הכינרת הקישו 3. לבחירת פעולה חדשה הקישו את המספר המתאים.';
}

function platePrompt(service) {
  return service === '2'
    ? 'בדיקת תו נכה. אנא הקישו את מספר הרישוי וסיימו בסולמית.'
    : 'בדיקת פרטי רכב. אנא הקישו את מספר הרישוי וסיימו בסולמית.';
}

function hebrewDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('he-IL');
}

function leafExtension(apiExtension) {
  if (!apiExtension) return '';
  const clean = String(apiExtension).split('^')[0];
  const parts = clean.split('*').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : clean;
}

export default async function handler(request, res) {
  const url = requestUrl(request);

  // ימות עשויה למסור את ההקשות בשם ApiPhoneInput, Digits או val.
  // מסירים תווים שאינם ספרות לצורך בחירת שירות/מספר רכב, בלי לפענח אותם לאותיות.
  const rawInput = url.searchParams.get('ApiPhoneInput')
    ?? url.searchParams.get('Digits')
    ?? url.searchParams.get('val')
    ?? url.searchParams.get('plate')
    ?? '';
  const digits = String(rawInput).replace(/[^0-9]/g, '');
  const extension = leafExtension(url.searchParams.get('ApiExtension'));
  const back = parentExtension(url.searchParams.get('ApiExtension'));

  // שלוחה 1: תחילה משמיעה הנחיה; בהקשה הבאה מקבלת מספר רכב.
  if (extension === '1') {
    if (!digits) return sendYemot(res, platePrompt('1'));
    if (!validatePlate(digits)) {
      return sendYemot(res, 'מספר הרישוי לא תקין. יש להקיש מספר בן 5 עד 9 ספרות ולסיים בסולמית.', back);
    }
    try {
      const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, digits)));
      const record = Object.assign({}, ...records.filter(Boolean));
      if (!Object.keys(record).length) {
        return sendYemot(res, `לא נמצא רכב שמספרו ${digitsToHebrewWords(digits)}.`, back);
      }
      const details = VEHICLE_FIELDS
        .filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
        .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key])}`)
        .join('. ');
      return sendYemot(res, `תוצאות בדיקת הרכב. ${details}`, back);
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני הרכב. אפשר לנסות שוב מאוחר יותר.', back);
    }
  }

  // שלוחה 2: שלב נפרד להזנת מספר הרכב לצורך בדיקת תו נכה.
  if (extension === '2') {
    if (!digits) return sendYemot(res, platePrompt('2'));
    if (!validatePlate(digits)) {
      return sendYemot(res, 'מספר הרישוי לא תקין. יש להקיש מספר בן 5 עד 9 ספרות ולסיים בסולמית.', back);
    }
    try {
      const record = await findRecord(RESOURCES.disability, digits);
      return sendYemot(res, record
        ? `נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(digits)}.`
        : `לא נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(digits)}.`, back);
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני תו הנכה. אפשר לנסות שוב מאוחר יותר.', back);
    }
  }

  // שלוחה ראשית: בחירת שירות בלבד, ללא צירוף מספר הרכב לאותה הקשה.
  if (!digits) return sendYemot(res, menuText(), back);
  if (digits === '1') return sendYemot(res, platePrompt('1'), '1');
  if (digits === '2') return sendYemot(res, platePrompt('2'), '2');

  if (digits === '3') {
    try {
      const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
      const record = result.records?.[0];
      if (!record) return sendYemot(res, 'לא נמצאה מדידה עדכנית של מפלס הכינרת.', back);
      const level = Number(record.Kinneret_Level);
      const levelText = Number.isFinite(level) ? formatNumber(level) : String(record.Kinneret_Level);
      return sendYemot(res, `מפלס הכינרת במדידה מתאריך ${hebrewDate(record.Survey_Date)} הוא ${levelText} מטרים.`, back);
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני מפלס הכינרת. אפשר לנסות שוב.', back);
    }
  }

  return sendYemot(res, 'הבחירה לא זוהתה. ' + menuText(), back);
}
