# 🎂 Hear Me Out Cake — Proje Spesifikasyonu

> Bu dosya Antigravity agent'ı için ana referans dokümanıdır. Kodlamaya başlamadan önce tamamını oku, ardından **"Geliştirme Planı"** bölümündeki fazları sırayla uygula. Her faz sonunda çalıştır, test et ve bir sonraki faza geç.

---

## 1. Proje Özeti

**Hear Me Out Cake**, kullanıcıların sanal bir pasta oluşturup onu dilimlere bölebildiği, isim ve resimlerle süsleyebildiği ve bunu **tek başına** ya da **arkadaşlarıyla birlikte** yapabildiği bir web uygulamasıdır. ("Hear me out cake" trendi: pastanın üzerine esprili/beklenmedik karakter, kişi ve isimlerin eklenmesi.)

Ana fikir:
1. Kullanıcı pastayı kaç kişiye böleceğini seçer (dilim sayısı).
2. Pastayı şekillendirir ve süsler (şekil, kat, renk, krema, süsler).
3. Pastaya **isim (yazı)** ve **resim** olarak ekleme yapar.
4. Pastayı **kaydeder** (veritabanı + PNG olarak indirme).
5. İsterse pastayı **arkadaşlarıyla birlikte** oluşturur: davet linki paylaşılır, arkadaşlar linkle katılıp kendi eklemelerini yapar.

---

## 2. Teknoloji Yığını (ZORUNLU)

| Katman | Teknoloji |
|---|---|
| Backend | **Python 3.11+ / FastAPI** |
| Veritabanı | **Supabase** (PostgreSQL + Storage + opsiyonel Realtime) |
| Frontend | **Saf HTML, CSS, JavaScript** (framework YOK: React/Vue/Svelte/Tailwind vb. kullanma) |
| Deployment | **Vercel** |
| Repo yapısı | **Tek repo (monorepo)**: frontend ve backend aynı repoda |

**Kurallar:**
- Frontend dosyaları `public/` altında statik olarak sunulur.
- Backend `api/` altında FastAPI olarak çalışır; Vercel Python runtime ile deploy edilir.
- Frontend ES Modules (`type="module"`) kullanır, build adımı yoktur.
- Harici JS kütüphanesi gerekiyorsa sadece CDN üzerinden ve minimum düzeyde kullan (örn. PNG export için `html-to-image` veya doğrudan Canvas API).
- Supabase `service_role` anahtarı **asla** frontend'e konulmaz. Tüm DB işlemleri FastAPI üzerinden yapılır.

---

## 3. Klasör Yapısı

```
hear-me-out-cake/
├── api/
│   ├── index.py              # Vercel giriş noktası (FastAPI app burada export edilir)
│   ├── main.py               # FastAPI app, router kayıtları, CORS
│   ├── config.py             # Env değişkenleri (pydantic-settings)
│   ├── supabase_client.py    # Supabase client singleton
│   ├── routers/
│   │   ├── cakes.py          # Pasta CRUD
│   │   ├── rooms.py          # Ortak pasta odaları / davet / katılım
│   │   ├── items.py          # Pastaya eklenen isim & resim öğeleri
│   │   └── uploads.py        # Resim yükleme (Supabase Storage)
│   ├── schemas/              # Pydantic modelleri
│   │   ├── cake.py
│   │   ├── room.py
│   │   └── item.py
│   └── services/
│       ├── slices.py         # Dilim hesaplama mantığı
│       └── quota.py          # Katılımcı ekleme hakkı kontrolü
├── public/
│   ├── index.html            # Ana sayfa (seçim ekranı)
│   ├── editor.html           # Pasta editörü
│   ├── join.html             # Davet linkiyle katılma ekranı
│   ├── gallery.html          # Kaydedilen pastalar
│   ├── css/
│   │   ├── variables.css     # Pastel renk paleti, tipografi
│   │   ├── base.css
│   │   ├── components.css
│   │   └── editor.css
│   └── js/
│       ├── api.js            # fetch wrapper
│       ├── state.js          # Basit global state
│       ├── cake-renderer.js  # Pasta çizimi (SVG)
│       ├── editor.js         # Editör etkileşimleri (sürükle-bırak vb.)
│       ├── room.js           # Oda/katılım mantığı
│       ├── export.js         # PNG olarak kaydetme
│       └── utils.js
├── supabase/
│   └── schema.sql            # Tablolar, indexler, RLS politikaları
├── requirements.txt
├── vercel.json
├── .env.example
├── .gitignore
├── PROJECT_SPEC.md           # Bu dosya
└── README.md
```

