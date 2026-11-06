// 食事の追加メニュー & 編集シート（写真AI解析・テキストAI推定・手動入力）
import { icons } from './icons.js';
import { openSheet, toast, confirmSheet } from './ui.js';
import { store } from './store.js';
import { analyzeMeal } from './gemini.js';
import { loadImage, resizeImage, putPhoto, deletePhoto, hydratePhotos } from './photos.js';
import { MEAL_TYPES, KYOJATORE_PRESETS, esc, uid, sumItems, fmtInt, r1, guessMealType, todayStr, fmtDateJP } from './utils.js';

const emptyItem = () => ({ name: '', amount: '', kcal: '', protein: '', fat: '', carbs: '', qty: 1 });
const QTY_STEPS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ensureBase(it) {
  const q = Number(it.qty) > 0 ? Number(it.qty) : 1;
  if (!it._base) {
    it._base = {
      kcal: (Number(it.kcal) || 0) / q,
      protein: (Number(it.protein) || 0) / q,
      fat: (Number(it.fat) || 0) / q,
      carbs: (Number(it.carbs) || 0) / q,
      amount: String(it.amount || '').replace(/\s*[×xX]\s*[\d.]+$/, ''),
    };
  }
}

function formatScaledAmount(baseAmount, qty) {
  const clean = String(baseAmount || '').trim();
  if (!clean) return qty === 1 ? '' : `×${qty}`;
  if (qty === 1) return clean;
  if (/^1(本|個|杯|枚|袋|切れ|皿|人前|パック|缶)$/.test(clean)) {
    return clean.replace(/^1/, String(qty));
  }
  return `${clean} ×${qty}`;
}

function applyQty(it, nextQty) {
  ensureBase(it);
  it.qty = nextQty;
  it.kcal = Math.round(it._base.kcal * nextQty);
  it.protein = r1(it._base.protein * nextQty);
  it.fat = r1(it._base.fat * nextQty);
  it.carbs = r1(it._base.carbs * nextQty);
  it.amount = formatScaledAmount(it._base.amount, nextQty);
}

