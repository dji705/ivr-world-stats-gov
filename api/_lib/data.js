const DATA_API = 'https://data.gov.il/api/3/action/datastore_search';

const RESOURCES = {
  vehicles: [
    '0866573c-40cd-4ca8-91d2-9dd2d7a492e5',
    '053cea08-09bc-40ec-8f7a-156f0677aff3'
  ],
  disability: 'c8b9f9c8-4612-4068-934f-d4acd2e3c06e',
  kinneret: '2de7b543-e13d-4e7e-b4c8-56071bc4d3c8'
};

// Friendly Hebrew labels are used both in the web interface and in IVR speech.
const VEHICLE_FIELDS = [
  ['mispar_rechev', 'מספר רישוי'],
  ['tozeret_cd', 'קוד יצרן'],
  ['sug_degem', 'סוג הדגם'],
  ['tozeret_nm', 'יצרן הרכב'],
  ['degem_cd', 'קוד דגם'],
  ['degem_nm', 'דגם הרכב'],
  ['ramat_gimur', 'רמת גימור'],
  ['ramat_eivzur_betihuty', 'רמת האבזור הבטיחותי'],
  ['kvutzat_zihum', 'דרגת זיהום האוויר'],
  ['shnat_yitzur', 'שנת ייצור'],
  ['degem_manoa', 'דגם המנוע'],
  ['mivchan_acharon_dt', 'תאריך הטסט האחרון'],
  ['tokef_dt', 'תוקף רישיון הרכב'],
  ['baalut', 'סוג הבעלות'],
  ['misgeret', 'מספר שלדה'],
  ['tzeva_cd', 'קוד צבע'],
  ['tzeva_rechev', 'צבע הרכב'],
  ['zmig_kidmi', 'מידת הצמיגים הקדמיים'],
  ['zmig_ahori', 'מידת הצמיגים האחוריים'],
  ['sug_delek_nm', 'סוג הדלק'],
  ['horaat_rishum', 'הוראת רישום'],
  ['moed_aliya_lakvish', 'תאריך עלייה לכביש'],
  ['kinuy_mishari', 'שם מסחרי']
];

function requestUrl(request) {
  const rawUrl = request?.url || '/';
  const host = request?.headers?.host || request?.headers?.get?.('host') || 'localhost';
  return new URL(rawUrl, `https://${host}`);
}

function plateFrom(request) {
  const url = requestUrl(request);
  return (url.searchParams.get('plate') || url.searchParams.get('Digits') || '')
    .replace(/[^0-9]/g, '');
}

function validatePlate(plate) { return /^[0-9]{5,9}$/.test(plate); }

async function dataGov(resourceId, params = {}, timeoutMs = 8000) {
  const url = new URL(DATA_API);
  url.searchParams.set('resource_id', resourceId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`מקור הנתונים החזיר ${response.status}`);
    const body = await response.json();
    if (!body.success || !body.result) throw new Error('תשובה לא תקינה ממקור הנתונים');
    return body.result;
  } finally { clearTimeout(timer); }
}

async function findRecord(resourceId, plate) {
  const result = await dataGov(resourceId, { limit: '1', filters: JSON.stringify({ mispar_rechev: Number(plate) }) });
  return result.records?.[0] || null;
}

function json(response, status, res) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(response));
}

function errorMessage(error) {
  if (error.name === 'AbortError') return 'מקור הנתונים לא הגיב בזמן';
  return error.message || 'אירעה שגיאה בלתי צפויה';
}

export { RESOURCES, VEHICLE_FIELDS, requestUrl, plateFrom, validatePlate, dataGov, findRecord, json, errorMessage };
