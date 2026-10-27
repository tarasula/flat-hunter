/**
 * dashboard.js — страница базы квартир.
 *
 * Два вида: Канбан (колонки по статусам, drag & drop между колонками) и Таблица.
 * Фильтры: поиск, район, pet-friendly, белый картон. Экспорт всей базы в CSV.
 * Страница слушает chrome.storage.onChanged и перерисовывается, когда квартира
 * сохраняется из popup в другой вкладке.
 */

const STORAGE_KEY = 'apartments';
const VIEW_KEY = 'flatHunter.view';

// Справочники (статусы, районы, отопление) — из data.js
const FH = globalThis.FlatHunter;
const STATUSES = FH.STATUSES;

const state = {
  apartments: [],
  view: 'kanban',
  search: '',
  district: '',
  petOnly: false,
  cartonOnly: false,
};

const $ = (sel) => document.querySelector(sel);

init();

// ---------- Инициализация ----------

/**
 * При открытии базы проверяем, не обновились ли файлы после `git pull`.
 * Если да — перезагружаем расширение, и база откроется заново уже в новой версии.
 */
async function applyUpdateIfAvailable() {
  try {
    const { updated } = await chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' });
    if (updated) {
      document.title = 'Обновляю…';
      chrome.runtime.sendMessage({ type: 'APPLY_UPDATE', reopenDashboard: true });
    }
  } catch { /* не критично */ }
}

async function init() {
  applyUpdateIfAvailable();

  // Опции фильтра районов: "m:<община>" — вся община с подрайонами, "d:<район>" — конкретный район
  const districtSelect = $('#filter-district');
  for (const group of FH.DISTRICT_GROUPS) {
    const og = document.createElement('optgroup');
    og.label = group.name;
    og.append(new Option(`${group.name} — все`, `m:${group.name}`));
    group.areas.forEach(([name]) => og.append(new Option(name, `d:${name}`)));
    districtSelect.append(og);
  }
  districtSelect.append(new Option(FH.OTHER_DISTRICT, `d:${FH.OTHER_DISTRICT}`));

  // Восстанавливаем выбранный вид
  try { state.view = localStorage.getItem(VIEW_KEY) || 'kanban'; } catch { /* ignore */ }

  $('#search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); render(); });
  districtSelect.addEventListener('change', (e) => { state.district = e.target.value; render(); });
  $('#filter-pet').addEventListener('change', (e) => { state.petOnly = e.target.checked; render(); });
  $('#filter-carton').addEventListener('change', (e) => { state.cartonOnly = e.target.checked; render(); });
  $('#export-btn').addEventListener('click', exportCsv);

  document.querySelectorAll('.view-toggle button').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      try { localStorage.setItem(VIEW_KEY, state.view); } catch { /* ignore */ }
      render();
    })
  );

  // Живое обновление при изменениях из popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      state.apartments = changes[STORAGE_KEY].newValue || [];
      render();
    }
  });

  const { [STORAGE_KEY]: list } = await chrome.storage.local.get(STORAGE_KEY);
  state.apartments = Array.isArray(list) ? list : [];
  render();
}

// ---------- Работа с данными ----------

async function persist(list) {
  state.apartments = list;
  render();
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
}

/** Частично обновляет квартиру по id (например, меняет статус). */
function updateApartment(id, patch) {
  const list = state.apartments.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a));
  return persist(list);
}

/** Удаляет квартиру после подтверждения. */
function deleteApartment(apt) {
  if (!confirm(`Удалить «${apt.title || apt.url || 'без названия'}» из базы?`)) return;
  return persist(state.apartments.filter((a) => a.id !== apt.id));
}

