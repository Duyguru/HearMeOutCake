// ============================================================
// Hear Me Out Cake — Editör Etkileşim Motoru (editor.js)
// ============================================================

import { api } from './api.js';
import { CakeRenderer } from './cake-renderer.js';
import { exportCakeToPng } from './export.js';
import { showToast, clamp, normToSvg, svgToNorm } from './utils.js';

class CakeEditorApp {
  constructor() {
    this.urlParams = new URLSearchParams(window.location.search);
    this.cakeParam = this.urlParams.get('cake');
    this.roomParam = this.urlParams.get('room');

    this.state = {
      cake: null,
      room: null,
      items: [],
      participants: [],
      myParticipant: null,
      remainingQuota: null,
      isCreator: false,
      selectedItem: null,
      isLocked: false
    };

    this.svgElement = document.getElementById('cake-svg');
    this.renderer = new CakeRenderer(this.svgElement, {
      interactive: true,
      onItemSelect: (item) => this.selectItem(item)
    });

    this.isDragging = false;
    this.isRotating = false;
    this.isScaling = false;
    this.activePointerId = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.itemStartPos = { x: 0, y: 0 };
    this.itemStartRot = 0;
    this.itemStartScale = 1;

    this.pollingTimer = null;

    // Zoom state
    this.zoomLevel = 1.0;
    this.minZoom = 0.5;
    this.maxZoom = 3.0;
    this.zoomStep = 0.25;

    // Paint state
    this.isPaintMode = false;
    this.isPainting = false;
    this.isEraserMode = false;
    this.paintColor = '#FF6B6B';
    this.paintBrushSize = 5;
    this.paintStrokes = [];
    this.currentStroke = null;

    // Undo / Redo History
    this.historyStack = [];
    this.redoStack = [];
    this.isRestoringState = false;
  }

  async init() {
    this.bindEvents();

    if (this.roomParam) {
      // Ortak Oda Modu
      await this.loadRoomMode(this.roomParam);
    } else if (this.cakeParam) {
      // Solo Pasta Modu
      await this.loadSoloMode(this.cakeParam);
    } else {
      showToast('Geçerli bir pasta veya oda bulunamadı.', 'error');
      setTimeout(() => window.location.href = '/', 2000);
    }
  }

  // ============================================================
  // YÜKLEME VE SENKRONİZASYON
  // ============================================================

  async loadSoloMode(cakeIdOrCode) {
    try {
      // Kaydedilmiş creator token var mı?
      const savedToken = localStorage.getItem(`cake_token_${cakeIdOrCode}`);
      if (savedToken) {
        api.setCreatorToken(savedToken);
        this.state.isCreator = true;
      }

      let cakeData = null;
      let cakeItems = [];

      try {
        const data = await api.getCake(cakeIdOrCode);
        cakeData = data.cake;
        cakeItems = data.items || [];
      } catch (err) {
        console.warn('API getCake error, using local fallback:', err);
        const cached = localStorage.getItem(`cake_data_${cakeIdOrCode}`);
        if (cached) {
          cakeData = JSON.parse(cached);
          const cachedItems = localStorage.getItem(`cake_items_${cakeIdOrCode}`) || localStorage.getItem(`cake_items_${cakeData.id}`);
          cakeItems = cachedItems ? JSON.parse(cachedItems) : [];
        } else {
          throw err;
        }
      }

      this.state.cake = cakeData;
      this.state.items = cakeItems;
      this.state.isLocked = cakeData.is_locked || false;

      this.updateUI();
      this.renderer.setData({
        cake: this.state.cake,
        items: this.state.items
      });

      // Solo modda dilim sayısını editörde göster
      this.updateEditorSliceCounter();
      this.saveStateToHistory();
    } catch (err) {
      showToast(err.message || 'Pasta yüklenemedi', 'error');
    }
  }

  async loadRoomMode(inviteCode) {
    try {
      // Katılımcı token'ını localStorage'dan al
      let savedToken = localStorage.getItem(`room_token_${inviteCode}`);
      let roomId = null;

      try {
        const roomStatus = await api.getRoomStatus(inviteCode);
        if (roomStatus && roomStatus.room) {
          roomId = roomStatus.room.id;
          savedToken = savedToken || localStorage.getItem(`room_token_${roomId}`);
        }
      } catch (err) {
        console.warn('Oda durumu alınırken hata (token araması):', err);
      }

      if (!savedToken) {
        // Token yoksa önce join sayfasına yönlendir
        window.location.href = `/join.html?room=${inviteCode}`;
        return;
      }

      api.setToken(savedToken);

      await this.pollRoomState(inviteCode);

      // 3 saniyede bir polling başlat
      this.pollingTimer = setInterval(() => {
        this.pollRoomState(inviteCode);
      }, 3000);

    } catch (err) {
      showToast(err.message || 'Oda yüklenemedi', 'error');
    }
  }

  async pollRoomState(inviteCode) {
    try {
      const data = await api.getRoomState(inviteCode);
      this.state.room = data.room;
      this.state.cake = data.cake;
      this.state.items = data.items || [];
      this.state.participants = data.participants || [];
      this.state.myParticipant = data.my_participant;
      this.state.remainingQuota = data.remaining_quota;
      this.state.isCreator = data.my_participant ? data.my_participant.is_creator : false;
      this.state.isLocked = data.cake.is_locked || false;

      this.updateUI();

      // Sürükleme veya döndürme esnasında kullanıcı hareketini bölmemek için seçili öğe yokken veya güncelken render et
      if (!this.isDragging && !this.isRotating && !this.isScaling) {
        this.renderer.setData({
          cake: this.state.cake,
          items: this.state.items,
          participants: this.state.participants
        });
      }
    } catch (err) {
      console.warn('Oda durumu senkronize edilemedi:', err);
    }
  }

  // ============================================================
  // ARAYÜZ GÜNCELLEMELERİ
  // ============================================================

