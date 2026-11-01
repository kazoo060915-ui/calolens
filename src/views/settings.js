// 設定画面：APIキー・プロフィール・目標・データ管理
import { icons } from '../icons.js';
import { store, calcAutoKcal, calcBMR, DEFAULT_MODEL } from '../store.js';
import { testConnection } from '../gemini.js';
import { clearPhotos } from '../photos.js';
import { toast, confirmSheet } from '../ui.js';
import { esc, fmtInt, num } from '../utils.js';

const MODELS = [
  ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite（推奨・高速・安定）'],
  ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
  ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
];

const ACTIVITY = [
  [1.3, 'ほとんど動かない（在宅・安静中心）'],
  [1.5, '低い（デスクワーク中心）'],
  [1.75, 'ふつう（立ち仕事・通勤や家事・軽い運動）'],
  [2.0, '高い（移動の多い仕事・活発な運動習慣）'],
];

export const settings = {
  mount(view, header) {
    this.view = view;
    header.innerHTML = `<h1 class="page-title">設定</h1>`;
    header.onclick = null;
    header.onchange = null;
    this.render();
    view.onclick = (e) => this.onClick(e);
    view.onchange = (e) => this.onChange(e);
    view.oninput = (e) => this.onInput(e);
  },

  // 入力中にフォーカスが外れないよう、全体の再描画はせずプレビューだけ更新
  update() {
    const s = store.state.settings;
    const latest = store.latestWeight();
    const el = this.view.querySelector('#kcal-preview');
    if (el) el.innerHTML = previewHtml(s, latest?.weight);
    const st = this.view.querySelector('#api-status');
    if (st) st.outerHTML = statusHtml(s.apiKey);
  },

  destroy() {
    this.view.onchange = null;
    this.view.oninput = null;
  },

  render() {
    const s = store.state.settings;
    const latest = store.latestWeight();
    const isCustomModel = !MODELS.some(([id]) => id === s.model);

    this.view.innerHTML = `
      <div class="stack">
        <section class="card settings-section">
          <div class="card-head">
            <h2 class="card-title">${icons.key} AI解析（Gemini API）</h2>
            ${statusHtml(s.apiKey)}
          </div>
          <div class="field">
            <label for="api-key">APIキー</label>
            <div class="input-group">
              <input class="input" id="api-key" type="password" autocomplete="off" spellcheck="false" value="${esc(s.apiKey)}" placeholder="AIza..." />
              <button class="icon-btn" id="toggle-key" style="position:absolute;right:6px" aria-label="表示切替">${icons.eye}</button>
            </div>
            <p class="hint">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> で無料で発行できます。
              キーはこの端末内にのみ保存され、Googleへの解析リクエスト以外には送信されません。
            </p>
          </div>
          <div class="field" style="margin-top:12px">
            <label for="model">AIモデル</label>
            <select class="input" id="model">
              ${MODELS.map(([id, l]) => `<option value="${id}" ${s.model === id ? 'selected' : ''}>${l}</option>`).join('')}
              <option value="__custom" ${isCustomModel ? 'selected' : ''}>その他（モデル名を入力）</option>
            </select>
            <input class="input" id="model-custom" placeholder="例: gemini-3.8-flash" value="${isCustomModel ? esc(s.model) : ''}" ${isCustomModel ? '' : 'hidden'} style="margin-top:8px" />
          </div>
          <button class="btn btn-ghost btn-block" id="btn-test" style="margin-top:14px">${icons.sparkles} 接続テスト</button>
        </section>

        <section class="card settings-section">
          <div class="card-head"><h2 class="card-title">${icons.user} プロフィール</h2></div>
          <div class="field">
            <span class="label">性別</span>
            <div class="segmented" style="width:100%">
              <button style="flex:1" data-sex="male" class="${s.sex === 'male' ? 'active' : ''}">男性</button>
              <button style="flex:1" data-sex="female" class="${s.sex === 'female' ? 'active' : ''}">女性</button>
            </div>
          </div>
          <div class="grid-2" style="margin-top:12px">
            <div class="field"><label for="age">年齢</label>
              <div class="input-group"><input class="input" id="age" data-setting="age" type="number" inputmode="numeric" value="${esc(s.age)}" /><span class="suffix">歳</span></div></div>
            <div class="field"><label for="height">身長</label>
              <div class="input-group"><input class="input" id="height" data-setting="height" type="number" inputmode="decimal" step="0.1" value="${esc(s.height)}" /><span class="suffix">cm</span></div></div>
          </div>
          <div class="field" style="margin-top:12px">
            <label for="activity">活動量</label>
            <select class="input" id="activity" data-setting="activity">
              ${ACTIVITY.map(([v, l]) => `<option value="${v}" ${num(s.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </section>

        <section class="card settings-section">
          <div class="card-head"><h2 class="card-title">${icons.target} 目標</h2></div>
          <div class="field">
            <label for="target-weight">目標体重</label>
            <div class="input-group"><input class="input" id="target-weight" data-setting="targetWeight" type="number" inputmode="decimal" step="0.1" value="${esc(s.targetWeight ?? '')}" placeholder="${latest ? latest.weight : '例: 60'}" /><span class="suffix">kg</span></div>
          </div>
          <div class="row-between" style="margin-top:16px">
            <div><div style="font-weight:700;font-size:14px">目標カロリーを自動計算</div>
              <div class="hint">体重・身長・年齢・活動量・目標から算出</div></div>
            <label class="switch"><input type="checkbox" id="auto-kcal" ${s.autoKcal ? 'checked' : ''} /><span></span></label>
          </div>
          <div class="field" id="manual-kcal" style="margin-top:12px" ${s.autoKcal ? 'hidden' : ''}>
            <label for="target-kcal">1日の目標カロリー</label>
            <div class="input-group"><input class="input" id="target-kcal" data-setting="targetKcal" type="number" inputmode="numeric" step="10" value="${esc(s.targetKcal)}" /><span class="suffix">kcal</span></div>
          </div>
          <div id="kcal-preview" style="margin-top:12px">${previewHtml(s, latest?.weight)}</div>
        </section>

        <section class="card settings-section">
          <div class="card-head"><h2 class="card-title">${icons.database} データ管理</h2></div>
          <p class="hint" style="margin-top:0">データはこの端末のブラウザ内に保存されています。機種変更やブラウザのデータ削除に備えて、定期的にバックアップしてください（写真は含まれません）。</p>
          <div class="grid-2" style="margin-top:10px">
            <button class="btn btn-ghost" id="btn-export">バックアップ</button>
            <label class="btn btn-ghost" for="import-file">復元<input type="file" id="import-file" accept="application/json,.json" class="sr-only" /></label>
          </div>
          <button class="btn btn-danger btn-block" id="btn-reset" style="margin-top:10px">${icons.trash} すべてのデータを削除</button>
        </section>

        <p class="hint" style="text-align:center;padding:8px 0 4px">CaloLens v1.0 ・ AIによる推定値は目安です。<br />持病のある方は医師・管理栄養士にご相談ください。</p>
      </div>`;
  },

  async onClick(e) {
    const sexBtn = e.target.closest('[data-sex]');
    if (sexBtn) {
      this.view.querySelectorAll('[data-sex]').forEach((b) => b.classList.toggle('active', b === sexBtn));
      store.updateSettings({ sex: sexBtn.dataset.sex });
      return;
    }
    const id = e.target.closest('button,label')?.id;
    if (id === 'toggle-key') {
      const k = this.view.querySelector('#api-key');
      k.type = k.type === 'password' ? 'text' : 'password';
    }
    if (id === 'btn-test') {
      const btn = this.view.querySelector('#btn-test');
      const keyInput = this.view.querySelector('#api-key');
      if (keyInput) store.updateSettings({ apiKey: keyInput.value.trim() });
      const { apiKey, model } = store.state.settings;
      if (!apiKey) return toast('APIキーを入力してください', 'error');
      btn.disabled = true;
      btn.innerHTML = `${icons.sparkles} 接続中…`;
      try {
        await testConnection({ apiKey, model });
        toast(`接続成功！${model} が使えます`);
      } catch (err) {
        toast(`接続失敗：${err.message}`, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icons.sparkles} 接続テスト`;
      }
    }
    if (id === 'btn-export') {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `calolens-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('バックアップファイルを保存しました');
    }
    if (id === 'btn-reset') {
      const ok = await confirmSheet({
        title: 'すべてのデータを削除',
        message: '食事・体重・設定・写真をすべて削除します。この操作は元に戻せません。',
        okLabel: '削除する',
        danger: true,
      });
      if (!ok) return;
      store.reset();
      await clearPhotos().catch(() => {});
      this.render();
      toast('すべてのデータを削除しました');
    }
  },

  onInput(e) {
    const t = e.target;
    if (t.id === 'api-key') {
      store.updateSettings({ apiKey: t.value.trim() });
    }
    if (t.id === 'model-custom' && t.value.trim()) {
      store.updateSettings({ model: t.value.trim() });
    }
  },

  async onChange(e) {
    const t = e.target;
    if (t.id === 'api-key') store.updateSettings({ apiKey: t.value.trim() });
    if (t.id === 'model') {
      const custom = this.view.querySelector('#model-custom');
      if (t.value === '__custom') {
        custom.hidden = false;
        custom.focus();
      } else {
        custom.hidden = true;
        store.updateSettings({ model: t.value });
      }
    }
    if (t.id === 'model-custom' && t.value.trim()) store.updateSettings({ model: t.value.trim() });
    if (t.id === 'auto-kcal') {
      this.view.querySelector('#manual-kcal').hidden = t.checked;
      const patch = { autoKcal: t.checked };
      if (!t.checked) patch.targetKcal = store.targetKcal();
      store.updateSettings(patch);
      this.view.querySelector('#target-kcal').value = store.state.settings.targetKcal;
    }
    if (t.dataset.setting) {
      const v = t.value === '' ? null : num(t.value);
      store.updateSettings({ [t.dataset.setting]: v });
    }
    if (t.id === 'import-file' && t.files?.[0]) {
      const file = t.files[0];
      t.value = '';
      const ok = await confirmSheet({
        title: 'バックアップから復元',
        message: '現在の食事・体重データをバックアップファイルの内容で上書きしますか？',
        okLabel: '復元する',
      });
      if (!ok) return;
      try {
        store.importJSON(await file.text());
        await clearPhotos().catch(() => {});
        this.render();
        toast('データを復元しました');
      } catch (err) {
        toast(err.message || '復元に失敗しました', 'error');
      }
    }
  },
};

function statusHtml(apiKey) {
  return `<span id="api-status" class="status-dot ${apiKey ? 'ok' : 'ng'}">${apiKey ? '設定済み' : '未設定'}</span>`;
}

function previewHtml(s, weight) {
  const kcal = store.targetKcal();
  const bmr = calcBMR(s, weight);
  const auto = calcAutoKcal(s, weight);
  const mode = s.autoKcal
    ? `基礎代謝 ${fmtInt(bmr)} kcal × 活動量 ${esc(s.activity)}${num(s.targetWeight) && weight ? (num(s.targetWeight) < weight ? ' − 減量分 400' : num(s.targetWeight) > weight ? ' + 増量分 300' : '') : ''}`
    : `自動計算の場合：${fmtInt(auto)} kcal`;
  return `<div class="kcal-preview"><span class="card-sub">1日の目標</span><span class="v num">${fmtInt(kcal)}</span><span class="card-sub">kcal</span></div>
    <p class="hint" style="margin-top:6px">${mode}${!weight ? '（体重未記録のため標準体重で仮計算）' : ''}</p>`;
}
