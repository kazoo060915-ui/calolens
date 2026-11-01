// 体重・体組成画面：記録・統計・推移グラフ・履歴
import { icons } from '../icons.js';
import { store } from '../store.js';
import { openSheet, toast, confirmSheet } from '../ui.js';
import { Chart, verticalGradient } from '../charts.js';
import { todayStr, addDays, fmtDateJP, fmtShort, r1, num } from '../utils.js';

let range = 30; // 日数（0 = 全期間）
let metric = 'weight'; // 'weight' | 'muscle' | 'fat'
let chart = null;

/** 体重入力シート（ホームからも呼ばれる） */
export function openWeightSheet(initialDate = todayStr()) {
  let date = initialDate;
  const last = store.latestWeight();
  const sheet = openSheet('');

  const renderForm = () => {
    const cur = store.state.weights[date];
    sheet.el.innerHTML = `
      <h2 class="sheet-title">
        <span>体重・体組成を記録</span>
        <button class="icon-btn" data-act="close" aria-label="閉じる">${icons.x}</button>
      </h2>
      <div class="field" style="margin-bottom:12px">
        <label for="ws-date">記録する日付</label>
        <input class="input" id="ws-date" type="date" value="${date}" max="${todayStr()}" />
      </div>
      <div class="weight-input-main">
        <div class="field"><label for="ws-weight">体重</label>
          <div class="input-group"><input class="input big-input" id="ws-weight" type="number" inputmode="decimal" step="0.1" min="20" max="300"
            value="${cur ? cur.weight : last ? last.weight : ''}" placeholder="60.0" /><span class="suffix">kg</span></div></div>
      </div>
      <div class="weight-input-sub">
        <div class="field"><label for="ws-fat">体脂肪率（任意）</label>
          <div class="input-group"><input class="input sub-input" id="ws-fat" type="number" inputmode="decimal" step="0.1" min="1" max="70"
            value="${cur?.bodyFat ?? ''}" placeholder="—" /><span class="suffix">%</span></div></div>
        <div class="field"><label for="ws-muscle">筋肉量（任意）</label>
          <div class="input-group"><input class="input sub-input" id="ws-muscle" type="number" inputmode="decimal" step="0.1" min="5" max="150"
            value="${cur?.muscleMass ?? ''}" placeholder="—" /><span class="suffix">kg</span></div></div>
      </div>
      <div class="sheet-actions">
        ${cur ? `<button class="btn btn-danger" data-act="delete" aria-label="削除">${icons.trash}</button>` : ''}
        <button class="btn btn-primary" data-act="save" id="btn-save-weight">${icons.check} 記録する</button>
      </div>`;
  };

  renderForm();
  setTimeout(() => sheet.el.querySelector('#ws-weight')?.select(), 350);

  sheet.el.addEventListener('change', (e) => {
    if (e.target.id === 'ws-date' && e.target.value) {
      date = e.target.value > todayStr() ? todayStr() : e.target.value;
      renderForm();
    }
  });

  sheet.el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.id !== 'ws-date') {
      sheet.el.querySelector('[data-act="save"]')?.click();
    }
  });

  sheet.el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') sheet.close();
    if (act === 'save') {
      const input = sheet.el.querySelector('#ws-weight');
      const w = num(input.value, NaN);
      if (!(w >= 20 && w <= 300)) return toast('体重を20〜300kgの範囲で入力してください', 'error');
      const fatRaw = sheet.el.querySelector('#ws-fat').value.trim();
      const muscleRaw = sheet.el.querySelector('#ws-muscle').value.trim();
      if (fatRaw !== '') {
        const bf = num(fatRaw, NaN);
        if (!(bf >= 1 && bf <= 70)) return toast('体脂肪率は1〜70%の範囲で入力してください', 'error');
      }
      if (muscleRaw !== '') {
        const mm = num(muscleRaw, NaN);
        if (!(mm >= 5 && mm <= 150)) return toast('筋肉量は5〜150kgの範囲で入力してください', 'error');
      }
      store.setWeight(date, r1(w), fatRaw === '' ? null : r1(num(fatRaw)), muscleRaw === '' ? null : r1(num(muscleRaw)));
      sheet.close();
      toast(`${fmtDateJP(date)}：${r1(w).toFixed(1)} kg を記録しました`);
    }
    if (act === 'delete') {
      const ok = await confirmSheet({
        title: '記録を削除',
        message: `${fmtDateJP(date)}の記録を削除します。`,
        okLabel: '削除する',
        danger: true,
      });
      if (ok) {
        store.deleteWeight(date);
        sheet.close();
        toast('削除しました');
      }
    }
  });
}