/** 追加方法を選ぶメニュー */
export function openAddMenu({ date = todayStr(), mealType = guessMealType() } = {}) {
  const hasApiKey = !!store.state.settings.apiKey;
  const mtObj = MEAL_TYPES.find((m) => m.id === mealType) || MEAL_TYPES[0];

  const sheet = openSheet('');
  const el = sheet.el;

  const render = () => {
    const favorites = store.favorites();
    const recent = store.recentMeals(6);

    el.innerHTML = `
      <h2 class="sheet-title">
        <span>食事を記録 <span class="card-sub" style="font-weight:500">${mtObj.emoji} ${mtObj.label} ・ ${fmtDateJP(date)}</span></span>
        <button class="icon-btn" data-act="close" aria-label="閉じる">${icons.x}</button>
      </h2>
      ${
        !hasApiKey
          ? `<div class="banner" style="margin-bottom:12px">${icons.alert}<div>AI自動解析を使うには、<a href="#settings" id="link-settings">設定画面</a>でGemini APIキーを登録してください。</div></div>`
          : ''
      }

      ${
        favorites.length
          ? `<div class="favorite-section" style="margin-bottom:16px">
               <div class="card-head" style="margin-bottom:8px">
                 <div class="card-sub" style="font-weight:700;color:var(--warn);display:flex;align-items:center;gap:5px">
                   <span style="display:inline-flex;color:var(--warn)">${icons.starFilled}</span> よく使うメニュー（1タップ記録）
                 </div>
               </div>
               <div class="preset-scroll fav-scroll">
                 ${favorites
                   .map(
                     (f) => `
                   <div class="fav-chip-pill">
                     <button type="button" class="preset-chip fav-chip" data-fav-add="${esc(f.id)}">
                       <span class="p-emoji">⭐</span>
                       <span class="p-body">
                         <span class="p-name">${esc(f.name)}</span>
                         <span class="p-kcal num">+${fmtInt(f.kcal)} kcal</span>
                       </span>
                     </button>
                     <button type="button" class="fav-chip-del" data-fav-del="${esc(f.id)}" aria-label="よく使うメニューから削除">${icons.x}</button>
                   </div>`
                   )
                   .join('')}
               </div>
             </div>`
          : ''
      }

      <div class="recent-meals" style="margin-bottom:14px">
        <div class="card-sub" style="font-weight:700;margin-bottom:8px">⚡ キョジャトレ胃に優しい定番（1タップ追加）</div>
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
      </div>

      <div class="add-grid">
        <label class="add-option primary" id="opt-camera">
          ${icons.camera}
          <span>写真を撮る</span>
          <small>AIが自動でカロリー計算</small>
          <input type="file" accept="image/*" capture="environment" class="sr-only" id="file-camera" />
        </label>
        <label class="add-option" id="opt-album">
          ${icons.image}
          <span>アルバム</span>
          <small>撮影済みの写真から</small>
          <input type="file" accept="image/*" class="sr-only" id="file-album" />
        </label>
      </div>
      <label class="btn btn-ghost btn-block" id="opt-label" style="margin-top:10px;cursor:pointer">
        ${icons.sparkles} <span>市販品の成分表・バーコード読取</span>
        <input type="file" accept="image/*" capture="environment" class="sr-only" id="file-label" />
      </label>
      <div class="divider"><span>または</span></div>
      <div class="text-ai">
        <textarea class="input" id="ai-text" rows="2" placeholder="例：牛丼 並盛とみそ汁、サラダ"></textarea>
        <button class="btn btn-ghost btn-block" id="btn-text-ai">${icons.sparkles} 文章からAIでカロリー推定</button>
      </div>

      ${
        recent.length
          ? `<div class="recent-meals" style="margin-top:16px">
               <div class="card-head" style="margin-bottom:8px">
                 <div class="card-sub" style="font-weight:700">最近の食事（タップで再記録 / ★でよく使うメニュー登録）</div>
               </div>
               <div class="recent-list">
                 ${recent
                   .map((m, idx) => {
                     const isFav = store.isFavorite(m.name, m.kcal);
                     return `
                     <div class="recent-item-row">
                       <button class="meal-row recent-meal-btn" data-recent="${idx}">
                         <div class="info">
                           <div class="name">${esc(m.name)}</div>
                           <div class="macros num">
                             <span style="color:var(--protein)">P ${r1(m.protein)}</span>
                             <span style="color:var(--fat)">F ${r1(m.fat)}</span>
                             <span style="color:var(--carbs)">C ${r1(m.carbs)}</span>
                           </div>
                         </div>
                         <div class="kcal num">${fmtInt(m.kcal)}<small> kcal</small></div>
                       </button>
                       <button type="button" class="btn-fav-toggle ${isFav ? 'active' : ''}" data-recent-fav="${idx}" aria-label="${isFav ? 'よく使うメニューから解除' : 'よく使うメニューに登録'}" title="${isFav ? '登録済み（タップで解除）' : 'よく使うメニューに登録'}">
                         ${isFav ? icons.starFilled : icons.star}
                       </button>
                     </div>`;
                   })
                   .join('')}
               </div>
             </div>`
          : ''
      }
      <button class="btn btn-link btn-block" id="btn-manual" style="margin-top:8px">${icons.edit} 手動で入力する</button>
    `;

    // バインド
    el.querySelector('[data-act="close"]')?.addEventListener('click', () => sheet.close());
    el.querySelector('#link-settings')?.addEventListener('click', () => sheet.close());

    const onFile = (mode = 'meal') => (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      sheet.close();
      openEditor({ date, mealType, file, mode });
    };
    el.querySelector('#file-camera')?.addEventListener('change', onFile('meal'));
    el.querySelector('#file-album')?.addEventListener('change', onFile('meal'));
    el.querySelector('#file-label')?.addEventListener('change', onFile('label'));
    el.querySelector('#btn-text-ai')?.addEventListener('click', () => {
      const text = el.querySelector('#ai-text')?.value.trim();
      if (!text) {
        toast('食べたものを入力してください', 'error');
        return;
      }
      sheet.close();
      openEditor({ date, mealType, text });
    });
    el.querySelector('#btn-manual')?.addEventListener('click', () => {
      sheet.close();
      openEditor({ date, mealType });
    });
  };

  el.addEventListener('click', (e) => {
    // よく使うメニューからワンタップ追加
    const favAdd = e.target.closest('[data-fav-add]');
    if (favAdd) {
      const favId = favAdd.dataset.favAdd;
      const fav = store.state.favorites.find((f) => f.id === favId);
      if (!fav) return;
      const saved = store.saveMeal({
        date,
        mealType: fav.mealType || mealType,
        name: fav.name,
        items: structuredClone(fav.items),
        comment: fav.comment || '',
        hasPhoto: false,
      });
      sheet.close();
      toast(`⭐「${saved.name}」を記録しました（+${fmtInt(saved.kcal)} kcal）`);
      return;
    }

    // よく使うメニューから削除
    const favDel = e.target.closest('[data-fav-del]');
    if (favDel) {
      const favId = favDel.dataset.favDel;
      store.removeFavorite(favId);
      toast('よく使うメニューから削除しました');
      render();
      return;
    }

    // キョジャトレ定番から追加
    const presetBtn = e.target.closest('[data-preset]');
    if (presetBtn) {
      const preset = KYOJATORE_PRESETS.find((p) => p.id === presetBtn.dataset.preset);
      if (!preset) return;
      const saved = store.saveMeal({
        date,
        mealType,
        name: preset.name,
        items: structuredClone(preset.items),
        comment: preset.comment,
        hasPhoto: false,
      });
      sheet.close();
      toast(`${preset.emoji}「${saved.name}」を記録しました（+${fmtInt(saved.kcal)} kcal）`);
      return;
    }

    // 最近の食事の「★」トグル
    const favToggleBtn = e.target.closest('[data-recent-fav]');
    if (favToggleBtn) {
      const recent = store.recentMeals(6);
      const src = recent[+favToggleBtn.dataset.recentFav];
      if (!src) return;
      const added = store.toggleFavorite(src);
      toast(added ? `⭐「${src.name}」をよく使うメニューに登録しました` : `「${src.name}」を登録解除しました`);
      render();
      return;
    }

    // 最近の食事からワンタップ記録
    const recBtn = e.target.closest('[data-recent]');
    if (recBtn) {
      const recent = store.recentMeals(6);
      const src = recent[+recBtn.dataset.recent];
      if (!src) return;
      const saved = store.saveMeal({
        date,
        mealType,
        name: src.name,
        items: structuredClone(src.items),
        comment: src.comment || '',
        hasPhoto: false,
      });
      sheet.close();
      toast(`「${saved.name}」を記録しました（+${fmtInt(saved.kcal)} kcal）`);
      return;
    }
  });

  render();
}