---

## 4. Kullanıcı Akışları

### 4.1 Ana Sayfa (`index.html`)
İki büyük pastel kart/buton:

1. **🍰 Bir Pasta Oluştur** → tek kişilik akış
2. **👯 Pastayı Arkadaşlarınla Oluştur** → ortak akış

Ek olarak: "Kaydedilen Pastalarım" linki (`gallery.html`).

### 4.2 Akış A — "Bir Pasta Oluştur" (Solo)
1. **Adım 1 – Kişi sayısı:** "Pasta kaç kişi için?" (sayı seçici, min 1, max 24). Seçilen sayı kadar **eşit dilim** oluşur.
2. **Adım 2 – Şekil & stil:** Pasta şekli (yuvarlak / kare / kalp), kat sayısı (1–3), pasta rengi, krema rengi, kenar süsü.
3. **Adım 3 – Editör:** Pasta dilimlere bölünmüş gösterilir. Kullanıcı:
   - Bir dilime veya pastanın üstüne **isim (yazı)** ekler (yazı tipi, renk, boyut seçilebilir).
   - **Resim** yükler/ekler (kırpma yuvarlak veya kare; sürükle, boyutlandır, döndür).
   - Süs/sticker ekler (çilek, mum, yıldız, çiçek vb. hazır set).
   - Eklenen öğeleri taşıyabilir, silebilir, öne/arkaya alabilir.
4. **Kaydet:** Pasta veritabanına kaydedilir + "PNG olarak indir" seçeneği sunulur. Kayıt sonrası bir **paylaşım linki** (görüntüleme) oluşur.

### 4.3 Akış B — "Pastayı Arkadaşlarınla Oluştur" (Ortak)
1. **Soru 1:** "Kaç kişi olacaksınız?" (toplam katılımcı sayısı, kendisi dahil, min 2, max 24). Bu sayı **aynı zamanda dilim sayısını** belirler (kişi başı 1 dilim).
2. **Soru 2:** "Her kişi pastaya kaç öğe ekleyebilsin?" (kişi başı ekleme hakkı, örn. 1–5). Bu **önceden seçilir ve oda boyunca sabittir**.
   - Bir "öğe" = 1 isim yazısı **veya** 1 resim (hakkın isim/resim ayrımı yoktur, toplam hak sayılır).
3. Oda oluşturulur ve **davet linki** üretilir (`/join.html?room=<invite_code>`). Link kopyala + Web Share API ile paylaş butonu.
4. **Arkadaşlar linke tıklar:**
   - Sadece bir takma ad girerler (hesap/giriş **yok**).
   - Oda doluysa (katılımcı sayısı = seçilen kişi sayısı) "Oda dolu" mesajı gösterilir.
   - Katılınca kendilerine bir dilim atanır ve editöre yönlendirilirler.
5. **Ortak editör:** Herkes aynı pastayı görür. Her katılımcı kendi ekleme hakkı kadar isim/resim ekler. Hak bitince ekleme butonları devre dışı kalır ("Hakkın doldu 🎉" mesajı).
   - Katılımcı **sadece kendi eklediği öğeleri** düzenleyip silebilir.
   - Oda sahibi (creator) tüm öğeleri silebilir ve pastayı **kilitleyip kaydedebilir**.
