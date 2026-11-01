// 食事の追加メニュー & 編集シート（写真AI解析・テキストAI推定・手動入力）
import { icons } from './icons.js';
import { openSheet, toast, confirmSheet } from './ui.js';
import { store } from './store.js';
import { analyzeMeal } from './gemini.js';
import { loadImage, resizeImage, putPhoto, deletePhoto, hydratePhotos } from './photos.js';
import { MEAL_TYPES, esc, uid, sumItems, fmtInt, r1, guessMealType, todayStr } from './utils.js';

const emptyItem = () => ({ name: '', amount: '', kcal: '', protein: '', fat: '', carbs: '' });

/** 追加方法を選ぶメニュー */
export function openAddMenu({ date = todayStr(), mealType = guessMealType() } = {}) {
  const sheet = openSheet(`
    <h2 class="sheet-title">食事を記録</h2>
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
    <div class="divider"><span>または</span></div>
    <div class="text-ai">
      <textarea class="input" id="ai-text" rows="2" placeholder="例：牛丼 並盛とみそ汁、サラダ"></textarea>
      <button class="btn btn-ghost btn-block" id="btn-text-ai">${icons.sparkles} 文章からAIでカロリー推定</button>
    </div>
    <button class="btn btn-link btn-block" id="btn-manual" style="margin-top:8px">${icons.edit} 手動で入力する</button>
  `);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sheet.close();
    openEditor({ date, mealType, file });
  };
  sheet.el.querySelector('#file-camera').addEventListener('change', onFile);
  sheet.el.querySelector('#file-album').addEventListener('change', onFile);
  sheet.el.querySelector('#btn-text-ai').addEventListener('click', () => {
    const text = sheet.el.querySelector('#ai-text').value.trim();
    if (!text) {
      toast('食べたものを入力してください', 'error');
      return;
    }
    sheet.close();
    openEditor({ date, mealType, text });
  });
  sheet.el.querySelector('#btn-manual').addEventListener('click', () => {
    sheet.close();
    openEditor({ date, mealType });
  });
}

/**
 * 食事編集シート
 * @param {{date?:string, mealType?:string, file?:File, text?:string, meal?:object}} opts
 */
export function openEditor({ date, mealType, file, text, meal } = {}) {
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
  };

  const sheet = openSheet('');
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
               <div class="analyzing-label">${icons.sparkles} AIが料理を解析中…</div>`
            : ctx.status === 'ready' && draft.items.length
              ? `<div class="photo-total"><div class="v num" id="photo-kcal">${fmtInt(totals.kcal)}<small> kcal</small></div></div>`
              : ''
        }
      </div>`;
  };

  const itemHtml = (it, i) => `
    <div class="item-card" style="animation-delay:${i * 60}ms">
      <div class="row1">
        <input class="input" data-idx="${i}" data-key="name" value="${esc(it.name)}" placeholder="料理名" />
        <input class="input" data-idx="${i}" data-key="amount" value="${esc(it.amount)}" placeholder="量" />
        <button class="icon-btn" data-remove="${i}" aria-label="削除">${icons.trash}</button>
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
    el.innerHTML = `
      <h2 class="sheet-title">${isEdit ? '食事を編集' : '食事を記録'}
        <button class="icon-btn" data-act="close" aria-label="閉じる">${icons.x}</button></h2>
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
    ctx.status = 'analyzing';
    ctx.error = '';
    render();
    try {
      const { apiKey, model } = store.state.settings;
      const hint = [ctx.apiImage ? '' : ctx.text, extraHint].filter(Boolean).join('\n');
      const result = await analyzeMeal({ imageDataUrl: ctx.apiImage, text: ctx.apiImage ? extraHint : hint }, { apiKey, model });
      if (!result.isFood || !result.items.length) {
        throw new Error('食べ物を認識できませんでした。別の角度から撮影するか、手動で入力してください。');
      }
      draft.items = result.items;
      if (!draft.name || !isEdit) draft.name = result.mealName;
      draft.comment = result.comment;
      ctx.status = 'ready';
      render();
      toast(`AI解析完了：${fmtInt(sumItems(draft.items).kcal)} kcal`);
    } catch (err) {
      ctx.status = 'error';
      ctx.error = err.message;
      if (!draft.items.length) draft.items.push(emptyItem());
      render();
    }
  };

  /* ---------- イベント ---------- */
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.idx !== undefined) {
      draft.items[+t.dataset.idx][t.dataset.key] = t.value;
      if (['kcal', 'protein', 'fat', 'carbs'].includes(t.dataset.key)) updateTotals();
    } else if (t.dataset.draft) {
      draft[t.dataset.draft] = t.value;
    }
  });

  el.addEventListener('click', async (e) => {
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

    if (act === 'close') sheet.close();
    if (act === 'go-settings') sheet.close();
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