/**
 * 食事編集シート
 * @param {{date?:string, mealType?:string, file?:File, text?:string, meal?:object, mode?:'meal'|'label'}} opts
 */
export function openEditor({ date, mealType, file, text, meal, mode = 'meal' } = {}) {
  const isEdit = !!meal;
  const draft = meal
    ? structuredClone(meal)
    : { id: null, date: date || todayStr(), mealType: mealType || guessMealType(), name: '', items: [], comment: '', hasPhoto: false };
  if (!draft.items.length && !file && !text) draft.items.push(emptyItem());

  const ctx = {
    status: file || text ? 'analyzing' : 'ready',
    error: '',
    thumb: null, // 新しく撮った写真のサムネイル
    apiImage: null, // AI送信用画像
    text: text || '',
    mode,
  };

  let abortCtrl = null;
  let dirty = !!(file || text);
  let isDisposed = false;
  let isFav = store.isFavorite(draft.name, sumItems(draft.items).kcal);

  const sheet = openSheet('', {
    beforeClose: async () => {
      if (ctx.status === 'analyzing' || dirty) {
        return await confirmSheet({
          title: '編集を終了しますか？',
          message: 'まだ記録されていません。入力中の内容は破棄されます。',
          okLabel: '破棄して閉じる',
          danger: true,
        });
      }
      return true;
    },
    onClose: () => {
      isDisposed = true;
      abortCtrl?.abort();
    },
  });
  const el = sheet.el;

  /* ---------- 描画 ---------- */
  const photoHtml = () => {
    const src = ctx.thumb;
    const stored = !src && draft.hasPhoto && draft.id;
    if (!src && !stored) return '';
    const totals = sumItems(draft.items);
    return `
      <div class="photo-hero ${ctx.status === 'analyzing' ? 'analyzing' : ''}">
        ${src ? `<img src="${src}" alt="食事の写真" />` : `<img data-photo="${esc(draft.id)}" alt="食事の写真" />`}
        ${
          ctx.status === 'analyzing'
            ? `<div class="scan-line"></div><div class="scan-corners"></div>
               <div class="analyzing-label">${icons.sparkles} ${ctx.mode === 'label' ? '成分表・バーコードを解析中…' : 'AIが料理を解析中…'}</div>`
            : ctx.status === 'ready' && draft.items.length
              ? `<div class="photo-total"><div class="v num" id="photo-kcal">${fmtInt(totals.kcal)}<small> kcal</small></div></div>`
              : ''
        }
      </div>`;
  };

  const itemHtml = (it, i) => {
    const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
    return `
    <div class="item-card" style="animation-delay:${i * 60}ms">
      <div class="row1">
        <input class="input" data-idx="${i}" data-key="name" value="${esc(it.name)}" placeholder="料理・商品名" />
        <button class="icon-btn" data-remove="${i}" aria-label="削除">${icons.trash}</button>
      </div>
      <div class="row-qty">
        <input class="input" data-idx="${i}" data-key="amount" value="${esc(it.amount)}" placeholder="量（例: 1杯、1本）" />
        <div class="qty-stepper" aria-label="数量調整">
          <button type="button" class="qty-btn" data-qty-idx="${i}" data-qty-dir="-1" aria-label="減らす">−</button>
          <span class="qty-val num">×${qty}</span>
          <button type="button" class="qty-btn" data-qty-idx="${i}" data-qty-dir="1" aria-label="増やす">＋</button>
        </div>
      </div>
      <div class="row2">
        <div class="mini-field" style="--c:var(--accent)"><span class="tag">kcal</span>
          <input class="input" inputmode="decimal" data-idx="${i}" data-key="kcal" value="${esc(it.kcal)}" placeholder="0" /></div>
        <div class="mini-field" style="--c:var(--protein)"><span class="tag">P g</span>
          <input class="input" inputmode="decimal" data-idx="${i}" data-key="protein" value="${esc(it.protein)}" placeholder="0" /></div>
        <div class="mini-field" style="--c:var(--fat)"><span class="tag">F g</span>
          <input class="input" inputmode="decimal" data-idx="${i}" data-key="fat" value="${esc(it.fat)}" placeholder="0" /></div>
        <div class="mini-field" style="--c:var(--carbs)"><span class="tag">C g</span>
          <input class="input" inputmode="decimal" data-idx="${i}" data-key="carbs" value="${esc(it.carbs)}" placeholder="0" /></div>
      </div>
    </div>`;
  };

  const totalsHtml = () => {
    const t = sumItems(draft.items);
    return `
      <div class="k">エネルギー</div><div class="k" style="--c:var(--protein)">P</div><div class="k" style="--c:var(--fat)">F</div><div class="k" style="--c:var(--carbs)">C</div>
      <div class="v main num">${fmtInt(t.kcal)}<small style="font-size:11px"> kcal</small></div>
      <div class="v num">${r1(t.protein)}<small style="font-size:10px;color:var(--text-3)">g</small></div>
      <div class="v num">${r1(t.fat)}<small style="font-size:10px;color:var(--text-3)">g</small></div>
      <div class="v num">${r1(t.carbs)}<small style="font-size:10px;color:var(--text-3)">g</small></div>`;
  };

  const bodyHtml = () => {
    if (ctx.status === 'analyzing') {
      return `
        ${ctx.thumb ? '' : `<div class="ai-comment">${icons.sparkles}<div>「${esc(ctx.text)}」をAIが解析しています…</div></div>`}
        <div class="items" style="margin-top:12px">
          <div class="skeleton"></div><div class="skeleton" style="opacity:.7"></div><div class="skeleton" style="opacity:.4"></div>
        </div>`;
    }
    return `
      ${
        ctx.status === 'error'
          ? `<div class="error-box">${esc(ctx.error)}
               <div class="actions">
                 ${ctx.apiImage || ctx.text ? `<button class="btn btn-sm btn-ghost" data-act="retry">再解析する</button>` : ''}
                 <a class="btn btn-sm btn-ghost" href="#settings" data-act="go-settings">設定を開く</a>
               </div></div>`
          : ''
      }
      ${draft.comment ? `<div class="ai-comment" style="margin-top:12px">${icons.sparkles}<div>${esc(draft.comment)}</div></div>` : ''}

      <div class="field" style="margin-top:16px">
        <span class="label">食事区分</span>
        <div class="chips">
          ${MEAL_TYPES.map((m) => `<button class="chip ${draft.mealType === m.id ? 'active' : ''}" data-type="${m.id}">${m.emoji} ${m.label}</button>`).join('')}
        </div>
      </div>

      <div class="grid-2" style="margin-top:14px">
        <div class="field"><label for="meal-name">メニュー名</label>
          <input class="input" id="meal-name" data-draft="name" value="${esc(draft.name)}" placeholder="例：焼き魚定食" /></div>
        <div class="field"><label for="meal-date">日付</label>
          <input class="input" id="meal-date" type="date" data-draft="date" value="${esc(draft.date)}" /></div>
      </div>

      <div class="card-head" style="margin:20px 0 10px">
        <h3 class="card-title">品目 <span class="card-sub">${draft.items.length}件</span></h3>
        ${
          ctx.apiImage && ctx.status !== 'error'
            ? `<button class="btn btn-sm btn-ghost" data-act="toggle-hint">${icons.sparkles} 補足して再解析</button>`
            : ''
        }
      </div>
      <div class="text-ai" id="hint-box" hidden style="margin-bottom:12px">
        <input class="input" id="hint-text" placeholder="例：ご飯は半分だけ食べた／ドレッシングなし" />
        <button class="btn btn-sm btn-ghost" data-act="retry-hint">この内容で再解析</button>
      </div>
      <div class="items" id="items">${draft.items.map(itemHtml).join('')}</div>
      <button class="add-row" data-act="add-item">${icons.plus} 品目を追加</button>

      <div class="totals-bar" id="totals" style="margin-top:16px">${totalsHtml()}</div>
      <p class="hint" style="margin-top:8px">※ AIの推定値は目安です。量や内容が違う場合は修正してください。</p>`;
  };

  const render = () => {
    isFav = store.isFavorite(draft.name, sumItems(draft.items).kcal);
    el.innerHTML = `
      <h2 class="sheet-title">
        <span>${isEdit ? '食事を編集' : '食事を記録'}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <button type="button" class="btn btn-sm btn-fav-star-action ${isFav ? 'active' : ''}" data-act="toggle-fav" aria-label="${isFav ? 'よく使うメニューから解除' : 'よく使うメニューに登録'}">
            ${isFav ? icons.starFilled : icons.star} <span>${isFav ? '登録済' : 'よく使うメニュー'}</span>
          </button>
          <button class="icon-btn" data-act="close" aria-label="閉じる">${icons.x}</button>
        </div>
      </h2>
      ${photoHtml()}
      ${bodyHtml()}
      <div class="sheet-actions">
        ${isEdit ? `<button class="btn btn-danger" data-act="delete" aria-label="削除">${icons.trash}</button>` : ''}
        <button class="btn btn-primary" data-act="save" id="btn-save-meal" ${ctx.status === 'analyzing' ? 'disabled' : ''}>
          ${icons.check} ${isEdit ? '更新する' : '記録する'}
        </button>
      </div>`;
    hydratePhotos(el);
  };

  const updateTotals = () => {
    const t = el.querySelector('#totals');
    if (t) t.innerHTML = totalsHtml();
    const pk = el.querySelector('#photo-kcal');
    if (pk) pk.innerHTML = `${fmtInt(sumItems(draft.items).kcal)}<small> kcal</small>`;
  };

  /* ---------- AI解析 ---------- */
  const analyze = async (extraHint = '') => {
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    ctx.status = 'analyzing';
    ctx.error = '';
    render();
    try {
      const { apiKey, model } = store.state.settings;
      const hint = [ctx.apiImage ? '' : ctx.text, extraHint].filter(Boolean).join('\n');
      const result = await analyzeMeal(
        { imageDataUrl: ctx.apiImage, text: ctx.apiImage ? extraHint : hint, mode: ctx.mode },
        { apiKey, model, signal: abortCtrl.signal }
      );
      if (isDisposed) return;
      if (!result.isFood || !result.items.length) {
        throw new Error('食べ物を認識できませんでした。別の角度から撮影するか、手動で入力してください。');
      }
      draft.items = result.items.map((i) => ({ ...i, qty: 1 }));
      if (!draft.name || !isEdit) draft.name = result.mealName;
      draft.comment = result.comment;
      ctx.status = 'ready';
      dirty = true;
      render();
      toast(`AI解析完了：${fmtInt(sumItems(draft.items).kcal)} kcal`);
    } catch (err) {
      if (isDisposed || abortCtrl.signal.aborted) return;
      ctx.status = 'error';
      ctx.error = err.message;
      if (!draft.items.length) draft.items.push(emptyItem());
      render();
    }
  };

  /* ---------- イベント ---------- */
  el.addEventListener('input', (e) => {
    const t = e.target;
    dirty = true;
    if (t.dataset.idx !== undefined) {
      const it = draft.items[+t.dataset.idx];
      const key = t.dataset.key;
      it[key] = t.value;
      const q = Number(it.qty) > 0 ? Number(it.qty) : 1;
      ensureBase(it);
      if (['kcal', 'protein', 'fat', 'carbs'].includes(key)) {
        it._base[key] = (Number(t.value) || 0) / q;
        updateTotals();
      } else if (key === 'amount') {
        it._base.amount = String(t.value || '').replace(/\s*[×xX]\s*[\d.]+$/, '');
      }
    } else if (t.dataset.draft) {
      draft[t.dataset.draft] = t.value;
    }
  });

  el.addEventListener('click', async (e) => {
    const qtyBtn = e.target.closest('[data-qty-idx]');
    if (qtyBtn) {
      const idx = +qtyBtn.dataset.qtyIdx;
      const dir = +qtyBtn.dataset.qtyDir;
      const it = draft.items[idx];
      if (!it) return;
      const curQty = Number(it.qty) > 0 ? Number(it.qty) : 1;
      let stepIdx = QTY_STEPS.findIndex((s) => s >= curQty);
      if (stepIdx === -1) stepIdx = QTY_STEPS.length - 1;
      const nextIdx = Math.max(0, Math.min(QTY_STEPS.length - 1, stepIdx + dir));
      const nextQty = QTY_STEPS[nextIdx];
      if (nextQty === curQty) return;
      dirty = true;
      applyQty(it, nextQty);
      el.querySelector('#items').innerHTML = draft.items.map(itemHtml).join('');
      updateTotals();
      return;
    }
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) {
      draft.mealType = typeBtn.dataset.type;
      el.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b === typeBtn));
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      draft.items.splice(+rm.dataset.remove, 1);
      el.querySelector('#items').innerHTML = draft.items.map(itemHtml).join('');
      updateTotals();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;

    if (act === 'close') sheet.close(false);
    if (act === 'go-settings') sheet.close(true);
    if (act === 'add-item') {
      draft.items.push(emptyItem());
      el.querySelector('#items').innerHTML = draft.items.map(itemHtml).join('');
      const inputs = el.querySelectorAll('#items input[data-key="name"]');
      inputs[inputs.length - 1]?.focus();
    }
    if (act === 'retry') analyze();
    if (act === 'toggle-hint') {
      const box = el.querySelector('#hint-box');
      box.hidden = !box.hidden;
      if (!box.hidden) el.querySelector('#hint-text').focus();
    }
    if (act === 'retry-hint') analyze(el.querySelector('#hint-text').value.trim());

    if (act === 'toggle-fav') {
      const items = draft.items.filter((i) => i.name?.trim() || Number(i.kcal) > 0);
      if (!items.length && !draft.name?.trim()) {
        toast('メニュー名または品目を入力してください', 'error');
        return;
      }
      const mealToFav = {
        ...draft,
        items,
        name: draft.name?.trim() || items.map((i) => i.name).filter(Boolean).join('、') || 'よく使うメニュー',
      };
      const added = store.toggleFavorite(mealToFav);
      toast(added ? `⭐「${mealToFav.name}」をよく使うメニューに登録しました` : `「${mealToFav.name}」を登録解除しました`);
      render();
      return;
    }

    if (act === 'save') {
      const items = draft.items.filter((i) => i.name?.trim() || Number(i.kcal) > 0);
      if (!items.length) {
        toast('品目を1つ以上入力してください', 'error');
        return;
      }
      try {
        draft.id ||= uid();
        if (ctx.thumb) {
          await putPhoto(draft.id, ctx.thumb);
          draft.hasPhoto = true;
        }
        const saved = store.saveMeal({ ...draft, items });
        if (isFav) {
          store.addFavorite({ ...draft, items, name: saved.name });
        }
        sheet.close();
        toast(`${isEdit ? '更新' : '記録'}しました（${fmtInt(saved.kcal)} kcal）`);
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    if (act === 'delete') {
      const ok = await confirmSheet({ title: 'この食事を削除しますか？', message: `「${draft.name}」の記録を削除します。`, okLabel: '削除する', danger: true });
      if (!ok) return;
      store.deleteMeal(draft.id);
      if (draft.hasPhoto) deletePhoto(draft.id).catch(() => {});
      sheet.close();
      toast('削除しました');
    }
  });

  /* ---------- 初期化 ---------- */
  render();
  if (file) {
    (async () => {
      try {
        const img = await loadImage(file);
        ctx.thumb = resizeImage(img, 480, 0.75);
        ctx.apiImage = resizeImage(img, 1024, 0.85);
        analyze();
      } catch {
        ctx.status = 'error';
        ctx.error = '画像を読み込めませんでした。別の写真をお試しください。';
        draft.items.push(emptyItem());
        render();
      }
    })();
  } else if (text) {
    analyze();
  }
}
