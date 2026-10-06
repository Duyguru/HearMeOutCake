// ============================================================
// Hear Me Out Cake — Yardımcı Fonksiyonlar (utils.js)
// ============================================================

export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// 0..1 Normalize koordinatları SVG viewBox koordinatlarına (örn: 600x600) çevirir
export function normToSvg(nx, ny, size = 600) {
  return {
    x: nx * size,
    y: ny * size
  };
}

// SVG viewBox koordinatlarını 0..1 normalize koordinata çevirir
export function svgToNorm(x, y, size = 600) {
  return {
    x: clamp(x / size, 0.05, 0.95),
    y: clamp(y / size, 0.05, 0.95)
  };
}
