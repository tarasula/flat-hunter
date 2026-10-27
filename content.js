/**
 * content.js — парсер страницы объявления.
 *
 * Скрипт НЕ висит постоянно на всех сайтах: popup инжектит его по клику
 * через chrome.scripting.executeScript (разрешение activeTab).
 * Плюсы: расширению не нужен доступ ко всем сайтам, и парсер работает
 * даже на вкладках, открытых до установки расширения.
 *
 * Перед ним инжектится data.js (справочник районов и отопления → globalThis.FlatHunter).
 * Значение последнего выражения файла (результат IIFE) возвращается в popup.
 * Формат: { title, price: number|null, url, district, heating }
 */
(() => {
  const FH = globalThis.FlatHunter;

  /** Правила для известных сайтов. Селекторы перебираются по порядку. */
  const SITE_RULES = [
    {
      host: /(^|\.)halooglasi\.com$/,
      title: ['#plh1', '.product-details-desc h1', 'h1'],
      price: ['.offer-price-value', 'span[itemprop="price"]'],
      location: ['.subtitle-places', '#plh2', '#plh3', '#plh4', '#plh5'],
      // Запасной вариант: HaloOglasi хранит данные объявления в JSON внутри <script>
      scriptPrice: /"cena_d"\s*:\s*"?([\d.]+)/,
    },
    {
      host: /(^|\.)cityexpert\.rs$/,
      title: ['h1'],
      price: ['.price-big', '[class*="property-price" i]', '[class*="price" i]'],
      location: ['[class*="address" i]', '[class*="location" i]'],
    },
  ];

  // ---------- Утилиты ----------

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  /** Текст первого найденного элемента из списка селекторов. */
  const textOf = (selectors = []) => {
    for (const sel of selectors) {
      const t = clean(document.querySelector(sel)?.textContent);
      if (t) return t;
    }
    return '';
  };

  /** Значение первого найденного <meta> по property/name/itemprop. */
  const metaOf = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
      const v = clean(el?.getAttribute('content'));
      if (v) return v;
    }
    return '';
  };

  /**
   * Превращает "1.200 €", "650,00 EUR", 900 в целое число.
   * Точка/пробел/запятая между группами по 3 цифры считаются разделителем тысяч.
   */
  function parsePrice(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return raw > 0 ? Math.round(raw) : null;
    const match = String(raw).replace(/\u00a0/g, ' ').match(/\d{1,3}(?:[.\s,]\d{3})+|\d+/);
    if (!match) return null;
    const n = parseInt(match[0].replace(/[.\s,]/g, ''), 10);
    return n > 0 && n < 10_000_000 ? n : null;
  }

  /** Ищет сумму рядом со знаком € / EUR в произвольном тексте. */
  function priceFromText(text) {
    const m = (text || '').match(/(\d[\d.\s,]{0,9})\s?(?:€|eur\b)|(?:€|eur)\s?(\d[\d.\s,]{0,9})/i);
    return m ? parsePrice(m[1] || m[2]) : null;
  }

  /** Цена из элементов по селекторам (атрибут content или текст). */
  function priceFromSelectors(selectors = [], requireCurrency = false) {
    for (const sel of selectors) {
      for (const el of [...document.querySelectorAll(sel)].slice(0, 20)) {
        const raw = el.getAttribute('content') || el.textContent;
        const p = requireCurrency ? priceFromText(raw) : parsePrice(raw);
        if (p) return p;
      }
    }
    return null;
  }

  /** Цена из JSON внутри <script> по регулярке (для сайтов, где DOM рендерится поздно). */
  function priceFromScripts(regex) {
    if (!regex) return null;
    for (const s of document.scripts) {
      const m = s.textContent.match(regex);
      if (m) return parsePrice(m[1]);
    }
    return null;
  }

  /** Достаёт название и цену из разметки schema.org (JSON-LD), если она есть. */
  function fromJsonLd() {
    const out = { title: '', price: null };
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (node.offers) {
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        out.price ??= parsePrice(offer?.price ?? offer?.lowPrice);
        if (!out.title && typeof node.name === 'string') out.title = clean(node.name);
      }
      if (node['@graph']) visit(node['@graph']);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { visit(JSON.parse(s.textContent)); } catch { /* битый JSON — пропускаем */ }
    });
    return out;
  }

  /** Текст всех элементов по всем селекторам (для блоков адреса). */
  const textOfAll = (selectors = []) =>
    selectors
      .flatMap((sel) => [...document.querySelectorAll(sel)].slice(0, 5))
      .map((el) => clean(el.textContent))
      .filter(Boolean)
      .join(' , ');

  /**
   * Район: сначала блок адреса (самый надёжный), потом заголовок, потом описание.
   * Сама логика сопоставления — в data.js (FlatHunter.detectDistrict).
   */
  function guessDistrict(rule, title) {
    const locationText = textOfAll([
      ...(rule.location || []),
      '[itemprop="address"]',
      '[class*="breadcrumb" i]',
    ]);
    return FH.detectDistrict([locationText, title, metaOf('og:description', 'description')]);
  }

  /** Отопление: ищем в тексте страницы ("Grejanje: CG", "Centralno grejanje", "TA peć"…). */
  function guessHeating(title) {
    return FH.detectHeating(`${title} ${document.body?.innerText?.slice(0, 30000) || ''}`);
  }

  // ---------- Основная логика ----------

  try {
    const rule = SITE_RULES.find((r) => r.host.test(location.hostname)) || {};
    const ld = fromJsonLd();

    const title =
      textOf(rule.title) ||
      ld.title ||
      metaOf('og:title') ||
      textOf(['h1']) ||
      clean(document.title.split(/\s[|–—-]\s/)[0]);

    const price =
      priceFromSelectors(rule.price) ||
      priceFromScripts(rule.scriptPrice) ||
      ld.price ||
      parsePrice(metaOf('product:price:amount', 'og:price:amount', 'price')) ||
      priceFromSelectors(['[itemprop="price"]']) ||
      priceFromSelectors(['[class*="price" i]', '[id*="price" i]'], true) ||
      priceFromText(document.body?.innerText?.slice(0, 20000));

    return {
      title,
      price: price || null,
      url: location.href,
      district: FH ? guessDistrict(rule, title) : '',
      heating: FH ? guessHeating(title) : '',
    };
  } catch (err) {
    // Если что-то пошло не так — отдаём хотя бы URL, остальное пользователь введёт сам.
    return { title: '', price: null, url: location.href, district: '', heating: '', error: String(err) };
  }
})();
