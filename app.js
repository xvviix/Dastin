(function () {
  'use strict';

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const gallery = $('#gallery');
  const sentinel = $('#gallery-sentinel');
  const emptyState = $('#empty-state');
  const productTemplate = $('#product-template');
  const dialog = $('#product-modal');
  const main = $('#site-content');
  const pageSize = 8;
  let products = [];
  let filtered = [];
  let page = 0;
  let selectedFilter = 'all';
  let observer;

  function finishIntro() {
    const intro = $('.intro');
    if (!intro || intro.classList.contains('is-leaving')) return;
    main.removeAttribute('inert');
    main.setAttribute('aria-hidden', 'false');
    intro.classList.add('is-leaving');
    window.setTimeout(() => intro.remove(), 1050);
    startReveals();
  }
  function initIntro() {
    const intro = $('.intro');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !intro) { main.removeAttribute('inert'); main.setAttribute('aria-hidden', 'false'); startReveals(); return; }
    $('.intro__skip', intro).addEventListener('click', finishIntro);
    window.setTimeout(finishIntro, 2850);
  }
  function initBackgroundVideo() {
    const video = $('.nature-video');
    if (!video) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    if (reduceMotion || saveData) return;
    if (!video.dataset.src) return;
    video.src = video.dataset.src;
    video.load();
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  }

  function startReveals() {
    const revealItems = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { revealItems.forEach(item => item.classList.add('is-visible')); return; }
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -30px' });
    revealItems.forEach(item => revealObserver.observe(item));
  }

  function productNumber(index) { return String(index + 1).padStart(2, '0'); }
  function makeCard(product, absoluteIndex) {
    const fragment = productTemplate.content.cloneNode(true);
    const card = $('.product-card', fragment);
    const button = $('.product-card__button', card);
    const image = $('img', card);
    image.alt = product.title;
    $('.product-card__category-text', card).textContent = DastinStore.categoryLabel(product.category);
    $('h3', card).textContent = product.title;
    $('.product-card__num', card).textContent = productNumber(absoluteIndex);
    button.addEventListener('click', () => openProduct(product));
    DastinStore.getImageURL(product.imageId, product.imagePath).then(url => {
      if (url && card.isConnected) image.src = url;
    }).catch(() => { card.classList.add('is-image-missing'); });
    return fragment;
  }
  function renderNextPage() {
    const start = page * pageSize;
    const chunk = filtered.slice(start, start + pageSize);
    if (!chunk.length) { sentinel.classList.add('is-done'); return; }
    const fragment = document.createDocumentFragment();
    chunk.forEach((product, index) => fragment.appendChild(makeCard(product, start + index)));
    gallery.appendChild(fragment);
    page += 1;
    if (page * pageSize >= filtered.length) sentinel.classList.add('is-done');
  }
  function resetGallery() {
    filtered = selectedFilter === 'all' ? products : products.filter(product => product.category === selectedFilter);
    gallery.replaceChildren();
    page = 0;
    emptyState.hidden = filtered.length !== 0;
    sentinel.classList.toggle('is-done', filtered.length === 0);
    if (filtered.length) renderNextPage();
  }
  function initVirtualGallery() {
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && page * pageSize < filtered.length) renderNextPage();
    }, { rootMargin: '700px 0px' });
    observer.observe(sentinel);
  }
  function initFilters() {
    document.querySelectorAll('.filter').forEach(button => {
      button.addEventListener('click', () => {
        selectedFilter = button.dataset.filter;
        document.querySelectorAll('.filter').forEach(item => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        resetGallery();
      });
    });
  }

  async function openProduct(product) {
    $('#modal-category-text').textContent = DastinStore.categoryLabel(product.category);
    $('#modal-title').textContent = product.title;
    $('#modal-description').textContent = product.description;
    $('#modal-price').textContent = product.price;
    $('#modal-weight').textContent = product.weight;
    $('#modal-copyright').textContent = product.copyright;
    const modalImage = $('#modal-image');
    modalImage.alt = product.title;
    dialog.dataset.productId = product.id;
    document.body.classList.add('modal-open');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    try {
      const url = await DastinStore.getImageURL(product.imageId, product.imagePath);
      if (dialog.dataset.productId === product.id && url) modalImage.src = url;
    } catch (_) { /* information remains usable even if its image is unavailable */ }
  }
  function closeDialog() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    document.body.classList.remove('modal-open');
  }
  function initModal() {
    $('.modal-close', dialog).addEventListener('click', closeDialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener('cancel', () => document.body.classList.remove('modal-open'));
    dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
  }
  function initMobileMenu() {
    const button = $('.menu-toggle'); const menu = $('.mobile-nav');
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      button.setAttribute('aria-label', open ? 'باز کردن منو' : 'بستن منو');
      menu.classList.toggle('is-open', !open);
      menu.setAttribute('aria-hidden', String(open));
      menu.toggleAttribute('inert', open);
    });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'باز کردن منو'); menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true'); menu.setAttribute('inert', ''); }));
  }
  async function applyShowcase(showcase) {
    $('#showcase-heading-first').textContent = showcase.headingFirst;
    $('#showcase-heading-accent').textContent = showcase.headingAccent;
    $('#showcase-description').textContent = showcase.description;
    await Promise.all(showcase.cards.map(async card => {
      const element = document.querySelector('[data-showcase-card="' + card.id + '"]');
      if (!element) return;
      $('.showcase-card__label', element).textContent = card.label;
      $('h3', element).textContent = card.title;
      const image = $('img', element); image.alt = card.title;
      const url = await DastinStore.getImageURL(card.imageId, card.imagePath);
      if (url) image.src = url;
    }));
    const notes = $('#showcase-notes'); notes.replaceChildren();
    showcase.notes.forEach((note, index) => {
      const line = document.createElement('p'); const number = document.createElement('b');
      number.textContent = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false }).format(index + 1);
      line.append(number, document.createTextNode(' ' + note)); notes.append(line);
    });
  }
  function applyContactSettings(settings) {
    const assign = (id, text, href, isEmail = false) => {
      const link = document.getElementById(id);
      if (!link) return;
      const safeHref = isEmail && href && !href.startsWith('mailto:') ? 'mailto:' + href : href;
      if (safeHref) {
        link.href = safeHref;
        link.removeAttribute('aria-disabled');
        link.removeAttribute('tabindex');
      }
      const label = link.querySelector('strong'); if (label) label.textContent = text || '';
    };
    assign('contact-instagram', settings.instagramText, settings.instagramUrl);
    assign('contact-whatsapp', settings.whatsappText, settings.whatsappUrl);
    assign('contact-bale', settings.baleText, settings.baleUrl);
    assign('contact-telegram', settings.telegramText, settings.telegramUrl);
    assign('contact-email', settings.emailText, settings.emailUrl, true);
    const emailHref = settings.emailUrl && (settings.emailUrl.startsWith('mailto:') ? settings.emailUrl : 'mailto:' + settings.emailUrl);
    if (emailHref) { const cta = $('#contact-email-cta'); if (cta) cta.href = emailHref; $('#modal-email-link').href = emailHref; }
  }
  async function bootstrapCatalogue() {
    try {
      await DastinStore.init();
      products = await DastinStore.listForPublic();
      const [settings, showcase] = await Promise.all([DastinStore.getSettingsForPublic(), DastinStore.getShowcaseForPublic()]);
      applyContactSettings(settings);
      await applyShowcase(showcase);
      resetGallery();
      initVirtualGallery();
    } catch (error) {
      console.error(error);
      emptyState.hidden = false;
      emptyState.textContent = 'مرورگر اجازهٔ ذخیره‌سازی کاتالوگ را نداد. لطفاً حالت مرور خصوصی را بررسی کنید.';
      sentinel.classList.add('is-done');
    }
  }

  $('#year').textContent = new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date());
  initBackgroundVideo();
  initIntro();
  initFilters();
  initModal();
  initMobileMenu();
  bootstrapCatalogue();
}());
