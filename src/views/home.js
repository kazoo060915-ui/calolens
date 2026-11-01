// ホーム画面：今日のカロリー・PFC・食事一覧
import { icons } from '../icons.js';
import { store } from '../store.js';
import { hydratePhotos } from '../photos.js';
import { openAddMenu, openEditor } from '../meal-editor.js';
import { openWeightSheet } from './weight.js';
import { MEAL_TYPES, todayStr, addDays, fmtDateJP, fmtShort, esc, fmtInt, r1, pfcTargets, sumItems, num } from '../utils.js';

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
      <div class="brand"><img src="/icons/icon-192.png" alt="" /><span>Calo<span class="grad">Lens</span></span></div>
      <div class="date-nav">
        <button class="icon-btn" data-nav="-1" aria-label="前の日">${icons.chevronLeft}</button>
        <label class="date-label">${isToday ? `今日 <span class="num" style="color:var(--text-3);font-weight:500">${fmtShort(date)}</span>` : fmtDateJP(date)}
          <input type="date" id="date-pick" value="${date}" max="${today}" aria-label="日付を選択" /></label>
        <button class="icon-btn" data-nav="1" aria-label="次の日" ${isToday ? 'disabled style="opacity:.3"' : ''}>${icons.chevronRight}</button>
      </div>`;

    const s = store.state.settings;
    const target = store.targetKcal();
    const meals = store.mealsOn(date);
    const t = sumItems(meals);
    const over = t.kcal > target;
    const remain = Math.abs(target - t.kcal);
    const ratio = Math.min(t.kcal / target, 1);
    const pt = pfcTargets(target);
    const w = store.state.weights[date];
    const prevList = store.weightList().filter((x) => x.date < date);
    const prev = prevList[prevList.length - 1];
    const diff = w && prev ? r1(w.weight - prev.weight) : null;
    const tw = num(s.targetWeight, 0);
    const isGainGoal = tw && w && tw > w.weight + 0.3;
    const diffCls = diff === null ? '' : (isGainGoal ? diff > 0 : diff < 0) ? 'down' : (isGainGoal ? diff < 0 : diff > 0) ? 'up' : 'flat';

    this.view.innerHTML = `
      <h1 class="sr-only">CaloLens ${fmtDateJP(date)}のカロリー記録</h1>
      <div class="stack">
        ${
          !s.apiKey
            ? `<div class="banner">${icons.alert}<div>写真からAIでカロリー解析するには、<a href="#settings">設定</a>で <b>Gemini APIキー</b> を登録してください（無料で取得できます）。</div></div>`
            : ''
        }

        <section class="card summary-card" aria-label="カロリーサマリー">
          <div class="ring-wrap">
            <div class="ring ${over ? 'over' : ''}">
              <svg viewBox="0 0 160 160">
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${over ? '#fb7185' : '#34d399'}" />
                    <stop offset="100%" stop-color="${over ? '#f43f5e' : '#22d3ee'}" />
                  </linearGradient>
                </defs>
                <circle class="track" cx="80" cy="80" r="${R}" fill="none" stroke-width="14" />
                <circle class="progress" cx="80" cy="80" r="${R}" fill="none" stroke="url(#ringGrad)" stroke-width="14"
                  stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}" data-offset="${CIRC * (1 - ratio)}" />
              </svg>
              <div class="ring-center">
                <div class="label">${over ? 'オーバー' : 'あと'}</div>
                <div class="value num">${fmtInt(remain)}</div>
                <div class="unit">kcal</div>
              </div>
            </div>
            <div class="ring-stats">
              <div class="ring-stat" style="--dot:var(--accent)"><div class="k">摂取カロリー</div><div class="v num">${fmtInt(t.kcal)}<small>kcal</small></div></div>
              <div class="ring-stat" style="--dot:var(--text-3)"><div class="k">目標カロリー</div><div class="v num">${fmtInt(target)}<small>kcal</small></div></div>
            </div>
          </div>
          <div class="pfc">
            ${pfcItem('たんぱく質', 'var(--protein)', t.protein, pt.protein)}
            ${pfcItem('脂質', 'var(--fat)', t.fat, pt.fat)}
            ${pfcItem('炭水化物', 'var(--carbs)', t.carbs, pt.carbs)}
          </div>
        </section>

        <section class="card weight-quick" data-weight role="button" tabindex="0" aria-label="体重を記録">
          <div class="icon">${icons.scale}</div>
          <div class="info">
            <div class="card-sub">${isToday ? '今日' : fmtShort(date)}の体重</div>
            ${
              w
                ? `<div class="v num">${w.weight.toFixed(1)}<small style="font-size:13px;color:var(--text-3)"> kg</small>
                   ${diff !== null ? `<span class="delta ${diffCls}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}</span>` : ''}</div>`
                : `<div style="font-weight:700;margin-top:2px">タップして記録</div>`
            }
          </div>
          <span class="icon-btn">${w ? icons.edit : icons.plus}</span>
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
