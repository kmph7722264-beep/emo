/**
 * 週菜單維護（內嵌於 admin.html，沿用管理頁 LIFF 憑證，不另開頁面）
 */
window.WeekMenu = (function () {
  const MEAL_DEFS = [
    { key: '早餐',    label: '早',  cls: 'bf', ph: '例：燒餅油條 / 飯糰' },
    { key: '中餐A',   label: 'A',   cls: 'la', ph: '例：滷雞腿便當' },
    { key: '中餐B',   label: 'B',   cls: 'lb', ph: '例：排骨便當' },
    { key: '中餐C',   label: 'C',   cls: 'lc', ph: '例：素食便當' },
    { key: '中餐湯品', label: '中湯', cls: 'ls', ph: '例：玉米濃湯' },
    { key: '中餐水果', label: '中果', cls: 'lf', ph: '' },
    { key: '中餐飲品', label: '中飲', cls: 'ld', ph: '例：無糖綠茶 / 檸檬水' },
    { key: '晚餐A',   label: '晚A', cls: 'da', ph: '例：紅燒牛肉麵' },
    { key: '晚餐B',   label: '晚B', cls: 'db', ph: '例：排骨湯麵' },
    { key: '晚餐湯品', label: '晚湯', cls: 'ds', ph: '例：味噌湯' },
    { key: '晚餐水果', label: '晚果', cls: 'df', ph: '' },
  ];
  const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

  let root = null;
  let getIdToken = () => '';
  let postJson = async () => ({ ok: false });
  let apiUrl = '';
  let onClose = () => {};
  let weekStart = getWeekStart(new Date());
  let loading = false;
  let inited = false;

  function $(id) { return root.querySelector('#' + id); }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function fmtDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function getWeekStart(ref) {
    const d = new Date(ref); d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }

  function showMsg(text, isErr) {
    const el = $('wkMsg');
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (isErr ? 'err' : 'ok');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 5000);
  }

  function updateWeekLabel() {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    $('wkWeekLabel').textContent =
      `${weekStart.getMonth() + 1}/${weekStart.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`;
  }

  function showSkeletons() {
    $('wkDayCards').innerHTML = Array.from({ length: 7 }, () => `
      <div class="skeleton-card">
        <div class="skeleton-head"></div>
        <div class="skeleton-body">
          ${Array.from({ length: 5 }, () => '<div class="skeleton-line"></div>').join('')}
        </div>
      </div>`).join('');
  }

  function buildWeekCards() {
    const container = $('wkDayCards');
    container.innerHTML = '';
    const today = todayStr();

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = fmtDate(d);
      const label = `${d.getMonth() + 1}/${d.getDate()} (${WEEK_DAYS[d.getDay()]})`;
      const isToday = dateStr === today;
      const isPast = dateStr < today;

      const card = document.createElement('div');
      card.className = `day-card${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}`;
      card.dataset.date = dateStr;
      card.dataset.dirty = 'false';

      const mealRows = MEAL_DEFS.map(m =>
        `<div class="meal-row">
          <span class="meal-tag tag-${m.cls}">${m.label}</span>
          <input class="meal-inp" data-meal="${m.key}" list="hist-${m.key}"
                 placeholder="${m.ph}" autocomplete="off" spellcheck="false">
        </div>`
      ).join('');

      card.innerHTML = `
        <div class="day-header">
          <span class="day-date">${label}</span>
          ${isToday ? '<span class="today-badge">今天</span>' : ''}
          <span class="dirty-dot" hidden>●</span>
        </div>
        <div class="day-meals">${mealRows}</div>`;

      card.querySelectorAll('.meal-inp').forEach(inp =>
        inp.addEventListener('input', () => onInput(card))
      );
      container.appendChild(card);
    }
  }

  function onInput(card) {
    const dirty = [...card.querySelectorAll('.meal-inp')].some(inp =>
      inp.value.trim() !== (inp.dataset.orig || '')
    );
    card.dataset.dirty = dirty ? 'true' : 'false';
    refreshCardUI(card);
    refreshSaveBtn();
  }

  function refreshCardUI(card) {
    const dirty = card.dataset.dirty === 'true';
    card.classList.toggle('is-dirty', dirty);
    card.querySelector('.dirty-dot').hidden = !dirty;
    card.classList.remove('save-ok', 'save-err');
    card.querySelector('.day-err-hint')?.remove();
  }

  function refreshSaveBtn() {
    const n = root.querySelectorAll('.day-card[data-dirty="true"]').length;
    const btn = $('wkBtnSaveAll');
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `💾 儲存變更（${n} 天）` : '💾 無變更可儲存';
  }

  async function loadWeekData() {
    const cards = [...root.querySelectorAll('.day-card')];
    await Promise.all(cards.map(async card => {
      const date = card.dataset.date;
      try {
        const res = await fetch(`${apiUrl}?action=menu&date=${date}`);
        const data = await res.json();
        const menu = (data.ok && data.menu) ? data.menu : {};
        card.querySelectorAll('.meal-inp').forEach(inp => {
          const v = menu[inp.dataset.meal] || '';
          inp.value = v;
          inp.dataset.orig = v;
        });
      } catch (_) {
        card.querySelectorAll('.meal-inp').forEach(inp => { inp.dataset.orig = ''; });
      }
      card.dataset.dirty = 'false';
      refreshCardUI(card);
    }));
    refreshSaveBtn();
  }

  async function loadHistory() {
    const idToken = getIdToken();
    if (!idToken) return;
    try {
      const data = await postJson({ action: 'menuHistory', idToken });
      if (!data.ok) return;
      const hist = data.history || {};
      MEAL_DEFS.forEach(m => {
        const dl = document.getElementById(`hist-${m.key}`);
        if (!dl) return;
        const names = hist[m.key] || [];
        dl.innerHTML = names.slice(0, 30)
          .map(n => `<option value="${n.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`)
          .join('');
      });
    } catch (_) {}
  }

  async function saveAll() {
    const dirtyCds = [...root.querySelectorAll('.day-card[data-dirty="true"]')];
    if (!dirtyCds.length || loading) return;
    const idToken = getIdToken();
    if (!idToken) { showMsg('登入憑證已過期，請關閉後重新整理管理頁', true); return; }
    loading = true;

    const btn = $('wkBtnSaveAll');
    btn.disabled = true;
    btn.textContent = '儲存中…';

    const results = await Promise.all(dirtyCds.map(async card => {
      const date = card.dataset.date;
      const menu = {};
      card.querySelectorAll('.meal-inp').forEach(inp => { menu[inp.dataset.meal] = inp.value.trim(); });
      try {
        const data = await postJson({ action: 'updateMenu', idToken, date, menu });
        return { card, ok: !!data.ok, error: data.error };
      } catch (e) {
        return { card, ok: false, error: e.message };
      }
    }));

    let fail = 0;
    results.forEach(({ card, ok, error }) => {
      if (ok) {
        card.querySelectorAll('.meal-inp').forEach(inp => { inp.dataset.orig = inp.value; });
        card.dataset.dirty = 'false';
        card.classList.remove('is-dirty');
        card.querySelector('.dirty-dot').hidden = true;
        card.classList.add('save-ok');
      } else {
        fail++;
        card.classList.add('save-err');
        const hint = document.createElement('div');
        hint.className = 'day-err-hint';
        hint.textContent = error || '儲存失敗，請重試';
        card.querySelector('.day-meals').after(hint);
      }
    });

    loading = false;
    refreshSaveBtn();
    showMsg(
      fail === 0
        ? `✅ 已成功儲存 ${results.length} 天菜單`
        : `⚠ ${fail} 天儲存失敗，請重試`,
      fail > 0
    );
  }

  async function pushWeeklyMenu() {
    const idToken = getIdToken();
    if (!idToken) { showMsg('登入憑證已過期，請關閉後重新整理管理頁', true); return; }
    const mondayStr = fmtDate(weekStart);
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 4);
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()} ～ ${endDate.getMonth() + 1}/${endDate.getDate()}`;
    if (!confirm(`確定將「${label}」的菜單傳送至廚房群組？`)) return;

    const btn = $('wkBtnPushMenu');
    btn.disabled = true;
    btn.textContent = '傳送中…';
    try {
      const data = await postJson({ action: 'pushWeeklyMenu', idToken, monday: mondayStr });
      showMsg(data.ok ? `✅ 已傳送 ${label} 菜單至廚房群組` : `❌ 傳送失敗：${data.error}`, !data.ok);
    } catch (e) {
      showMsg('❌ 傳送失敗：' + e.message, true);
    }
    btn.disabled = false;
    btn.textContent = '📤 傳送本週菜單至廚房群組';
  }

  async function changeWeek() {
    if (loading) return;
    loading = true;
    updateWeekLabel();
    showSkeletons();
    buildWeekCards();
    await Promise.all([loadHistory(), loadWeekData()]);
    loading = false;
  }

  function inferYear(month, day) {
    const now = new Date();
    const y = now.getFullYear();
    for (const yr of [y, y + 1, y - 1]) {
      const d = new Date(yr, month - 1, day);
      const diff = (d - now) / 86400000;
      if (diff >= -14 && diff <= 45) return yr;
    }
    return y;
  }

  function parseMenuText(text) {
    const result = {};
    const sections = text.split(/\n?-{4,}\n?/).map(s => s.trim()).filter(s => s);
    for (const section of sections) {
      const lines = section.split('\n').map(l => l.trim()).filter(l => l);
      let dateStr = null;
      let startIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\d{1,2})\/(\d{1,2})[（(]/);
        if (m) {
          const mo = parseInt(m[1], 10), day = parseInt(m[2], 10);
          const yr = inferYear(mo, day);
          dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          startIdx = i + 1;
          break;
        }
      }
      if (!dateStr) continue;
      const menu = {};
      for (let i = startIdx; i < lines.length; i++) {
        const mm = lines[i].match(/^(早餐|中餐|午餐|晚餐)[：:](.+)/);
        if (!mm) continue;
        const type = mm[1], val = mm[2].trim();
        if (type === '早餐') {
          menu['早餐'] = val;
        } else if (type === '中餐' || type === '午餐') {
          const parts = val.split('/').map(p => p.trim());
          if (parts[0]) menu['中餐A'] = parts[0];
          if (parts[1]) menu['中餐B'] = parts[1];
          if (parts[2]) menu['中餐C'] = parts[2];
        } else if (type === '晚餐') {
          const parts = val.split('/').map(p => p.trim());
          if (parts[0]) menu['晚餐A'] = parts[0];
          if (parts[1]) menu['晚餐B'] = parts[1];
        }
      }
      if (Object.keys(menu).length) result[dateStr] = menu;
    }
    return result;
  }

  async function applyImport(parsed) {
    const dates = Object.keys(parsed);
    if (!dates.length) { showMsg('⚠ 未解析到任何菜單資料，請確認格式', true); return; }

    const targetWeekStart = getWeekStart(new Date(dates[0]));
    if (fmtDate(weekStart) !== fmtDate(targetWeekStart)) {
      weekStart = targetWeekStart;
      loading = true;
      updateWeekLabel();
      showSkeletons();
      buildWeekCards();
      await Promise.all([loadHistory(), loadWeekData()]);
      loading = false;
    }

    let filled = 0;
    dates.forEach(dateStr => {
      const card = root.querySelector(`.day-card[data-date="${dateStr}"]`);
      if (!card) return;
      Object.entries(parsed[dateStr]).forEach(([mealKey, value]) => {
        const inp = card.querySelector(`[data-meal="${mealKey}"]`);
        if (inp) inp.value = value;
      });
      onInput(card);
      filled++;
    });

    const missed = dates.length - filled;
    const note = missed > 0 ? `（${missed} 天不在本週，已略過）` : '';
    showMsg(
      filled > 0 ? `✅ 已匯入 ${filled} 天菜單${note}，請確認後儲存` : `⚠ 所選週內沒有符合的日期${note}`,
      filled === 0
    );
  }

  function bindEvents() {
    $('wkBtnPrev').addEventListener('click', () => {
      weekStart.setDate(weekStart.getDate() - 7);
      changeWeek();
    });
    $('wkBtnNext').addEventListener('click', () => {
      weekStart.setDate(weekStart.getDate() + 7);
      changeWeek();
    });
    $('wkBtnThisWeek').addEventListener('click', () => {
      weekStart = getWeekStart(new Date());
      changeWeek();
    });
    $('wkBtnSaveAll').addEventListener('click', saveAll);
    $('wkBtnPushMenu').addEventListener('click', pushWeeklyMenu);
    $('wkBtnImport').addEventListener('click', () => {
      $('wkImportOverlay').classList.remove('hidden');
      $('wkImportText').focus();
    });
    $('wkBtnImportCancel').addEventListener('click', () => {
      $('wkImportOverlay').classList.add('hidden');
    });
    $('wkBtnImportConfirm').addEventListener('click', async () => {
      const text = $('wkImportText').value;
      const parsed = parseMenuText(text);
      $('wkImportOverlay').classList.add('hidden');
      await applyImport(parsed);
    });
    $('wkImportOverlay').addEventListener('click', e => {
      if (e.target === $('wkImportOverlay')) $('wkImportOverlay').classList.add('hidden');
    });
    $('wkBtnClose').addEventListener('click', e => {
      e.preventDefault();
      close();
    });
  }

  async function loadPanel() {
    loading = true;
    weekStart = getWeekStart(new Date());
    updateWeekLabel();
    showSkeletons();
    buildWeekCards();
    await Promise.all([loadHistory(), loadWeekData()]);
    loading = false;
  }

  function init(options) {
    root = options.root;
    getIdToken = options.getIdToken;
    postJson = options.postJson;
    apiUrl = options.apiUrl;
    onClose = options.onClose || (() => {});
    if (!inited) {
      bindEvents();
      inited = true;
    }
  }

  async function open() {
    if (!root) return;
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    root.scrollTop = 0;
    await loadPanel();
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    document.body.style.overflow = '';
    onClose();
  }

  return { init, open, close };
})();