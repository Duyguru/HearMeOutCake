// ============================================================
// Hear Me Out Cake — SVG Pasta Çizim Motoru (cake-renderer.js)
// ============================================================

export class CakeRenderer {
  constructor(svgElement, options = {}) {
    this.svg = svgElement;
    this.size = 600; // viewBox boyutu: 0 0 600 600
    this.options = {
      interactive: true,
      showSliceLabels: true,
      onItemSelect: null,
      onItemChange: null,
      onSliceClick: null,
      ...options
    };

    this.state = {
      cake: null,
      items: [],
      participants: [],
      selectedItemId: null,
      hoveredSlice: null,
      paintStrokes: []
    };

    this.initSvg();
  }

  initSvg() {
    this.svg.setAttribute('viewBox', '0 0 600 600');
    this.svg.style.overflow = 'visible';
    this.svg.innerHTML = `
      <defs>
        <!-- Tabak ve Pasta Gölgeleri -->
        <filter id="plate-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="rgba(91, 75, 107, 0.16)"/>
        </filter>
        <filter id="cake-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="rgba(91, 75, 107, 0.12)"/>
        </filter>
        <filter id="topper-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="rgba(91, 75, 107, 0.22)"/>
        </filter>
        <!-- Boyamayı Pasta Alanıyla (r=230) Sınırlama -->
        <clipPath id="cake-paint-clip">
          <circle cx="300" cy="300" r="230"/>
        </clipPath>
        <!-- Resimler için yuvarlak/kare kırpma -->
        <clipPath id="topper-img-clip">
          <rect x="-58" y="-126" width="116" height="92" rx="8" ry="8"/>
        </clipPath>
      </defs>

      <!-- 1. Katman: Tabak -->
      <g id="layer-plate"></g>

      <!-- 2. Katman: Pasta Gövdesi ve Dilimler -->
      <g id="layer-cake"></g>

      <!-- 3. Katman: Krema Süslemeleri (Piping Beads) -->
      <g id="layer-piping"></g>

      <!-- 3.5. Katman: Boyama Çizimleri (Pasta Alanıyla Sınırlı) -->
      <g id="layer-paint" clip-path="url(#cake-paint-clip)"></g>

      <!-- 4. Katman: Dilim Çizgileri ve Etiketler -->
      <g id="layer-slices"></g>

      <!-- 5. Katman: Pastaya Eklenen Öğeler (Tabelalar, Resimler, Sticker'lar) -->
      <g id="layer-items"></g>

      <!-- 6. Katman: Seçim ve Kontrol Tutamaçları -->
      <g id="layer-controls"></g>
    `;

    this.layerPlate = this.svg.querySelector('#layer-plate');
    this.layerCake = this.svg.querySelector('#layer-cake');
    this.layerPiping = this.svg.querySelector('#layer-piping');
    this.layerPaint = this.svg.querySelector('#layer-paint');
    this.layerSlices = this.svg.querySelector('#layer-slices');
    this.layerItems = this.svg.querySelector('#layer-items');
    this.layerControls = this.svg.querySelector('#layer-controls');
  }

  setData({ cake, items = [], participants = [] }) {
    if (cake) this.state.cake = cake;
    if (items) this.state.items = items;
    if (participants) this.state.participants = participants;
    this.render();
  }

  render() {
    if (!this.state.cake) return;
    this.renderPlate();
    this.renderCake();
    this.renderPiping();
    this.renderPaintStrokes();
    this.renderSlices();
    this.renderItems();
    this.renderControls();
  }

  renderPlate() {
    const cx = 300;
    const cy = 300;
    this.layerPlate.innerHTML = `
      <!-- Dış Tabak -->
      <circle cx="${cx}" cy="${cy}" r="275" fill="#FFFFFF" stroke="#F2D9E2" stroke-width="4" filter="url(#plate-shadow)"/>
      <!-- Tabak İç Halka -->
      <circle cx="${cx}" cy="${cy}" r="255" fill="#FFF9FB" stroke="#F7E6ED" stroke-width="2"/>
    `;
  }

