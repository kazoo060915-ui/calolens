// データ保存（localStorage）
// 写真は容量が大きいので IndexedDB（photos.js）に分けて保存する
import { uid, num, sumItems } from './utils.js';

const KEY = 'calolens:v1';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const defaults = () => ({
  settings: {
    apiKey: '',
    model: DEFAULT_MODEL,
    sex: 'male',
    age: 35,
    height: 170,
    activity: 1.5,
    targetWeight: null,
    autoKcal: true,
    targetKcal: 2000,
  },
  /** @type {Array<{id:string,date:string,mealType:string,name:string,items:any[],kcal:number,protein:number,fat:number,carbs:number,comment:string,hasPhoto:boolean,createdAt:number}>} */
  meals: [],
  /** @type {Record<string,{weight:number,bodyFat:number|null}>} */
  weights: {},
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw);
    const d = defaults();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch {
    return defaults();
  }
}

let state = load();
const listeners = new Set();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    throw new Error('端末の保存容量が不足しています');
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get state() {
    return state;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /* ---------- 食事 ---------- */
  mealsOn(date) {
    return state.meals.filter((m) => m.date === date).sort((a, b) => a.createdAt - b.createdAt);
  },
  saveMeal(meal) {
    const totals = sumItems(meal.items);
    const record = {
      id: meal.id || uid(),
      date: meal.date,
      mealType: meal.mealType,
      name: meal.name?.trim() || meal.items.map((i) => i.name).filter(Boolean).join('、') || '食事',
      items: meal.items.map((i) => ({
        name: i.name?.trim() || '',
        amount: i.amount?.trim() || '',
        kcal: Math.round(num(i.kcal)),
        protein: num(i.protein),
        fat: num(i.fat),
        carbs: num(i.carbs),
      })),
      kcal: Math.round(totals.kcal),
      protein: totals.protein,
      fat: totals.fat,
      carbs: totals.carbs,
      comment: meal.comment || '',
      hasPhoto: !!meal.hasPhoto,
      createdAt: meal.createdAt || Date.now(),
    };
    const idx = state.meals.findIndex((m) => m.id === record.id);
    if (idx >= 0) state.meals[idx] = record;
    else state.meals.push(record);
    commit();
    return record;
  },
  deleteMeal(id) {
    state.meals = state.meals.filter((m) => m.id !== id);
    commit();
  },
  dayTotals(date) {
    return sumItems(this.mealsOn(date));
  },

  /* ---------- 体重・体組成 ---------- */
  setWeight(date, weight, bodyFat = null, muscleMass = null) {
    state.weights[date] = {
      weight: num(weight),
      bodyFat: bodyFat === null || bodyFat === '' ? null : num(bodyFat),
      muscleMass: muscleMass === null || muscleMass === '' ? null : num(muscleMass),
    };
    commit();
  },
  deleteWeight(date) {
    delete state.weights[date];
    commit();
  },
  /** 日付昇順の体重リスト */
  weightList() {
    return Object.entries(state.weights)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  latestWeight() {
    const list = this.weightList();
    return list.length ? list[list.length - 1] : null;
  },

  /* ---------- 設定 ---------- */
  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    commit();
  },
  /** 目標摂取カロリー */
  targetKcal() {
    const s = state.settings;
    if (!s.autoKcal) return Math.max(800, Math.round(num(s.targetKcal, 2000)));
    return calcAutoKcal(s, this.latestWeight()?.weight);
  },

  /* ---------- データ管理 ---------- */
  exportJSON() {
    const { apiKey, ...settings } = state.settings; // APIキーは書き出さない
    return JSON.stringify({ app: 'CaloLens', version: 1, exportedAt: new Date().toISOString(), ...state, settings }, null, 2);
  },
  importJSON(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data.meals) || typeof data.weights !== 'object') throw new Error('CaloLensのバックアップファイルではありません');
    const d = defaults();
    state = {
      settings: { ...d.settings, ...data.settings, apiKey: state.settings.apiKey },
      meals: data.meals.map((m) => ({ ...m, hasPhoto: false })),
      weights: data.weights,
    };
    commit();
  },
  reset() {
    state = defaults();
    commit();
  },
};

/**
 * Mifflin-St Jeor式で基礎代謝→活動量を掛けてTDEEを算出。
 * 目標体重が現在より低ければ -400kcal（月1.5kg程度の減量ペース）、高ければ +300kcal。
 */
export function calcAutoKcal(s, weight) {
  const w = num(weight, s.sex === 'male' ? 65 : 52);
  const bmr = 10 * w + 6.25 * num(s.height, 165) - 5 * num(s.age, 35) + (s.sex === 'male' ? 5 : -161);
  let kcal = bmr * num(s.activity, 1.5);
  const tw = num(s.targetWeight, 0);
  if (tw && tw < w - 0.3) kcal -= 400;
  else if (tw && tw > w + 0.3) kcal += 300;
  return Math.round(Math.max(kcal, 1200) / 10) * 10;
}

export function calcBMR(s, weight) {
  const w = num(weight, s.sex === 'male' ? 65 : 52);
  return Math.round(10 * w + 6.25 * num(s.height, 165) - 5 * num(s.age, 35) + (s.sex === 'male' ? 5 : -161));
}
