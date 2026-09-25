import { RESOURCES, dataGov, json, errorMessage } from './_lib/data.js';

export default async function handler(request, response) {
  try {
    const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
    const record = result.records?.[0];
    if (!record) return json({ ok: false, error: 'לא נמצאה מדידה של מפלס הכינרת' }, 404, response);
    return json({ ok: true, level: record.Kinneret_Level, date: record.Survey_Date, message: `מפלס הכינרת במדידה האחרונה מתאריך ${record.Survey_Date} הוא ${record.Kinneret_Level} מטרים` }, 200, response);
  } catch (error) { return json({ ok: false, error: errorMessage(error) }, error.name === 'AbortError' ? 504 : 502, response); }
}
