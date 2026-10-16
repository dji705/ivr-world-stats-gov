import { RESOURCES, VEHICLE_FIELDS, requestUrl, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, readParts, digitsToHebrewWords } from './_lib/yemot.js';

const FLIGHTS_RESOURCE = 'e83f763b-b7d7-479e-b172-ae981ddc6de5';

function sendYemot(res, text, options = {}) {
  const { inputName = 'wm_nav', min = 1, max = 1, dtmfTimeout = '5' } = options;
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // Yemot read format: variable, clear-old-value, min, max, timeout, input-type, ...
  // Keep the same field order as the known-good response format used by this system.
  res.end(`read=${readParts(text)}=${inputName},no,${min},${max},${dtmfTimeout},Digits,no,no,,,1,Ok`);
}

function menuText() {
  return 'מערכת מידע. לפרטי רכב הקישו 1. לבדיקת תו נכה הקישו 2. למפלס הכינרת האחרון שפורסם הקישו 3. לחיפוש מדידה לפי תאריך הקישו 4. לטיסות נוחתות הקישו 5. לטיסות ממריאות הקישו 6. לטיסות בעיכוב הקישו 7. לחיפוש טיסה לפי מספר טיסה הקישו 8.';
}
function menuAgain(text) { return `${text} לתפריט הראשי, הקישו כוכבית. ${menuText()}`; }
function digitsParam(url, names) {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value !== null && value !== '') return String(value);
  }
  return '';
}
function dateKey(value) {
  if (!value) return '';
  const match = String(value).trim().match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}
