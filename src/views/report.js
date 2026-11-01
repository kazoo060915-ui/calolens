// レポート画面：日別カロリーと平均PFCバランス
import { store } from '../store.js';
import { Chart } from '../charts.js';
import { home } from './home.js';
import { todayStr, addDays, fmtShort, fmtInt, r1 } from '../utils.js';

let range = 7;
let chart = null;

export const report = {
  mount(view, header) {
    this.view = view;
    header.innerHTML = `<h1 class="page-title">レポート</h1>`;
    header.onclick = null;
    header.onchange = null;
    view.onclick = (e) => {
      const r = e.target.closest('[data-range]');
      if (r) {
        range = +r.dataset.range;
        this.render();
      }
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
    const target = store.targetKcal();
    const days = Array.from({ length: range }, (_, i) => addDays(todayStr(), i - range + 1));
    const daily = days.map((d) => ({ date: d, ...store.dayTotals(d) }));
    const logged = daily.filter((d) => d.kcal > 0);
    const n = logged.length || 1;
    const avg = {
      kcal: logged.reduce((a, d) => a + d.kcal, 0) / n,
      protein: logged.reduce((a, d) => a + d.protein, 0) / n,
      fat: logged.reduce((a, d) => a + d.fat, 0) / n,
      carbs: logged.reduce((a, d) => a + d.carbs, 0) / n,
    };
    const within = logged.filter((d) => d.kcal <= target).length;
    const eP = avg.protein * 4;
    const eF = avg.fat * 9;
    const eC = avg.carbs * 4;
    const eSum = eP + eF + eC || 1;
    const pct = { p: (eP / eSum) * 100, f: (eF / eSum) * 100, c: (eC / eSum) * 100 };

    this.view.innerHTML = `
      <div class="stack">
        <div style="display:flex;justify-content:center">
          <div class="segmented">
            <button data-range="7" class="${range === 7 ? 'active' : ''}">1週間</button>
            <button data-range="30" class="${range === 30 ? 'active' : ''}">1ヶ月</button>
          </div>
        </div>

        <section class="card">
          <div class="stats-grid">
            <div class="stat"><div class="k">平均摂取カロリー</div><div class="v num">${logged.length ? fmtInt(avg.kcal) : '—'}<small>kcal</small></div>
              <div class="s">目標 ${fmtInt(target)} kcal</div></div>
            <div class="stat"><div class="k">目標との差（平均）</div>
              <div class="v num" style="color:${avg.kcal > target ? 'var(--danger)' : 'var(--accent)'}">${logged.length ? (avg.kcal > target ? '+' : '−') + fmtInt(Math.abs(avg.kcal - target)) : '—'}<small>kcal</small></div>
              <div class="s">${logged.length ? (avg.kcal > target ? 'やや摂りすぎ' : 'いいペースです') : ''}</div></div>
            <div class="stat"><div class="k">記録した日数</div><div class="v num">${logged.length}<small>/ ${range}日</small></div></div>
            <div class="stat"><div class="k">目標内の日数</div><div class="v num">${within}<small>日</small></div></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">日別カロリー</h2></div>
          ${
            logged.length
              ? `<div class="chart-box"><canvas id="kcal-chart" aria-label="日別カロリーグラフ"></canvas></div>
                 <div class="legend"><span style="--c:#34d399"><i></i>目標内</span><span style="--c:#fb7185"><i></i>オーバー</span><span style="--c:rgba(255,255,255,.5)"><i style="height:2px"></i>目標</span></div>`
              : `<div class="empty"><div class="big">🍱</div>この期間の食事記録がありません</div>`
          }
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">PFCバランス（平均）</h2><span class="card-sub">エネルギー比率</span></div>
          ${
            logged.length
              ? `<div class="ratio-bar">
                   <span style="--c:var(--protein);flex:${pct.p}"></span>
                   <span style="--c:var(--fat);flex:${pct.f}"></span>
                   <span style="--c:var(--carbs);flex:${pct.c}"></span>
                 </div>
                 <div class="ratio-legend">
                   ${ratioItem('たんぱく質', 'var(--protein)', pct.p, avg.protein, '13〜20%')}
                   ${ratioItem('脂質', 'var(--fat)', pct.f, avg.fat, '20〜30%')}
                   ${ratioItem('炭水化物', 'var(--carbs)', pct.c, avg.carbs, '50〜65%')}
                 </div>
                 <p class="hint" style="margin-top:12px;text-align:center">目安は厚生労働省「日本人の食事摂取基準」の目標量です。</p>`
              : `<div class="empty">データがありません</div>`
          }
        </section>
      </div>`;

    const canvas = this.view.querySelector('#kcal-chart');
    if (canvas) {
      chart = new Chart(canvas, {
        data: {
          labels: daily.map((d) => fmtShort(d.date)),
          datasets: [
            {
              type: 'bar',
              label: '摂取',
              data: daily.map((d) => Math.round(d.kcal)),
              backgroundColor: daily.map((d) => (d.kcal > target ? 'rgba(251,113,133,0.85)' : 'rgba(52,211,153,0.85)')),
              borderRadius: 8,
              borderSkipped: false,
              maxBarThickness: 28,
            },
            {
              type: 'line',
              label: '目標',
              data: daily.map(() => target),
              borderColor: 'rgba(255,255,255,0.5)',
              borderDash: [5, 5],
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (_e, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              const targetDate = daily[idx]?.date;
              if (targetDate) {
                home.setDate(targetDate);
                location.hash = '#home';
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: range > 7 ? 8 : 7, maxRotation: 0 } },
            y: { beginAtZero: true, ticks: { maxTicksLimit: 6 } },
          },
          plugins: {
            tooltip: {
              filter: (i) => i.datasetIndex === 0,
              callbacks: { label: (c) => `${fmtInt(c.raw)} kcal` },
            },
          },
        },
      });
    }
  },
};

function ratioItem(name, color, pct, grams, ideal) {
  return `<div style="--c:${color}">
    <div class="k">${name}</div>
    <div class="v num">${Math.round(pct)}<small style="font-size:11px">%</small></div>
    <div class="s num">${r1(grams)}g ・ 目安${ideal}</div></div>`;
}
