/**
 * background.js — service worker расширения (Manifest V3).
 *
 * Задачи:
 *  1. Инициализировать хранилище при установке.
 *  2. Показывать на иконке бейдж с числом "активных" квартир (все, кроме статуса "Отказ").
 *  3. Dev-автообновление: если расширение загружено как распакованное (из папки
 *     с git-репозиторием), каждые 30 секунд проверять, не изменились ли файлы
 *     на диске (например, после `git pull`), и перезагружать расширение.
 *     Данные в chrome.storage.local при перезагрузке сохраняются.
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

// ---------- Dev-автообновление ----------

const RELOAD_ALARM = 'dev-autoreload';
const HASH_KEY = 'devFilesHash';

/** Файлы, изменения которых отслеживаем. При добавлении нового файла — допишите его сюда. */
const WATCHED_FILES = [
  'manifest.json', 'background.js', 'data.js', 'content.js',
  'popup.html', 'popup.js', 'dashboard.html', 'dashboard.js', 'styles.css',
];

/** У расширений из Chrome Web Store в манифесте есть update_url, у распакованных — нет. */
const IS_UNPACKED = !('update_url' in chrome.runtime.getManifest());

if (IS_UNPACKED) {
  // Создаём будильник один раз (повторный create сбрасывал бы таймер при каждом пробуждении воркера)
  chrome.alarms.get(RELOAD_ALARM).then((alarm) => {
    if (!alarm) chrome.alarms.create(RELOAD_ALARM, { periodInMinutes: 0.5 });
  });
  checkForFileChanges();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RELOAD_ALARM) checkForFileChanges();
});

/**
 * Читает файлы расширения с диска, считает общий SHA-256 и сравнивает
 * с сохранённым. Если отличается — перезагружает расширение.
 * chrome.storage.session очищается при перезагрузке, поэтому после reload
 * первый проход просто запоминает новый "отпечаток".
 */
async function checkForFileChanges() {
  try {
    const contents = await Promise.all(
      WATCHED_FILES.map((file) =>
        fetch(chrome.runtime.getURL(file), { cache: 'no-store' })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => '')
      )
    );
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contents.join('\u0000')));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const { [HASH_KEY]: previous } = await chrome.storage.session.get(HASH_KEY);
    if (!previous) {
      await chrome.storage.session.set({ [HASH_KEY]: hash });
    } else if (previous !== hash) {
      console.log('[Flat Hunter] Файлы изменились — перезагружаю расширение');
      chrome.runtime.reload();
    }
  } catch (err) {
    console.warn('[Flat Hunter] Проверка обновлений не удалась:', err);
  }
}