  renderCake() {
    const cx = 300;
    const cy = 300;
    const r = 230;
    const cakeColor = this.state.cake.cake_color || '#FFD6E0';
    const frostingColor = this.state.cake.frosting_color || '#FFF1E6';

    this.layerCake.innerHTML = `
      <!-- Pasta Taban Derinliği (3D etki) -->
      <ellipse cx="${cx}" cy="${cy + 12}" rx="${r}" ry="${r}" fill="#E8B4C2" opacity="0.4"/>
      <!-- Ana Pasta Yüzeyi -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${cakeColor}" stroke="#F2CCD7" stroke-width="3" filter="url(#cake-shadow)"/>
      <!-- Üst Krema İnce Katmanı -->
      <circle cx="${cx}" cy="${cy}" r="${r - 14}" fill="${frostingColor}" opacity="0.6"/>
    `;
  }

  renderPiping() {
    const cx = 300;
    const cy = 300;
    const r = 226;
    const frostingColor = this.state.cake.frosting_color || '#FFF1E6';
    const beadCount = 36;
    let beadsHtml = '';

    for (let i = 0; i < beadCount; i++) {
      const angle = (i * 360) / beadCount;
      const rad = (angle * Math.PI) / 180;
      const bx = cx + r * Math.cos(rad);
      const by = cy + r * Math.sin(rad);
      beadsHtml += `<circle cx="${bx}" cy="${by}" r="7" fill="${frostingColor}" stroke="#F2DFD0" stroke-width="1.5" />`;
      // Küçük ışıltı noktası
      beadsHtml += `<circle cx="${bx - 2}" cy="${by - 2}" r="2" fill="#FFFFFF" opacity="0.7" />`;
    }

    this.layerPiping.innerHTML = beadsHtml;
  }

  renderSlices() {
    const sliceCount = this.state.cake.slice_count || 8;
    const cx = 300;
    const cy = 300;
    const r = 230;
    let html = '';

    if (sliceCount <= 1) {
      this.layerSlices.innerHTML = '';
      return;
    }

    const step = 360 / sliceCount;

    for (let i = 0; i < sliceCount; i++) {
      const angle = i * step;
      const rad = ((angle - 90) * Math.PI) / 180;
      const x2 = cx + r * Math.cos(rad);
      const y2 = cy + r * Math.sin(rad);

      // Dilim ayırıcı kesik çizgi
      html += `
        <line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"
          stroke="#C29DA8" stroke-width="2.5" stroke-dasharray="6,5" opacity="0.85" />
      `;

      // Dilim etiketleri (Dilim Numarası veya Katılımcı Adı)
      if (this.options.showSliceLabels) {
        const midAngle = angle + (step / 2);
        const midRad = ((midAngle - 90) * Math.PI) / 180;
        // Etiket konumu: kenara yakın (r * 0.82)
        const lx = cx + (r * 0.82) * Math.cos(midRad);
        const ly = cy + (r * 0.82) * Math.sin(midRad);

        // Bu dilime atanmış katılımcı var mı?
        const participant = this.state.participants.find(p => p.slice_index === i);
        const labelText = participant ? participant.nickname : `${i + 1}`;

        html += `
          <g class="slice-badge" data-slice="${i}">
            <circle cx="${lx}" cy="${ly}" r="15" fill="#FFFFFF" stroke="#F2CCD7" stroke-width="2" opacity="0.9" />
            <text x="${lx}" y="${ly + 4.5}" text-anchor="middle" font-family="var(--font-display, sans-serif)"
              font-size="11" font-weight="bold" fill="#755E6D">${labelText.substring(0, 5)}</text>
          </g>
        `;
      }
    }

    // Pasta merkez noktası süsü
    html += `
      <circle cx="${cx}" cy="${cy}" r="10" fill="${this.state.cake.frosting_color || '#FFF1E6'}" stroke="#F2CCD7" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="#FF8FB1"/>
    `;

    this.layerSlices.innerHTML = html;
  }

