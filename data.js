/**
 * data.js — общие справочники и утилиты Flat Hunter.
 *
 * Подключается обычным <script> в popup.html и dashboard.html,
 * а также инжектится на страницу объявления перед content.js.
 * Всё публикуется в globalThis.FlatHunter (без модулей — сборщик не нужен).
 */
(() => {
  // При повторной инъекции на ту же вкладку объект уже существует
  if (globalThis.FlatHunter) return;

  // ---------- Статусы ----------

  /** Статусы в порядке колонок канбана + цвет тега в стиле Notion. */
  const STATUSES = [
    { name: 'Интересно', color: 'gray' },
    { name: 'Не дозвонился', color: 'orange' },
    { name: 'Договорился на просмотр', color: 'blue' },
    { name: 'Посмотрел - Думаю', color: 'purple' },
    { name: 'Готов снимать', color: 'green' },
    { name: 'Отказ', color: 'red' },
  ];

  // ---------- Районы Белграда ----------

  /**
   * Группа = община (opština). Первая опция группы — "весь район".
   * Район: [название по-русски, латиница как на сайтах, алиасы?, доп. регулярки?]
   * Кириллица (Сењак, Дорћол…) распознаётся автоматически через транслитерацию.
   * Названия "Новый Белград", "Врачар", "Дорчол", "Белград на воде", "Другое"
   * совпадают с версией 1.0 — старые записи остаются валидными.
   */
  const DISTRICT_GROUPS = [
    {
      name: 'Стари град', latin: 'Stari grad',
      areas: [
        ['Дорчол', 'Dorćol'],
        ['Скадарлия', 'Skadarlija'],
        ['Косанчичев венац', 'Kosančićev venac'],
        ['Теразие', 'Terazije'],
        ['Студентски трг', 'Studentski trg'],
        ['Зелени венац', 'Zeleni venac'],
      ],
    },
    {
      name: 'Савски венац', latin: 'Savski venac',
      areas: [
        ['Белград на воде', 'Beograd na vodi', ['belgrade waterfront', 'beogradu na vodi'], [/(?:^| )bw(?= |$)/]],
        ['Сеньяк', 'Senjak'],
        ['Дединье', 'Dedinje'],
        ['Топчидер', 'Topčider'],
        ['Савамала', 'Savamala'],
        ['Сайам', 'Sajam', ['beogradski sajam']],
        ['Царева чуприя', 'Careva ćuprija'],
        ['Прокоп', 'Prokop'],
      ],
    },
    {
      name: 'Врачар', latin: 'Vračar',
      areas: [
        ['Црвени крст', 'Crveni krst'],
        ['Неимар', 'Neimar'],
        ['Славия', 'Slavija'],
        ['Чубура', 'Čubura'],
        ['Южный бульвар', 'Južni bulevar'],
        ['Каленич', 'Kalenić'],
      ],
    },
    {
      name: 'Новый Белград', latin: 'Novi Beograd',
      aliases: ['new belgrade'],
      extra: [/(?:^| )blok(?:ovi|u)? ?\d{1,2}(?= |$)/], // "Blok 45", "Blok45"
      areas: [
        ['Бежанийска коса', 'Bežanijska kosa'],
        ['Фонтана', 'Fontana'],
        ['Ледине', 'Ledine'],
        ['Павильони', 'Paviljoni'],
        ['Тошин бунар', 'Tošin bunar'],
        ['Савски насип', 'Savski nasip'],
        ['Белвиль', 'Belville', ['bellville', 'belvil']],
        ['Ушче', 'Ušće'],
        ['Студентски град', 'Studentski grad'],
      ],
    },
    {
      name: 'Земун', latin: 'Zemun',
      areas: [
        ['Гардош / Горни град', 'Gardoš', ['gornji grad']],
        ['Земун поле', 'Zemun polje'],
        ['Батайница', 'Batajnica'],
        ['Алтина', 'Altina'],
        ['Галеника', 'Galenika', ['nova galenika']],
        ['Калвария', 'Kalvarija'],
        ['Угриновци', 'Ugrinovci'],
      ],
    },
    {
      name: 'Звездара', latin: 'Zvezdara',
      areas: [
        ['Джерам', 'Đeram'],
        ['Лион', 'Lion'],
        ['Коньярник', 'Konjarnik'],
        ['Мириево', 'Mirijevo'],
        ['Мали Мокри Луг', 'Mali Mokri Lug'],
        ['Булбулдер', 'Bulbulder'],
        ['Цветкова пияца', 'Cvetkova pijaca'],
        ['Учительско насеље', 'Učiteljsko naselje'],
        ['Зелено брдо', 'Zeleno brdo'],
        ['Вуков споменик', 'Vukov spomenik'],
      ],
    },
    {
      name: 'Палилула', latin: 'Palilula',
      areas: [
        ['Ташмайдан', 'Tašmajdan'],
        ['Карабурма', 'Karaburma'],
        ['Вишница', 'Višnjica'],
        ['Вишничка баня', 'Višnjička banja'],
        ['Профессорска колония', 'Profesorska kolonija'],
        ['Хаджипоповац', 'Hadžipopovac'],
        ['Богословия', 'Bogoslovija'],
        ['Борча', 'Borča'],
        ['Крняча', 'Krnjača'],
        ['Котеж', 'Kotež'],
        ['Овча', 'Ovča'],
      ],
    },
    {
      name: 'Вождовац', latin: 'Voždovac',
      areas: [
        ['Автокоманда', 'Autokomanda'],
        ['Баница', 'Banjica'],
        ['Медакович', 'Medaković'],
        ['Браче Еркович', 'Braće Jerković'],
        ['Кумодраж', 'Kumodraž'],
        ['Яйинци', 'Jajinci'],
        ['Шумице', 'Šumice'],
        ['Душановац', 'Dušanovac'],
        ['Степа Степанович', 'Stepa Stepanović'],
        ['Трошарина', 'Trošarina'],
        ['Лекино брдо', 'Lekino brdo'],
        ['Бели поток', 'Beli potok'],
      ],
    },
    {
      name: 'Чукарица', latin: 'Čukarica',
      areas: [
        ['Баново брдо', 'Banovo brdo'],
        ['Жарково', 'Žarkovo'],
        ['Беле воде', 'Bele vode'],
        ['Церак', 'Cerak'],
        ['Церак виногради', 'Cerak vinogradi'],
        ['Юлино брдо', 'Julino brdo'],
        ['Ада Циганлия', 'Ada Ciganlija'],
        ['Гольф насеље', 'Golf naselje'],
        ['Чукаричка падина', 'Čukarička padina'],
        ['Филмски град', 'Filmski grad'],
        ['Железник', 'Železnik'],
        ['Сремчица', 'Sremčica'],
        ['Умка', 'Umka'],
      ],
    },
    {
      name: 'Раковица', latin: 'Rakovica',
      areas: [
        ['Канарево брдо', 'Kanarevo brdo'],
        ['Миляковац', 'Miljakovac'],
        ['Лабудово брдо', 'Labudovo brdo'],
        ['Видиковац', 'Vidikovac'],
        ['Ресник', 'Resnik'],
        ['Петлово брдо', 'Petlovo brdo'],
        ['Киево', 'Kijevo'],
        ['Кошутняк', 'Košutnjak'],
      ],
    },
    {
      // Пригородные общины: каждая — отдельная опция без подрайонов
      name: 'Пригороды', latin: null, areasAreMunicipalities: true,
      areas: [
        ['Сурчин', 'Surčin', ['jakovo', 'dobanovci', 'becmen']],
        ['Гроцка', 'Grocka'],
        ['Обреновац', 'Obrenovac'],
        ['Младеновац', 'Mladenovac'],
        ['Лазаревац', 'Lazarevac'],
        ['Бараево', 'Barajevo'],
        ['Сопот', 'Sopot'],
      ],
    },
  ];

  const OTHER_DISTRICT = 'Другое';

  // ---------- Типы отопления ----------

  /**
   * phrases — фразы, которые ищутся в любом месте текста (нормализованного),
   * codes   — короткие коды, которые принимаются только сразу после слова "grejanje"
   *           ("Grejanje: CG"), чтобы не ловить случайные "cg"/"gas" на странице.
   * Порядок важен: при нескольких совпадениях выигрывает тот, что выше.
   */
  const HEATING_TYPES = [
    { value: 'Центральное (CG)', short: '🔥 CG', phrases: ['centralno grejanje', 'daljinsko grejanje'], codes: ['cg'] },
    { value: 'Этажное (EG)', short: '🏠 EG', phrases: ['etazno grejanje'], codes: ['eg'] },
    { value: 'Газ', short: '🔵 Газ', phrases: ['gasno grejanje', 'grejanje na gas', 'gasni kotao'], codes: ['gas'] },
    { value: 'Тепловой насос', short: '♻️ Тепловой насос', phrases: ['toplotna pumpa', 'toplotnom pumpom'], codes: [] },
    { value: 'Тёплый пол', short: '🦶 Тёплый пол', phrases: ['podno grejanje'], codes: ['podno'] },
    { value: 'ТА-печь', short: '🧱 ТА-печь', phrases: ['ta pec', 'termoakumulacion'], codes: ['ta'] },
    { value: 'Норвежские радиаторы', short: '⚡ Норв. радиаторы', phrases: ['norvesk'], codes: [] },
    { value: 'Кондиционер / инвертор', short: '❄️ Инвертор', phrases: ['inverter', 'invertor'], codes: ['klima'] },
    { value: 'Электричество', short: '⚡ Электричество', phrases: ['grejanje na struju', 'elektricno grejanje'], codes: ['struja'] },
    { value: 'Твёрдое топливо', short: '🪵 Дрова/пеллеты', phrases: ['cvrsto gorivo', 'pelet', 'kotao na drva'], codes: ['drva'] },
    { value: 'Другое', short: '♨️ Другое', phrases: [], codes: [] },
  ];

  /** Значения из версии 1.0, которых больше нет в списке, — только для отображения. */
  const LEGACY_HEATING = { 'Электрическое (EG/Инвертор)': '⚡ EG / инвертор' };

  // ---------- Нормализация текста ----------

  // Сербская и русская кириллица → латиница (без диакритики)
  const CYR = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ё: 'e', ж: 'z', з: 'z', и: 'i', й: 'j',
    ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's',
    т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's', щ: 's', ъ: '',
    ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja',
  };

  /**
   * Приводит текст к виду "senjak savski venac": нижний регистр, латиница
   * без диакритики (č/ć→c, š→s, ž→z, đ→dj), всё кроме букв и цифр → пробел.
   * Так "Сењак", "SENJAK" и "Senjak," сравниваются одинаково.
   */
  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[Ѐ-ӿ]/g, (ch) => CYR[ch] ?? ch)
      .replace(/đ/g, 'dj')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Строит регулярку для названия с учётом сербских падежей:
   * "Senjak" найдёт "na Senjaku", "Dedinje" — "na Dedinju", "Vračar" — "Vračaru".
   * Для коротких слов (Lion, Umka, Ovča) — только точное совпадение.
   */
  function nameRegex(name) {
    const words = normalize(name).split(' ');
    const last = words.pop();
    const stem = last.length >= 6 && /[aeiou]$/.test(last) ? last.slice(0, -1) : last;
    const suffix = last.length >= 5 ? '[a-z]{0,3}' : '';
    return new RegExp(`(?:^| )${[...words, stem].map(escapeRe).join(' ')}${suffix}(?= |$)`);
  }

  // ---------- Индексы для поиска ----------

  /** Плоский список всех вариантов района с регулярками и уровнем (m — община, a — район). */
  const DISTRICT_ENTRIES = [];
  const GROUP_OF = new Map(); // название района → название группы

  for (const group of DISTRICT_GROUPS) {
    if (group.latin) {
      DISTRICT_ENTRIES.push({
        value: group.name,
        group: group.name,
        level: 'm',
        res: [group.latin, ...(group.aliases || [])].map(nameRegex).concat(group.extra || []),
      });
      GROUP_OF.set(group.name, group.name);
    }
    for (const [name, latin, aliases = [], extra = []] of group.areas) {
      DISTRICT_ENTRIES.push({
        value: name,
        group: group.name,
        level: group.areasAreMunicipalities ? 'm' : 'a',
        res: [latin, ...aliases].map(nameRegex).concat(extra),
      });
      GROUP_OF.set(name, group.name);
    }
  }

  /** Все совпадения районов в одном тексте: [{entry, index, length}] */
  function findDistrictHits(text) {
    const norm = normalize(text);
    if (!norm) return [];
    const hits = [];
    for (const entry of DISTRICT_ENTRIES) {
      for (const re of entry.res) {
        const m = re.exec(norm);
        if (m) {
          hits.push({ entry, index: m.index, length: m[0].trim().length });
          break;
        }
      }
    }
    return hits;
  }

  /**
   * Определяет район по нескольким источникам в порядке приоритета
   * (например: [блок адреса, заголовок, описание]).
   * Конкретный район (Сеньяк) важнее общины (Савски венац); при нескольких
   * районах побеждает более длинное название (Церак виногради > Церак).
   * Если в адресе найдена только община, район из заголовка принимается,
   * лишь если он из той же общины.
   */
  function detectDistrict(sources) {
    let municipality = null;

    for (const src of sources) {
      const hits = findDistrictHits(src);
      const areas = hits
        .filter((h) => h.entry.level === 'a')
        .filter((h) => !municipality || h.entry.group === municipality.group)
        .sort((x, y) => y.length - x.length || x.index - y.index);
      if (areas.length) return areas[0].entry.value;

      if (!municipality) {
        const muni = hits.filter((h) => h.entry.level === 'm').sort((x, y) => x.index - y.index)[0];
        if (muni) municipality = muni.entry;
      }
    }
    return municipality?.value || '';
  }

  /** Определяет тип отопления по тексту объявления. */
  function detectHeating(text) {
    const norm = normalize(text);
    if (!norm) return '';
    for (const type of HEATING_TYPES) {
      const byPhrase = type.phrases.some((p) => new RegExp(`(?:^| )${escapeRe(p)}`).test(norm));
      const byCode = type.codes.length &&
        new RegExp(`grejanje (?:je )?(?:${type.codes.map(escapeRe).join('|')})(?= |$)`).test(norm);
      if (byPhrase || byCode) return type.value;
    }
    return '';
  }

  // ---------- Комнаты и площадь ----------

  /** Варианты комнатности как в Сербии: 0.5 = гарсоньера, 2.5 = "двоипособан", 5 = 5 и больше. */
  const ROOM_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

  /** "Garsonjera", "dvoiposoban", "trosoban" → число комнат. */
  const ROOM_WORDS = [
    [/garsonjer/, 0.5], [/jednoiposob/, 1.5], [/jednosob/, 1],
    [/dvoiposob/, 2.5], [/dvosob/, 2], [/troiposob/, 3.5], [/trosob/, 3],
    [/cetvoroiposob/, 4.5], [/cetvorosob/, 4], [/petosob|visesob/, 5],
  ];

  /** Приводит число к ближайшему варианту из ROOM_OPTIONS (5+ → 5). */
  function roundRooms(n) {
    const num = Number(String(n).replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.min(5, Math.max(0.5, Math.round(num * 2) / 2));
  }

  /**
   * Комнаты из текста: "Broj soba: 2.5", "Struktura 3.0", "Moderan 4.0 stan",
   * "dvosoban stan", "garsonjera".
   */
  function detectRooms(text) {
    const raw = String(text || '');
    const labeled = raw.match(/(?:broj soba|struktura|sobnost|број соба|структура)\s*:?\s*(\d(?:[.,]\d)?\+?)/i);
    if (labeled) return roundRooms(labeled[1]);
    const inTitle = raw.match(/(?:^|[\s,])(\d)[.,]([05])\+?\s*(?:stan|sob|str|soban|-?soban)/i);
    if (inTitle) return roundRooms(`${inTitle[1]}.${inTitle[2]}`);
    const norm = normalize(raw);
    return ROOM_WORDS.find(([re]) => re.test(norm))?.[1] ?? null;
  }

  /** Площадь из текста: "Kvadratura 105 m2", "Površina: 64,5 m²", "65m2". */
  function detectArea(text) {
    const raw = String(text || '');
    const labeled = raw.match(/(?:kvadratura|povr[šs]ina|квадратура|површина)\s*:?\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
    const plain = raw.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s?(?:m2|m²|kvm|м2|м²)(?![a-z])/i);
    const value = parseFloat((labeled || plain)?.[1]?.replace(',', '.'));
    return value >= 10 && value <= 1000 ? Math.round(value * 10) / 10 : null;
  }

  /** 0.5 → "гарсоньера", 2.5 → "2.5 комн.", 5 → "5+ комн." */
  function formatRooms(n) {
    if (n == null || n === '') return '';
    const num = Number(n);
    if (num === 0.5) return 'гарсоньера';
    return `${num >= 5 ? '5+' : String(num).replace('.', ',')} комн.`;
  }

  // ---------- Хелперы для UI ----------

  /** Название группы (общины) для района; '' для "Другое" и неизвестных значений. */
  const groupOf = (district) => GROUP_OF.get(district) || '';

  /** Короткая подпись отопления для карточек. */
  const heatingShort = (value) =>
    HEATING_TYPES.find((h) => h.value === value)?.short || LEGACY_HEATING[value] || value;

  /** Заполняет <select> районами с группами <optgroup>. */
  function fillDistrictSelect(select, { includeWhole = true } = {}) {
    for (const group of DISTRICT_GROUPS) {
      const og = document.createElement('optgroup');
      og.label = group.name;
      if (group.latin && includeWhole) og.append(new Option(`${group.name} (весь)`, group.name));
      for (const [name, latin] of group.areas) og.append(new Option(`${name} · ${latin}`, name));
      select.append(og);
    }
    select.append(new Option(OTHER_DISTRICT, OTHER_DISTRICT));
  }

  /** Если значения нет среди опций (старая запись), добавляет его, чтобы не потерять. */
  function ensureOption(select, value) {
    if (value && ![...select.options].some((o) => o.value === value)) {
      select.append(new Option(value, value));
    }
  }

  globalThis.FlatHunter = Object.freeze({
    STATUSES,
    DISTRICT_GROUPS,
    OTHER_DISTRICT,
    HEATING_TYPES,
    normalize,
    detectDistrict,
    detectHeating,
    ROOM_OPTIONS,
    detectRooms,
    detectArea,
    roundRooms,
    formatRooms,
    groupOf,
    heatingShort,
    fillDistrictSelect,
    ensureOption,
  });
})();
