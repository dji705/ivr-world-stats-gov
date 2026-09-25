import { RESOURCES, plateFrom, validatePlate, findRecord, json, errorMessage } from './_lib/data.js';

export default async function handler(request) {
  const plate = plateFrom(request);
  if (!validatePlate(plate)) return json({ ok: false, found: false, error: 'יש להזין מספר רישוי תקין' }, 400);
  try {
    const record = await findRecord(RESOURCES.disability, plate);
    return json({
      ok: true,
      found: Boolean(record),
      plate,
      message: record ? `נמצא תו נכה לרכב שמספרו ${plate}` : `לא נמצא תו נכה לרכב שמספרו ${plate}`,
      record
    });
  } catch (error) { return json({ ok: false, error: errorMessage(error) }, 502); }
}
