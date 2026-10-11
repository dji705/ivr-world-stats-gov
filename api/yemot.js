import { RESOURCES, VEHICLE_FIELDS, requestUrl, plateFrom, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts, digitsToHebrewWords } from './_lib/yemot.js';

function sendYemot(res, text, goTo = '') {
  const navigation = goTo ? `,go_to_folder=${goTo}` : '';
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // Yemot response format: read=t-text.n-number.t-text=wm_nav,...
  res.end(`read=${readParts(text)}=wm_nav,no,1,1,5,Digits,no,no,,,1,Ok${navigation}`);
}

function getChoice(url) {
  return url.searchParams.get('choice') ||
    url.searchParams.get('menu') ||
    url.searchParams.get('ApiParam') ||
    url.searchParams.get('ApiParam1') || '';
}

function menuText() {
  return 'ברוכים הבאים למרכז בדיקות מידע. לבדיקת פרטי רכב לפי מספר רישוי הקישו 1. לבדיקת תו נכה הקישו 2. לבדיקת מפלס הכינרת הקישו 3.';
}

function promptForChoice(choice) {
  if (choice === '1') return 'בדיקת פרטי רכב. הקלידו את מספר הרישוי ולסיום הקישו סולמית.';
  if (choice === '2') return 'בדיקת תו נכה. הקלידו את מספר הרישוי ולסיום הקישו סולמית.';
  if (choice === '3') return '';
  return 'הבחירה אינה תקינה. ' + menuText();
}

function hebrewDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('he-IL');
}

export default async function handler(request, res) {
  const url = requestUrl(request);
  const digits = url.searchParams.get('Digits') || '';
  const choice = getChoice(url);
  const back = parentExtension(url.searchParams.get('ApiExtension'));

  if (!choice && !digits) return sendYemot(res, menuText(), back);

  const selected = choice || (['1', '2', '3'].includes(digits) ? digits : '');
  if (!choice && ['1', '2'].includes(digits)) return sendYemot(res, promptForChoice(digits), back);

  if (selected === '3' && (!digits || digits === '3')) {
    try {
      const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
      const record = result.records?.[0];
      if (!record) return sendYemot(res, 'לא נמצאה מדידה של מפלס הכינרת.', back);
      const level = Number(record.Kinneret_Level);
      const levelText = Number.isFinite(level) ? formatNumber(level) : String(record.Kinneret_Level);
      return sendYemot(res, `מפלס הכינרת במדידה האחרונה מתאריך ${hebrewDate(record.Survey_Date)} הוא ${levelText} מטרים.`, back);
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני מפלס הכינרת. נא לנסות שוב מאוחר יותר.', back);
    }
  }

  if (selected !== '1' && selected !== '2') return sendYemot(res, 'הבחירה אינה תקינה. ' + menuText(), back);

  const plate = choice ? plateFrom(request) : '';
  if (!plate) return sendYemot(res, promptForChoice(selected), back);
  if (!validatePlate(plate)) return sendYemot(res, 'מספר הרישוי שהוקלד אינו תקין. יש להקליד בין 5 ל 9 ספרות ולסיום להקיש סולמית.', back);

  try {
    if (selected === '2') {
      const record = await findRecord(RESOURCES.disability, plate);
      return sendYemot(res, record
        ? `נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`
        : `לא נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`, back);
    }

    const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
    const record = Object.assign({}, ...records.filter(Boolean));
    if (!Object.keys(record).length) return sendYemot(res, `לא נמצא רכב שמספרו ${digitsToHebrewWords(plate)}.`, back);

    const text = VEHICLE_FIELDS
      .filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
      .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key])}`)
      .join('. ');
    return sendYemot(res, text, back);
  } catch (_) {
    return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני הרכב. נא לנסות שוב מאוחר יותר.', back);
  }
}
