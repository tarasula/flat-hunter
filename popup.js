/**
 * popup.js — логика окна расширения.
 *
 * Поток: открыли popup → подставили URL текущей вкладки → если квартира с таким URL
 * уже сохранена, загрузили её в форму для редактирования → по кнопке "Спарсить"
 * инжектим content.js и заполняем найденные поля → "Сохранить" делает upsert в storage.
 */

const STORAGE_KEY = 'apartments';

const form = document.getElementById('apt-form');
const parseBtn = document.getElementById('parse-btn');
const saveBtn = document.getElementById('save-btn');
const banner = document.getElementById('existing-banner');
const toastEl = document.getElementById('toast');

/** Короткий доступ к полю формы по имени (form.title конфликтует с HTMLElement.title). */
const field = (name) => form.elements.namedItem(name);

let activeTab = null;
let editingId = null;
let toastTimer = null;

document.addEventListener('DOMContentLoaded', init);

/** Точка входа: навешиваем обработчики и подгружаем данные текущей вкладки. */
async function init() {
  populateSelects();
  checkForUpdate();

  document.getElementById('open-dashboard').addEventListener('click', async () => {
    await chrome.runtime.openOptionsPage(); // откроет dashboard или переключит на уже открытую вкладку
    window.close();
  });
  parseBtn.addEventListener('click', parseCurrentPage);
  form.addEventListener('submit', saveApartment);
  form.addEventListener('input', (e) => e.target.classList.remove('needs-input'));

  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = activeTab?.url ?? '';

  if (!/^https?:\/\//i.test(tabUrl)) {
    parseBtn.disabled = true;
    parseBtn.title = 'Парсинг доступен только на обычных веб-страницах';
    return;
  }

  field('url').value = tabUrl;

  const existing = await findByUrl(tabUrl);
  if (existing) {
    fillForm(existing);
    editingId = existing.id;
    banner.hidden = false;
    saveBtn.textContent = 'Обновить квартиру';
  }
}

/**
 * Если после `git pull` файлы расширения на диске изменились,
 * показывает плашку с кнопкой "Обновить" (перезагрузка расширения, данные сохраняются).
 */
async function checkForUpdate() {
  try {
    const { updated } = await chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' });
    if (!updated) return;
    document.getElementById('update-banner').hidden = false;
    document.getElementById('apply-update').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'APPLY_UPDATE' }); // popup закроется при перезагрузке
    });
  } catch { /* не критично */ }
}

/** Строит списки районов, статусов и отопления из справочника data.js. */
function populateSelects() {
  const FH = globalThis.FlatHunter;

  const district = field('district');
  FH.fillDistrictSelect(district);
  district.value = FH.OTHER_DISTRICT;

  const status = field('status');
  FH.STATUSES.forEach((s) => status.append(new Option(s.name, s.name)));
  status.value = FH.STATUSES[0].name;

  const heating = field('heating');
  FH.HEATING_TYPES.forEach((h) => heating.append(new Option(h.value, h.value)));
}

// ---------- Парсинг ----------

/** Инжектит content.js в активную вкладку и заполняет форму результатом. */
async function parseCurrentPage() {
  if (!activeTab?.id) return;
  setLoading(parseBtn, true, 'Читаю страницу…');

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['data.js', 'content.js'], // справочник + парсер; результат — от последнего файла
    });
    const data = injection?.result;
    if (!data) throw new Error('Парсер вернул пустой результат');
    applyParsed(data);
  } catch (err) {
    console.error('[Flat Hunter] parse error:', err);
    showToast('Не удалось прочитать страницу. Заполните поля вручную.', 'error');
  } finally {
    setLoading(parseBtn, false);
  }
}

/**
 * Переносит найденные данные в форму.
 * Не найденные поля не трогаем (остаются пустыми для ручного ввода) и подсвечиваем.
 */
