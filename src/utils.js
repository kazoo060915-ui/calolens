// 共通ユーティリティ

export const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'（ローカル時間） */
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());

export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const fmtDateJP = (s) => {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
};
export const fmtShort = (s) => {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export const r1 = (n) => Math.round(n * 10) / 10;
export const fmtInt = (n) => Math.round(n).toLocaleString('ja-JP');

export const MEAL_TYPES = [
  { id: 'breakfast', label: '朝食', emoji: '🌅' },
  { id: 'lunch', label: '昼食', emoji: '☀️' },
  { id: 'dinner', label: '夕食', emoji: '🌙' },
  { id: 'snack', label: '間食', emoji: '🍪' },
];

export const mealTypeOf = (id) => MEAL_TYPES.find((m) => m.id === id) ?? MEAL_TYPES[3];

/** 現在時刻から食事区分を推測 */
export const guessMealType = () => {
  const h = new Date().getHours();
  if (h >= 4 && h < 10) return 'breakfast';
  if (h >= 10 && h < 15) return 'lunch';
  if (h >= 17 || h < 4) return 'dinner';
  return 'snack';
};

/** 目標カロリーからPFCの目標グラム数（P15% / F25% / C60%） */
export const pfcTargets = (kcal) => ({
  protein: Math.round((kcal * 0.15) / 4),
  fat: Math.round((kcal * 0.25) / 9),
  carbs: Math.round((kcal * 0.6) / 4),
});

/** 品目リストの合計 */
export const sumItems = (items) =>
  items.reduce(
    (a, it) => ({
      kcal: a.kcal + num(it.kcal),
      protein: a.protein + num(it.protein),
      fat: a.fat + num(it.fat),
      carbs: a.carbs + num(it.carbs),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
