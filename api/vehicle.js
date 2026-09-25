import { RESOURCES, VEHICLE_FIELDS, plateFrom, validatePlate, findRecord, json, errorMessage } from './_lib/data.js';

export default async function handler(request, response) {
  const plate = plateFrom(request);
  if (!validatePlate(plate)) return json({ ok: false, error: 'יש להזין מספר רישוי תקין באורך 5 עד 9 ספרות' }, 400, response);
  try {
    const records = await Promise.all(RESOURCES.vehicles.map(id => findRecord(id, plate)));
    const record = Object.assign({}, ...records.filter(Boolean));
    if (!Object.keys(record).length) return json({ ok: false, found: false, error: 'לא נמצא רכב במסדי הנתונים' }, 404, response);
    const fields = VEHICLE_FIELDS.reduce((result, [key, label]) => {
      if (record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '') result.push({ id: key, label, value: record[key] });
      return result;
    }, []);
    return json({ ok: true, found: true, plate, fields, record }, 200, response);
  } catch (error) { return json({ ok: false, error: errorMessage(error) }, error.name === 'AbortError' ? 504 : 502, response); }
}
