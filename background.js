/**
 * background.js — service worker расширения (Manifest V3).
 *
 * Задачи:
 *  1. Инициализировать хранилище при установке.
 *  2. Показывать на иконке бейдж с числом "активных" квартир (все, кроме статуса "Отказ").
 *  3. Обновление по требованию: после `git pull` замечать новые файлы
 *     при открытии popup/базы и перезагружать расширение (данные сохраняются).
 */

const STORAGE_KEY = 'apartments';
const REJECTED_STATUS = 'Отказ';

// ---------- Хранилище и бейдж ----------

/** При установке/обновлении гарантируем, что в storage лежит массив. */
chrome.runtime.onInstalled.addListener(async () => {
  const { [STORAGE_KEY]: list } = await chrome.storage.local.get(STORAGE_KEY);
  if (!Array.isArray(list)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  }
  updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

/** Любое изменение базы (из popup или dashboard) обновляет бейдж. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) updateBadge();
});

/** Пересчитывает и рисует бейдж на иконке расширения. */
async function updateBadge() {
  const { [STORAGE_KEY]: list = [] } = await chrome.storage.local.get(STORAGE_KEY);
  const activeCount = list.filter((apt) => apt.status !== REJECTED_STATUS).length;

  await chrome.action.setBadgeBackgroundColor({ color: '#2383e2' });
  await chrome.action.setBadgeText({ text: activeCount ? String(activeCount) : '' });
}

// ---------- Обновление из git-папки ----------
//
// Никаких таймеров: расширение проверяет свои файлы на диске только тогда,
// когда вы открываете popup или "Мою базу". Если после `git pull`
// (скрипт update-mac.command / update-windows.bat) файлы изменились —
// база перезагружает расширение сама, а popup показывает кнопку "Обновить".

const HASH_KEY = 'filesHash';
const REOPEN_KEY = 'reopenDashboardAfterUpdate';

/** Файлы, изменения которых отслеживаем. При добавлении нового файла — допишите его сюда. */
const WATCHED_FILES = [
  'manifest.json', 'background.js', 'data.js', 'content.js',
  'popup.html', 'popup.js', 'dashboard.html', 'dashboard.js', 'styles.css',
];

/** SHA-256 от содержимого всех файлов расширения, прочитанных с диска. */
async function computeFilesHash() {
  const contents = await Promise.all(
    WATCHED_FILES.map((file) =>
      fetch(chrome.runtime.getURL(file), { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '')
    )
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contents.join('\u0000')));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * true, если файлы на диске отличаются от тех, что сейчас загружены.
 * "Отпечаток" загруженной версии запоминается в storage.session
 * (живёт до перезапуска браузера или перезагрузки расширения).
 */
async function hasPendingUpdate() {
  const hash = await computeFilesHash();
  const { [HASH_KEY]: loaded } = await chrome.storage.session.get(HASH_KEY);
  if (!loaded) {
    await chrome.storage.session.set({ [HASH_KEY]: hash });
    return false;
  }
  return loaded !== hash;
}

/** Применяет обновление; при reopenDashboard база откроется заново после перезагрузки. */
async function applyUpdate(reopenDashboard) {
  if (reopenDashboard) await chrome.storage.local.set({ [REOPEN_KEY]: true });
  chrome.runtime.reload();
}

// Запоминаем отпечаток версии при старте браузера/расширения
hasPendingUpdate().catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'CHECK_UPDATE') {
    hasPendingUpdate().then((updated) => sendResponse({ updated })).catch(() => sendResponse({ updated: false }));
    return true; // ответ асинхронный
  }
  if (msg?.type === 'APPLY_UPDATE') {
    applyUpdate(Boolean(msg.reopenDashboard));
  }
});

/**
 * После перезагрузки из базы — открываем базу снова.
 * Вызывается при каждом старте воркера (а не только в onInstalled),
 * поэтому срабатывает при любом способе перезагрузки.
 */
async function reopenDashboardIfRequested() {
  const { [REOPEN_KEY]: reopen } = await chrome.storage.local.get(REOPEN_KEY);
  if (reopen) {
    await chrome.storage.local.remove(REOPEN_KEY);
    chrome.runtime.openOptionsPage();
  }
}
reopenDashboardIfRequested().catch(() => {});
