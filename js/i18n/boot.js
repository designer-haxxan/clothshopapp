// Runs before the first paint (classic script in <head>): applies the saved language, direction and the
// Bootstrap LTR/RTL stylesheet, so Urdu screens never flash in left-to-right. Keys match js/i18n/i18n.js.
(function () {
  var lang = 'en';
  try { lang = JSON.parse(localStorage.getItem('disterp.pref.lang') || '"en"') === 'ur' ? 'ur' : 'en'; } catch (e) { /* storage blocked: English */ }
  var root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ur' ? 'rtl' : 'ltr';
  if (lang === 'ur') {
    root.classList.add('lang-ur');
    var bs = document.getElementById('bs-css');
    if (bs) bs.setAttribute('href', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css');
  }
})();
