// ホーム画面：今日のカロリー・PFC・キョジャトレ1タップ補給・体調＆独自トレ・食事一覧
import { icons } from '../icons.js';
import { store } from '../store.js';
import { toast } from '../ui.js';
import { hydratePhotos } from '../photos.js';
import { openAddMenu, openEditor } from '../meal-editor.js';
import { openWeightSheet } from './weight.js';
import {
  MEAL_TYPES,
  KYOJATORE_PRESETS,
  KYOJATORE_WORKOUTS,
  KYOJATORE_CONDITIONS,
  todayStr,
  addDays,
  fmtDateJP,
  fmtShort,
  esc,
  fmtInt,
  r1,
  pfcTargets,
  sumItems,
  num,
} from '../utils.js';

let date = todayStr();
const R = 66;
const CIRC = 2 * Math.PI * R;

export const home = {
  setDate(d) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      date = d > todayStr() ? todayStr() : d;
    }
  },
  mount(view, header) {
    this.view = view;
    this.headerEl = header;
    header.onclick = (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        date = addDays(date, +nav.dataset.nav);
        this.render();
      }
    };
    header.onchange = (e) => {
      if (e.target.id === 'date-pick' && e.target.value) {
        date = e.target.value > todayStr() ? todayStr() : e.target.value;
        this.render();
      }
    };
    view.onclick = (e) => {
      const presetBtn = e.target.closest('[data-preset]');
      if (presetBtn) {
        const preset = KYOJATORE_PRESETS.find((p) => p.id === presetBtn.dataset.preset);
        if (!preset) return;
        const saved = store.saveMeal({
          date,
          mealType: preset.mealType,
          name: preset.name,
          items: structuredClone(preset.items),
          comment: preset.comment,
          hasPhoto: false,
        });
        toast(`${preset.emoji}「${saved.name}」を追加しました（+${fmtInt(saved.kcal)} kcal）`);
        return;
      }
      const condBtn = e.target.closest('[data-cond]');
      if (condBtn) {
        store.setCondition(date, condBtn.dataset.cond, condBtn.dataset.val);
        return;
      }
      const workBtn = e.target.closest('[data-workout]');
      if (workBtn) {
        store.toggleWorkout(date, workBtn.dataset.workout);
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) return openAddMenu({ date, mealType: add.dataset.add });
      const row = e.target.closest('[data-meal]');
      if (row) {
        const meal = store.state.meals.find((m) => m.id === row.dataset.meal);
        if (meal) openEditor({ meal });
        return;
      }
      if (e.target.closest('[data-weight]')) openWeightSheet(date);
    };
    this.render();
  },

  update() {
    this.render();
  },

  get date() {
    return date;
  },

  render() {
    const today = todayStr();
    const isToday = date === today;
    this.headerEl.innerHTML = `
      <div class="brand"><img src="/icons/icon-192.png" alt="" /><span>Kyoja<span class="grad">Tore</span></span></div>
      <div class="date-nav">
        <button class="icon-btn" data-nav="-1" aria-label="前の日">${icons.chevronLeft}</button>
        <label class="date-label">${isToday ? `今日 <span class="num" style="color:var(--text-3);font-weight:500">${fmtShort(date)}</span>` : fmtDateJP(date)}
          <input type="date" id="date-pick" value="${date}" max="${today}" aria-label="日付を選択" /></label>
        <button class="icon-btn" data-nav="1" aria-label="次の日" ${isToday ? 'disabled style="opacity:.3"' : ''}>${icons.chevronRight}</button>
      </div>`;

    const s = store.state.settings;
    const isGain = store.isGainMode();
    const target = store.targetKcal();
    const meals = store.mealsOn(date);
    const t = sumItems(meals);
    const over = t.kcal >= target;
    const tooMuchForStomach = isGain && t.kcal > target + 500;
    const showDanger = (!isGain && t.kcal > target) || tooMuchForStomach;
    const remain = Math.abs(target - t.kcal);
    const ratio = Math.min(t.kcal / target, 1);
    const pt = pfcTargets(target);
    const w = store.state.weights[date];
    const prevList = store.weightList().filter((x) => x.date < date);
    const prev = prevList[prevList.length - 1];
    const diff = w && prev ? r1(w.weight - prev.weight) : null;
    const tw = num(s.targetWeight, 0);
    const isGainGoal = isGain || (tw && w && tw > w.weight + 0.3);
    const diffCls = diff === null ? '' : (isGainGoal ? diff > 0 : diff < 0) ? 'down' : (isGainGoal ? diff < 0 : diff > 0) ? 'up' : 'flat';
    const dLog = store.dayLog(date);
    const doneWorkouts = Array.isArray(dLog.workouts) ? dLog.workouts : [];

    const ringLabel = isGain
      ? tooMuchForStomach
        ? '胃もたれ注意'
        : over
          ? '目標達成！+'
          : '目標まであと'
      : over
        ? 'オーバー'
        : 'あと';

    this.view.innerHTML = `
      <h1 class="sr-only">KyojaTore ${fmtDateJP(date)}のキョジャトレ記録</h1>
      <div class="stack">
        ${
          !s.apiKey
            ? `<div class="banner">${icons.alert}<div>写真からAIでカロリー解析するには、<a href="#settings">設定</a>で <b>Gemini APIキー</b> を登録してください（無料で取得できます）。</div></div>`
            : ''
        }

        <section class="card summary-card" aria-label="カロリーサマリー">
          <div class="ring-wrap">
            <div class="ring ${showDanger ? 'over' : ''}">
              <svg viewBox="0 0 160 160">
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${showDanger ? '#fb7185' : '#34d399'}" />
                    <stop offset="100%" stop-color="${showDanger ? '#f43f5e' : '#22d3ee'}" />
                  </linearGradient>
                </defs>
                <circle class="track" cx="80" cy="80" r="${R}" fill="none" stroke-width="14" />
                <circle class="progress" cx="80" cy="80" r="${R}" fill="none" stroke="url(#ringGrad)" stroke-width="14"
                  stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}" data-offset="${CIRC * (1 - ratio)}" />
              </svg>
              <div class="ring-center">
                <div class="label" style="${isGain && over && !tooMuchForStomach ? 'color:var(--accent);font-weight:700' : ''}">${ringLabel}</div>
                <div class="value num">${fmtInt(remain)}</div>
                <div class="unit">kcal</div>
              </div>
            </div>
            <div class="ring-stats">
              <div class="ring-stat" style="--dot:var(--accent)"><div class="k">摂取カロリー</div><div class="v num">${fmtInt(t.kcal)}<small>kcal</small></div></div>
              <div class="ring-stat" style="--dot:var(--text-3)"><div class="k">${isGain ? '増量目標' : '目標カロリー'}</div><div class="v num">${fmtInt(target)}<small>kcal</small></div></div>
            </div>
          </div>
          <div class="pfc">
            ${pfcItem('たんぱく質', 'var(--protein)', t.protein, pt.protein)}
            ${pfcItem('脂質', 'var(--fat)', t.fat, pt.fat)}
            ${pfcItem('炭水化物', 'var(--carbs)', t.carbs, pt.carbs)}
          </div>
        </section>

        <section class="card preset-card" aria-label="キョジャトレ1タップ補給">
          <div class="card-head" style="margin-bottom:8px">
            <div class="meal-type"><span class="emoji">⚡</span>胃に優しい1タップ補給</div>
            <span class="card-sub">タップで即追加</span>
          </div>
          <div class="preset-scroll">
            ${KYOJATORE_PRESETS.map((p) => {
              const pkcal = sumItems(p.items).kcal;
              return `<button type="button" class="preset-chip" data-preset="${p.id}">
                <span class="p-emoji">${p.emoji}</span>
                <span class="p-body">
                  <span class="p-name">${esc(p.shortLabel)}</span>
                  <span class="p-kcal num">+${fmtInt(pkcal)} kcal</span>
                </span>
              </button>`;
            }).join('')}
          </div>
        </section>

        <section class="card weight-quick" data-weight role="button" tabindex="0" aria-label="体重を記録">
          <div class="icon">${icons.scale}</div>
          <div class="info">
            <div class="card-sub">${isToday ? '今日' : fmtShort(date)}の体重 ${tw ? `<span style="color:var(--text-3)">（目標 ${tw.toFixed(1)}kg）</span>` : ''}</div>
            ${
              w
                ? `<div class="v num">${w.weight.toFixed(1)}<small style="font-size:13px;color:var(--text-3)"> kg</small>
                   ${diff !== null ? `<span class="delta ${diffCls}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}</span>` : ''}</div>`
                : `<div style="font-weight:700;margin-top:2px">タップして記録</div>`
            }
          </div>
          <span class="icon-btn">${w ? icons.edit : icons.plus}</span>
        </section>

        <section class="card kyoja-check-card" aria-label="キョジャトレ体調と独自トレ">
          <div class="card-head" style="margin-bottom:10px">
            <div class="meal-type"><span class="emoji">🌿</span>キョジャトレ体調＆独自トレ</div>
            <span class="card-sub num">トレ ${doneWorkouts.length}/${KYOJATORE_WORKOUTS.length}</span>
          </div>
          <div class="cond-list">
            ${KYOJATORE_CONDITIONS.map((c) => {
              const cur = dLog[c.id];
              return `<div class="cond-row">
                <div class="cond-info">
                  <div class="cond-label">${esc(c.label)}</div>
                  <div class="cond-hint">${esc(c.hint)}</div>
                </div>
                <div class="cond-btns">
                  <button type="button" class="cond-btn ${cur === 'good' ? 'active good' : ''}" data-cond="${c.id}" data-val="good">◎</button>
                  <button type="button" class="cond-btn ${cur === 'ok' ? 'active ok' : ''}" data-cond="${c.id}" data-val="ok">△</button>
                  <button type="button" class="cond-btn ${cur === 'bad' ? 'active bad' : ''}" data-cond="${c.id}" data-val="bad">×</button>
                </div>
              </div>`;
            }).join('')}
          </div>
          ${
            dLog.stomach === 'bad'
              ? `<div class="kyoja-alert">💡 <b>胃の安全弁作動：</b>朝の胃が重い日は無理に詰め込まず、夕食を湯豆腐・雑炊（腹7分目）にして胃を休めましょう。</div>`
              : dLog.sleepiness === 'bad'
                ? `<div class="kyoja-alert">💡 <b>眠気対策：</b>昼の白米を30〜50g減らし、食前リンゴ酢や午後の豆乳甘酒・出汁粉飴に分散しましょう。</div>`
                : dLog.recovery === 'bad'
                  ? `<div class="kyoja-alert">💡 <b>疲労回復優先：</b>今日は筋トレをお休みし、みぞおちほぐしと4-8秒深呼吸だけにしましょう。</div>`
                  : ''
          }
          <div class="workout-divider">立ち仕事＆自宅の独自自重トレ（6〜7割で止める）</div>
          <div class="workout-list">
            ${KYOJATORE_WORKOUTS.map((wk) => {
              const checked = doneWorkouts.includes(wk.id);
              return `<button type="button" class="workout-item ${checked ? 'done' : ''}" data-workout="${wk.id}">
                <span class="wk-check">${checked ? '✓' : ''}</span>
                <span class="wk-emoji">${wk.emoji}</span>
                <span class="wk-text">
                  <span class="wk-title">${esc(wk.label)}</span>
                  <span class="wk-sub">${esc(wk.sub)}</span>
                </span>
              </button>`;
            }).join('')}
          </div>
        </section>

        ${MEAL_TYPES.map((mt) => mealSection(mt, meals.filter((m) => m.mealType === mt.id))).join('')}
      </div>`;

    requestAnimationFrame(() => {
      const p = this.view.querySelector('.progress');
      if (p) p.style.strokeDashoffset = p.dataset.offset;
      this.view.querySelectorAll('.bar > span[data-w]').forEach((b) => (b.style.width = b.dataset.w));
    });
    hydratePhotos(this.view);
  },
};

