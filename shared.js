/* DASTIN local catalogue — no server required. Data lives in IndexedDB for this browser/origin. */
(function () {
  'use strict';

  const DB_NAME = 'dastin-catalogue';
  const DB_VERSION = 1;
  const imageURLs = new Map();
  const inStudio = /\/studio-dastin(?:\/|$)/.test(window.location.pathname);
  const assetPrefix = inStudio ? '../assets/' : 'assets/';
  const cataloguePath = inStudio ? '../catalogue.json' : 'catalogue.json';
  const categories = {
    burger: 'برگر',
    sausage: 'دودی و سوسیس',
    cake: 'کیک و شیرینی',
    fingerfood: 'فینگر فود'
  };

  const defaults = [
    { id: 'burger-smoky-mix', title: 'برگر میکس دودی', category: 'burger', price: '۳۴۰ هزار تومان', weight: '۲۵۰ گرم', copyright: '© DASTIN / تصویر اختصاصی', description: 'برگر دست‌ساز با ترکیب گوشت تازه، ادویه‌های اختصاصی و عطر لطیف دود. برای آن شب‌هایی که یک برگر معمولی کافی نیست', imageId: 'default-burger', order: 10, createdAt: 1704067200000 },
    { id: 'sausage-oak-smoked', title: 'سوسیس دودی بلوط', category: 'sausage', price: '۲۸۰ هزار تومان', weight: '۴۰۰ گرم', copyright: '© DASTIN / تصویر اختصاصی', description: 'گوشت انتخاب‌شده، بافت دلچسب و دود آرام چوب طبیعی بلوط؛ مزه‌ای عمیق و ماندگار برای صبحانه و ساندویچ‌های جدی', imageId: 'default-sausage', order: 20, createdAt: 1704153600000 },
    { id: 'cake-pistachio', title: 'کیک پسته و زعفران', category: 'cake', price: '۳۹۰ هزار تومان', weight: '۷۰۰ گرم', copyright: '© DASTIN / تصویر اختصاصی', description: 'کیک خانگی لطیف با پسته‌ی فراوان و زعفران خوش‌عطر؛ شیرینیِ متعادل برای عصرانه‌ای که باید کمی خاص‌تر باشد', imageId: 'default-cake', order: 30, createdAt: 1704240000000 },
    { id: 'finger-food-party', title: 'باکس دورهمی', category: 'fingerfood', price: '۴۸۰ هزار تومان', weight: '۱۲۰۰ گرم', copyright: '© DASTIN / تصویر اختصاصی', description: 'یک باکس پر از لقمه‌های کوچک و خوش‌رنگ که برای به اشتراک گذاشتن ساخته شده‌اند؛ تازه، مرتب و آماده‌ی مهمانی', imageId: 'default-finger-food', order: 40, createdAt: 1704326400000 }
  ];
  const defaultImages = {
    'default-burger': 'product-burger.jpg',
    'default-sausage': 'product-sausage.jpg',
    'default-cake': 'product-cake.jpg',
    'default-finger-food': 'product-finger-food.jpg'
  };
  const defaultSettings = {
    instagramText: '@dastin.food', instagramUrl: 'https://instagram.com/dastin.food',
    whatsappText: 'واتساپ دستین', whatsappUrl: 'https://wa.me/989000000000',
    baleText: 'پیام‌رسان بله', baleUrl: 'https://ble.ir/',
    telegramText: '@dastin_food', telegramUrl: 'https://t.me/dastin_food',
    emailText: 'hello@dastin.food', emailUrl: 'hello@dastin.food'
  };
  const defaultShowcase = {
    headingFirst: 'یک مزه،',
    headingAccent: 'حالِ خوب',
    description: 'از مهمانی‌های شلوغ تا یک عصرانه‌ی دو نفره، برای هر حال‌وهوایی چیزی خوش‌طعم داریم',
    cards: [
      { id: 'cake', label: 'شیرین / لطیف', title: 'کیک های خوشمزه', imageId: '', imagePath: 'assets/product-cake.jpg' },
      { id: 'burger', label: 'آبدار / دست‌ساز', title: 'برگر های لذیذ', imageId: '', imagePath: 'assets/product-burger.jpg' },
      { id: 'coldcuts', label: 'تازه / دست‌ساز', title: 'سوسیس و کالباس خانگی', imageId: '', imagePath: 'assets/product-cold-cuts.jpg' }
    ],
    notes: ['کیک و شیرینی های رژیمی و فوق‌العاده', 'برگر های لذیذ', 'سوسیس و کالباس خانگی']
  };

  let dbPromise;
  let publishedCataloguePromise;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB باز نشد.'));
    });
    return dbPromise;
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('خطا در ذخیره‌سازی داده'));
    });
  }
  async function transaction(stores, mode, worker) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('تراکنش کامل نشد.'));
      tx.onabort = () => reject(tx.error || new Error('تراکنش لغو شد.'));
      Promise.resolve(worker(tx)).then((value) => { result = value; }).catch((error) => { try { tx.abort(); } catch (_) {} reject(error); });
    });
  }

  async function init() {
    await openDB();
    const seeded = await transaction(['meta'], 'readonly', tx => requestAsPromise(tx.objectStore('meta').get('seeded')));
    if (seeded && seeded.value) return;
    await transaction(['products', 'meta'], 'readwrite', tx => {
      const store = tx.objectStore('products');
      defaults.forEach(product => store.put({ ...product }));
      tx.objectStore('meta').put({ key: 'seeded', value: true, seededAt: Date.now() });
    });
  }

  async function list() {
    await init();
    const rows = await transaction(['products'], 'readonly', tx => requestAsPromise(tx.objectStore('products').getAll()));
    return rows.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }
  async function get(id) {
    await init();
    return transaction(['products'], 'readonly', tx => requestAsPromise(tx.objectStore('products').get(id)));
  }
  async function getSettings() {
    await init();
    const row = await transaction(['meta'], 'readonly', tx => requestAsPromise(tx.objectStore('meta').get('settings')));
    if (row && row.value) return { ...defaultSettings, ...row.value };
    await transaction(['meta'], 'readwrite', tx => { tx.objectStore('meta').put({ key: 'settings', value: { ...defaultSettings }, updatedAt: Date.now() }); });
    return { ...defaultSettings };
  }
  async function saveSettings(patch) {
    const next = {};
    Object.keys(defaultSettings).forEach(key => { next[key] = cleanText(patch[key], 220) || defaultSettings[key]; });
    await transaction(['meta'], 'readwrite', tx => {
      tx.objectStore('meta').put({ key: 'settings', value: next, updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'localChanges', value: true, updatedAt: Date.now() });
    });
    return next;
  }
  function normaliseShowcase(input) {
    const source = input || {};
    const sourceCards = Array.isArray(source.cards) ? source.cards : [];
    return {
      headingFirst: cleanText(source.headingFirst, 90) || defaultShowcase.headingFirst,
      headingAccent: cleanText(source.headingAccent, 90) || defaultShowcase.headingAccent,
      description: cleanText(source.description, 400) || defaultShowcase.description,
      cards: defaultShowcase.cards.map(base => {
        const card = sourceCards.find(item => item && item.id === base.id) || {};
        const imageId = cleanText(card.imageId, 120);
        const imagePath = cleanText(card.imagePath, 220);
        return {
          id: base.id,
          label: cleanText(card.label, 80) || base.label,
          title: cleanText(card.title, 100) || base.title,
          imageId,
          imagePath: imagePath || (imageId ? '' : base.imagePath)
        };
      }),
      notes: defaultShowcase.notes.map((note, index) => cleanText((source.notes || [])[index], 180) || note)
    };
  }
  async function getShowcase() {
    await init();
    const row = await transaction(['meta'], 'readonly', tx => requestAsPromise(tx.objectStore('meta').get('showcase')));
    return normaliseShowcase(row && row.value);
  }
  async function saveShowcase(input, imageUpdates = {}) {
    const next = normaliseShowcase(input);
    await transaction(['meta', 'media'], 'readwrite', tx => {
      next.cards.forEach(card => {
        const image = imageUpdates[card.id];
        if (image && image.blob instanceof Blob) {
          const imageId = 'showcase-' + card.id;
          clearImageCache(imageId);
          card.imageId = imageId;
          card.imagePath = '';
          tx.objectStore('media').put({ id: imageId, blob: image.blob, name: image.name || (card.id + '.webp'), updatedAt: Date.now() });
        }
      });
      tx.objectStore('meta').put({ key: 'showcase', value: next, updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'localChanges', value: true, updatedAt: Date.now() });
    });
    return next;
  }
  async function markLocalChanges() {
    await transaction(['meta'], 'readwrite', tx => { tx.objectStore('meta').put({ key: 'localChanges', value: true, updatedAt: Date.now() }); });
  }
  async function hasLocalChanges() {
    const row = await transaction(['meta'], 'readonly', tx => requestAsPromise(tx.objectStore('meta').get('localChanges')));
    return Boolean(row && row.value);
  }
  async function fetchPublishedCatalogue() {
    if (!publishedCataloguePromise) {
      publishedCataloguePromise = (async () => {
        try {
          const response = await fetch(cataloguePath, { cache: 'no-cache' });
          if (!response.ok) return null;
          const data = await response.json();
          if (!data || data.format !== 'dastin-public-catalogue' || !Array.isArray(data.products)) return null;
          return data;
        } catch (_) { return null; }
      })();
    }
    return publishedCataloguePromise;
  }
  async function listForPublic() {
    await init();
    if (await hasLocalChanges()) return list();
    const published = await fetchPublishedCatalogue();
    if (!published) return list();
    return published.products.slice().sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }
  async function getSettingsForPublic() {
    await init();
    if (await hasLocalChanges()) return getSettings();
    const published = await fetchPublishedCatalogue();
    return published && published.settings ? { ...defaultSettings, ...published.settings } : getSettings();
  }
  async function getShowcaseForPublic() {
    await init();
    if (await hasLocalChanges()) return getShowcase();
    const published = await fetchPublishedCatalogue();
    return normaliseShowcase(published && published.showcase);
  }
  async function syncPublishedForAdmin() {
    await init();
    if (await hasLocalChanges()) return list();
    const published = await fetchPublishedCatalogue();
    if (!published) return list();
    const safeProducts = published.products.map(product => ({
      id: cleanText(product.id, 100) || ('p-' + Math.random().toString(36).slice(2)),
      imageId: cleanText(product.imageId, 110), imagePath: cleanText(product.imagePath, 220),
      title: cleanText(product.title, 80), category: categories[product.category] ? product.category : 'fingerfood',
      price: cleanText(product.price, 70), weight: cleanText(product.weight, 70), copyright: cleanText(product.copyright, 140), description: cleanText(product.description, 800),
      order: Number(product.order) || 10, createdAt: Number(product.createdAt) || Date.now(), updatedAt: Number(product.updatedAt) || undefined
    })).filter(product => product.title && product.imageId);
    await transaction(['products', 'media', 'meta'], 'readwrite', tx => {
      tx.objectStore('products').clear(); tx.objectStore('media').clear();
      safeProducts.forEach(product => tx.objectStore('products').put(product));
      tx.objectStore('meta').put({ key: 'settings', value: { ...defaultSettings, ...(published.settings || {}) }, updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'showcase', value: normaliseShowcase(published.showcase), updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'seeded', value: true, seededAt: Date.now() });
    });
    return list();
  }
  async function getImageURL(imageId, explicitPath) {
    if (explicitPath) {
      if (/^(https?:|blob:|data:|\/)/i.test(explicitPath)) return explicitPath;
      return inStudio ? '../' + explicitPath : explicitPath;
    }
    if (!imageId) return '';
    if (defaultImages[imageId]) return assetPrefix + defaultImages[imageId];
    if (imageURLs.has(imageId)) return imageURLs.get(imageId);
    const media = await transaction(['media'], 'readonly', tx => requestAsPromise(tx.objectStore('media').get(imageId)));
    if (!media || !media.blob) return '';
    const url = URL.createObjectURL(media.blob);
    imageURLs.set(imageId, url);
    return url;
  }
  function clearImageCache(imageId) {
    if (imageURLs.has(imageId)) {
      URL.revokeObjectURL(imageURLs.get(imageId));
      imageURLs.delete(imageId);
    }
  }
  async function add(input) {
    await init();
    const rows = await list();
    const id = 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const imageId = 'm-' + id;
    const record = {
      id, imageId,
      title: cleanText(input.title, 80),
      category: categories[input.category] ? input.category : 'fingerfood',
      price: cleanText(input.price, 70),
      weight: cleanText(input.weight, 70),
      copyright: cleanText(input.copyright, 140),
      description: cleanText(input.description, 800),
      order: rows.length ? Math.max(...rows.map(p => Number(p.order) || 0)) + 10 : 10,
      createdAt: Date.now()
    };
    if (!record.title || !record.price || !record.weight || !record.copyright || !record.description || !(input.imageBlob instanceof Blob)) throw new Error('همهٔ اطلاعات و تصویر را کامل کنید.');
    await transaction(['products', 'media'], 'readwrite', tx => {
      tx.objectStore('media').put({ id: imageId, blob: input.imageBlob, name: input.imageName || 'image.webp', updatedAt: Date.now() });
      tx.objectStore('products').put(record);
    });
    await markLocalChanges();
    return record;
  }
  async function update(id, patch) {
    await init();
    const old = await get(id);
    if (!old) throw new Error('این آیتم پیدا نشد.');
    const hasNewImage = patch.imageBlob instanceof Blob;
    const targetImageId = hasNewImage && defaultImages[old.imageId] ? ('m-' + old.id) : old.imageId;
    const next = {
      ...old,
      imageId: targetImageId,
      imagePath: hasNewImage ? undefined : old.imagePath,
      title: cleanText(patch.title, 80),
      category: categories[patch.category] ? patch.category : old.category,
      price: cleanText(patch.price, 70),
      weight: cleanText(patch.weight, 70),
      copyright: cleanText(patch.copyright, 140),
      description: cleanText(patch.description, 800),
      updatedAt: Date.now()
    };
    if (!next.title || !next.price || !next.weight || !next.copyright || !next.description) throw new Error('همهٔ فیلدهای اطلاعاتی ضروری‌اند.');
    await transaction(['products', 'media'], 'readwrite', tx => {
      tx.objectStore('products').put(next);
      if (hasNewImage) {
        clearImageCache(old.imageId);
        tx.objectStore('media').put({ id: targetImageId, blob: patch.imageBlob, name: patch.imageName || 'image.webp', updatedAt: Date.now() });
      }
    });
    await markLocalChanges();
    return next;
  }
  async function remove(id) {
    await init();
    const record = await get(id);
    if (!record) return;
    await transaction(['products', 'media'], 'readwrite', tx => {
      tx.objectStore('products').delete(id);
      if (!defaultImages[record.imageId]) tx.objectStore('media').delete(record.imageId);
    });
    clearImageCache(record.imageId);
    await markLocalChanges();
  }
  async function move(id, direction) {
    const rows = await list();
    const at = rows.findIndex(row => row.id === id);
    const target = at + direction;
    if (at < 0 || target < 0 || target >= rows.length) return false;
    const a = rows[at], b = rows[target];
    await transaction(['products'], 'readwrite', tx => {
      tx.objectStore('products').put({ ...a, order: b.order });
      tx.objectStore('products').put({ ...b, order: a.order });
    });
    await markLocalChanges();
    return true;
  }

  function cleanText(value, max) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
  function categoryLabel(key) { return categories[key] || 'دسته‌بندی نشده'; }

  async function optimizeImage(file) {
    if (!(file instanceof Blob)) throw new Error('فایل تصویر معتبر نیست');
    if (!/^image\/(jpeg|png|webp|avif)$/i.test(file.type)) throw new Error('فقط تصویر JPG، PNG، WEBP یا AVIF قابل قبول است');
    if (file.size > 12 * 1024 * 1024) throw new Error('حجم تصویر باید کمتر از ۱۲ مگابایت باشد');
    let source;
    try { source = await createImageBitmap(file); } catch (_) {
      source = await loadImage(file);
    }
    const originalWidth = source.width || source.naturalWidth;
    const originalHeight = source.height || source.naturalHeight;
    const scale = Math.min(1, 1800 / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    if (typeof source.close === 'function') source.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .86));
    if (!blob) throw new Error('فشرده‌سازی تصویر انجام نشد.');
    return { blob, name: (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp', width, height };
  }
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('خواندن تصویر ممکن نشد.')); };
      image.src = url;
    });
  }
  function fileAsDataURL(blob) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  }
  function dataURLAsBlob(dataURL) {
    const [meta, encoded] = String(dataURL).split(',');
    const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/webp';
    const binary = atob(encoded); const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  async function createBackup() {
    const products = await list();
    const settings = await getSettings();
    const showcase = await getShowcase();
    const media = {};
    const mediaIds = [
      ...products.filter(product => !defaultImages[product.imageId]).map(product => product.imageId),
      ...showcase.cards.map(card => card.imageId).filter(Boolean)
    ];
    for (const imageId of new Set(mediaIds)) {
      const record = await transaction(['media'], 'readonly', tx => requestAsPromise(tx.objectStore('media').get(imageId)));
      if (record && record.blob) media[imageId] = { name: record.name, dataURL: await fileAsDataURL(record.blob) };
    }
    return { format: 'dastin-catalogue', version: 3, exportedAt: new Date().toISOString(), products, settings, showcase, media };
  }
  async function createGitExport() {
    const products = await list();
    const settings = await getSettings();
    const showcase = await getShowcase();
    const downloads = [];
    const exportMedia = async (entry, label) => {
      if (!entry.imageId) return;
      const media = await transaction(['media'], 'readonly', tx => requestAsPromise(tx.objectStore('media').get(entry.imageId)));
      if (media && media.blob) {
        const filename = entry.imageId + '.webp';
        entry.imagePath = 'assets/uploads/' + filename;
        downloads.push({ filename, blob: media.blob });
      } else if (!entry.imagePath) {
        throw new Error('فایل تصویر «' + label + '» پیدا نشد.');
      }
    };
    for (const product of products) {
      if (defaultImages[product.imageId]) product.imagePath = 'assets/' + defaultImages[product.imageId];
      else await exportMedia(product, product.title);
    }
    for (const card of showcase.cards) await exportMedia(card, card.title);
    return { manifest: { format: 'dastin-public-catalogue', version: 1, exportedAt: new Date().toISOString(), settings, showcase, products }, downloads };
  }
  async function restoreBackup(backup) {
    if (!backup || backup.format !== 'dastin-catalogue' || !Array.isArray(backup.products)) throw new Error('فایل پشتیبان دستین معتبر نیست');
    const safeProducts = backup.products.map(product => ({
      id: cleanText(product.id, 100) || ('p-' + Math.random().toString(36).slice(2)),
      imageId: cleanText(product.imageId, 110), imagePath: cleanText(product.imagePath, 220),
      title: cleanText(product.title, 80), category: categories[product.category] ? product.category : 'fingerfood',
      price: cleanText(product.price, 70), weight: cleanText(product.weight, 70), copyright: cleanText(product.copyright, 140), description: cleanText(product.description, 800),
      order: Number(product.order) || 10, createdAt: Number(product.createdAt) || Date.now(), updatedAt: Number(product.updatedAt) || undefined
    })).filter(product => product.title && product.imageId);
    await transaction(['products', 'media', 'meta'], 'readwrite', tx => {
      tx.objectStore('products').clear(); tx.objectStore('media').clear();
      safeProducts.forEach(product => tx.objectStore('products').put(product));
      Object.entries(backup.media || {}).forEach(([id, item]) => {
        if (item && item.dataURL && !defaultImages[id]) tx.objectStore('media').put({ id, name: cleanText(item.name, 120), blob: dataURLAsBlob(item.dataURL), updatedAt: Date.now() });
      });
      tx.objectStore('meta').put({ key: 'seeded', value: true, seededAt: Date.now() });
      tx.objectStore('meta').put({ key: 'settings', value: { ...defaultSettings, ...(backup.settings || {}) }, updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'showcase', value: normaliseShowcase(backup.showcase), updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'localChanges', value: true, updatedAt: Date.now() });
    });
    imageURLs.forEach(url => URL.revokeObjectURL(url)); imageURLs.clear();
  }

  window.DastinStore = { init, list, listForPublic, syncPublishedForAdmin, get, getImageURL, getSettings, getSettingsForPublic, saveSettings, getShowcase, getShowcaseForPublic, saveShowcase, add, update, remove, move, categoryLabel, categories, optimizeImage, createBackup, createGitExport, restoreBackup, cleanText };
}());
