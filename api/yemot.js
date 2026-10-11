import { RESOURCES, VEHICLE_FIELDS, requestUrl, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts, digitsToHebrewWords } from './_lib/yemot.js';

function sendYemot(res, text, options = {}) {
  const { goTo = '', inputName = 'Choice', min = 1, max = 1 } = options;
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // תחביר read של ימות: שם המשתנה מוגדר אחרי הטקסט, ולא wm_nav.
  // הקלט נשלח תחת inputName; מספר רכב נקלט כספרות עד 9 ספרות.
  const readCommand = `read=${readParts(text)}=${inputName},yes,${min},${max},Digits,yes,no,*,`;
  const navigation = goTo ? `\ngo_to_folder=/${goTo}` : '';
  res.end(readCommand + navigation);
}

function menuText() {
  return 'ברוכים הבאים למערכת המידע הטלפונית. לבדיקת פרטי רכב הקישו 1. לבדיקת תו נכה הקישו 2. לקבלת מפלס הכינרת הקישו 3.';
}

function platePrompt(service) {
  return service === '2'
    ? 'בדיקת תו נכה. אנא הקישו את מספר הרישוי, בין 5 ל 9 ספרות, ולסיום הקישו סולמית.'
    : 'בדיקת פרטי רכב. אנא הקישו את מספר הרישוי, בין 5 ל 9 ספרות, ולסיום הקישו סולמית.';
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
  const extension = leafExtension(url.searchParams.get('ApiExtension'));
  const back = parentExtension(url.searchParams.get('ApiExtension'));

  // שלוחות 81/82: הקריאה הראשונה מבקשת מספר רישוי. ימות מחזירה אותו
  // בפרמטר ApiPhoneInput שהוגדר בפקודת read.
  if (extension === '81' || extension === '82') {
    const rawPlate = url.searchParams.get('ApiPhoneInput')
      ?? url.searchParams.get('plate')
      ?? url.searchParams.get('Digits')
      ?? url.searchParams.get('val')
      ?? '';
    const plate = String(rawPlate).replace(/[^0-9]/g, '');

    if (!plate) {
      return sendYemot(res, platePrompt(extension === '82' ? '2' : '1'), {
        inputName: 'ApiPhoneInput', min: 5, max: 9
      });
    }
    if (!validatePlate(plate)) {
      return sendYemot(res, 'מספר הרישוי לא תקין. הקישו מספר בן 5 עד 9 ספרות ונסו שוב.', {
        inputName: 'ApiPhoneInput', min: 5, max: 9
      });
    }

    try {
      if (extension === '82') {
        const record = await findRecord(RESOURCES.disability, plate);
        return sendYemot(res, record
          ? `נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`
          : `לא נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`, { goTo: back });
      }

      const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
      const record = Object.assign({}, ...records.filter(Boolean));
      if (!Object.keys(record).length) {
        return sendYemot(res, `לא נמצא רכב שמספרו ${digitsToHebrewWords(plate)}.`, { goTo: back });
      }
      const details = VEHICLE_FIELDS
        .filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
        .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key)}`)
        .join('. ');
      return sendYemot(res, `תוצאות בדיקת הרכב. ${details}`, { goTo: back });
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני הבדיקה. אפשר לנסות שוב מאוחר יותר.', { goTo: back });
    }
  }

  // תפריט ראשי: מקש יחיד נשמר ב-Choice. לא מערבבים אותו עם מספר הרכב.
  const rawChoice = url.searchParams.get('Choice')
    ?? url.searchParams.get('ApiPhoneInput')
    ?? url.searchParams.get('Digits')
    ?? url.searchParams.get('val')
    ?? '';
  const choice = String(rawChoice).replace(/[^0-9]/g, '');

  if (!choice) {
    return sendYemot(res, menuText(), { inputName: 'Choice', min: 1, max: 1 });
  }
  if (choice === '1') {
    return sendYemot(res, 'נבחרה בדיקת פרטי רכב. עוברים להזנת מספר הרישוי.', { goTo: '81' });
  }
  if (choice === '2') {
    return sendYemot(res, 'נבחרה בדיקת תו נכה. עוברים להזנת מספר הרישוי.', { goTo: '82' });
  }
  if (choice === '3') {
    try {
      const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
      const record = result.records?.[0];
      if (!record) return sendYemot(res, 'לא נמצאה מדידה עדכנית של מפלס הכינרת.', { goTo: back });
      const level = Number(record.Kinneret_Level);
      const levelText = Number.isFinite(level) ? formatNumber(level) : String(record.Kinneret_Level);
      return sendYemot(res, `מפלס הכינרת במדידה מתאריך ${hebrewDate(record.Survey_Date)} הוא ${levelText} מטרים.`, { goTo: back });
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני מפלס הכינרת. אפשר לנסות שוב.', { goTo: back });
    }
  }
  return sendYemot(res, 'הבחירה לא זוהתה. ' + menuText(), { inputName: 'Choice', min: 1, max: 1 });
}