/** Квартиры с учётом фильтров, свежие сверху. */
function getFiltered() {
  return state.apartments
    .filter((a) => matchesDistrictFilter(a.district))
    .filter((a) => !state.petOnly || a.petFriendly)
    .filter((a) => !state.cartonOnly || a.whiteCarton)
    .filter((a) => {
      if (!state.search) return true;
      return [a.title, a.comment, a.district, a.url].join(' ').toLowerCase().includes(state.search);
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Фильтр по району: целая община ("m:Савски венац") или конкретный район ("d:Сеньяк"). */
function matchesDistrictFilter(district) {
  const f = state.district;
  if (!f) return true;
  if (f.startsWith('m:')) return FH.groupOf(district) === f.slice(2);
  return district === f.slice(2);
}

/** Подпись района на карточке: "Сеньяк · Савски венац". */
function districtLabel(district) {
  const group = FH.groupOf(district);
  return group && group !== district && group !== 'Пригороды' ? `${district} · ${group}` : district;
}

// ---------- Рендер ----------

function render() {
  renderStats();

  document.querySelectorAll('.view-toggle button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === state.view)
  );

  const isEmpty = state.apartments.length === 0;
  $('#empty').hidden = !isEmpty;
  $('#board').hidden = isEmpty || state.view !== 'kanban';
  $('#table-wrap').hidden = isEmpty || state.view !== 'table';
  if (isEmpty) return;

  const items = getFiltered();
  if (state.view === 'kanban') renderKanban(items);
  else renderTable(items);
}

/** Строка статистики под заголовком. */
function renderStats() {
  const list = state.apartments;
  const priced = list.filter((a) => a.price).map((a) => a.price);
  const avg = priced.length ? Math.round(priced.reduce((s, p) => s + p, 0) / priced.length) : null;
  const ready = list.filter((a) => a.status === 'Готов снимать').length;

  const parts = [`v${chrome.runtime.getManifest().version}`, `Всего: ${list.length}`];
  if (avg) parts.push(`средняя цена ${formatPrice(avg)}`);
  if (ready) parts.push(`готов снимать: ${ready}`);
  $('#stats').textContent = parts.join(' · ');
}

/** Канбан: по колонке на каждый статус, с drag & drop. */
function renderKanban(items) {
  const board = $('#board');
  board.replaceChildren();

  const knownStatuses = new Set(STATUSES.map((s) => s.name));

  STATUSES.forEach((status, i) => {
    // Квартиры с неизвестным статусом попадают в первую колонку
    const columnItems = items.filter((a) =>
      a.status === status.name || (i === 0 && !knownStatuses.has(a.status))
    );

    const column = el('section', { className: 'column' });
    column.dataset.status = status.name;

    column.append(
      el('div', { className: 'column-header' },
        el('span', { className: `tag tag-${status.color}`, textContent: status.name }),
        el('span', { className: 'count', textContent: String(columnItems.length) })
      ),
      ...columnItems.map(createCard)
    );

    attachDropZone(column);
    board.append(column);
  });
}

/** Карточка квартиры для канбана. */
function createCard(apt) {
  const card = el('article', { className: 'card', draggable: true });
  card.dataset.id = apt.id;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', apt.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  const priceEl = el('div', {
    className: apt.price ? 'card-price' : 'card-price empty',
    textContent: apt.price ? formatPrice(apt.price) : 'Цена не указана',
  });

  const tags = el('div', { className: 'tags' },
    apt.district && el('span', { className: 'tag tag-gray', textContent: `📍 ${districtLabel(apt.district)}` }),
    apt.heating && el('span', { className: 'tag tag-yellow', textContent: FH.heatingShort(apt.heating) })
  );

  const comment = apt.comment && el('p', { className: 'card-comment', textContent: apt.comment, title: apt.comment });

  const footer = el('div', { className: 'card-footer' },
    createStatusSelect(apt),
    createDeleteButton(apt)
  );

  const specs = specsText(apt);
  const specsEl = specs && el('div', { className: 'card-specs', textContent: specs });

  card.append(createTitle(apt), priceEl);
  if (specsEl) card.append(specsEl);
  card.append(tags, createFeatureIcons(apt));
  if (comment) card.append(comment);
  card.append(footer);
  return card;
}

/** Таблица со всеми полями. */
function renderTable(items) {
  const tbody = $('#table-body');
  tbody.replaceChildren();

  if (!items.length) {
    const td = el('td', { className: 'table-empty', textContent: 'Ничего не найдено по фильтрам' });
    td.colSpan = 12;
    tbody.append(el('tr', {}, td));
    return;
  }

  items.forEach((apt) => {
    const tr = el('tr', {},
      el('td', {}, createTitle(apt)),
      el('td', { className: 'nowrap', textContent: apt.price ? formatPrice(apt.price) : '—' }),
      el('td', { className: 'nowrap', textContent: apt.area ? `${formatNumber(apt.area)} м²` : '—' }),
      el('td', { className: 'nowrap', textContent: apt.rooms ? FH.formatRooms(apt.rooms) : '—' }),
      el('td', { className: 'nowrap', textContent: apt.district ? districtLabel(apt.district) : '—' }),
      el('td', {}, createStatusSelect(apt)),
      el('td', { className: 'nowrap', textContent: apt.heating ? FH.heatingShort(apt.heating) : '—' }),
      el('td', { className: 'center', textContent: apt.whiteCarton ? '✅' : '—' }),
      el('td', { className: 'center', textContent: apt.petFriendly ? '✅' : '—' }),
      el('td', { className: 'comment-cell', textContent: apt.comment || '' }),
      el('td', { className: 'nowrap muted', textContent: formatDate(apt.createdAt) }),
      el('td', {}, createDeleteButton(apt))
    );
    tbody.append(tr);
  });
}

// ---------- Компоненты ----------

/** Заголовок-ссылка. Ссылка рендерится только для http(s), чтобы не пропустить javascript: URL. */
function createTitle(apt) {
  const text = apt.title || apt.url || 'Без названия';
  const href = safeUrl(apt.url);
  if (!href) return el('span', { className: 'card-title', textContent: text });
  return el('a', { className: 'card-title', href, target: '_blank', rel: 'noopener noreferrer', textContent: text });
}

/** Иконки-чекбоксы: активная иконка — яркая, неактивная — бледная. */
function createFeatureIcons(apt) {
  return el('div', { className: 'icons' },
    el('span', {
      className: `icon ${apt.whiteCarton ? '' : 'off'}`,
      textContent: '📄',
      title: apt.whiteCarton ? 'Делает белый картон' : 'Белый картон: нет / неизвестно',
    }),
    el('span', {
      className: `icon ${apt.petFriendly ? '' : 'off'}`,
      textContent: '🐾',
      title: apt.petFriendly ? 'Pet-friendly' : 'Pet-friendly: нет / неизвестно',
    })
  );
}

/** Select для быстрой смены статуса, окрашенный в цвет статуса. */
function createStatusSelect(apt) {
  const select = el('select', { className: `status-select tag-${statusColor(apt.status)}`, title: 'Изменить статус' });
  STATUSES.forEach((s) => select.append(new Option(s.name, s.name, false, s.name === apt.status)));
  select.addEventListener('change', () => updateApartment(apt.id, { status: select.value }));
  // Чтобы клик по select не начинал drag карточки
  select.addEventListener('mousedown', (e) => e.stopPropagation());
  return select;
}

function createDeleteButton(apt) {
  const btn = el('button', { type: 'button', className: 'btn btn-icon btn-delete', textContent: '🗑', title: 'Удалить' });
  btn.addEventListener('click', () => deleteApartment(apt));
  return btn;
}

/** Делает колонку приёмником drag & drop: бросили карточку — сменили статус. */
function attachDropZone(column) {
  column.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drag-over');
  });
  column.addEventListener('dragleave', (e) => {
    if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over');
  });
  column.addEventListener('drop', (e) => {
    e.preventDefault();
    column.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    const apt = state.apartments.find((a) => a.id === id);
    if (apt && apt.status !== column.dataset.status) {
      updateApartment(id, { status: column.dataset.status });
    }
  });
}