function applyParsed({ title, price, url, district, heating }) {
  const missing = [];

  if (url) field('url').value = url;

  if (title) field('title').value = title;
  else { markMissing('title'); missing.push('заголовок'); }

  if (price) field('price').value = price;
  else { markMissing('price'); missing.push('цену'); }

  if (district) field('district').value = district;
  else missing.push('район');

  // Отопление подставляем, только если пользователь его ещё не выбрал
  if (heating && !field('heating').value) field('heating').value = heating;

  if (missing.length) showToast(`Не нашёл: ${missing.join(', ')} — введите вручную`, 'warn');
  else showToast('Данные подтянуты ✓');
}

function markMissing(name) {
  const input = field(name);
  if (!input.value) input.classList.add('needs-input');
}

// ---------- Сохранение ----------

/** Сохраняет квартиру: обновляет запись с тем же id/URL или добавляет новую в начало списка. */
async function saveApartment(event) {
  event.preventDefault();
  const data = readForm();

  if (!data.title && !data.url) {
    markMissing('title');
    showToast('Нужен хотя бы заголовок или URL', 'error');
    return;
  }

  const list = await getApartments();
  const now = Date.now();

  let index = editingId ? list.findIndex((a) => a.id === editingId) : -1;
  if (index === -1 && data.url) {
    index = list.findIndex((a) => normalizeUrl(a.url) === normalizeUrl(data.url));
  }

  if (index >= 0) {
    list[index] = { ...list[index], ...data, updatedAt: now };
    editingId = list[index].id;
  } else {
    const apartment = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
    list.unshift(apartment);
    editingId = apartment.id;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: list });

  showToast(index >= 0 ? 'Квартира обновлена ✓' : 'Квартира сохранена ✓');
  saveBtn.textContent = 'Обновить квартиру';
  banner.hidden = false;
}

/** Собирает объект квартиры из полей формы. */
function readForm() {
  const priceRaw = field('price').value.trim();
  const price = priceRaw === '' ? null : Math.round(Number(priceRaw));

  return {
    title: field('title').value.trim(),
    url: field('url').value.trim(),
    price: Number.isFinite(price) && price >= 0 ? price : null,
    district: field('district').value,
    status: field('status').value,
    heating: field('heating').value,
    whiteCarton: field('whiteCarton').checked,
    petFriendly: field('petFriendly').checked,
    comment: field('comment').value.trim(),
  };
}

/** Заполняет форму данными сохранённой квартиры. */
function fillForm(apt) {
  // Значения из старых версий, которых нет в текущих списках, не теряем
  globalThis.FlatHunter.ensureOption(field('district'), apt.district);
  globalThis.FlatHunter.ensureOption(field('heating'), apt.heating);

  field('title').value = apt.title ?? '';
  field('url').value = apt.url ?? '';
  field('price').value = apt.price ?? '';
  field('district').value = apt.district || 'Другое';
  field('status').value = apt.status || 'Интересно';
  field('heating').value = apt.heating ?? '';
  field('whiteCarton').checked = Boolean(apt.whiteCarton);
  field('petFriendly').checked = Boolean(apt.petFriendly);
  field('comment').value = apt.comment ?? '';
}

// ---------- Хранилище ----------

async function getApartments() {
  const { [STORAGE_KEY]: list } = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(list) ? list : [];
}

async function findByUrl(url) {
  const target = normalizeUrl(url);
  return (await getApartments()).find((a) => a.url && normalizeUrl(a.url) === target) || null;
}

/** Убирает #hash, utm-метки и завершающий слэш, чтобы одно объявление не сохранилось дважды. */
function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    [...u.searchParams.keys()]
      .filter((k) => k.startsWith('utm_') || k === 'fbclid' || k === 'gclid')
      .forEach((k) => u.searchParams.delete(k));
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(raw || '').trim();
  }
}

// ---------- UI-хелперы ----------

function setLoading(button, isLoading, text = '') {
  if (isLoading) {
    button.dataset.label = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

/** Всплывающее уведомление внизу popup. type: success | warn | error */
function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}
