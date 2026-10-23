const DATA_API = 'https://data.gov.il/api/3/action/datastore_search';

const RESOURCES = {
  vehicles: [
    '0866573c-40cd-4ca8-91d2-9dd2d7a492e5',
    '053cea08-09bc-40ec-8f7a-156f0677aff3'
  ],
  disability: 'c8b9f9c8-4612-4068-934f-d4acd2e3c06e',
  kinneret: '2de7b543-e13d-4e7e-b4c8-56071bc4d3c8'
};

// Only read the commercial model name, labeled simply as "הדגם".
const VEHICLE_FIELDS = [
  ['kinuy_mishari', 'הדגם']
];

function requestUrl(request) {
  const rawUrl = request?.url || '/';
  const host = request?.headers?.host || request?.headers?.get?.('host') || 'localhost';

  // Yemot sends API parameters in its native format:
  // ?ApiCallId^...*ApiPhone^...*wm_nav^3
  // Convert each *-separated KEY^VALUE pair into a standard query parameter
  // so URLSearchParams can read it. Keep ordinary key=value URLs unchanged.
  const question = rawUrl.indexOf('?');
  if (question < 0) return new URL(rawUrl, `https://${host}`);
  const base = rawUrl.slice(0, question);
  const query = rawUrl.slice(question + 1).split('#')[0];
  if (!query.includes('^') && !query.includes('*')) return new URL(rawUrl, `https://${host}`);

  const pairs = [];
  for (const part of query.split('*')) {
    if (!part) continue;
    const separator = part.indexOf('^');
    if (separator >= 0) {
      const key = part.slice(0, separator);
      const value = part.slice(separator + 1);
      if (key) pairs.push([key, value]);
    } else if (part.includes('=')) {
      const separatorEq = part.indexOf('=');
      const key = part.slice(0, separatorEq);
      const value = part.slice(separatorEq + 1);
      if (key) pairs.push([key, value]);
    } else if (part) {
      // Bare keys such as "0" can represent a keypad press in Yemot logs.
      pairs.push([part, '']);
    }
  }

  const normalized = new URL(base, `https://${host}`);
  for (const [key, value] of pairs) normalized.searchParams.append(key, value);
  return normalized;
}

function plateFrom(request) {
  const url = requestUrl(request);
  return (url.searchParams.get('plate') || url.searchParams.get('Digits') || '')
    .replace(/[^0-9]/g, '');
}

function validatePlate(plate) { return /^[0-9]{5,9}$/.test(plate); }

const dataCache = new Map();
const CACHE_LIMIT = 200;
function cacheTtl(resourceId) {
  if (resourceId === 'e83f763b-b7d7-479e-b172-ae981ddc6de5') return 60_000;
  if (resourceId === RESOURCES.kinneret) return 5 * 60_000;
  return 60_000;
}

async function dataGov(resourceId, params = {}, timeoutMs = 8000) {
  const url = new URL(DATA_API);
  url.searchParams.set('resource_id', resourceId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const cacheKey = url.toString();
  const now = Date.now();
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) dataCache.delete(cacheKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`מקור הנתונים החזיר ${response.status}`);
    const body = await response.json();
    if (!body.success || !body.result) throw new Error('תשובה לא תקינה ממקור הנתונים');
    if (dataCache.size >= CACHE_LIMIT) {
      const firstKey = dataCache.keys().next().value;
      if (firstKey !== undefined) dataCache.delete(firstKey);
    }
    dataCache.set(cacheKey, { value: body.result, expiresAt: now + cacheTtl(resourceId) });
    return body.result;
  } finally { clearTimeout(timer); }
}

async function findRecord(resourceId, plate, fieldName = 'mispar_rechev') {
  const result = await dataGov(resourceId, { limit: '1', filters: JSON.stringify({ [fieldName]: Number(plate) }) });
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
