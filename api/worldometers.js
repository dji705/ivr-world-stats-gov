import { getWorldStats } from './_lib/worldstats.js';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const data = await getWorldStats();
    response.status(200).end(JSON.stringify(data));
  } catch (error) {
    const status = error?.name === 'AbortError' ? 504 : 502;
    response.status(status).end(JSON.stringify({
      ok: false,
      error: error?.name === 'AbortError'
        ? 'מקור הנתונים לא הגיב בזמן'
        : 'לא ניתן לקבל כרגע נתוני סטטיסטיקת עולם',
      details: error?.message || 'Unknown error'
    }));
  }
}