6. **Gerçek zamanlı his:** Başkalarının eklemeleri görünmeli. (Önce 3 saniyelik polling ile uygula; sonra Supabase Realtime opsiyonel iyileştirme olarak ekle.)
7. **Kaydet:** Oda sahibi "Pastayı Tamamla ve Kaydet" der. Pasta kalıcı olarak kaydedilir, düzenleme kilitlenir, herkes görüntüleyip PNG indirebilir.

> **Varsayım notu:** "Her kullanıcının kaç kişi ekleyeceği önceden seçilecek" ifadesi, kişi başı **ekleme hakkı (quota)** olarak yorumlanmıştır. Kullanıcı sonradan farklı bir anlam istediğini belirtirse `services/quota.py` içinde değiştirilebilecek şekilde izole tut.

---

## 5. Veri Modeli (Supabase / PostgreSQL)

`supabase/schema.sql` dosyasını aşağıdakine göre oluştur:

```sql
create extension if not exists "pgcrypto";

-- Pastalar
create table cakes (
  id uuid primary key default gen_random_uuid(),
  title text default 'İsimsiz Pasta',
  shape text not null default 'round' check (shape in ('round','square','heart')),
  layers int not null default 1 check (layers between 1 and 3),
  cake_color text not null default '#FFD6E0',
  frosting_color text not null default '#FFF1E6',
  slice_count int not null check (slice_count between 1 and 24),
  mode text not null default 'solo' check (mode in ('solo','collab')),
  is_locked boolean not null default false,
  share_code text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,10),
  creator_token text not null default encode(gen_random_bytes(16),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ortak oda ayarları (sadece collab pastalar için)
create table rooms (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references cakes(id) on delete cascade,
  invite_code text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,8),
  max_participants int not null check (max_participants between 2 and 24),
  items_per_participant int not null check (items_per_participant between 1 and 10),
  created_at timestamptz not null default now()
);

-- Katılımcılar
create table participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  slice_index int not null,                       -- atanan dilim (0'dan başlar)
  is_creator boolean not null default false,
  token text not null default encode(gen_random_bytes(16),'hex'),
  joined_at timestamptz not null default now(),
  unique (room_id, slice_index)
);

-- Pastaya eklenen öğeler (isim / resim / sticker)
create table cake_items (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references cakes(id) on delete cascade,
  participant_id uuid references participants(id) on delete set null,  -- solo'da null olabilir
  type text not null check (type in ('text','image','sticker')),
  content text not null,            -- text: yazı | image: Storage URL | sticker: sticker kodu
  x real not null default 0.5,      -- 0..1 normalize koordinat
  y real not null default 0.5,
  scale real not null default 1,
  rotation real not null default 0,
  z_index int not null default 0,
  style jsonb not null default '{}'::jsonb,   -- font, renk, kırpma biçimi vb.
  created_at timestamptz not null default now()
);

create index on cake_items (cake_id);
create index on participants (room_id);
create index on rooms (invite_code);
create index on cakes (share_code);
```

**Storage:** `cake-images` adında bir bucket oluştur (public read). Dosyalar sadece backend üzerinden yüklenir. Kısıtlar: maks. 5 MB, sadece `image/png`, `image/jpeg`, `image/webp`.

