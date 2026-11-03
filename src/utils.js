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

/** キョジャトレ定番・胃に優しい1タップ補給プリセット */
export const KYOJATORE_PRESETS = [
  {
    id: 'soy_amazake',
    emoji: '🥛',
    name: '温豆乳＋米麹甘酒割り',
    shortLabel: '豆乳甘酒',
    mealType: 'snack',
    tag: '職場冷蔵庫・午後補給',
    items: [
      { name: '無調整豆乳', amount: '150ml', kcal: 70, protein: 5.4, fat: 3.6, carbs: 3.6, qty: 1 },
      { name: '米麹甘酒（ノンアル）', amount: '150ml', kcal: 150, protein: 2.1, fat: 0.3, carbs: 34.0, qty: 1 },
    ],
    comment: '職場で飲み物として摂れる胃に優しい+220kcal補給（乳糖・グルテンフリー）',
  },
  {
    id: 'corn_mct',
    emoji: '🌽',
    name: 'コーンポタージュ＋MCTオイル',
    shortLabel: 'コンポタMCT',
    mealType: 'lunch',
    tag: '昼食プラス・即エネルギー',
    items: [
      { name: 'コーンポタージュスープ', amount: '1杯', kcal: 90, protein: 2.0, fat: 2.0, carbs: 16.0, qty: 1 },
      { name: 'MCTオイル', amount: '小さじ1 (5g)', kcal: 45, protein: 0, fat: 5.0, carbs: 0, qty: 1 },
    ],
    comment: '胆汁酸・消化酵素不要で即エネルギー化するMCTオイルで胃もたれゼロの+135kcal',
  },
  {
    id: 'soy_protein_half',
    emoji: '🍵',
    name: 'ソイプロテイン半量＋温豆乳',
    shortLabel: 'ソイ半量豆乳',
    mealType: 'breakfast',
    tag: '朝・胃が張らないP補給',
    items: [
      { name: 'ソイプロテイン（半量）', amount: '12g', kcal: 45, protein: 10.0, fat: 0.5, carbs: 0.5, qty: 1 },
      { name: '無調整豆乳（温）', amount: '150ml', kcal: 70, protein: 5.4, fat: 3.6, carbs: 3.6, qty: 1 },
    ],
    comment: '乳糖ゼロ＆半量ずつ温めて飲むことでお腹の張りを防ぎたんぱく質15g確保',
  },
  {
    id: 'dashi_konaame',
    emoji: '🍲',
    name: '温出汁スープ＋粉飴＋天然塩',
    shortLabel: '出汁＋粉飴',
    mealType: 'snack',
    tag: 'SGLT1高速吸収ハック',
    items: [
      { name: '粉飴（マルトデキストリン）', amount: '大さじ1.5 (15g)', kcal: 60, protein: 0, fat: 0, carbs: 15.0, qty: 1 },
      { name: '温かい出汁・天然塩ひとつまみ', amount: '150ml', kcal: 5, protein: 1.0, fat: 0, carbs: 0.2, qty: 1 },
    ],
    comment: 'ナトリウム×ブドウ糖共輸送体(SGLT1)を起動し、胃ブレーキ(GLP-1)をかけずにエネルギー吸収',
  },
  {
    id: 'egg_zosui_mct',
    emoji: '🥚',
    name: '3分ふわとろ卵雑炊＋MCTオイル',
    shortLabel: '3分卵雑炊',
    mealType: 'breakfast',
    tag: '朝の胃を起こす朝食',
    items: [
      { name: '温かい白米（半膳）', amount: '100g', kcal: 156, protein: 2.5, fat: 0.3, carbs: 35.6, qty: 1 },
      { name: '卵スープ・温泉卵', amount: '1個分', kcal: 90, protein: 6.5, fat: 5.5, carbs: 1.5, qty: 1 },
      { name: 'MCTオイル', amount: '小さじ1 (5g)', kcal: 45, protein: 0, fat: 5.0, carbs: 0, qty: 1 },
    ],
    comment: '温かい半固形食で朝の胃を優しく起こしながら約290kcal・P9gを補給',
  },
  {
    id: 'mochi_snack',
    emoji: '🎍',
    name: 'レンジ切り餅（醤油海苔/きな粉）',
    shortLabel: '切り餅1個',
    mealType: 'snack',
    tag: '高密度エネルギー',
    items: [
      { name: '切り餅', amount: '1個 (50g)', kcal: 118, protein: 2.1, fat: 0.3, carbs: 25.4, qty: 1 },
      { name: 'きな粉・醤油・海苔', amount: '少量', kcal: 15, protein: 1.0, fat: 0.5, carbs: 1.5, qty: 1 },
    ],
    comment: 'アミロペクチン主体で消化が早く、少量でしっかりカロリーを稼げる和食間食',
  },
  {
    id: 'gelatin_miso_vinegar',
    emoji: '🍎',
    name: '食前リンゴ酢白湯＋ゼラチン味噌汁',
    shortLabel: '酢＋ゼラチン汁',
    mealType: 'dinner',
    tag: '胃酸起動＆腸粘膜修復',
    items: [
      { name: '食前リンゴ酢白湯', amount: '小さじ1', kcal: 3, protein: 0, fat: 0, carbs: 0.8, qty: 1 },
      { name: '味噌汁＋ゼラチンパウダー', amount: '1杯 (ゼラチン5g)', kcal: 57, protein: 6.5, fat: 0.8, carbs: 5.0, qty: 1 },
    ],
    comment: '食前の有機酸でペプシンを活性化し、高濃度グリシンで小腸タイトジャンクションを修復',
  },
];

/** 立ち仕事×上半身肥大の独自キョジャトレ5選 */
export const KYOJATORE_WORKOUTS = [
  {
    id: 'dfl',
    emoji: '👅',
    label: '舌上あご＆足指グリップ',
    sub: '立ち仕事中・内臓下垂＆猫背ロック (DFL連鎖)',
  },
  {
    id: 'cocontract',
    emoji: '💪',
    label: '7秒自力共収縮＆合掌プレス',
    sub: '立ち仕事中・胸と背中を同時に固めてパンプ',
  },
  {
    id: 'wallpush',
    emoji: '🧱',
    label: '壁押し5秒（前鋸筋プッシュ）',
    sub: '肋骨を引き上げて胃のスペース拡大＋胸板肥大',
  },
  {
    id: 'elbowpress',
    emoji: '🪽',
    label: '壁肘押し7秒（広背筋プレス）',
    sub: '巻き肩を一瞬で引き戻し背中の厚みを作る',
  },
  {
    id: 'towel',
    emoji: '🧣',
    label: '夕食前2分間タオル絞り',
    sub: '血管からNO放出→夕食の栄養を筋肉へ直送',
  },
];

/** キョジャトレ体調3指標 */
export const KYOJATORE_CONDITIONS = [
  { id: 'stomach', label: '朝の胃の軽さ', hint: '胃もたれせず朝食が入るか' },
  { id: 'sleepiness', label: '食後の覚醒・夕方元気', hint: '昼の強い眠気・夕方のガス欠なし' },
  { id: 'recovery', label: '身体の軽さ', hint: '前日の運動疲れが残っていないか' },
];

