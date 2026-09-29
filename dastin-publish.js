/* DASTIN publisher — commits studio changes straight to the GitHub repository
   with the GitHub REST API (Git Data API = one atomic commit for all files).
   A push automatically triggers the GitHub Pages build workflow, so the public
   site updates ~1–2 minutes after each publish. The token stays in this
   browser only (session or local storage) and is never sent anywhere else. */
(function () {
  'use strict';

  var OWNER = 'xvviix';
  var REPO = 'Dastin';
  var BRANCH = 'main';
  var API = 'https://api.github.com';
  var SESSION_KEY = 'dastin-gh-token';
  var LOCAL_KEY = 'dastin-gh-token-remembered';

  var pendingTimer = null;
  var publishing = false;
  var queuedAgain = false;

  function getToken() {
    try { return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(LOCAL_KEY) || ''; } catch (_) { return ''; }
  }
  function setToken(token, remember) {
    try {
      sessionStorage.setItem(SESSION_KEY, token);
      if (remember) localStorage.setItem(LOCAL_KEY, token); else localStorage.removeItem(LOCAL_KEY);
    } catch (_) {}
  }
  function clearToken() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(LOCAL_KEY); } catch (_) {}
  }
  function hasToken() { return Boolean(getToken()); }

  function api(path, options) {
    options = options || {};
    return fetch(API + path, {
      method: options.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + getToken(),
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(async function (response) {
      if (!response.ok) {
        var detail = '';
        try { detail = (await response.json()).message || ''; } catch (_) {}
        if (response.status === 401) throw new Error('توکن گیت‌هاب معتبر نیست یا منقضی شده. دوباره وارد شوید.');
        if (response.status === 403) throw new Error('توکن اجازهٔ نوشتن در این ریپو را ندارد (دسترسی Contents: Read and write لازم است).' + (detail ? ' ' + detail : ''));
        throw new Error('خطای گیت‌هاب (' + response.status + ')' + (detail ? ': ' + detail : ''));
      }
      return response.status === 204 ? null : response.json();
    });
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(new Error('خواندن فایل تصویر ممکن نشد.')); };
      reader.readAsDataURL(blob);
    });
  }
  function referencedUploads(manifest) {
    var ids = [];
    manifest.products.forEach(function (product) {
      var match = /assets\/uploads\/(.+\.webp)$/.exec(product.imagePath || '');
      if (match) ids.push(match[1]);
    });
    (manifest.showcase.cards || []).forEach(function (card) {
      var match = /assets\/uploads\/(.+\.webp)$/.exec(card.imagePath || '');
      if (match) ids.push(match[1]);
    });
    return ids;
  }

  async function validate() {
    var repo = await api('/repos/' + OWNER + '/' + REPO);
    return { name: repo.full_name, private: repo.private };
  }

  /* Builds the next catalogue.json from the studio's local state and commits it
     together with any new/changed images (and deletions) in a single commit. */
  async function publish() {
    if (publishing) { queuedAgain = true; return null; }
    publishing = true;
    try {
      var products = await window.DastinStore.list();
      var settings = await window.DastinStore.getSettings();
      var showcase = await window.DastinStore.getShowcase();

      var manifest = { format: 'dastin-public-catalogue', version: 1, exportedAt: new Date().toISOString(), settings: settings, showcase: showcase, products: products };
      var uploadNames = referencedUploads(manifest);

      /* Resolve every non-default image against the local media store. */
      var imageFiles = []; /* {name, blob} */
      var entries = products.concat(showcase.cards || []);
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.imageId) continue;
        if (/^default-/.test(entry.imageId)) { entry.imagePath = 'assets/' + ({ 'default-burger': 'product-burger.jpg', 'default-sausage': 'product-sausage.jpg', 'default-cake': 'product-cake.jpg', 'default-finger-food': 'product-finger-food.jpg' })[entry.imageId]; continue; }
        var blob = await window.DastinStore.getMediaBlob(entry.imageId);
        if (!blob) {
          if (entry.imagePath && !/^https?:/i.test(entry.imagePath) && entry.imagePath.indexOf('assets/') === 0) continue; /* keep existing repo image */
          throw new Error('تصویر «' + (entry.title || entry.id) + '» در مرورگر پیدا نشد. دوباره انتخابش کنید.');
        }
        entry.imagePath = 'assets/uploads/' + entry.imageId + '.webp';
        imageFiles.push({ name: entry.imageId + '.webp', blob: blob });
      }

      var ref = await api('/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + BRANCH);
      var baseSha = ref.object.sha;
      var baseCommit = await api('/repos/' + OWNER + '/' + REPO + '/git/commits/' + baseSha);

      var tree = [];
      var seen = {};
      for (var j = 0; j < imageFiles.length; j++) {
        var file = imageFiles[j];
        if (seen[file.name]) continue;
        seen[file.name] = true;
        var blobResp = await api('/repos/' + OWNER + '/' + REPO + '/git/blobs', { method: 'POST', body: { content: await blobToBase64(file.blob), encoding: 'base64' } });
        tree.push({ path: 'assets/uploads/' + file.name, mode: '100644', type: 'blob', sha: blobResp.sha });
      }

      /* Prune upload images that nothing references anymore. */
      var oldManifest = null;
      try {
        var old = await api('/repos/' + OWNER + '/' + REPO + '/contents/catalogue.json?ref=' + baseSha);
        oldManifest = JSON.parse(atob((old.content || '').replace(/\n/g, '')));
      } catch (_) { oldManifest = null; }
      if (oldManifest) {
        var keep = {};
        uploadNames.forEach(function (name) { keep[name] = true; });
        referencedUploads(oldManifest).forEach(function (name) { if (!keep[name]) tree.push({ path: 'assets/uploads/' + name, mode: '100644', type: 'blob', sha: null }); });
      }

      var catalogueBlob = await api('/repos/' + OWNER + '/' + REPO + '/git/blobs', { method: 'POST', body: { content: btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2) + '\n'))), encoding: 'base64' } });
      tree.push({ path: 'catalogue.json', mode: '100644', type: 'blob', sha: catalogueBlob.sha });

      var newTree = await api('/repos/' + OWNER + '/' + REPO + '/git/trees', { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree: tree } });
      var commit = await api('/repos/' + OWNER + '/' + REPO + '/git/commits', { method: 'POST', body: { message: 'Publish catalogue changes from studio', tree: newTree.sha, parents: [baseSha] } });
      await api('/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + BRANCH, { method: 'PATCH', body: { sha: commit.sha, force: false } });

      await window.DastinStore.resetPublishedCache();
      return { sha: commit.sha, html: commit.html_url };
    } finally {
      publishing = false;
      if (queuedAgain) { queuedAgain = false; publishSoon(800); }
    }
  }

  function publishSoon(delay) {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(async function () {
      pendingTimer = null;
      if (!hasToken()) return;
      try { await publish(); if (typeof window.onDastinPublished === 'function') window.onDastinPublished(null); }
      catch (error) { if (typeof window.onDastinPublished === 'function') window.onDastinPublished(error); }
    }, delay == null ? 2500 : delay);
  }

  window.DastinPublisher = {
    hasToken: hasToken,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    validate: validate,
    publish: publish,
    publishSoon: publishSoon
  };
}());