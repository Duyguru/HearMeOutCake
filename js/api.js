// ============================================================
// Hear Me Out Cake — API İstemcisi (api.js)
// ============================================================

export class ApiClient {
  constructor(options = {}) {
    this.token = options.token || null;
    this.creatorToken = options.creatorToken || null;
  }

  setToken(token) {
    this.token = token;
  }

  setCreatorToken(token) {
    this.creatorToken = token;
  }

  getHeaders(customHeaders = {}) {
    const headers = { ...customHeaders };
    if (this.token) {
      headers['X-Participant-Token'] = this.token;
    }
    if (this.creatorToken) {
      headers['X-Creator-Token'] = this.creatorToken;
    }
    return headers;
  }

  async request(path, options = {}) {
    const headers = this.getHeaders(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    if (!response.ok) {
      let errorDetail = `İstek başarısız oldu (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.detail) errorDetail = errJson.detail;
      } catch (e) {
        // ignore parse error
      }
      const error = new Error(errorDetail);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  // Pastalar
  createSoloCake(data) {
    return this.request('/api/cakes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  getCake(shareCodeOrId) {
    return this.request(`/api/cakes/${shareCodeOrId}`);
  }

  getCakeById(cakeId) {
    return this.request(`/api/cakes/id/${cakeId}`);
  }

  updateCake(cakeId, updates) {
    return this.request(`/api/cakes/${cakeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  saveCake(cakeId) {
    return this.request(`/api/cakes/${cakeId}/save`, {
      method: 'POST'
    });
  }

  deleteCake(cakeId) {
    return this.request(`/api/cakes/${cakeId}`, {
      method: 'DELETE'
    });
  }

  getGalleryCakes(tokens) {
    return this.request(`/api/cakes/gallery?tokens=${encodeURIComponent(tokens.join(','))}`);
  }

  // Odalar
  createRoom(data) {
    return this.request('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  getRoomStatus(inviteCode) {
    return this.request(`/api/rooms/${inviteCode}`);
  }

  joinRoom(inviteCode, nickname) {
    return this.request(`/api/rooms/${inviteCode}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname })
    });
  }

  getRoomState(inviteCode) {
    return this.request(`/api/rooms/${inviteCode}/state`);
  }

  // Öğeler
  addItem(cakeId, itemData) {
    return this.request(`/api/cakes/${cakeId}/items`, {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
  }

  updateItem(itemId, updates) {
    return this.request(`/api/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  deleteItem(itemId) {
    return this.request(`/api/items/${itemId}`, {
      method: 'DELETE'
    });
  }

  // Resim Yükleme
  async uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/api/uploads', {
      method: 'POST',
      body: formData
    });
  }
}

export const api = new ApiClient();
if (typeof window !== 'undefined') {
  window.api = api;
}