// ---------- Экспорт ----------

/** Скачивает всю базу в CSV (UTF-8 с BOM — корректно открывается в Excel и Google Sheets). */
function exportCsv() {
  if (!state.apartments.length) {
    alert('База пуста — экспортировать нечего.');
    return;
  }

  const headers = ['Заголовок', 'URL', 'Цена (€)', 'Площадь (м²)', 'Комнаты', 'Район', 'Статус', 'Отопление',
    'Белый картон', 'Pet-friendly', 'Комментарий', 'Добавлено', 'Обновлено'];

  const rows = state.apartments.map((a) => [
    a.title, a.url, a.price ?? '', a.area ?? '', a.rooms ?? '', a.district, a.status, a.heating,
    a.whiteCarton ? 'Да' : 'Нет', a.petFriendly ? 'Да' : 'Нет',
    a.comment, formatDate(a.createdAt), formatDate(a.updatedAt),
  ]);

  const escape = (value) => {
    const s = String(value ?? '');
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = el('a', { href: url, download: `apartments-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Утилиты ----------

/** Мини-хелпер создания DOM-элементов: el('div', {className}, child1, child2). Пустые children пропускаются. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter(Boolean));
  return node;
}

function statusColor(name) {
  return STATUSES.find((s) => s.name === name)?.color || 'gray';
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** "105 м² · 4 комн. · 11 €/м²" — строка характеристик для карточки. */
function specsText(apt) {
  const parts = [];
  if (apt.area) parts.push(`${formatNumber(apt.area)} м²`);
  if (apt.rooms) parts.push(FH.formatRooms(apt.rooms));
  if (apt.area && apt.price) parts.push(`${formatNumber(Math.round((apt.price / apt.area) * 10) / 10)} €/м²`);
  return parts.join(' · ');
}

function formatNumber(n) {
  return Number(n).toLocaleString('ru-RU');
}

function formatPrice(n) {
  return `${Number(n).toLocaleString('ru-RU')} €`;
}

function formatDate(ts) {
  return ts ? new Date(ts).toLocaleDateString('ru-RU') : '';
}
