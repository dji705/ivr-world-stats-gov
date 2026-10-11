import { RESOURCES, VEHICLE_FIELDS, requestUrl, plateFrom, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts, digitsToHebrewWords } from './_lib/yemot.js';

function sendYemot(res, text, goTo = '') {
  const navigation = goTo ? `,go_to_folder=${goTo}` : '';
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // One complete keypad entry per call: service key + (optional) plate + #.
  // This avoids losing the selected service between separate IVR requests.
  res.end(`read=${readParts(text)}=wm_nav,no,1,1,10,Digits,no,no,#,,1,Ok${navigation}`);
}

function menuText() {
  return 'ברוכים הבאים למרכז המידע הטלפוני. לבדיקת פרטי רכב הקישו 1, ולאחריו את מספר הרישוי. לבדיקת תו נכה הקישו 2, ולאחריו את מספר הרישוי. לשמיעת מפלס הכינרת הקישו 3. לאחר ההקלדה הקישו סולמית לאישור. לדוגמה, לבדיקת רכב הקישו 1 ולאחריו את מספר הרישוי וסולמית.';
}

export default async function handler(request, res) {
  const url = requestUrl(request);
  const rawDigits = url.searchParams.get('Digits') || url.searchParams.get('plate') || '';
  const digits = String(rawDigits).replace(/[^0-9]/g, '');
  const back = parentExtension(url.searchParams.get('ApiExtension'));

  // Always show the same menu when no keypad input was supplied.
  if (!digits) return sendYemot(res, menuText(), back);

  // The first digit selects the service. For vehicle-related checks, the
  // remaining digits are the license plate. This keeps the whole flow in one
  // keypad collection and does not depend on session variables being retained.
  const selected = digits[0];
  const plate = digits.slice(1);

  if (selected === '3' && digits === '3') {
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

  if (selected !== '1' && selected !== '2') {
    return sendYemot(res, 'הקלט לא זוהה. ' + menuText(), back);
  }

  if (!validatePlate(plate)) {
    return sendYemot(res, 'מספר הרישוי לא נקלט בצורה תקינה. יש להקיש תחילה 1 לבדיקת רכב או 2 לבדיקת תו נכה, לאחר מכן 5 עד 9 ספרות של מספר הרישוי, ולסיום סולמית. ' + menuText(), back);
  }

  try {
    if (selected === '2') {
      const record = await findRecord(RESOURCES.disability, plate);
      return sendYemot(res, record
        ? `נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`
        : `לא נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`, back);
    }

    const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
    const record = Object.assign({}, ...records.filter(Boolean));
    if (!Object.keys(record).length) {
      return sendYemot(res, `לא נמצא רכב שמספרו ${digitsToHebrewWords(plate)}.`, back);
    }

    const text = VEHICLE_FIELDS
      .filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
      .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key])}`)
      .join('. ');
    return sendYemot(res, text, back);
  } catch (_) {
    return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני הרכב. נא לנסות שוב מאוחר יותר.', back);
  }
}
