import { RESOURCES, dataGov, json, errorMessage } from './_lib/data.js';

export default async function handler() {
  try {
    const result = await dataGov(RESOURCES.kinneret, { limit: '1', sort: 'Survey_Date desc' });
    const record = result.records?.[0];
    if (!record) return json({ ok: false, error: 'לא נמצאה מדידה של מפלס הכינרת' }, 404);
    const level = record.Kinneret_Level;
    const date = record.Survey_Date;
    return json({ ok: true, level, date, message: `מפלס הכינרת במדידה האחרונה מתאריך ${date} הוא ${level} מטרים` });
  } catch (error) { return json({ ok: false, error: errorMessage(error) }, 502); }
}
