# ivr-world-stats-gov

Serverless API ב־Vercel לבדיקת פרטי רכב, תו נכה ומפלס הכינרת, כולל ממשק בדיקה ושלוחת API לימות המשיח.

## נתיבי API

| נתיב | פורמט החזרה |
|---|---|
| `GET /api/vehicle?plate=1234567` | JSON עם `ok`, `found`, `plate`, `fields` ו־`record` |
| `GET /api/disability-badge?plate=1234567` | JSON עם `ok`, `found`, `plate`, `message` ו־`record` |
| `GET /api/kinneret` | JSON עם `ok`, `level`, `date` ו־`message` |
| `GET /api/yemot` | טקסט רגיל בפורמט התגובה של ימות המשיח |

## פורמט JSON

בתשובה מוצלחת, נתוני ה־API מוחזרים כאובייקט JSON עם `Content-Type: application/json; charset=utf-8`. בשגיאה מוחזרים `ok: false` ו־`error` עם קוד HTTP מתאים. מספר הרישוי מועבר בפרמטר `plate`; ב־API של ימות המשיח אפשר להעביר את הספרות בפרמטר `Digits`.

## פורמט ההחזרה לימות המשיח

הנתיב `/api/yemot` מחזיר `text/plain; charset=utf-8` בגוף תגובה במבנה:

```text
read=t-טקסט להקראה.n-123.t-מטרים=wm_nav,no,1,1,5,Digits,no,no,,,1,Ok
```

- `t-` מציין מקטע טקסט שמנוע ההקראה משמיע.
- `n-` מציין ערך מספרי, כדי שימות יקרא אותו כמספר ולא כמחרוזת ספרות.
- מספרים גדולים מ־2,147,483,647 מפורקים לקבוצות של מיליארד, מיליון ואלף כדי למנוע גלישת מספר.
- מספר עשרוני מוחזר כמספר, המילה `נקודה`, ואז הספרות שאחרי הנקודה.
- בסיום התגובה מוגדר `wm_nav` לקבלת הקשות. לחיצה על 0 יכולה להחזיר לשלוחת האב אם `ApiExtension` נשלח בבקשה.

## הגדרת שלוחת API

בקובץ `ext.ini` של השלוחה:

```ini
type=api
api_link=https://YOUR-APP.vercel.app/api/yemot
```

החליפו את `YOUR-APP` בשם הפרויקט ב־Vercel.

## פיתוח ובדיקות

נדרש Node.js 18 ומעלה.

```bash
npm test
```

הנתונים נשלפים ממקורות ממשלתיים בזמן הבדיקה. אין לשמור או להציג פרטים שלא מוחזרים על ידי מקור הנתונים.
