// ボトムシート・トースト・確認ダイアログ
import { icons } from './icons.js';
import { esc } from './utils.js';

let openCount = 0;

/**
 * ボトムシートを開く
 * @param {string} html
 * @param {{onClose?: () => void, beforeClose?: () => boolean | Promise<boolean>}} [opts]
 * @returns {{el: HTMLElement, close: (force?: boolean) => Promise<void>}}
 */
export function openSheet(html = '', { onClose, beforeClose } = {}) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="sheet-body">${html}</div></div>`;
  root.appendChild(wrap);
  openCount++;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));

  let closed = false;
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && root.lastElementChild === wrap) {
      close(false);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const close = async (force = true) => {
    if (closed) return;
    if (!force && beforeClose) {
      const ok = await beforeClose();
      if (!ok || closed) return;
    }
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    wrap.classList.remove('open');
    openCount--;
    if (openCount <= 0) document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 350);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close(false);
  });
  return { el: wrap.querySelector('.sheet-body'), close };
}

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'error' ? icons.alert : icons.check;
  el.innerHTML = `<span style="width:18px;height:18px;display:inline-flex;color:${type === 'error' ? 'var(--danger)' : 'var(--accent)'}">${icon}</span><span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 4000 : 2400);
}

export function confirmSheet({ title, message, okLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const sheet = openSheet(
      `<h2 class="sheet-title">${esc(title)}</h2>
       <p class="hint" style="font-size:14px;color:var(--text-2)">${esc(message)}</p>
       <div style="display:flex;gap:10px;margin-top:20px">
         <button class="btn btn-ghost" style="flex:1" data-act="cancel">キャンセル</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" style="flex:1" data-act="ok">${esc(okLabel)}</button>
       </div>`,
      { onClose: () => resolve(result) }
    );
    sheet.el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      result = act === 'ok';
      sheet.close();
    });
  });
}