export const weight = {
  mount(view, header) {
    this.view = view;
    header.innerHTML = `<h1 class="page-title">体重・筋肉量</h1>
      <button class="btn btn-sm btn-primary" id="btn-add-weight">${icons.plus} 記録</button>`;
    header.onclick = (e) => {
      if (e.target.closest('#btn-add-weight')) openWeightSheet();
    };
    header.onchange = null;
    view.onclick = async (e) => {
      const r = e.target.closest('[data-range]');
      if (r) {
        range = +r.dataset.range;
        this.render();
        return;
      }
      const m = e.target.closest('[data-metric]');
      if (m) {
        metric = m.dataset.metric;
        this.render();
        return;
      }
      const ed = e.target.closest('[data-edit]');
      if (ed) return openWeightSheet(ed.dataset.edit);
      if (e.target.closest('#btn-today-weight')) openWeightSheet();
    };
    this.render();
  },
  update() {
    this.render();
  },
  destroy() {
    chart?.destroy();
    chart = null;
  },

  render() {
    chart?.destroy();
    chart = null;
    const s = store.state.settings;
    const list = store.weightList();
    const latest = list[list.length - 1];
    const first = list[0];
    const today = store.state.weights[todayStr()];
    const h = num(s.height, 0) / 100;
    const bmi = latest && h ? latest.weight / (h * h) : null;
    const tw = num(s.targetWeight, 0);

    // 7日前との比較
    const weekAgo = [...list].reverse().find((x) => x.date <= addDays(todayStr(), -7));
    const latestMuscle = [...list].reverse().find((x) => x.muscleMass != null);
    const latestFat = [...list].reverse().find((x) => x.bodyFat != null);

    let goalPct = 0;
    if (tw && first && latest && first.weight !== tw) {
      goalPct = Math.max(0, Math.min(100, ((first.weight - latest.weight) / (first.weight - tw)) * 100));
    }

    const filtered = range ? list.filter((x) => x.date >= addDays(todayStr(), -range + 1)) : list;
    const hasMetricData = filtered.some((x) =>
      metric === 'muscle' ? x.muscleMass != null : metric === 'fat' ? x.bodyFat != null : x.weight != null
    );
    const isGainGoal = tw && latest && tw > latest.weight + 0.3;

    this.view.innerHTML = `
      <div class="stack">
        ${
          !today
            ? `<section class="card weight-quick" id="btn-today-weight" role="button" tabindex="0">
                 <div class="icon">${icons.scale}</div>
                 <div class="info"><div class="card-sub">今日の体重</div><div style="font-weight:700">まだ記録していません</div></div>
                 <span class="btn btn-sm btn-primary">${icons.plus} 記録</span>
               </section>`
            : ''
        }

        <section class="card">
          <div class="stats-grid">
            <div class="stat"><div class="k">現在の体重</div>
              <div class="v num">${latest ? latest.weight.toFixed(1) : '—'}<small>kg</small></div>
              <div class="s">${latest ? fmtShort(latest.date) + ' 時点' : '記録なし'}</div></div>
            <div class="stat"><div class="k">1週間の変化</div>
              <div class="v num">${deltaHtml(latest && weekAgo ? latest.weight - weekAgo.weight : null, false, isGainGoal)}</div>
              <div class="s">${weekAgo ? fmtShort(weekAgo.date) + ' 比' : 'データ不足'}</div></div>
            <div class="stat"><div class="k">筋肉量</div>
              <div class="v num" style="color:var(--muscle)">${latestMuscle ? latestMuscle.muscleMass.toFixed(1) : '—'}<small>kg</small></div>
              <div class="s">${latestMuscle ? fmtShort(latestMuscle.date) + ' 時点' : '未記録'}</div></div>
            <div class="stat"><div class="k">体脂肪率</div>
              <div class="v num" style="color:var(--fat)">${latestFat ? latestFat.bodyFat.toFixed(1) : '—'}<small>%</small></div>
              <div class="s">${latestFat ? fmtShort(latestFat.date) + ' 時点' : '未記録'}</div></div>
            <div class="stat"><div class="k">BMI</div>
              <div class="v num">${bmi ? bmi.toFixed(1) : '—'}</div>
              <div class="s">${bmi ? bmiLabel(bmi) : '身長を設定してください'}</div></div>
            <div class="stat"><div class="k">目標まで</div>
              <div class="v num">${tw && latest ? Math.abs(latest.weight - tw).toFixed(1) : '—'}<small>kg</small></div>
              <div class="s">${tw ? `目標 ${tw.toFixed(1)} kg` : '<a href="#settings">目標を設定</a>'}</div></div>
          </div>
          ${
            tw && first && latest
              ? `<div class="goal-progress">
                   <div class="bar"><span data-w="${goalPct}%"></span></div>
                   <div class="labels num"><span>開始 ${first.weight.toFixed(1)}kg</span><span>達成率 ${Math.round(goalPct)}%</span><span>目標 ${tw.toFixed(1)}kg</span></div>
                 </div>`
              : ''
          }
        </section>

        <section class="card">
          <div class="card-head" style="flex-direction:column;align-items:stretch;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h2 class="card-title">推移グラフ</h2>
              <div class="segmented" role="tablist">
                ${[
                  [7, '1週'],
                  [30, '1ヶ月'],
                  [90, '3ヶ月'],
                  [0, '全期間'],
                ]
                  .map(([d, l]) => `<button data-range="${d}" class="${range === d ? 'active' : ''}">${l}</button>`)
                  .join('')}
              </div>
            </div>
            <div class="segmented" style="width:100%">
              <button style="flex:1" data-metric="weight" class="${metric === 'weight' ? 'active' : ''}">体重</button>
              <button style="flex:1" data-metric="muscle" class="${metric === 'muscle' ? 'active' : ''}">筋肉量</button>
              <button style="flex:1" data-metric="fat" class="${metric === 'fat' ? 'active' : ''}">体脂肪率</button>
            </div>
          </div>
          ${
            hasMetricData
              ? `<div class="chart-box"><canvas id="weight-chart" aria-label="推移グラフ"></canvas></div>`
              : `<div class="empty"><div class="big">📈</div>この期間の${metric === 'muscle' ? '筋肉量' : metric === 'fat' ? '体脂肪率' : '体重'}記録がありません。<br />記録を追加してグラフで変化を見てみましょう！</div>`
          }
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">履歴</h2><span class="card-sub">${list.length}件</span></div>
          ${
            list.length
              ? `<div class="history-list">
                  ${[...list]
                    .reverse()
                    .slice(0, 60)
                    .map((x, i, arr) => {
                      const prev = arr[i + 1];
                      return `<div class="history-item">
                        <span class="d">${fmtDateJP(x.date)}</span>
                        ${prev ? deltaHtml(x.weight - prev.weight, true, isGainGoal) : ''}
                        <div class="meta-col">
                          ${x.muscleMass != null ? `<span class="mm num">筋肉 ${x.muscleMass.toFixed(1)}kg</span>` : ''}
                          ${x.bodyFat != null ? `<span class="bf num">体脂肪 ${x.bodyFat.toFixed(1)}%</span>` : ''}
                        </div>
                        <span class="w num">${x.weight.toFixed(1)}<small style="font-size:11px;color:var(--text-3)"> kg</small></span>
                        <button class="icon-btn" data-edit="${x.date}" aria-label="編集">${icons.edit}</button>
                      </div>`;
                    })
                    .join('')}
                </div>`
              : `<div class="empty">まだ記録がありません</div>`
          }
        </section>
      </div>`;

    requestAnimationFrame(() => {
      this.view.querySelectorAll('.bar > span[data-w]').forEach((b) => (b.style.width = b.dataset.w));
    });

    const canvas = this.view.querySelector('#weight-chart');
    if (canvas) chart = drawChart(canvas, filtered, metric, tw);
  },
};