  updateUI() {
    const titleEl = document.getElementById('nav-cake-title');
    if (titleEl && this.state.cake) {
      titleEl.textContent = this.state.cake.title || 'Hear Me Out Cake';
    }

    const badgeModeEl = document.getElementById('badge-mode');
    if (badgeModeEl && this.state.cake) {
      if (this.state.cake.mode === 'collab') {
        badgeModeEl.textContent = '👯 Ortak Oda';
        badgeModeEl.className = 'badge badge-quota';
      } else {
        badgeModeEl.textContent = '🍰 Solo Mod';
      }
    }

    // Kota Göstergesi (Ortak Modda)
    const quotaBadge = document.getElementById('badge-quota');
    if (quotaBadge) {
      if (this.state.room && this.state.remainingQuota !== null) {
        quotaBadge.style.display = 'inline-flex';
        quotaBadge.textContent = `${this.state.remainingQuota}/${this.state.room.items_per_participant} Ekleme Hakkı`;
        if (this.state.remainingQuota === 0) {
          quotaBadge.style.background = '#FFE388';
          quotaBadge.style.color = '#8A6D00';
        }
      } else {
        quotaBadge.style.display = 'none';
      }
    }

    // Katılımcı Listesi
    const participantsList = document.getElementById('participants-list');
    if (participantsList && this.state.participants.length > 0) {
      participantsList.innerHTML = '';
      this.state.participants.forEach(p => {
        const row = document.createElement('div');
        row.className = `participant-row ${this.state.myParticipant && this.state.myParticipant.id === p.id ? 'is-me' : ''}`;
        row.innerHTML = `
          <span>${p.is_creator ? '👑 ' : ''}${p.nickname}</span>
          <span class="badge">Dilim #${p.slice_index + 1}</span>
        `;
        participantsList.appendChild(row);
      });
    }

    // Kilitli Pasta Durumu & Yetki Kontrolleri
    const lockNotice = document.getElementById('lock-notice');
    const saveBtn = document.getElementById('btn-save-cake');
    const deleteEntireBtn = document.getElementById('btn-delete-entire-cake');

    if (this.state.isLocked) {
      if (lockNotice) lockNotice.style.display = 'block';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '🔒 Kilitlendi';
      }
    } else {
      if (lockNotice) lockNotice.style.display = 'none';
      if (saveBtn) {
        if (!this.state.isCreator && this.state.cake && this.state.cake.mode === 'collab') {
          saveBtn.style.display = 'none'; // Sadece creator kilitleyebilir
        } else {
          saveBtn.style.display = '';
        }
      }
    }

    if (deleteEntireBtn) {
      if (!this.state.isCreator && this.state.cake && this.state.cake.mode === 'collab') {
        deleteEntireBtn.style.display = 'none'; // Katılımcı tüm pastayı silemez
      } else {
        deleteEntireBtn.style.display = '';
      }
    }