function hebrewDate(value) {
  const key = dateKey(value);
  if (!key) return value ? String(value) : 'תאריך לא ידוע';
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}
function formatKinneretRecord(record, includeToday = false) {
  const level = Number(record.Kinneret_Level);
  const levelText = Number.isFinite(level) ? formatNumber(level) : String(record.Kinneret_Level ?? 'לא ידוע');
  const today = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }).format(new Date());
  return `${includeToday ? `היום ${today}. ` : ''}המדידה האחרונה שפורסמה היא מתאריך ${hebrewDate(record.Survey_Date)}. מפלס הכינרת במדידה זו עומד על ${levelText} מטרים מתחת לפני הים.`;
}
function parseDateInput(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  const day = Number(digits.slice(0, 2)), month = Number(digits.slice(2, 4)), year = Number(digits.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function flightTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
function clockTime(value) {
  const time = flightTime(value);
  if (time === null) return 'שעה לא ידועה';
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(time));
}
function flightNumber(record) {
  return [record.CHOPER, record.CHFLTN].filter(Boolean).join(' ');
}
function flightDirection(record) {
  const value = String(record.CHAORD || '').toUpperCase();
  if (value === 'A' || value === 'ARRIVAL') return 'A';
  if (value === 'D' || value === 'DEPARTURE') return 'D';
  return '';
}
function isFinalStatus(record) {
  return /LANDED|DEPARTED|CANCELED|CANCELLED|נחתה|נחת|המריאה|בוטלה|מבוטלת/i.test(String(record.CHRMINE || '') + ' ' + String(record.CHRMINH || ''));
}
function delayMinutes(record) {
  const planned = flightTime(record.CHSTOL), estimated = flightTime(record.CHPTOL);
  if (planned === null || estimated === null) return null;
  return Math.round((estimated - planned) / 60000);
}
function formatFlight(record, kind) {
  const number = flightNumber(record) || 'מספר טיסה לא ידוע';
  const airline = record.CHOPERD || 'חברת תעופה לא ידועה';
  const city = record.CHLOC1TH || record.CHLOC1T || record.CHLOC1D || 'יעד לא ידוע';
  const country = record.CHLOC1CH ? `, ${record.CHLOC1CH}` : '';
  const status = record.CHRMINH ? `. סטטוס: ${record.CHRMINH}` : '';
  if (kind === 'A') {
    return `טיסה ${number}, ${airline}, מגיעה מ${city}${country}. נחיתה מתוכננת ${clockTime(record.CHSTOL)}, נחיתה משוערת ${clockTime(record.CHPTOL)}. טרמינל ${record.CHTERM || 'לא צוין'}${status}.`;
  }
  return `טיסה ${number}, ${airline}, ליעד ${city}${country}. המראה מתוכננת ${clockTime(record.CHSTOL)}, המראה משוערת ${clockTime(record.CHPTOL)}. טרמינל ${record.CHTERM || 'לא צוין'}${record.CHCINT ? `. דלפקים ${record.CHCINT}` : ''}${status}.`;
}
async function getFlights() {
  const result = await dataGov(FLIGHTS_RESOURCE, { limit: '1000', sort: 'CHSTOL asc' });
  return (result.records || []).filter(record => flightDirection(record));
}
async function flightsMessage(choice) {
  const records = await getFlights();
  const now = Date.now();
  if (choice === '5' || choice === '6') {
    const direction = choice === '5' ? 'A' : 'D';
    const label = direction === 'A' ? 'טיסות נוחתות' : 'טיסות ממריאות';
    const upcoming = records
      .filter(record => flightDirection(record) === direction && !isFinalStatus(record))
      .filter(record => {
        const t = flightTime(record.CHPTOL) ?? flightTime(record.CHSTOL);
        return t !== null && t >= now - 30 * 60000 && t <= now + 36 * 3600000;
      })
      .sort((a, b) => (flightTime(a.CHPTOL) ?? flightTime(a.CHSTOL)) - (flightTime(b.CHPTOL) ?? flightTime(b.CHSTOL)))
      .slice(0, 5);
    if (!upcoming.length) return `לא נמצאו כרגע ${label} עתידיות במאגר.`;
    return `${label}. ${upcoming.map(record => formatFlight(record, direction)).join(' ')}`;
  }
  const delayed = records
    .map(record => ({ record, delay: delayMinutes(record), direction: flightDirection(record), t: flightTime(record.CHPTOL) ?? flightTime(record.CHSTOL) }))
    .filter(item => item.direction && item.delay !== null && item.delay >= 15 && item.t !== null && item.t >= now - 30 * 60000 && item.t <= now + 36 * 3600000 && !isFinalStatus(item.record))
    .sort((a, b) => b.delay - a.delay)
    .slice(0, 8);
  if (!delayed.length) return 'לא נמצאו כרגע טיסות פעילות עם עיכוב של רבע שעה ומעלה לפי השעות במאגר.';
  return 'טיסות בעיכוב. ' + delayed.map(({ record, delay, direction }) =>
    `${formatFlight(record, direction)} העיכוב לפי השעות במאגר הוא ${delay} דקות.`
  ).join(' ');
}

export default async function handler(request, res) {
  const url = requestUrl(request);

  // Detect star before extracting numeric menu choices; '*' is not a digit.
  if ([...url.searchParams.values()].some(value => String(value).includes('*'))) {
    return sendYemot(res, menuText(), { inputName: 'wm_nav', min: 1, max: 1, dtmfTimeout: '2' });
  }

  // קלטים ייחודיים לכל פעולה מאפשרים להישאר באותה שלוחת API,
  // ללא צורך בשלוחות פנימיות 81, 82 או 84.
  const vehicleInput = digitsParam(url, ['VehiclePlate', 'ApiPhoneInput']);
  const disabilityInput = digitsParam(url, ['DisabilityPlate', 'ApiPhoneInput']);
  const dateInput = digitsParam(url, ['KinneretDate', 'DateInput', 'ApiPhoneInput']);
  const flightInput = digitsParam(url, ['FlightNumber', 'ApiPhoneInput']);
  const activeBranch = String(url.searchParams.get('branch') || '').toLowerCase();

  if (url.searchParams.has('VehiclePlate') || url.searchParams.has('DisabilityPlate') || (activeBranch === 'vehicle' && url.searchParams.has('ApiPhoneInput')) || (activeBranch === 'disability' && url.searchParams.has('ApiPhoneInput'))) {
    const isDisability = url.searchParams.has('DisabilityPlate') || activeBranch === 'disability';
    const rawPlate = isDisability ? disabilityInput : vehicleInput;
    const plate = rawPlate.replace(/\D/g, '');
    const inputName = isDisability ? 'DisabilityPlate' : 'VehiclePlate';
    if (!plate) return sendYemot(res, 'הקישו את מספר הרכב, בן 7 ספרות, ולסיום סולמית.', { inputName, min: isDisability ? 5 : 7, max: isDisability ? 9 : 7, dtmfTimeout: '7' });
    if (isDisability ? !validatePlate(plate) : !/^\d{7}$/.test(plate)) return sendYemot(res, isDisability ? 'מספר הרישוי לא תקין. הקישו מספר בן 5 עד 9 ספרות, ולסיום סולמית.' : 'מספר הרישוי לא תקין. הקישו בדיוק 7 ספרות.', { inputName, min: isDisability ? 5 : 7, max: isDisability ? 9 : 7, dtmfTimeout: '7' });
    try {
      if (isDisability) {
        const record = await findRecord(RESOURCES.disability, plate, 'MISPAR RECHEV');
        return sendYemot(res, menuAgain(record
          ? `נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`
          : `לא נמצא תו נכה לרכב שמספרו ${digitsToHebrewWords(plate)}.`));
      }
      const found = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
      const record = Object.assign({}, ...found.filter(Boolean));
      if (!Object.keys(record).length) return sendYemot(res, menuAgain(`לא נמצא רכב שמספרו ${digitsToHebrewWords(plate)}.`));
      const details = VEHICLE_FIELDS
        .filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
        .map(([key, label]) => `${label}: ${key === 'mispar_rechev' ? digitsToHebrewWords(record[key]) : (typeof record[key] === 'number' ? formatNumber(record[key]) : record[key])}`)
        .join('. ');
      return sendYemot(res, menuAgain(`תוצאות בדיקת הרכב. ${details}`));
    } catch (_) {
      return sendYemot(res, menuAgain('לא ניתן לקבל כרגע את נתוני הבדיקה. אפשר לנסות שוב מאוחר יותר.'));
    }
  }


  if (url.searchParams.has('FlightNumber') || (activeBranch === 'flight-search' && url.searchParams.has('ApiPhoneInput'))) {
    const number = flightInput.replace(/\D/g, '');
    if (!number) return sendYemot(res, 'הקישו את מספר הטיסה, ספרה אחת עד חמש ספרות, ולסיום הקישו סולמית.', { inputName: activeBranch === 'flight-search' ? 'ApiPhoneInput' : 'FlightNumber', min: 1, max: 5, dtmfTimeout: '7' });
    if (!/^\d{1,5}$/.test(number)) return sendYemot(res, 'מספר הטיסה לא תקין. הקישו ספרה אחת עד חמש ספרות ולסיום סולמית.', { inputName: activeBranch === 'flight-search' ? 'ApiPhoneInput' : 'FlightNumber', min: 1, max: 5, dtmfTimeout: '7' });
    try {
      const records = await getFlights();
      const matches = records.filter(record => String(record.CHFLTN ?? '').replace(/\D/g, '') === number)
        .sort((a, b) => (flightTime(a.CHPTOL) ?? flightTime(a.CHSTOL) ?? 0) - (flightTime(b.CHPTOL) ?? flightTime(b.CHSTOL) ?? 0))
        .slice(0, 3);
      if (!matches.length) return sendYemot(res, menuAgain(`לא נמצאה טיסה מספר ${digitsToHebrewWords(number)} בלוח הטיסות הנוכחי.`));
      return sendYemot(res, menuAgain('תוצאות חיפוש לפי מספר טיסה. ' + matches.map(record => formatFlight(record, flightDirection(record))).join(' ')));
    } catch (_) {
      return sendYemot(res, menuAgain('לא ניתן לקבל כרגע את נתוני הטיסות. נסו שוב מאוחר יותר.'));
    }
  }

  if (url.searchParams.has('KinneretDate') || url.searchParams.has('DateInput') || (activeBranch === 'kinneret-date' && url.searchParams.has('ApiPhoneInput'))) {
    const requestedDate = parseDateInput(dateInput);
    if (!requestedDate) return sendYemot(res, 'התאריך לא תקין. הקישו שמונה ספרות לפי הסדר יום, חודש, שנה, ולסיום סולמית.', { inputName: activeBranch === 'kinneret-date' ? 'ApiPhoneInput' : 'KinneretDate', min: 8, max: 8, dtmfTimeout: '7' });
    try {
      const exact = await dataGov(RESOURCES.kinneret, { limit: '5', filters: JSON.stringify({ Survey_Date: requestedDate + 'T00:00:00' }) });
      let record = (exact.records || []).find(item => dateKey(item.Survey_Date) === requestedDate);
      if (!record) {
        const result = await dataGov(RESOURCES.kinneret, { limit: '1000', sort: 'Survey_Date desc' });
        record = (result.records || []).find(item => dateKey(item.Survey_Date) === requestedDate);
      }
      return sendYemot(res, menuAgain(record ? formatKinneretRecord(record) : `לא נמצאה מדידת מפלס כינרת בתאריך ${hebrewDate(requestedDate)}.`));
    } catch (_) {
      return sendYemot(res, menuAgain('לא ניתן לקבל כרגע את היסטוריית מפלס הכינרת. אפשר לנסות שוב מאוחר יותר.'));
    }
  }

  const rawChoice = digitsParam(url, ['wm_nav', 'Choice', 'ApiPhoneInput', 'Digits', 'val']);
  const branchChoices = {
    vehicle: '1',
    disability: '2',
    kinneret: '3',
    'kinneret-history': '4',
    'kinneret-date': '4',
    arrivals: '5',
    departures: '6',
    delays: '7',
    'flight-search': '8',
  };
  const branch = String(url.searchParams.get('branch') || '').toLowerCase();
  const choice = branchChoices[branch] || rawChoice.replace(/\D/g, '') || '';
  if (!choice) return sendYemot(res, menuText(), { inputName: 'wm_nav', min: 1, max: 1, dtmfTimeout: '2' });

  if (choice === '1') return sendYemot(res, 'הקישו את מספר הרכב, בן 7 ספרות, ולסיום סולמית.', { inputName: 'VehiclePlate', min: 7, max: 7, dtmfTimeout: '7' });
  if (choice === '2') return sendYemot(res, 'הקישו את מספר הרכב לבדיקת תו נכה. אפשר להקיש מספר בן 5 עד 9 ספרות; בסיום הקישו סולמית.', { inputName: branch === 'disability' ? 'ApiPhoneInput' : 'DisabilityPlate', min: 5, max: 9, dtmfTimeout: '7' });
  if (choice === '3') {
    try {
      const result = await dataGov(RESOURCES.kinneret, { limit: '100', sort: 'Survey_Date desc' });
      const record = (result.records || []).filter(item => dateKey(item.Survey_Date))
        .sort((a, b) => dateKey(b.Survey_Date).localeCompare(dateKey(a.Survey_Date)))[0];
      return sendYemot(res, menuAgain(record ? formatKinneretRecord(record, true) : 'לא נמצאה מדידה של מפלס הכינרת במאגר.'));
    } catch (_) {
      return sendYemot(res, menuAgain('לא ניתן לקבל כרגע את נתוני מפלס הכינרת. אפשר לנסות שוב.'));
    }
  }
  if (choice === '4') return sendYemot(res, 'לחיפוש מדידה היסטורית, הקישו תאריך בשמונה ספרות: יום, חודש, שנה. לסיום הקישו סולמית.', { inputName: branch === 'kinneret-date' ? 'ApiPhoneInput' : 'KinneretDate', min: 8, max: 8, dtmfTimeout: '7' });
  if (choice === '8') return sendYemot(res, 'הקישו את מספר הטיסה, ספרה אחת עד חמש ספרות, ולסיום הקישו סולמית.', { inputName: branch === 'flight-search' ? 'ApiPhoneInput' : 'FlightNumber', min: 1, max: 5, dtmfTimeout: '7' });
  if (choice === '5' || choice === '6' || choice === '7') {
    try { return sendYemot(res, menuAgain(await flightsMessage(choice))); }
    catch (_) { return sendYemot(res, menuAgain('לא ניתן לקבל כרגע את נתוני הטיסות. נסו שוב מאוחר יותר.')); }
  }
  return sendYemot(res, 'הבחירה לא זוהתה. ' + menuText(), { inputName: 'wm_nav', min: 1, max: 1 });
}
