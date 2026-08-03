(function () {
  'use strict';

  const ACCESS_KEY = 'dastin-studio-authorized';
  // This only gates the UI. Use Cloudflare Access for real protection on a public deployment.
  const PASSWORD_HASH = 'd76f201a488bec5c1373e096ab78d6cba55a5d012cdc4cdf4ed1b4c51886f89a';
  const PAGE_SIZE = 30;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const loginView = $('#login-view');
  const adminView = $('#admin-view');
  const form = $('#product-form');
  const formStatus = $('#form-status');
  const list = $('#admin-product-list');
  const loadMoreButton = $('#load-more');
  let products = [];
  let renderedCount = PAGE_SIZE;
  let pendingImage = null;
  let localPreviewURL = null;
  let currentShowcase = null;

  function toFaNumber(value) { return new Intl.NumberFormat('fa-IR').format(value); }
  function setStatus(message, error = false) {
    formStatus.textContent = message || '';
    formStatus.classList.toggle('is-error', Boolean(error));
  }
  function setPreview(url, ownsURL = false) {
    const preview = $('#image-preview');
    if (localPreviewURL) { URL.revokeObjectURL(localPreviewURL); localPreviewURL = null; }
    if (url) {
      if (ownsURL) localPreviewURL = url;
      preview.src = url; preview.hidden = false; $('#upload-icon').hidden = true; $('#upload-title').textContent = 'برای تغییر، تصویر تازه انتخاب کنید';
    } else { preview.removeAttribute('src'); preview.hidden = true; $('#upload-icon').hidden = false; $('#upload-title').textContent = 'انتخاب تصویر'; }
  }
  async function showStudio() {
    loginView.hidden = true;
    adminView.hidden = false;
    try { await DastinStore.syncPublishedForAdmin(); } catch (_) { /* Offline preview falls back to local data. */ }
    refreshProducts();
    loadContactSettings();
    loadShowcaseSettings();
  }
  async function digest(value) {
    if (!(window.crypto && crypto.subtle)) throw new Error('این مرورگر از ورود امن پشتیبانی نمی‌کند.');
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function initLogin() {
    if (sessionStorage.getItem(ACCESS_KEY) === '1') { showStudio(); return; }
    $('#toggle-password').addEventListener('click', () => {
      const input = $('#admin-password'); const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      $('#toggle-password').setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
    });
    $('#login-form').addEventListener('submit', async event => {
      event.preventDefault();
      const error = $('#login-error'); error.hidden = true;
      try {
        const submitted = await digest($('#admin-password').value);
        if (submitted !== PASSWORD_HASH) { error.hidden = false; return; }
        sessionStorage.setItem(ACCESS_KEY, '1'); showStudio();
      } catch (_) { error.textContent = 'ورود در این مرورگر ممکن نیست.'; error.hidden = false; }
    });
  }

  function productRow(product, index) {
    const item = document.createElement('article'); item.className = 'admin-product';
    const media = document.createElement('div'); media.className = 'admin-product__image';
    const image = new Image(); image.alt = product.title; image.loading = 'lazy'; media.append(image);
    DastinStore.getImageURL(product.imageId, product.imagePath).then(url => { if (url && item.isConnected) image.src = url; });
    const data = document.createElement('div'); data.className = 'admin-product__data';
    const meta = document.createElement('div'); meta.className = 'admin-product__meta';
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
    const category = document.createElement('span'); category.textContent = DastinStore.categoryLabel(product.category);
    const price = document.createElement('span'); price.textContent = product.price;
    meta.append(number, category, price);
    const title = document.createElement('h3'); title.textContent = product.title;
    const description = document.createElement('p'); description.textContent = product.description;
    data.append(meta, title, description);
    const actions = document.createElement('div'); actions.className = 'admin-product__actions';
    actions.append(
      actionButton('ویرایش «' + product.title + '»', '✎', () => editProduct(product)),
      actionButton('بردن به جایگاه بالاتر', '↑', () => moveProduct(product.id, -1), index === 0),
      actionButton('بردن به جایگاه پایین‌تر', '↓', () => moveProduct(product.id, 1), index === products.length - 1),
      actionButton('حذف «' + product.title + '»', '×', () => deleteProduct(product), false, true)
    );
    item.append(media, data, actions);
    return item;
  }
  function actionButton(label, symbol, callback, disabled = false, destructive = false) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button' + (destructive ? ' icon-button--delete' : ''); button.textContent = symbol; button.title = label; button.setAttribute('aria-label', label); button.disabled = disabled; button.addEventListener('click', callback); return button;
  }
  function renderList() {
    list.replaceChildren();
    const visible = products.slice(0, renderedCount);
    const fragment = document.createDocumentFragment(); visible.forEach((product, index) => fragment.append(productRow(product, index))); list.append(fragment);
    $('#product-count').textContent = toFaNumber(products.length);
    $('#admin-empty').hidden = products.length !== 0;
    loadMoreButton.hidden = renderedCount >= products.length;
    if (!loadMoreButton.hidden) loadMoreButton.textContent = 'نمایش ' + toFaNumber(Math.min(PAGE_SIZE, products.length - renderedCount)) + ' مورد بیشتر ↓';
  }
  async function refreshProducts(keepVisible = false) {
    products = await DastinStore.list();
    if (!keepVisible) renderedCount = PAGE_SIZE;
    renderList();
  }
  async function moveProduct(id, direction) {
    try { await DastinStore.move(id, direction); await refreshProducts(true); } catch (error) { alert(error.message || 'تغییر ترتیب انجام نشد.'); }
  }
  async function deleteProduct(product) {
    if (!confirm('«' + product.title + '» و تصویر آن حذف شود؟ این کار قابل بازگشت نیست.')) return;
    try {
      await DastinStore.remove(product.id);
      if ($('#product-id').value === product.id) resetForm();
      await refreshProducts(true);
    } catch (error) { alert(error.message || 'حذف انجام نشد.'); }
  }

  async function editProduct(product) {
    $('#product-id').value = product.id;
    $('#product-title').value = product.title;
    $('#product-category').value = product.category;
    $('#product-price').value = product.price;
    $('#product-weight').value = product.weight;
    $('#product-copyright').value = product.copyright;
    $('#product-description').value = product.description;
    $('#editor-title').textContent = 'ویرایش طعم';
    $('#edit-mode-badge').hidden = false;
    $('#cancel-edit').hidden = false;
    $('#save-product').innerHTML = 'ذخیره تغییرات <b>←</b>';
    $('#image-required').hidden = true;
    $('#product-image').value = '';
    pendingImage = null;
    setStatus('بدون انتخاب تصویر تازه، عکس فعلی حفظ می‌شود.');
    try { setPreview(await DastinStore.getImageURL(product.imageId, product.imagePath)); } catch (_) { setPreview(''); }
    $('.editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resetForm() {
    form.reset();
    $('#product-id').value = '';
    $('#editor-title').textContent = 'افزودن طعم جدید';
    $('#edit-mode-badge').hidden = true;
    $('#cancel-edit').hidden = true;
    $('#save-product').innerHTML = 'ثبت محصول <b>←</b>';
    $('#image-required').hidden = false;
    pendingImage = null;
    setPreview(''); setStatus('');
  }
  function initForm() {
    $('#product-image').addEventListener('change', async event => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      setStatus('در حال بهینه‌سازی تصویر...');
      try {
        const result = await DastinStore.optimizeImage(file);
        pendingImage = result;
        setPreview(URL.createObjectURL(result.blob), true);
        const size = Math.round(result.blob.size / 1024);
        setStatus('آمادهٔ ذخیره · WEBP · ' + toFaNumber(size) + ' کیلوبایت');
      } catch (error) {
        event.target.value = ''; pendingImage = null; setPreview(''); setStatus(error.message || 'تصویر آماده نشد.', true);
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const editingId = $('#product-id').value;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (!editingId && !pendingImage) { setStatus('برای محصول تازه، انتخاب تصویر ضروری است.', true); return; }
      const payload = { title: $('#product-title').value, category: $('#product-category').value, price: $('#product-price').value, weight: $('#product-weight').value, copyright: $('#product-copyright').value, description: $('#product-description').value };
      if (pendingImage) { payload.imageBlob = pendingImage.blob; payload.imageName = pendingImage.name; }
      const saveButton = $('#save-product'); saveButton.disabled = true; setStatus('در حال ذخیره...');
      try {
        if (editingId) await DastinStore.update(editingId, payload); else await DastinStore.add(payload);
        resetForm(); await refreshProducts(); setStatus('با موفقیت ذخیره شد.');
      } catch (error) { setStatus(error.message || 'ذخیره انجام نشد.', true); }
      finally { saveButton.disabled = false; }
    });
    $('#cancel-edit').addEventListener('click', resetForm);
  }

  async function loadContactSettings() {
    try {
      const settings = await DastinStore.getSettings();
      $('#setting-instagram-text').value = settings.instagramText;
      $('#setting-instagram-url').value = settings.instagramUrl;
      $('#setting-whatsapp-text').value = settings.whatsappText;
      $('#setting-whatsapp-url').value = settings.whatsappUrl;
      $('#setting-bale-text').value = settings.baleText;
      $('#setting-bale-url').value = settings.baleUrl;
      $('#setting-telegram-text').value = settings.telegramText;
      $('#setting-telegram-url').value = settings.telegramUrl;
      $('#setting-email-text').value = settings.emailText;
      $('#setting-email-url').value = settings.emailUrl;
    } catch (error) { $('#settings-status').textContent = 'بارگذاری تنظیمات انجام نشد.'; $('#settings-status').classList.add('is-error'); }
  }
  function initContactSettings() {
    $('#contact-settings-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button'); const status = $('#settings-status');
      const payload = {
        instagramText: $('#setting-instagram-text').value, instagramUrl: $('#setting-instagram-url').value,
        whatsappText: $('#setting-whatsapp-text').value, whatsappUrl: $('#setting-whatsapp-url').value,
        baleText: $('#setting-bale-text').value, baleUrl: $('#setting-bale-url').value,
        telegramText: $('#setting-telegram-text').value, telegramUrl: $('#setting-telegram-url').value,
        emailText: $('#setting-email-text').value, emailUrl: $('#setting-email-url').value
      };
      button.disabled = true; status.classList.remove('is-error'); status.textContent = 'در حال ذخیره...';
      try { await DastinStore.saveSettings(payload); status.textContent = 'راه‌های ارتباطی ذخیره شد.'; }
      catch (error) { status.textContent = error.message || 'ذخیره انجام نشد.'; status.classList.add('is-error'); }
      finally { button.disabled = false; }
    });
  }
  function showcasePanel(id) { return document.querySelector('[data-editor-card="' + id + '"]'); }
  async function loadShowcaseSettings() {
    try {
      currentShowcase = await DastinStore.getShowcase();
      $('#showcase-heading-first-input').value = currentShowcase.headingFirst;
      $('#showcase-heading-accent-input').value = currentShowcase.headingAccent;
      $('#showcase-description-input').value = currentShowcase.description;
      currentShowcase.cards.forEach(async card => {
        const panel = showcasePanel(card.id); if (!panel) return;
        $('[data-showcase-field="label"]', panel).value = card.label;
        $('[data-showcase-field="title"]', panel).value = card.title;
        const preview = $('.showcase-editor-preview', panel);
        const url = await DastinStore.getImageURL(card.imageId, card.imagePath);
        if (url) preview.src = url;
      });
      currentShowcase.notes.forEach((note, index) => { const input = document.querySelector('[data-showcase-note="' + index + '"]'); if (input) input.value = note; });
    } catch (_) { $('#showcase-status').textContent = 'بارگذاری سکشن معرفی انجام نشد'; $('#showcase-status').classList.add('is-error'); }
  }
  function initShowcaseSettings() {
    document.querySelectorAll('[data-showcase-field="image"]').forEach(input => {
      input.addEventListener('change', event => {
        const file = event.target.files && event.target.files[0]; if (!file) return;
        const preview = $('.showcase-editor-preview', event.target.closest('[data-editor-card]'));
        preview.src = URL.createObjectURL(file);
      });
    });
    $('#showcase-settings-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!currentShowcase) return;
      const button = event.currentTarget.querySelector('button'); const status = $('#showcase-status');
      const draft = {
        headingFirst: $('#showcase-heading-first-input').value,
        headingAccent: $('#showcase-heading-accent-input').value,
        description: $('#showcase-description-input').value,
        cards: currentShowcase.cards.map(card => {
          const panel = showcasePanel(card.id);
          return { ...card, label: $('[data-showcase-field="label"]', panel).value, title: $('[data-showcase-field="title"]', panel).value };
        }),
        notes: [0, 1, 2].map(index => document.querySelector('[data-showcase-note="' + index + '"]').value)
      };
      const images = {}; button.disabled = true; status.classList.remove('is-error'); status.textContent = 'در حال آماده‌سازی و ذخیره...';
      try {
        for (const card of draft.cards) {
          const file = $('[data-showcase-field="image"]', showcasePanel(card.id)).files[0];
          if (file) images[card.id] = await DastinStore.optimizeImage(file);
        }
        currentShowcase = await DastinStore.saveShowcase(draft, images);
        status.textContent = 'سکشن معرفی ذخیره شد';
        await loadShowcaseSettings();
      } catch (error) { status.textContent = error.message || 'ذخیره انجام نشد'; status.classList.add('is-error'); }
      finally { button.disabled = false; }
    });
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function initBackup() {
    $('#export-git').addEventListener('click', async () => {
      const button = $('#export-git'); button.disabled = true; button.textContent = 'در حال ساخت خروجی...';
      try {
        const pack = await DastinStore.createGitExport();
        downloadBlob(new Blob([JSON.stringify(pack.manifest, null, 2)], { type: 'application/json' }), 'catalogue.json');
        // A short gap helps browsers keep each file download distinct. The admin moves these files to assets/uploads/.
        pack.downloads.forEach((file, index) => setTimeout(() => downloadBlob(file.blob, file.filename), 260 * (index + 1)));
        const detail = pack.downloads.length ? (' و ' + toFaNumber(pack.downloads.length) + ' تصویر') : '';
        alert('catalogue.json' + detail + ' دانلود شد. catalogue.json را در ریشهٔ repository و تصویرها را در assets/uploads/ بگذارید، سپس commit و push کنید.');
      } catch (error) { alert(error.message || 'ساخت خروجی GitHub انجام نشد.'); }
      finally { button.disabled = false; button.innerHTML = 'خروجی GitHub <b>↓</b>'; }
    });
    $('#export-backup').addEventListener('click', async () => {
      const button = $('#export-backup'); button.disabled = true; button.textContent = 'در حال آماده‌سازی...';
      try {
        const backup = await DastinStore.createBackup();
        const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = 'dastin-backup-' + new Date().toISOString().slice(0, 10) + '.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { alert(error.message || 'ساخت پشتیبان انجام نشد.'); }
      finally { button.disabled = false; button.innerHTML = 'دانلود پشتیبان <b>↓</b>'; }
    });
    $('#import-backup').addEventListener('change', async event => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      if (!confirm('بازیابی پشتیبان، کاتالوگ فعلی این مرورگر را جایگزین می‌کند. ادامه می‌دهید؟')) { event.target.value = ''; return; }
      try {
        const backup = JSON.parse(await file.text());
        await DastinStore.restoreBackup(backup); resetForm(); await refreshProducts(); alert('پشتیبان با موفقیت بازیابی شد.');
      } catch (error) { alert(error.message || 'این فایل قابل بازیابی نیست.'); }
      event.target.value = '';
    });
  }

  $('#logout-button').addEventListener('click', () => { sessionStorage.removeItem(ACCESS_KEY); location.reload(); });
  loadMoreButton.addEventListener('click', () => { renderedCount += PAGE_SIZE; renderList(); });
  initLogin(); initForm(); initContactSettings(); initShowcaseSettings(); initBackup();
}());
