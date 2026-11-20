(() => {
  let choice = null;
  try { choice = localStorage.getItem('letomeet-theme'); } catch {}
  if (!['light','dark'].includes(choice)) choice = null;
  function apply() {
    const dark = choice === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#242620' : '#e3cd86';
    const button = document.querySelector('#theme-toggle');
    if (button) {
      button.textContent = dark ? '☀' : '☾';
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', 'Тёмная тема');
      button.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    }
  }
  apply();
  window.addEventListener('storage', event => {
    if (event.key !== 'letomeet-theme' && event.key !== null) return;
    choice = ['light','dark'].includes(event.newValue) ? event.newValue : null;
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelector('#theme-toggle').onclick = () => {
      choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('letomeet-theme', choice); } catch {}
      apply();
    };
  });
})();
