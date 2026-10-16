(function() {
  function removeWarning() {
    const el = document.getElementById('warning') || 
               document.querySelector('div[style*="position: fixed"]') ||
               document.querySelector('table[style*="background"]');
    if (el) {
      el.style.display = 'none';
    }
    const frames = document.querySelectorAll('iframe');
    frames.forEach(f => {
      f.style.top = '0px';
      f.style.height = '100vh';
    });
  }

  removeWarning();
  const observer = new MutationObserver(removeWarning);
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
