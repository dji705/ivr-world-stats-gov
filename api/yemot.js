import { RESOURCES, VEHICLE_FIELDS, plateFrom, validatePlate, findRecord, dataGov } from './_lib/data.js';
import { formatNumber, parentExtension, readParts } from './_lib/yemot.js';

function response(text, goTo = '') {
  const navigation = goTo ? `,go_to_folder=${goTo}` : '';
  return new Response(`read=${readParts(text)}=wm_nav,no,1,1,5,Digits,no,no,,,1,Ok${navigation}`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function menu(request) {
  const url = new URL(request.url);
  const choice = url.searchParams.get('Digits') || url.searchParams.get('choice');
  const apiExtension = parentExtension(url.searchParams.get('ApiExtension'));
  if (!choice) return response('הקישו 1 לבדיקת פרטי רכב לפי מספר רישוי הקישו 2 לבדיקת תו נכה הקישו 3 לבדיקת מפלס הכינרת', apiExtension);
  return response(choice === '1' ? 'לבדיקת פרטי רכב הקלידו מספר רישוי ולסיום הקישו סולמית' : choice === '2' ? 'לבדיקת תו נכה הקלידו מספר רישוי ולסיום הקישו סולמית' : choice === '3' ? 'מפלס הכינרת ��תעדכן בנתיב נפרד' : 'בחירה לא תקינה', apiExtension);
}

export default async function handler(request) {
  const url = new URL(request.url);
  if (!url.searchParams.has('plate') && !url.searchParams.has('Digits')) return menu(request);
  const plate = plateFrom(request);
  if (!validatePlate(plate)) return response('מספר הרישוי שהוקלד אינו תקין');
  try {
    const choice = url.searchParams.get('choice') || url.searchParams.get('menu');
    if (choice === '2') {
      const record = await findRecord(RESOURCES.disability, plate);
      return response(record ? `נמצא תו נכה לרכב מספר ${plate}` : `לא נמצא תו נכה לרכב מספר ${plate}`);
    }
    const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
    const record = Object.assign({}, ...records.filter(Boolean));
    if (!Object.keys(record).length) return response(`לא נמצא רכב שמספרו ${plate}`);
    const text = VEHICLE_FIELDS.filter(([key]) => record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '')
      .map(([key, label]) => `${label} ${typeof record[key] === 'number' ? formatNumber(record[key]) : record[key]}`).join(' ');
    return response(text);
  } catch (_) { return response('לא ניתן לקבל כרגע את נתוני הרכב, נא לנסות שוב מאוחר יותר'); }
}