    // Solo modda Dilim sekmesini göster, Collab modda gizle
    const tabSlices = document.getElementById('tab-slices');
    const mobileTabSlices = document.getElementById('mobile-tab-slices');
    if (this.state.cake && this.state.cake.mode === 'collab') {
      if (tabSlices) tabSlices.style.display = 'none';
      if (mobileTabSlices) mobileTabSlices.style.display = 'none';
    } else {
      if (tabSlices) tabSlices.style.display = '';
      if (mobileTabSlices) mobileTabSlices.style.display = '';
    }
  }

  updateEditorSliceCounter() {
    const valEl = document.getElementById('val-editor-slice');
    if (valEl && this.state.cake) {
      valEl.textContent = this.state.cake.slice_count || 8;
    }
  }

  // ============================================================
  // ETKİLEŞİMLER VE DOKUNMATİK / MOUSE KONTROLLERİ
  // ============================================================

  bindEvents() {
    // Sekme Butonları (Araçlar / Sticker / Renkler / Boya / Dilim)
    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        const section = document.getElementById(target);
        if (section) section.classList.add('active');
      });
    });

    // SVG Canvas Pointer Olayları (Sürükleme, Döndürme, Boyutlandırma)
    this.svgElement.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));

    // Yazı Ekleme Formu
    this.bindTextForm();

    // Sticker Ekleme Tıklamaları
    this.bindStickerGrid();

    // Renk Değiştirme
    this.bindColorPalette();

    // Özel Renk Seçiciler (Color Picker)
    this.bindCustomColorPickers();

    // Kaydet ve Kilitle Butonu
    const saveBtn = document.getElementById('btn-save-cake');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveCake());
    }

    // PNG İndirme Butonu
    const exportBtn = document.getElementById('btn-export-png');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportPng());
    }

    // Paylaş Butonu
    const shareBtn = document.getElementById('btn-share-cake');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.shareCake());
    }

    // Zoom Kontrolleri
    this.bindZoomControls();

    // Boyama Aracı
    this.bindPaintTool();

    // Dilim Sayısı (Solo Mod)
    this.bindSliceCounter();

    // Panelleri Gizle / Göster
    this.bindPanelToggles();

    // İnteraktif Resim Kırpma & Yerleştirme Modali
    this.bindInteractiveCropModal();

    // Geri Al / İleri Al ve Klavye Kısayolları
    this.bindUndoRedoControls();

    // Pastayı Silme Kontrolü
    this.bindDeleteCakeControl();

    // Mouse tekerleği ile zoom (canvas üzerinde)
    const canvasContainer = document.querySelector('.editor-canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.deltaY < 0) {
            this.zoomIn();
          } else {
            this.zoomOut();
          }
        }
      }, { passive: false });
    }
  }

  // ============================================================
  // ZOOM KONTROLLERİ
  // ============================================================

  bindZoomControls() {
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.zoomIn());
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.zoomOut());
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => this.zoomReset());
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
    this.applyZoom();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
    this.applyZoom();
  }

  zoomReset() {
    this.zoomLevel = 1.0;
    this.applyZoom();
  }

  applyZoom() {
    const stage = document.getElementById('cake-stage');
    const levelEl = document.getElementById('zoom-level');
    if (stage) {
      stage.style.transform = `scale(${this.zoomLevel})`;
    }
    if (levelEl) {
      levelEl.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  // ============================================================
  // BOYAMA ARACI
  // ============================================================

  bindPaintTool() {
    const toggleBtn = document.getElementById('btn-toggle-paint');
    const clearBtn = document.getElementById('btn-clear-paint');
    const brushSlider = document.getElementById('paint-brush-size');
    const brushLabel = document.getElementById('brush-size-label');
    const btnBrush = document.getElementById('btn-tool-brush');
    const btnEraser = document.getElementById('btn-tool-eraser');
    const colorsSection = document.getElementById('section-paint-colors');
    const brushSizeLbl = document.getElementById('lbl-brush-size');

    const updatePaintToggleUI = () => {
      const statusEl = document.getElementById('paint-status');
      if (!toggleBtn) return;
      if (this.isPaintMode) {
        toggleBtn.textContent = this.isEraserMode ? '🛑 Silmeyi Bitir' : '🛑 Boyamayı Bitir';
        toggleBtn.classList.remove('btn-primary');
        toggleBtn.classList.add('btn-secondary');
        document.body.classList.add('paint-active');
        if (statusEl) {
          statusEl.textContent = this.isEraserMode
            ? '🧹 Silgi modu aktif — pasta üzerindeki çizimleri silebilirsiniz!'
            : '🎨 Boyama modu aktif — pasta üzerine çizim yapabilirsiniz!';
        }
      } else {
        toggleBtn.textContent = this.isEraserMode ? '🧹 Silme İşlemini Başlat' : '🖌️ Boyamayı Başlat';
        toggleBtn.classList.remove('btn-secondary');
        toggleBtn.classList.add('btn-primary');
        document.body.classList.remove('paint-active');
        if (statusEl) statusEl.textContent = '';
      }
    };

    // Fırça / Silgi Modu Seçimi
    if (btnBrush) {
      btnBrush.addEventListener('click', () => {
        this.isEraserMode = false;
        btnBrush.classList.add('active');
        if (btnEraser) btnEraser.classList.remove('active');
        if (colorsSection) colorsSection.style.display = 'block';
        if (brushSizeLbl) brushSizeLbl.innerHTML = '<span>📏</span> Fırça Kalınlığı';
        updatePaintToggleUI();
      });
    }

    if (btnEraser) {
      btnEraser.addEventListener('click', () => {
        this.isEraserMode = true;
        btnEraser.classList.add('active');
        if (btnBrush) btnBrush.classList.remove('active');
        if (colorsSection) colorsSection.style.display = 'none';
        if (brushSizeLbl) brushSizeLbl.innerHTML = '<span>📏</span> Silgi Kalınlığı';
        updatePaintToggleUI();
      });
    }

    // Fırça rengi seçimi
    document.querySelectorAll('#paint-color-swatches .color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#paint-color-swatches .color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.paintColor = btn.dataset.color;
      });
    });

    // Özel boya rengi
    const customPaintColor = document.getElementById('custom-paint-color');
    if (customPaintColor) {
      customPaintColor.addEventListener('input', (e) => {
        this.paintColor = e.target.value;
        document.querySelectorAll('#paint-color-swatches .color-swatch').forEach(b => b.classList.remove('active'));
      });
    }

    // Fırça kalınlığı
    if (brushSlider) {
      brushSlider.addEventListener('input', (e) => {
        this.paintBrushSize = parseInt(e.target.value);
        if (brushLabel) brushLabel.textContent = `${this.paintBrushSize}px`;
      });
    }

    // Boyama modunu aç/kapa
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.isPaintMode = !this.isPaintMode;
        updatePaintToggleUI();
      });
    }

    // Boyamaları temizle
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.paintStrokes = [];
        this.renderer.state.paintStrokes = [];
        this.renderer.renderPaintStrokes();
        this.saveStateToHistory();
        showToast('Boyama temizlendi 🧹', 'info');
      });
    }
  }

  // Pointer Olayları
  handlePointerDown(e) {
    if (this.state.isLocked) return;

    // Boyama modu açıksa önce boyama işlemini başlat
    if (this.isPaintMode) {
      // Tutamaçlara tıklanmadığından emin ol
      const handle = e.target.closest('.handle-delete, .handle-rotate, .handle-scale');
      if (!handle) {
        this.startPaint(e);
        return;
      }
    }

    // 1. Silme Butonu Tıklaması
    const deleteBtn = e.target.closest('.handle-delete');
    if (deleteBtn && this.state.selectedItem) {
      e.stopPropagation();
      this.deleteSelectedItem();
      return;
    }

    // 2. Döndürme Tutamacı
    const rotateHandle = e.target.closest('.handle-rotate');
    if (rotateHandle && this.state.selectedItem) {
      e.stopPropagation();
      this.isRotating = true;
      this.activePointerId = e.pointerId;
      const pt = this.getSvgCoords(e);
      this.dragStartPos = pt;
      this.itemStartRot = this.state.selectedItem.rotation || 0;
      return;
    }

    // 3. Boyutlandırma Tutamacı
    const scaleHandle = e.target.closest('.handle-scale');
    if (scaleHandle && this.state.selectedItem) {
      e.stopPropagation();
      this.isScaling = true;
      this.activePointerId = e.pointerId;
      const pt = this.getSvgCoords(e);
      this.dragStartPos = pt;
      this.itemStartScale = this.state.selectedItem.scale || 1.0;
      return;
    }

    // 4. Öğeye Tıklama ve Sürükleme Başlatma
    const itemNode = e.target.closest('.cake-item-node');
    if (itemNode) {
      const itemId = itemNode.dataset.itemId;
      const item = this.state.items.find(i => i.id === itemId);
      if (item) {
        this.selectItem(item);
        this.isDragging = true;
        this.activePointerId = e.pointerId;
        const pt = this.getSvgCoords(e);
        this.dragStartPos = pt;
        this.itemStartPos = { x: item.x, y: item.y };
        e.stopPropagation();
        return;
      }
    }

    // 5. Boş Alana Tıklama -> Seçimi Kaldır
    this.selectItem(null);
  }

  handlePointerMove(e) {
    // Boyama modu sırasında (Pasta yüzeyi r=230 ile sınırlı)
    if (this.isPainting && this.currentStroke) {
      let pt = this.getSvgCoords(e);
      const dist = Math.hypot(pt.x - 300, pt.y - 300);
      if (dist > 230) {
        pt.x = Math.round(300 + ((pt.x - 300) / dist) * 230);
        pt.y = Math.round(300 + ((pt.y - 300) / dist) * 230);
      }
      this.currentStroke.points.push(pt);
      this.renderer.state.paintStrokes = this.paintStrokes;
      this.renderer.renderPaintStrokes();
      return;
    }

    if (this.activePointerId !== e.pointerId) return;
    const pt = this.getSvgCoords(e);

    if (this.isDragging && this.state.selectedItem) {
      const dx = (pt.x - this.dragStartPos.x) / 600;
      const dy = (pt.y - this.dragStartPos.y) / 600;
      this.state.selectedItem.x = clamp(this.itemStartPos.x + dx, 0.05, 0.95);
      this.state.selectedItem.y = clamp(this.itemStartPos.y + dy, 0.05, 0.95);
      this.renderer.render();
    } else if (this.isRotating && this.state.selectedItem) {
      const center = normToSvg(this.state.selectedItem.x, this.state.selectedItem.y);
      const angle = Math.atan2(pt.y - center.y, pt.x - center.x) * (180 / Math.PI);
      this.state.selectedItem.rotation = Math.round(angle + 90);
      this.renderer.render();
    } else if (this.isScaling && this.state.selectedItem) {
      const center = normToSvg(this.state.selectedItem.x, this.state.selectedItem.y);
      const dist = Math.hypot(pt.x - center.x, pt.y - center.y);
      const initDist = Math.hypot(this.dragStartPos.x - center.x, this.dragStartPos.y - center.y) || 1;
      const newScale = clamp(this.itemStartScale * (dist / initDist), 0.003, 3.0);
      this.state.selectedItem.scale = Math.round(newScale * 1000) / 1000;
      this.renderer.render();
    }
  }

  async handlePointerUp(e) {
    // Boyama bitişi
    if (this.isPainting) {
      this.isPainting = false;
      this.currentStroke = null;
      this.saveStateToHistory();
      return;
    }

    if (this.activePointerId !== e.pointerId) return;

    if ((this.isDragging || this.isRotating || this.isScaling) && this.state.selectedItem) {
      const item = this.state.selectedItem;
      try {
        await api.updateItem(item.id, {
          x: item.x,
          y: item.y,
          rotation: item.rotation,
          scale: item.scale
        });
        this.saveStateToHistory();
      } catch (err) {
        console.warn('Öğe konumu güncellenemedi:', err);
      }
    }

    this.isDragging = false;
    this.isRotating = false;
    this.isScaling = false;
    this.activePointerId = null;
  }

  startPaint(e) {
    e.preventDefault();
    e.stopPropagation();
    let pt = this.getSvgCoords(e);
    const dist = Math.hypot(pt.x - 300, pt.y - 300);
    if (dist > 230) {
      pt.x = Math.round(300 + ((pt.x - 300) / dist) * 230);
      pt.y = Math.round(300 + ((pt.y - 300) / dist) * 230);
    }
    this.isPainting = true;
    this.currentStroke = {
      color: this.paintColor,
      size: this.isEraserMode ? (this.paintBrushSize * 1.8) : this.paintBrushSize,
      isEraser: this.isEraserMode,
      points: [pt]
    };
    this.paintStrokes.push(this.currentStroke);
  }

  getSvgCoords(e) {
    const rect = this.svgElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 600;
    const y = ((e.clientY - rect.top) / rect.height) * 600;
    return { x, y };
  }

  selectItem(item) {
    this.state.selectedItem = item;
    this.renderer.state.selectedItemId = item ? item.id : null;
    if (item) {
      // Seçili öğeyi en üst katmana getir
      const idx = this.state.items.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        const [selected] = this.state.items.splice(idx, 1);
        this.state.items.push(selected);
      }
    }
    this.renderer.render();

    const bar = document.getElementById('selected-item-bar');
    const nameLabel = document.getElementById('selected-item-name');
    if (bar && nameLabel) {
      if (item) {
        const typeNames = { topper: 'Kürdanlı Tabela 🍢', sticker: 'Süs 🍓', text: 'Yazı ✍️', image: 'Fotoğraf 📸' };
        nameLabel.textContent = typeNames[item.type] || 'Öğe';
        bar.style.display = 'flex';
      } else {
        bar.style.display = 'none';
      }
    }
  }

  persistSoloItems() {
    if (this.state.cake && this.state.cake.mode === 'solo') {
      try {
        localStorage.setItem(`cake_items_${this.state.cake.id}`, JSON.stringify(this.state.items));
        if (this.state.cake.share_code) {
          localStorage.setItem(`cake_items_${this.state.cake.share_code}`, JSON.stringify(this.state.items));
        }
      } catch (e) {}
    }
  }

  async deleteSelectedItem() {
    if (!this.state.selectedItem) return;
    const itemId = this.state.selectedItem.id;
    try {
      await api.deleteItem(itemId);
    } catch (err) {
      console.warn('API deleteItem failed, deleting locally:', err);
    }
    this.state.items = this.state.items.filter(i => i.id !== itemId);
    this.persistSoloItems();
    this.selectItem(null);
    this.renderer.setData({ items: this.state.items });
    this.saveStateToHistory();
    showToast('Öğe silindi', 'info');
    if (this.state.remainingQuota !== null) {
      this.state.remainingQuota++;
      this.updateUI();
    }
  }

  // ============================================================
  // GERİ AL / İLERİ AL (UNDO / REDO) HİSTORY SİSTEMİ
  // ============================================================

  saveStateToHistory() {
    if (this.isRestoringState || !this.state.cake) return;
    const snapshotStr = JSON.stringify({
      cake: JSON.parse(JSON.stringify(this.state.cake)),
      items: JSON.parse(JSON.stringify(this.state.items || [])),
      paintStrokes: JSON.parse(JSON.stringify(this.paintStrokes || []))
    });

    if (this.historyStack.length > 0 && this.historyStack[this.historyStack.length - 1] === snapshotStr) {
      return;
    }

    this.historyStack.push(snapshotStr);
    if (this.historyStack.length > 50) this.historyStack.shift();
    this.redoStack = [];
    this.updateUndoRedoUI();
  }

  updateUndoRedoUI() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = this.historyStack.length <= 1;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }

  undo() {
    if (this.historyStack.length <= 1) return;
    const currentStr = this.historyStack.pop();
    this.redoStack.push(currentStr);

    const prevSnapshotStr = this.historyStack[this.historyStack.length - 1];
    this.applyStateSnapshot(JSON.parse(prevSnapshotStr));
    this.updateUndoRedoUI();
    showToast('İşlem geri alındı ↶', 'info');
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const nextSnapshotStr = this.redoStack.pop();
    this.historyStack.push(nextSnapshotStr);

    this.applyStateSnapshot(JSON.parse(nextSnapshotStr));
    this.updateUndoRedoUI();
    showToast('İşlem ileri alındı ↷', 'info');
  }

  applyStateSnapshot(snapshot) {
    this.isRestoringState = true;
    try {
      this.state.cake = snapshot.cake;
      this.state.items = snapshot.items || [];
      this.paintStrokes = snapshot.paintStrokes || [];

      this.renderer.state.paintStrokes = this.paintStrokes;
      this.renderer.setData({ cake: this.state.cake, items: this.state.items });
      this.renderer.renderPaintStrokes();
      this.updateUI();

      if (this.state.selectedItem) {
        const stillExists = this.state.items.find(i => i.id === this.state.selectedItem.id);
        this.selectItem(stillExists || null);
      }
    } finally {
      this.isRestoringState = false;
    }
  }

  bindUndoRedoControls() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.addEventListener('click', () => this.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => this.redo());

    const btnDeleteSelected = document.getElementById('btn-delete-selected-item');
    if (btnDeleteSelected) btnDeleteSelected.addEventListener('click', () => this.deleteSelectedItem());

    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          this.redo();
        } else {
          e.preventDefault();
          this.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused && this.state.selectedItem) {
        e.preventDefault();
        this.deleteSelectedItem();
      }
    });
  }

  bindDeleteCakeControl() {
    const deleteBtn = document.getElementById('btn-delete-entire-cake');
    if (!deleteBtn) return;

    deleteBtn.addEventListener('click', async () => {
      if (!this.state.cake) return;
      const cakeTitle = this.state.cake.title || 'Bu pastayı';
      if (!confirm(`"${cakeTitle}" tamamen silinecektir. Emin misiniz?`)) return;

      try {
        const cakeId = this.state.cake.id;
        const shareCode = this.state.cake.share_code;

        const tokenKey = `cake_token_${cakeId}`;
        const altTokenKey = `cake_token_${shareCode}`;
        const savedToken = localStorage.getItem(tokenKey) || localStorage.getItem(altTokenKey);
        if (savedToken) api.setCreatorToken(savedToken);

        if (typeof api.deleteCake === 'function') {
          await api.deleteCake(cakeId);
        } else {
          await api.request(`/api/cakes/${cakeId}`, { method: 'DELETE' });
        }
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(altTokenKey);
        showToast('Pasta başarıyla silindi 🗑️', 'info');
        setTimeout(() => window.location.href = '/gallery.html', 1000);
      } catch (err) {
        showToast(err.message || 'Pasta silinemedi', 'error');
      }
    });
  }

  // ============================================================
  // DİLİM SAYISI DEĞİŞTİRME (Solo Mod)
  // ============================================================

  bindSliceCounter() {
    const minusBtn = document.getElementById('btn-editor-slice-minus');
    const plusBtn = document.getElementById('btn-editor-slice-plus');

    if (minusBtn) {
      minusBtn.addEventListener('click', () => this.changeSliceCount(-1));
    }
    if (plusBtn) {
      plusBtn.addEventListener('click', () => this.changeSliceCount(1));
    }
  }

  async changeSliceCount(delta) {
    if (!this.state.cake || this.state.isLocked) return;
    if (this.state.cake.mode === 'collab') {
      showToast('Ortak modda dilim sayısı değiştirilemez.', 'error');
      return;
    }

    const current = this.state.cake.slice_count || 8;
    const next = clamp(current + delta, 1, 24);
    if (next === current) return;

    try {
      await api.updateCake(this.state.cake.id, { slice_count: next });
      this.state.cake.slice_count = next;
      this.updateEditorSliceCounter();
      this.renderer.setData({ cake: this.state.cake });
      this.saveStateToHistory();
      showToast(`Dilim sayısı: ${next} 🔪`, 'success');
    } catch (err) {
      showToast(err.message || 'Dilim sayısı güncellenemedi', 'error');
    }
  }

  // ============================================================
  // ÖĞE EKLEME METOTLARI
  // ============================================================

  bindPanelToggles() {
    const workspace = document.querySelector('.editor-workspace');
    const btnToggleFocus = document.getElementById('btn-toggle-focus');
    const lblToggleFocus = document.getElementById('lbl-toggle-focus');

    const btnToggleLeft = document.getElementById('btn-toggle-left-panel');
    const btnToggleRight = document.getElementById('btn-toggle-right-panel');

    let hideLeft = false;
    let hideRight = false;

    const updatePanels = () => {
      if (hideLeft) {
        workspace.classList.add('hide-left');
      } else {
        workspace.classList.remove('hide-left');
      }

      if (hideRight) {
        workspace.classList.add('hide-right');
      } else {
        workspace.classList.remove('hide-right');
      }

      if (btnToggleFocus) {
        if (hideLeft && hideRight) {
          if (lblToggleFocus) lblToggleFocus.textContent = 'Panelleri Göster';
        } else {
          if (lblToggleFocus) lblToggleFocus.textContent = 'Panelleri Gizle';
        }
      }
    };

    if (btnToggleFocus) {
      btnToggleFocus.addEventListener('click', () => {
        if (hideLeft && hideRight) {
          hideLeft = false;
          hideRight = false;
        } else {
          hideLeft = true;
          hideRight = true;
        }
        updatePanels();
      });
    }

    if (btnToggleLeft) {
      btnToggleLeft.addEventListener('click', () => {
        hideLeft = !hideLeft;
        updatePanels();
      });
    }

    if (btnToggleRight) {
      btnToggleRight.addEventListener('click', () => {
        hideRight = !hideRight;
        updatePanels();
      });
    }
  }

  bindInteractiveCropModal() {
    const modal = document.getElementById('modal-crop-image');
    const closeBtn = document.getElementById('close-modal-crop');
    const cancelBtn = document.getElementById('btn-crop-cancel');
    const confirmBtn = document.getElementById('btn-crop-confirm');

    const stage = document.getElementById('interactive-crop-stage');
    const img = document.getElementById('crop-stage-img');

    const zoomInBtn = document.getElementById('btn-crop-zoom-in');
    const zoomOutBtn = document.getElementById('btn-crop-zoom-out');
    const rotateBtn = document.getElementById('btn-crop-rotate');
    const centerBtn = document.getElementById('btn-crop-center');

    const zoomSlider = document.getElementById('crop-slider-zoom');
    const zoomValLabel = document.getElementById('crop-zoom-val');
    const captionInput = document.getElementById('crop-input-caption');

    const fileInput = document.getElementById('input-topper-file');
    const dropzone = document.getElementById('dropzone-topper');

    if (!modal || !stage || !img) return;

    let loadedFile = null;
    let cropState = {
      posX: 0,
      posY: 0,
      zoom: 1.0,
      rotation: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
      initPosX: 0,
      initPosY: 0
    };

    const updateTransform = () => {
      img.style.transform = `translate(calc(-50% + ${cropState.posX}px), calc(-50% + ${cropState.posY}px)) scale(${cropState.zoom}) rotate(${cropState.rotation}deg)`;
      if (zoomSlider) zoomSlider.value = cropState.zoom;
      if (zoomValLabel) {
        const pct = cropState.zoom * 100;
        zoomValLabel.textContent = pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
      }
    };

    const resetCropState = () => {
      cropState.posX = 0;
      cropState.posY = 0;
      cropState.zoom = 1.0;
      cropState.rotation = 0;
      updateTransform();
    };

    // Stage Pointer Drag (Fare/Dokunmatik ile resim kaydırma)
    stage.addEventListener('pointerdown', (e) => {
      cropState.isDragging = true;
      cropState.startX = e.clientX;
      cropState.startY = e.clientY;
      cropState.initPosX = cropState.posX;
      cropState.initPosY = cropState.posY;
      stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => {
      if (!cropState.isDragging) return;
      const dx = e.clientX - cropState.startX;
      const dy = e.clientY - cropState.startY;
      cropState.posX = cropState.initPosX + dx;
      cropState.posY = cropState.initPosY + dy;
      updateTransform();
    });

    const stopDrag = (e) => {
      if (cropState.isDragging) {
        cropState.isDragging = false;
        try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);

    // Tekerlek ile zoom
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      cropState.zoom = clamp(Math.round((cropState.zoom + delta) * 1000) / 1000, 0.003, 3.0);
      updateTransform();
    }, { passive: false });

    // Buton kontrolleri
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => { cropState.zoom = clamp(Math.round((cropState.zoom + 0.15) * 1000) / 1000, 0.003, 3.0); updateTransform(); });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { cropState.zoom = clamp(Math.round((cropState.zoom - 0.15) * 1000) / 1000, 0.003, 3.0); updateTransform(); });
    if (rotateBtn) rotateBtn.addEventListener('click', () => { cropState.rotation = (cropState.rotation + 90) % 360; updateTransform(); });
    if (centerBtn) centerBtn.addEventListener('click', resetCropState);

    if (zoomSlider) {
      zoomSlider.addEventListener('input', (e) => {
        cropState.zoom = parseFloat(e.target.value) || 1.0;
        updateTransform();
      });
    }

    const closeModal = () => {
      modal.classList.remove('active');
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (captionInput) {
      captionInput.addEventListener('input', (e) => {
        const previewEl = document.getElementById('crop-caption-preview');
        if (previewEl) previewEl.textContent = e.target.value.trim() || 'Hear Me Out';
      });
    }

    // Dropzone veya File Input seçildiğinde Modali Aç
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          loadedFile = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (re) => {
            img.onload = () => {
              const imgW = img.naturalWidth || 232;
              const imgH = img.naturalHeight || 184;
              const baseRatio = Math.max(232 / imgW, 184 / imgH);
              img.style.width = `${Math.round(imgW * baseRatio)}px`;
              img.style.height = `${Math.round(imgH * baseRatio)}px`;
              resetCropState();
            };
            img.src = re.target.result;

            if (captionInput) {
              const sidebarCaption = document.getElementById('input-topper-caption');
              if (sidebarCaption && sidebarCaption.value) {
                captionInput.value = sidebarCaption.value;
              }
              const previewEl = document.getElementById('crop-caption-preview');
              if (previewEl) previewEl.textContent = captionInput.value.trim() || 'Hear Me Out';
            }
            modal.classList.add('active');
          };
          reader.readAsDataURL(loadedFile);
        }
      });
    }

    // Modal Onayla ve Pastaya Ekle
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (this.state.isLocked) {
          showToast('Pasta kilitlendiği için öğe eklenemez.', 'error');
          return;
        }
        if (this.state.remainingQuota === 0) {
          showToast('Ekleme hakkınız doldu! 🎉', 'error');
          return;
        }
        if (!loadedFile) {
          showToast('Lütfen bir fotoğraf seçin', 'error');
          return;
        }

        const caption = captionInput ? (captionInput.value.trim() || 'Hear Me Out') : 'Hear Me Out';
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Görsel İşleniyor... 🍢';

        try {
          // Offscreen Canvas Render
          const croppedBlob = await this.renderCroppedCanvas(img, cropState);
          const finalFile = new File([croppedBlob], 'topper-adjusted.png', { type: 'image/png' });

          let itemRes = null;
          try {
            const uploadRes = await api.uploadImage(finalFile);
            itemRes = await api.addItem(this.state.cake.id, {
              type: 'topper',
              content: caption,
              x: 0.5,
              y: 0.45,
              scale: 1.0,
              rotation: Math.floor(Math.random() * 16) - 8,
              style: {
                caption: caption,
                imageUrl: uploadRes.url
              }
            });
          } catch (uploadOrAddErr) {
            console.warn('API topper upload/add error, using local fallback:', uploadOrAddErr);
            const dataUrl = await new Promise((res) => {
              const r = new FileReader();
              r.onload = () => res(r.result);
              r.readAsDataURL(finalFile);
            });
            itemRes = {
              id: 'topper_' + Math.random().toString(36).substring(2, 10),
              cake_id: this.state.cake.id,
              type: 'topper',
              content: caption,
              x: 0.5,
              y: 0.45,
              scale: 1.0,
              rotation: Math.floor(Math.random() * 16) - 8,
              style: {
                caption: caption,
                imageUrl: dataUrl
              },
              created_at: new Date().toISOString()
            };
          }

          this.state.items.push(itemRes);
          this.persistSoloItems();
          this.renderer.setData({ items: this.state.items });
          this.selectItem(itemRes);
          this.saveStateToHistory();

          if (this.state.remainingQuota !== null && this.state.remainingQuota > 0) {
            this.state.remainingQuota--;
            this.updateUI();
          }

          fileInput.value = '';
          loadedFile = null;
          if (captionInput) captionInput.value = '';
          closeModal();
          showToast('Tabela pastaya dikildi! 🍰✨', 'success');
        } catch (err) {
          showToast(err.message || 'Tabela eklenemedi', 'error');
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Pastaya Dik 📍';
        }
      });
    }
  }

  renderCroppedCanvas(imgElement, { posX, posY, zoom, rotation }) {
    return new Promise((resolve) => {
      const targetW = 232;
      const targetH = 184;
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#FFF5F8';
      ctx.fillRect(0, 0, targetW, targetH);

      ctx.save();
      // Center canvas origin
      ctx.translate(targetW / 2 + posX, targetH / 2 + posY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      const imgW = imgElement.naturalWidth || imgElement.width || 100;
      const imgH = imgElement.naturalHeight || imgElement.height || 100;

      const baseRatio = Math.max(targetW / imgW, targetH / imgH);
      const drawW = imgW * baseRatio;
      const drawH = imgH * baseRatio;

      ctx.drawImage(imgElement, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      canvas.toBlob(resolve, 'image/png', 0.95);
    });
  }

  bindTextForm() {
    const btnAddText = document.getElementById('btn-add-text');
    if (!btnAddText) return;

    btnAddText.addEventListener('click', async () => {
      if (this.state.isLocked) {
        showToast('Pasta kilitlendiği için öğe eklenemez.', 'error');
        return;
      }
      if (this.state.remainingQuota === 0) {
        showToast('Ekleme hakkınız doldu! 🎉', 'error');
        return;
      }

      const text = document.getElementById('input-cake-text').value.trim();
      if (!text) {
        showToast('Lütfen bir metin girin', 'error');
        return;
      }

      try {
        let itemRes = null;
        try {
          itemRes = await api.addItem(this.state.cake.id, {
            type: 'text',
            content: text,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            rotation: 0,
            style: {
              color: '#5B4B6B',
              fontSize: 16
            }
          });
        } catch (apiErr) {
          console.warn('API text add error, using local fallback:', apiErr);
          itemRes = {
            id: 'text_' + Math.random().toString(36).substring(2, 10),
            cake_id: this.state.cake.id,
            type: 'text',
            content: text,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            rotation: 0,
            style: {
              color: '#5B4B6B',
              fontSize: 16
            },
            created_at: new Date().toISOString()
          };
        }

        this.state.items.push(itemRes);
        this.persistSoloItems();
        this.renderer.setData({ items: this.state.items });
        this.selectItem(itemRes);
        this.saveStateToHistory();

        if (this.state.remainingQuota !== null && this.state.remainingQuota > 0) {
          this.state.remainingQuota--;
          this.updateUI();
        }

        document.getElementById('input-cake-text').value = '';
        showToast('Yazı eklendi ✨', 'success');
      } catch (err) {
        showToast(err.message || 'Yazı eklenemedi', 'error');
      }
    });
  }

  bindStickerGrid() {
    document.querySelectorAll('.sticker-item').forEach(el => {
      el.addEventListener('click', async () => {
        if (this.state.isLocked) {
          showToast('Pasta kilitlendiği için öğe eklenemez.', 'error');
          return;
        }
        if (this.state.remainingQuota === 0) {
          showToast('Ekleme hakkınız doldu! 🎉', 'error');
          return;
        }

        const stickerCode = el.dataset.sticker;
        try {
          let itemRes = null;
          try {
            itemRes = await api.addItem(this.state.cake.id, {
              type: 'sticker',
              content: stickerCode,
              x: 0.5 + (Math.random() * 0.2 - 0.1),
              y: 0.5 + (Math.random() * 0.2 - 0.1),
              scale: 1.0,
              rotation: Math.floor(Math.random() * 30 - 15)
            });
          } catch (apiErr) {
            console.warn('API sticker add error, using local fallback:', apiErr);
            itemRes = {
              id: 'sticker_' + Math.random().toString(36).substring(2, 10),
              cake_id: this.state.cake.id,
              type: 'sticker',
              content: stickerCode,
              x: 0.5 + (Math.random() * 0.2 - 0.1),
              y: 0.5 + (Math.random() * 0.2 - 0.1),
              scale: 1.0,
              rotation: Math.floor(Math.random() * 30 - 15),
              style: {},
              created_at: new Date().toISOString()
            };
          }

          this.state.items.push(itemRes);
          this.persistSoloItems();
          this.renderer.setData({ items: this.state.items });
          this.selectItem(itemRes);
          this.saveStateToHistory();

          if (this.state.remainingQuota !== null && this.state.remainingQuota > 0) {
            this.state.remainingQuota--;
            this.updateUI();
          }

          showToast('Süs eklendi! 🎀', 'success');
        } catch (err) {
          showToast(err.message || 'Süs eklenemedi', 'error');
        }
      });
    });
  }

  bindColorPalette() {
    document.querySelectorAll('#editor-swatches-cake .color-swatch').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (this.state.isLocked) return;
        const color = btn.dataset.color;
        // Tüm aktif sınıfları kaldır
        document.querySelectorAll('#editor-swatches-cake .color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        try {
          await api.updateCake(this.state.cake.id, { cake_color: color });
        } catch (err) {
          console.warn('API updateCake cake_color failed, updating locally:', err);
        }
        this.state.cake.cake_color = color;
        this.renderer.setData({ cake: this.state.cake });
        this.saveStateToHistory();
      });
    });

    document.querySelectorAll('#editor-swatches-frosting .color-swatch').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (this.state.isLocked) return;
        const color = btn.dataset.color;
        document.querySelectorAll('#editor-swatches-frosting .color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        try {
          await api.updateCake(this.state.cake.id, { frosting_color: color });
        } catch (err) {
          console.warn('API updateCake frosting_color failed, updating locally:', err);
        }
        this.state.cake.frosting_color = color;
        this.renderer.setData({ cake: this.state.cake });
        this.saveStateToHistory();
      });
    });
  }

  bindCustomColorPickers() {
    // Özel pasta rengi
    const customCakeColor = document.getElementById('custom-cake-color');
    if (customCakeColor) {
      customCakeColor.addEventListener('input', async (e) => {
        if (this.state.isLocked) return;
        const color = e.target.value;
        document.querySelectorAll('#editor-swatches-cake .color-swatch').forEach(b => b.classList.remove('active'));
        try {
          await api.updateCake(this.state.cake.id, { cake_color: color });
        } catch (err) {
          console.warn('API updateCake cake_color failed, updating locally:', err);
        }
        this.state.cake.cake_color = color;
        this.renderer.setData({ cake: this.state.cake });
      });
    }

    // Özel krema rengi
    const customFrostingColor = document.getElementById('custom-frosting-color');
    if (customFrostingColor) {
      customFrostingColor.addEventListener('input', async (e) => {
        if (this.state.isLocked) return;
        const color = e.target.value;
        document.querySelectorAll('#editor-swatches-frosting .color-swatch').forEach(b => b.classList.remove('active'));
        try {
          await api.updateCake(this.state.cake.id, { frosting_color: color });
        } catch (err) {
          console.warn('API updateCake frosting_color failed, updating locally:', err);
        }
        this.state.cake.frosting_color = color;
        this.renderer.setData({ cake: this.state.cake });
      });
    }
  }

  // ============================================================
  // KAYDETME, PAYLAŞMA VE PNG İNDİRME
  // ============================================================

  async saveCake() {
    if (this.state.isLocked) return;
    if (!confirm('Pastayı tamamlayıp kilitlemek istediğinize emin misiniz? Kilitlendikten sonra yeni öğe eklenemez.')) {
      return;
    }

    try {
      await api.saveCake(this.state.cake.id);
    } catch (err) {
      console.warn('API saveCake failed, saving locally:', err);
    }
    this.state.isLocked = true;
    this.state.cake.is_locked = true;
    if (this.state.cake.mode === 'solo') {
      localStorage.setItem(`cake_data_${this.state.cake.id}`, JSON.stringify(this.state.cake));
      if (this.state.cake.share_code) {
        localStorage.setItem(`cake_data_${this.state.cake.share_code}`, JSON.stringify(this.state.cake));
      }
    }
    this.updateUI();
    showToast('Pasta başarıyla kilitlendi ve kaydedildi! 🎉', 'success');
  }

  async exportPng() {
    try {
      showToast('PNG görseli hazırlanıyor...', 'info');
      await exportCakeToPng(this.svgElement, this.state.cake.title);
      showToast('Pastanız indirildi! 🎂📸', 'success');
    } catch (err) {
      showToast('PNG dışa aktarılırken hata oluştu: ' + err.message, 'error');
    }
  }

  shareCake() {
    let shareUrl = window.location.href;
    if (this.state.room) {
      shareUrl = `${window.location.origin}/join.html?room=${this.state.room.invite_code}`;
    } else if (this.state.cake) {
      shareUrl = `${window.location.origin}/editor.html?cake=${this.state.cake.share_code}`;
    }

    if (navigator.share) {
      navigator.share({
        title: this.state.cake ? this.state.cake.title : 'Hear Me Out Cake',
        text: 'Pastamızı birlikte süsleyelim veya görüntüle!',
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      showToast('Paylaşım linki panoya kopyalandı! 📋', 'success');
    }
  }
}

// Uygulamayı başlat
const app = new CakeEditorApp();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
