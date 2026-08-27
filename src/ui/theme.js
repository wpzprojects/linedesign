/**
 * theme.js — Alternar tema claro/oscuro, persistido en localStorage.
 * El ícono (sol/luna) se conmuta por CSS según la clase `dark-theme` en
 * <body> (ver styles.css .icon-sun / .icon-moon); este módulo solo mueve
 * la clase y guarda la preferencia.
 */
(function (global) {
  function initTheme(toggleButton) {
    function applyTheme(theme) {
      document.body.classList.toggle('dark-theme', theme === 'dark');
      try {
        localStorage.setItem('linedesign-theme', theme);
      } catch (error) {
        console.warn('No se pudo guardar el tema:', error);
      }
    }

    const savedTheme = (() => {
      try {
        return localStorage.getItem('linedesign-theme') || 'dark';
      } catch (error) {
        return 'dark';
      }
    })();
    applyTheme(savedTheme);

    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(next);
      });
    }
  }

  global.LineDesignTheme = { initTheme };
})(typeof window !== 'undefined' ? window : globalThis);
