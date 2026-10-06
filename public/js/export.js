// ============================================================
// Hear Me Out Cake — PNG Olarak İndirme (export.js)
// ============================================================

export async function exportCakeToPng(svgElement, cakeTitle = 'hearmeout-cake') {
  return new Promise((resolve, reject) => {
    try {
      const clone = svgElement.cloneNode(true);

      // Kontrol tutamaçlarını temizle
      const controls = clone.querySelector('#layer-controls');
      if (controls) controls.remove();

      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 1200; // Yüksek çözünürlük
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 1. Pastel Gradyan Arka Plan
        const gradient = ctx.createLinearGradient(0, 0, size, size);
        gradient.addColorStop(0, '#FFF9FB');
        gradient.addColorStop(0.5, '#FFF0F5');
        gradient.addColorStop(1, '#F3E8FF');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        // 2. Hafif Dekoratif Kenarlık
        ctx.strokeStyle = '#F2D9E2';
        ctx.lineWidth = 16;
        ctx.strokeRect(16, 16, size - 32, size - 32);

        // 3. Pastayı Çiz (ortalanmış)
        const cakeSize = 980;
        const offset = (size - cakeSize) / 2;
        ctx.drawImage(image, offset, offset - 20, cakeSize, cakeSize);

        // 4. İmzayı ve Başlığı Ekle
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5B4B6B';
        ctx.font = 'bold 36px "Baloo 2", "Nunito", sans-serif';
        ctx.fillText(cakeTitle || 'Hear Me Out Cake', size / 2, size - 70);

        ctx.fillStyle = '#8E7FA0';
        ctx.font = '20px "Nunito", sans-serif';
        ctx.fillText('✨ Hear Me Out Cake ✨', size / 2, size - 36);

        URL.revokeObjectURL(blobURL);

        // 5. İndirme Bağlantısı Oluştur
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        const filename = `${(cakeTitle || 'pasta').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.png`;
        downloadLink.download = filename;
        downloadLink.href = pngUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        resolve(pngUrl);
      };

      image.onerror = (err) => {
        URL.revokeObjectURL(blobURL);
        reject(err);
      };

      image.src = blobURL;
    } catch (e) {
      reject(e);
    }
  });
}