**Güvenlik modeli:** Kullanıcı hesabı yok. Yetkilendirme **token** ile yapılır:
- `creator_token` / `participants.token` → frontend `localStorage`'da saklanır, istek başlığında `X-Participant-Token` olarak gönderilir.
- RLS tüm tablolarda **açık** olsun ve anon rolüne hiçbir politika verilmesin (tüm erişim service role ile backend'den).

---

## 6. API Tasarımı (FastAPI)

Tüm endpoint'ler `/api` önekiyle başlar. Hatalar tutarlı JSON döner: `{ "detail": "..." }`.

### Pasta
| Metot | Yol | Açıklama |
|---|---|---|
| POST | `/api/cakes` | Solo pasta oluştur (slice_count, shape, layers, renkler) → `{cake, creator_token}` |
| GET | `/api/cakes/{share_code}` | Pasta + öğeler (herkese açık görüntüleme) |
| PATCH | `/api/cakes/{id}` | Pasta ayarlarını güncelle (creator_token gerekli) |
| POST | `/api/cakes/{id}/save` | Pastayı kaydet/kilitle |
| GET | `/api/cakes?tokens=...` | Cihazdaki kayıtlı pastaları listele (galeri) |

### Ortak Oda
| Metot | Yol | Açıklama |
|---|---|---|
| POST | `/api/rooms` | Oda + pasta oluştur (max_participants, items_per_participant, creator nickname) → `{room, cake, participant, invite_url}` |
| GET | `/api/rooms/{invite_code}` | Oda durumu (doluluk, ayarlar) — join ekranı için |
| POST | `/api/rooms/{invite_code}/join` | Takma adla katıl → `{participant, token}`; dolu ise 409 |
| GET | `/api/rooms/{invite_code}/state` | Pasta + öğeler + katılımcılar + kalan haklar (polling için) |

### Öğeler
| Metot | Yol | Açıklama |
|---|---|---|
| POST | `/api/cakes/{id}/items` | Öğe ekle (kota kontrolü zorunlu: aşılırsa 403) |
| PATCH | `/api/items/{id}` | Konum/boyut/stil güncelle (sadece sahibi veya creator) |
| DELETE | `/api/items/{id}` | Sil (sadece sahibi veya creator) |

### Yükleme
| Metot | Yol | Açıklama |
|---|---|---|
| POST | `/api/uploads` | Resim yükle (multipart) → `{url}`; boyut ve MIME doğrulaması yap |

**İş kuralları (backend'de zorunlu):**
- Kota kontrolü: `participant'ın item sayısı < rooms.items_per_participant`
- Kilitli pastaya (`is_locked = true`) ekleme/düzenleme/silme yapılamaz.
- Katılım: `participants sayısı < max_participants`, dilim indexi sıradaki boş dilim olarak atanır.
- Text içeriği max 40 karakter; XSS'e karşı frontend'de `textContent` kullan, backend'de strip et.
- Basit rate limiting (IP başına dakikada makul bir limit).

---

## 7. Frontend Detayları

### 7.1 Pasta Çizimi
- Pasta **SVG** ile çizilir (`cake-renderer.js`). Girdi: `shape`, `layers`, `slice_count`, renkler, öğeler.
- Dilimler, merkezden çıkan eşit açılı çizgilerle (yuvarlak), ızgara/radyal bölümlerle (kare, kalp) gösterilir. Her dilimin içinde küçük numara/katılımcı adı etiketi (opsiyonel, aç/kapa).
- Öğeler pasta üzerinde **normalize koordinatlarla** (0–1) konumlanır → farklı ekran boyutlarında tutarlı görünür.
- Sürükle-bırak: Pointer Events kullan (mouse + dokunmatik). Seçili öğede boyutlandırma/döndürme tutamaçları.
- Dilim vurgusu: Hover/tap'te dilim hafifçe öne çıkar (pastel highlight).

### 7.2 Editör Arayüzü
- Masaüstü: Sol panel (araçlar), orta (pasta), sağ panel (katılımcılar, kalan hak).
- Mobil: Pasta üstte, araçlar alt çekmecede (bottom sheet). **Mobile-first tasarla.**
- Araçlar: ➕ İsim Ekle, 🖼️ Resim Ekle, ✨ Sticker, 🎨 Renkler, ↩️ Geri al, 🗑️ Sil.
- Kalan hak göstergesi: "2/3 hakkın kaldı" (ortak modda).

### 7.3 Kaydetme / Dışa Aktarma
- **Kaydet:** Backend'e kaydeder; `cake_id`, `share_code`, `creator_token` `localStorage`'a yazılır (galeri için).
- **PNG indir:** SVG → Canvas → PNG (`export.js`). Resimler CORS uyumlu yüklenmeli (`crossorigin="anonymous"`). Arka plan pastel gradyan, altta küçük "Hear Me Out Cake" imzası.
- **Paylaş:** Görüntüleme linkini kopyala + Web Share API.

### 7.4 Erişilebilirlik & UX
- Butonlarda `aria-label`, klavye ile odaklanabilirlik, yeterli kontrast.
- Yükleme durumları için iskelet/spinner, hata durumları için nazik toast mesajları (Türkçe).
- Arayüz dili: **Türkçe**.

---

## 8. Tasarım Sistemi — Pastel Tonlar 🎀

Genel his: yumuşak, tatlı, sıcak, oyuncu. Keskin siyah kullanma; koyu metinler için yumuşak mor-gri kullan.

`public/css/variables.css`:

```css
:root {
  /* Pastel palet */
  --pink:        #FFD6E0;
  --pink-deep:   #FFB3C6;
  --peach:       #FFE5D0;
  --butter:      #FFF6C9;
  --mint:        #D4F5E3;
  --sky:         #D6EBFF;
  --lavender:    #E6DBFF;
  --lilac:       #F3E8FF;

  /* Yüzeyler */
  --bg:          #FFF9FB;
  --surface:     #FFFFFF;
  --surface-alt: #FFF1F5;
  --border:      #F2D9E2;

  /* Metin */
  --text:        #5B4B6B;   /* yumuşak mor-gri */
  --text-soft:   #8E7FA0;
  --accent:      #FF8FB1;   /* birincil buton */
  --accent-hover:#FF74A0;
  --success:     #8FD9B6;
  --danger:      #FF9AA2;

  /* Şekil */
  --radius-sm: 12px;
  --radius-md: 20px;
  --radius-lg: 28px;
  --shadow-soft: 0 8px 24px rgba(255, 143, 177, 0.18);

  /* Tipografi */
  --font-display: 'Baloo 2', 'Fredoka', system-ui, sans-serif;
  --font-body: 'Nunito', system-ui, sans-serif;
}
```

- Google Fonts: **Baloo 2** (başlıklar) + **Nunito** (gövde).
- Butonlar: yuvarlak köşeli (pill), yumuşak gölge, hover'da hafif yukarı kayma.
- Arka plan: çok hafif pastel gradyan (pink → lilac → sky), isteğe bağlı yavaş hareket eden konfeti/yıldız dekorları (`prefers-reduced-motion` saygı göster).
- Dilim ve pasta renk seçici: yukarıdaki pastel palet hazır renk (swatch) olarak sunulur.
- Hazır sticker seti: SVG olarak `public/assets/stickers/` altında, pastel tonlarda (çilek, kiraz, mum, yıldız, kalp, çiçek, bulut, kurdele).

---

## 9. Deployment (Vercel)

**`vercel.json`:**
```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.py", "use": "@vercel/python" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "api/index.py" },
    { "handle": "filesystem" },
    { "src": "/join", "dest": "/public/join.html" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ]
}
```
> Not: Vercel'in güncel FastAPI/statik dosya yapılandırması değişmiş olabilir. Deploy öncesi Vercel dokümantasyonunu kontrol et; gerekirse `vercel.json`'ı güncel yönteme (örn. `rewrites`, `public/` otomatik sunumu) uyarla. Sonuç değişmemeli: `/api/*` → FastAPI, diğer her şey → `public/`.

**`api/index.py`:**
```python
from api.main import app  # Vercel bu "app" nesnesini ASGI olarak çalıştırır
```

**`requirements.txt`:** `fastapi`, `uvicorn`, `supabase`, `pydantic`, `pydantic-settings`, `python-multipart`, `Pillow` (resim doğrulama/küçültme için).

**Ortam değişkenleri (`.env.example`):**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=cake-images
APP_BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
```
Bunlar Vercel → Project Settings → Environment Variables'a girilir. `.env` dosyası **asla** commit edilmez.

**Yerel geliştirme:** `uvicorn api.main:app --reload --port 8000` ve `public/` klasörünü FastAPI'nin `StaticFiles`'ı ile (sadece local'de) sun veya basit bir statik sunucu kullan. README'de adımları yaz.

---

## 10. Geliştirme Planı (Fazlar)

Her faz sonunda uygulamayı çalıştır, kısa bir test yap ve ilerlemeyi özetle.

### Faz 1 — İskelet
- Klasör yapısı, `requirements.txt`, `.env.example`, `.gitignore`, `vercel.json`.
- FastAPI app (`/api/health` endpoint'i), CORS, config.
- `variables.css`, `base.css`, `index.html` ana sayfa (iki pastel kart).

### Faz 2 — Veritabanı
- `supabase/schema.sql` yaz; Supabase'e uygulanacak adımları README'ye ekle.
- Supabase client, Pydantic şemaları.
- Storage bucket kurulum notları.

### Faz 3 — Solo Akış
- `POST /api/cakes`, `GET /api/cakes/{share_code}`, items CRUD, upload.
- Kişi sayısı → şekil/stil → editör sihirbazı.
- `cake-renderer.js` (SVG pasta + dilimler), isim/resim/sticker ekleme, sürükle-bırak.
- Kaydet + PNG export + galeri.

### Faz 4 — Ortak Akış
- Rooms/participants endpoint'leri, kota ve doluluk kuralları.
- "Kaç kişi?" ve "Kişi başı kaç ekleme?" soruları, davet linki üretimi.
- `join.html`, takma ad ile katılma, dilim atama.
- Polling ile senkronizasyon, kalan hak göstergesi, creator'ın kilitleme/kaydetme yetkisi.

### Faz 5 — Cila
- Mobil iyileştirme, animasyonlar, toast'lar, boş/hata durumları.
- Erişilebilirlik kontrolü.
- (Opsiyonel) Supabase Realtime ile polling'i değiştir.
- README: kurulum, env, deploy adımları.

### Faz 6 — Deploy
- Vercel'e deploy, env değişkenleri, canlıda uçtan uca test (solo + 3 kişilik oda).

---

## 11. Kabul Kriterleri

- [ ] Ana sayfada "Bir Pasta Oluştur" ve "Pastayı Arkadaşlarınla Oluştur" seçenekleri var.
- [ ] Seçilen kişi sayısı kadar dilim doğru çizilir (1–24).
- [ ] Pastaya isim, resim ve sticker eklenebilir; taşınabilir, boyutlandırılabilir, silinebilir.
- [ ] Ortak modda kişi sayısı ve kişi başı ekleme hakkı **önceden** seçilir.
- [ ] Davet linkiyle giren arkadaş yalnızca takma ad girerek katılır; oda doluysa engellenir.
- [ ] Kişi başı ekleme hakkı backend'de zorunlu kılınır (UI'ı atlayan istek 403 alır).
- [ ] Pasta Supabase'e kaydedilir; link ile tekrar açılabilir; PNG olarak indirilebilir.
- [ ] Kilitli pasta düzenlenemez.
- [ ] Tasarım pastel tonlarda, mobilde sorunsuz çalışır.
- [ ] Vercel'de canlı çalışır; `service_role` anahtarı frontend'de görünmez.

---

## 12. Kod Kalitesi Kuralları

- Python: type hint kullan, async endpoint'ler, router bazlı ayrım, Pydantic ile doğrulama.
- JavaScript: ES Modules, `const/let`, küçük ve tek sorumluluklu fonksiyonlar, global değişken kirliliği yok.
- CSS: değişkenler (`variables.css`) üzerinden renk/boyut; sabit renk kodlarını bileşenlere gömme.
- Kullanıcıdan gelen hiçbir veriyi `innerHTML` ile basma.
- Yorumlar ve kullanıcıya görünen metinler Türkçe; kod ve değişken isimleri İngilizce.
- Her faz sonunda kısa bir değişiklik özeti ver.