  renderItems() {
    let html = '';
    const items = [...this.state.items].sort((a, b) => (a.z_index || 0) - (b.z_index || 0));

    items.forEach(item => {
      const x = (item.x || 0.5) * this.size;
      const y = (item.y || 0.5) * this.size;
      const scale = item.scale || 1.0;
      const rot = item.rotation || 0;
      const isSelected = item.id === this.state.selectedItemId;

      html += `
        <g class="cake-item-node" data-item-id="${item.id}"
           transform="translate(${x}, ${y}) rotate(${rot}) scale(${scale})"
           style="cursor: grab;">
          ${this.renderItemContent(item)}
        </g>
      `;
    });

    this.layerItems.innerHTML = html;
  }

  renderItemContent(item) {
    if (item.type === 'topper') {
      // ============================================================
      // KÜRDANLI TABELA (Hear Me Out Placard / Stick Topper)
      // Kullanıcının isteği: "resmin altına yazı eklenicek tablo gibi onu da pastaya dikeceğiz"
      // ============================================================
      const caption = (item.style && item.style.caption) || item.content || '';
      const imageUrl = (item.style && item.style.imageUrl) || item.content;

      return `
        <!-- Kürdanın Pastadaki Giriş Gölgesi -->
        <ellipse cx="0" cy="72" rx="10" ry="5" fill="rgba(91, 75, 107, 0.28)" />
        
        <!-- Kürdan / Çubuk -->
        <path d="M -3.5 -20 L -2.5 68 L 0 74 L 2.5 68 L 3.5 -20 Z" fill="#D4A373" stroke="#B08055" stroke-width="1"/>
        <!-- Kürdan Parlaması -->
        <line x1="-0.5" y1="-14" x2="-0.5" y2="66" stroke="#E9C49A" stroke-width="1.2" stroke-linecap="round"/>

        <!-- Tabela Çerçevesi (Polaroid / Placard Kart) -->
        <g filter="url(#topper-shadow)">
          <rect x="-66" y="-135" width="132" height="148" rx="12" ry="12"
                fill="#FFFFFF" stroke="#F2D9E2" stroke-width="3"/>
          
          <!-- Fotoğraf Alanı -->
          <rect x="-58" y="-126" width="116" height="92" rx="8" ry="8" fill="#FFF5F8" />
          <image href="${imageUrl}" x="-58" y="-126" width="116" height="92"
                 preserveAspectRatio="xMidYMid slice" clip-path="url(#topper-img-clip)" />

          <!-- Resmin Altındaki Yazı / İsim Alanı (Placard Caption) -->
          <rect x="-58" y="-28" width="116" height="34" rx="5" ry="5" fill="#FFF9FB" />
          <text x="0" y="-5" text-anchor="middle"
                font-family="var(--font-display, Nunito, sans-serif)"
                font-size="15" font-weight="800" fill="#5B4B6B">
            ${this.escapeSvg(caption)}
          </text>
        </g>
      `;
    }

    if (item.type === 'text') {
      const text = item.content || '';
      const color = (item.style && item.style.color) || '#5B4B6B';
      const fontSize = (item.style && item.style.fontSize) || 18;
      const bg = (item.style && item.style.bg) || '#FFFFFF';

      return `
        <g filter="url(#topper-shadow)">
          <rect x="-80" y="-24" width="160" height="42" rx="21" ry="21" fill="${bg}" stroke="#F2D9E2" stroke-width="2"/>
          <text x="0" y="5" text-anchor="middle"
                font-family="var(--font-display, sans-serif)"
                font-size="${fontSize}" font-weight="800" fill="${color}">
            ${this.escapeSvg(text)}
          </text>
        </g>
      `;
    }

    if (item.type === 'sticker') {
      const stickerCode = item.content || 'strawberry';
      return `
        <g filter="url(#topper-shadow)">
          <image href="/assets/stickers/${stickerCode}.svg" x="-38" y="-38" width="76" height="76" />
        </g>
      `;
    }

    if (item.type === 'image') {
      const url = item.content;
      return `
        <g filter="url(#topper-shadow)">
          <circle cx="0" cy="0" r="32" fill="#FFFFFF" stroke="#F2D9E2" stroke-width="3"/>
          <clipPath id="circle-clip-${item.id}">
            <circle cx="0" cy="0" r="30" />
          </clipPath>
          <image href="${url}" x="-30" y="-30" width="60" height="60"
                 preserveAspectRatio="xMidYMid slice" clip-path="url(#circle-clip-${item.id})" />
        </g>
      `;
    }

    return '';
  }