function pfcItem(name, color, val, target) {
  const pct = Math.min((val / target) * 100, 100);
  return `
    <div class="pfc-item" style="--c:${color}">
      <div class="top"><span class="name">${name}</span></div>
      <div class="amt num">${r1(val)}<small> / ${target}g</small></div>
      <div class="bar" style="margin-top:6px"><span data-w="${pct}%"></span></div>
    </div>`;
}

function mealSection(mt, meals) {
  const kcal = meals.reduce((a, m) => a + m.kcal, 0);
  return `
    <section class="card meal-section" aria-label="${mt.label}">
      <div class="card-head">
        <div class="meal-type"><span class="emoji">${mt.emoji}</span>${mt.label}</div>
        <div class="meal-kcal num"><b>${fmtInt(kcal)}</b> kcal</div>
      </div>
      <div class="meal-list">
        ${meals
          .map(
            (m) => `
          <button class="meal-row" data-meal="${esc(m.id)}">
            <div class="thumb">${m.hasPhoto ? `<img data-photo="${esc(m.id)}" alt="" />` : ''}🍽️</div>
            <div class="info">
              <div class="name">${esc(m.name)}</div>
              <div class="macros num">
                <span style="color:var(--protein)">P ${r1(m.protein)}</span>
                <span style="color:var(--fat)">F ${r1(m.fat)}</span>
                <span style="color:var(--carbs)">C ${r1(m.carbs)}</span>
              </div>
            </div>
            <div class="kcal num">${fmtInt(m.kcal)}<small> kcal</small></div>
          </button>`
          )
          .join('')}
      </div>
      <button class="add-row" data-add="${mt.id}" id="add-${mt.id}">${icons.plus} ${mt.label}を追加</button>
    </section>`;
}