function drawChart(canvas, data, currentMetric, targetWeight) {
  let values;
  let labelName;
  let color;
  let unit;
  let hasTarget = false;

  if (currentMetric === 'muscle') {
    values = data.map((d) => (d.muscleMass != null ? d.muscleMass : null));
    labelName = '筋肉量';
    color = '#38bdf8';
    unit = 'kg';
  } else if (currentMetric === 'fat') {
    values = data.map((d) => (d.bodyFat != null ? d.bodyFat : null));
    labelName = '体脂肪率';
    color = '#fbbf24';
    unit = '%';
  } else {
    values = data.map((d) => d.weight);
    labelName = '体重';
    color = '#a78bfa';
    unit = 'kg';
    hasTarget = !!targetWeight;
  }

  const validValues = values.filter((v) => v !== null && !isNaN(v));
  if (!validValues.length) {
    values = data.map(() => 0);
  }

  const allForScale = hasTarget && targetWeight ? [...validValues, targetWeight] : validValues.length ? validValues : [50, 70];
  const min = Math.floor(Math.min(...allForScale) - 1);
  const max = Math.ceil(Math.max(...allForScale) + 1);

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((d) => fmtShort(d.date)),
      datasets: [
        {
          label: labelName,
          data: values,
          borderColor: color,
          borderWidth: 3,
          tension: 0.35,
          spanGaps: true,
          pointRadius: data.length > 40 ? 0 : 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0b0f14',
          pointBorderColor: color,
          pointBorderWidth: 2,
          fill: true,
          backgroundColor: (c) =>
            c.chart.chartArea
              ? verticalGradient(c.chart.ctx, c.chart.chartArea, hexToRgba(color, 0.35), hexToRgba(color, 0))
              : 'transparent',
        },
        ...(hasTarget && targetWeight
          ? [
              {
                label: '目標体重',
                data: data.map(() => targetWeight),
                borderColor: 'rgba(52,211,153,0.7)',
                borderDash: [6, 6],
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false,
              },
            ]
          : []),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } },
        y: { min, max, ticks: { maxTicksLimit: 6, callback: (v) => v + unit } },
      },
      plugins: {
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            label: (c) => {
              const d = data[c.dataIndex];
              const parts = [];
              if (d.weight != null) parts.push(`体重 ${d.weight.toFixed(1)}kg`);
              if (d.muscleMass != null) parts.push(`筋肉 ${d.muscleMass.toFixed(1)}kg`);
              if (d.bodyFat != null) parts.push(`体脂肪 ${d.bodyFat.toFixed(1)}%`);
              return parts.join(' / ');
            },
          },
        },
      },
    },
  });
}

function hexToRgba(hex, alpha) {
  if (hex === '#38bdf8') return `rgba(56,189,248,${alpha})`;
  if (hex === '#fbbf24') return `rgba(251,191,36,${alpha})`;
  if (hex === '#a78bfa') return `rgba(167,139,250,${alpha})`;
  return `rgba(52,211,153,${alpha})`;
}

function deltaHtml(d, small = false, isGainGoal = false) {
  if (d === null || d === undefined) return '—';
  const v = r1(d);
  const good = isGainGoal ? v > 0 : v < 0;
  const bad = isGainGoal ? v < 0 : v > 0;
  const cls = good ? 'down' : bad ? 'up' : 'flat';
  const txt = `${v > 0 ? '+' : ''}${v.toFixed(1)}${small ? '' : '<small>kg</small>'}`;
  return small ? `<span class="delta ${cls} num">${txt}</span>` : `<span style="color:${good ? 'var(--accent)' : bad ? 'var(--danger)' : 'inherit'}">${txt}</span>`;
}

function bmiLabel(b) {
  if (b < 18.5) return '低体重';
  if (b < 25) return '普通体重';
  if (b < 30) return '肥満（1度）';
  return '肥満（2度以上）';
}
