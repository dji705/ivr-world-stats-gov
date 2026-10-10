const API = 'https://api.worldbank.org/v2/country/WLD/indicator/';
const INDICATORS = {
  population: { id: 'SP.POP.TOTL', label: 'אוכלוסיית העולם', unit: 'אנשים' },
  growth: { id: 'SP.POP.GROW', label: 'שיעור גידול האוכלוסייה', unit: 'אחוזים לשנה' },
  birthRate: { id: 'SP.DYN.CBRT.IN', label: 'שיעור לידות', unit: 'לידות לאלף תושבים בשנה' },
  deathRate: { id: 'SP.DYN.CDRT.IN', label: 'שיעור תמותה', unit: 'מקרי מוות לאלף תושבים בשנה' }
};

async function latestIndicator(indicator, timeoutMs = 8000) {
  const url = new URL(API + indicator.id);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('date', '2010:2026');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`World Bank returned HTTP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
    const row = rows.find(item => item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value)));
    if (!row) throw new Error(`לא נמצא נתון זמין למדד ${indicator.id}`);
    return { value: Number(row.value), year: Number(row.date) };
  } finally {
    clearTimeout(timer);
  }
}

function utcYearProgress(now) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const end = Date.UTC(now.getUTCFullYear() + 1, 0, 1);
  return Math.max(0, Math.min(1, (now.getTime() - start) / (end - start)));
}
function formatInteger(value) {
  return Math.round(value).toLocaleString('en-US');
}
function makeCounter(id, label, value, year, note) {
  return { id, label, value: Math.max(0, Math.round(value)), value_text: formatInteger(Math.max(0, value)), as_of: String(year), as_of_text: `מבוסס על נתוני שנת ${year}`, note };
}
async function getWorldStats({ timeoutMs = 8000, now = new Date() } = {}) {
  const [population, growth, birthRate, deathRate] = await Promise.all([
    latestIndicator(INDICATORS.population, timeoutMs),
    latestIndicator(INDICATORS.growth, timeoutMs),
    latestIndicator(INDICATORS.birthRate, timeoutMs),
    latestIndicator(INDICATORS.deathRate, timeoutMs)
  ]);
  const secondsToday = (now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 1000;
  const dayFraction = secondsToday / 86400;
  const yearFraction = utcYearProgress(now);
  const birthsPerYear = population.value * birthRate.value / 1000;
  const deathsPerYear = population.value * deathRate.value / 1000;
  const currentPopulation = population.value * Math.pow(1 + growth.value / 100, Math.max(0, (now.getTime() - Date.UTC(population.year + 1, 0, 1)) / (365.2425 * 86400000)));
  const counters = [
    makeCounter('population_now', 'אוכלוסיית העולם המשוערת', currentPopulation, population.year, 'הקרנה מנתון האוכלוסייה הרשמי האחרון ושיעור הגידול השנתי'),
    makeCounter('births_today', 'לידות היום', birthsPerYear * dayFraction / 365.2425, birthRate.year, 'אומדן לפי שיעור הלידות השנתי'),
    makeCounter('births_this_year', 'לידות השנה', birthsPerYear * yearFraction, birthRate.year, 'אומדן לפי שיעור הלידות השנתי'),
    makeCounter('deaths_today', 'מקרי מוות היום', deathsPerYear * dayFraction / 365.2425, deathRate.year, 'אומדן לפי שיעור התמותה השנתי'),
    makeCounter('deaths_this_year', 'מקרי מוות השנה', deathsPerYear * yearFraction, deathRate.year, 'אומדן לפי שיעור התמותה השנתי'),
    makeCounter('growth_today', 'גידול האוכלוסייה היום', (birthsPerYear - deathsPerYear) * dayFraction / 365.2425, Math.max(birthRate.year, deathRate.year), 'לידות משוערות פחות מקרי מוות משוערים'),
    makeCounter('growth_this_year', 'גידול האוכלוסייה השנה', (birthsPerYear - deathsPerYear) * yearFraction, Math.max(birthRate.year, deathRate.year), 'לידות משוערות פחות מקרי מוות משוערים')
  ];
  return {
    ok: true,
    source: 'https://data.worldbank.org (World Bank Open Data)',
    fetched_at: now.toISOString(),
    data_years: { population: String(population.year), growth: String(growth.year), birth_rate: String(birthRate.year), death_rate: String(deathRate.year) },
    count: counters.length,
    counters,
    disclaimer: 'הנתונים השנתיים הרשמיים משמשים לחישוב אומדנים; אין מדובר בספירה עולמית מדויקת בזמן אמת.'
  };
}
export { getWorldStats, formatInteger };
