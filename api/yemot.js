import { RESOURCES, VEHICLE_FIELDS, requestUrl, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts, digitsToHebrewWords } from './_lib/yemot.js';

function sendYemot(res, text, options = {}) {
  const { goTo = '', inputName = 'Choice', min = 1, max = 1 } = options;
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // כשצריך לעבור לשלוחה אחרת, לא משתמשים ב-read כי הוא ממתין להקשה נוספת.
  // משמיעים את ההודעה ומעבירים מיד לשלוחה המבוקשת.
  if (goTo) {
    res.end(`id_list_message=${readParts(text)}\ngo_to_folder=/${goTo}`);
    return;
  }

  // בתפריט או בבקשת מספר רכב משתמשים ב-read כדי לקלוט קלט מהמאזין.
  // השדה שאחרי שם המשתנה נשאר ריק כדי לא להפעיל מצב אישור שמחזיר את המתקשר לתפריט.
  const readCommand = `read=${readParts(text)}=${inputName},,${min},${max},Digits,yes,no,*,`;
  res.end(readCommand);
}

function menuText() {
  return 'ברוכים הבאים למערכת המידע הטלפונית. לבדיקת פרטי רכב הקישו 1. לבדיקת תו נכה הקישו 2. לקבלת מפלס הכינרת העדכני הקישו 3. לחיפוש מפלס לפי תאריך היסטורי הקישו 4.';
}

function platePrompt(service) {
  return service === '2'
    ? 'בדיקת תו נכה. אנא הקישו את מספר הרישוי, בין 5 ל 9 ספרות, ולסיום הקישו סולמית.'
    : 'בדיקת פרטי רכב. אנא הקישו את מספר הרישוי, בין 5 ל 9 ספרות, ולסיום הקישו סולמית.';
}

function dateKey(value) {
  if (!value) return '';
  // בחלק מהרשומות התאריך מגיע בפורמט "2023 -09-03T00:00:00".
  const raw = String(value).trim().replace(/\s+/g, '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$1-$2-$3');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function hebrewDate(value) {
  const key = dateKey(value);
  if (!key) return value ? String(value) : 'תאריך לא ידוע';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatKinneretRecord(record) {
  const level = Number(record.Kinneret_Level);
  const levelText = Number.isFinite(level) ? formatNumber(level) : String(record.Kinneret_Level ?? 'לא ידוע');
  return `מפלס הכינרת בתאריך ${hebrewDate(record.Survey_Date)} הוא ${levelText} מטרים.`;
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

  // שלוחה 84: חיפוש היסטורי לפי תאריך בפורמט יום-חודש-שנה, 8 ספרות.
  if (extension === '84') {
    const rawDate = url.searchParams.get('ApiPhoneInput')
      ?? url.searchParams.get('DateInput')
      ?? url.searchParams.get('Digits')
      ?? url.searchParams.get('val')
      ?? '';
    const digits = String(rawDate).replace(/\D/g, '');
    if (!digits) {
      return sendYemot(res, 'לחיפוש מדידה היסטורית, הקישו את התאריך בשמונה ספרות: יום, חודש, שנה. לדוגמה, לראשון בספטמבר אלפיים עשרים ושלוש הקישו אפס אחד, אפס תשע, שתיים אפס שתיים שלוש.', {
        inputName: 'ApiPhoneInput', min: 8, max: 8
      });
    }
    if (!/^\d{8}$/.test(digits)) {
      return sendYemot(res, 'התאריך לא תקין. הקישו שמונה ספרות לפי הסדר יום, חודש, שנה.', {
        inputName: 'ApiPhoneInput', min: 8, max: 8
      });
    }
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    const requestedDate = `${year}-${month}-${day}`;
    const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
    if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() + 1 !== Number(month) || check.getUTCDate() !== Number(day)) {
      return sendYemot(res, 'התאריך שהוקש אינו תאריך תקין. נסו שוב.', {
        inputName: 'ApiPhoneInput', min: 8, max: 8
      });
    }
    try {
      const result = await dataGov(RESOURCES.kinneret, { limit: '20000', sort: 'Survey_Date desc' });
      const record = (result.records || []).find(item => dateKey(item.Survey_Date) === requestedDate);
      return sendYemot(res, record
        ? formatKinneretRecord(record)
        : `לא נמצאה מדידת מפלס כינרת בתאריך ${hebrewDate(requestedDate)}. בדקו את התאריך ונסו שוב.`, { goTo: back });
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את היסטוריית מפלס הכינרת. אפשר לנסות שוב מאוחר יותר.', { goTo: back });
    }
  }

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
        .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key])}`)
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
      // מבקשים את הרשומה האחרונה לפי תאריך המדידה, ולא לפי תאריך היום במחשב.
      const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
      let record = result.records?.[0];
      if (!record || !dateKey(record.Survey_Date)) {
        const fallback = await dataGov(RESOURCES.kinneret, { limit: '20000', sort: 'Survey_Date desc' });
        record = (fallback.records || []).filter(item => dateKey(item.Survey_Date))
          .sort((a, b) => dateKey(b.Survey_Date).localeCompare(dateKey(a.Survey_Date)))[0];
      }
      return sendYemot(res, record
        ? formatKinneretRecord(record)
        : 'לא נמצאה מדידה עדכנית של מפלס הכינרת.', { goTo: back });
    } catch (_) {
      return sendYemot(res, 'לא ניתן לקבל כרגע את נתוני מפלס הכינרת. אפשר לנסות שוב.', { goTo: back });
    }
  }
  if (choice === '4') {
    return sendYemot(res, 'חיפוש היסטוריית מפלס הכינרת לפי תאריך.', { goTo: '84' });
  }
  return sendYemot(res, 'הבחירה לא זוהתה. ' + menuText(), { inputName: 'Choice', min: 1, max: 1 });
}