  renderPaintStrokes() {
    let html = '';
    const frostingColor = (this.state.cake && this.state.cake.frosting_color) || '#FFF1E6';
    this.state.paintStrokes.forEach(stroke => {
      if (stroke.points && stroke.points.length > 1) {
        let d = `M ${stroke.points[0].x} ${stroke.points[0].y}`;
        for (let i = 1; i < stroke.points.length; i++) {
          d += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
        }
        const strokeColor = stroke.isEraser ? frostingColor : stroke.color;
        const strokeOpacity = stroke.isEraser ? "1.0" : "0.85";
        html += `<path d="${d}" stroke="${strokeColor}" stroke-width="${stroke.size}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${strokeOpacity}" />`;
      }
    });
    this.layerPaint.innerHTML = html;
  }

  renderControls() {
    if (!this.state.selectedItemId || !this.options.interactive) {
      this.layerControls.innerHTML = '';
      return;
    }

    const item = this.state.items.find(i => i.id === this.state.selectedItemId);
    if (!item) {
      this.layerControls.innerHTML = '';
      return;
    }

    const x = (item.x || 0.5) * this.size;
    const y = (item.y || 0.5) * this.size;
    const scale = item.scale || 1.0;
    const rot = item.rotation || 0;

    let boxW, boxH, topY, halfW;

    if (item.type === 'sticker') {
      boxW = 86 * scale;
      boxH = 86 * scale;
      topY = -43 * scale;
      halfW = 43 * scale;
    } else if (item.type === 'text') {
      boxW = 175 * scale;
      boxH = 52 * scale;
      topY = -26 * scale;
      halfW = 87.5 * scale;
    } else if (item.type === 'image') {
      boxW = 74 * scale;
      boxH = 74 * scale;
      topY = -37 * scale;
      halfW = 37 * scale;
    } else {
      // topper / tabela
      boxW = 145 * scale;
      boxH = 210 * scale;
      topY = -140 * scale;
      halfW = boxW / 2;
    }

    this.layerControls.innerHTML = `
      <g transform="translate(${x}, ${y}) rotate(${rot})">
        <!-- Seçim Çerçevesi -->
        <rect x="${-halfW - 6}" y="${topY - 6}" width="${boxW + 12}" height="${boxH + 12}"
              rx="8" ry="8" fill="none" stroke="#FF8FB1" stroke-width="2.5" stroke-dasharray="6,4" />

        <!-- Döndürme Tutamacı (Üstte) -->
        <g class="handle-rotate" style="cursor: grab;">
          <line x1="0" y1="${topY - 6}" x2="0" y2="${topY - 28}" stroke="#FF8FB1" stroke-width="2" />
          <circle cx="0" cy="${topY - 28}" r="9" fill="#FF8FB1" stroke="#FFFFFF" stroke-width="2" />
          <text x="0" y="${topY - 24}" text-anchor="middle" font-size="10" fill="#FFFFFF" font-weight="bold">↻</text>
        </g>

        <!-- Boyutlandırma Tutamacı (Sağ Altta) -->
        <g class="handle-scale" transform="translate(${halfW + 6}, ${(topY + boxH) + 6})" style="cursor: nwse-resize;">
          <circle cx="0" cy="0" r="8" fill="#FF8FB1" stroke="#FFFFFF" stroke-width="2" />
        </g>

        <!-- Silme Butonu (Sol Üstte) -->
        <g class="handle-delete" transform="translate(${-halfW - 6}, ${topY - 6})" style="cursor: pointer;">
          <circle cx="0" cy="0" r="10" fill="#FF5D73" stroke="#FFFFFF" stroke-width="2" />
          <text x="0" y="3.5" text-anchor="middle" font-size="12" fill="#FFFFFF" font-weight="bold">✕</text>
        </g>
      </g>
    `;
  }

  escapeSvg(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
