import { RESOURCES, plateFrom, validatePlate, findRecord, json, errorMessage } from './_lib/data.js';

export default async function handler(request, response) {
  const plate = plateFrom(request);
  if (!validatePlate(plate)) return json({ ok: false, found: false, error: 'יש להזין מספר רישוי תקין' }, 400, response);
  try {
    const record = await findRecord(RESOURCES.disability, plate, 'MISPAR RECHEV');
    return json({ ok: true, found: Boolean(record), plate, message: record ? `נמצא תו נכה לרכב שמספרו ${plate}` : `לא נמצא תו נכה לרכב שמספרו ${plate}`, record }, 200, response);
  } catch (error) { return json({ ok: false, error: errorMessage(error) }, error.name === 'AbortError' ? 504 : 502, response); }
}
