# 🎂 Hear Me Out Cake

Kullanıcıların sanal bir pasta oluşturup onu dilimlere bölebildiği, isim ve resimlerle kürdanlı tabelalar gibi pastaya dikebildiği ve bunu **tek başına** ya da **arkadaşlarıyla ortak bir odada** yapabildiği web uygulaması.

---

## 🌟 Özellikler

- **🍰 Klasik Yuvarlak Pasta & Eşit Dilimleme:** 1–24 arası seçilen kişi sayısı kadar eşit radyal dilimleme.
- **🍢 Kürdanlı Tabela ("Hear Me Out" Placard):** Resim yükleyip altına isim yazarak pastaya gerçek bir kürdanlı tabela gibi saplama.
- **✨ Hafif SVG Süsler:** Çilek, mum, kiraz, yıldız, kalp, kurdele, çiçek, ışıltı.
- **👯 Ortak Oda (Collab Mode):** 
  - Kişi sayısı ve kişi başı ekleme hakkı (kota: 1–10) önceden belirlenir.
  - Davet linki ile arkadaşlar sadece takma ad girerek katılır.
  - Herkes kendi dilimini süsler; kota dolunca ekleme kilitlenir.
  - 3 saniyede bir polling ile başkalarının eklemeleri canlı güncellenir.
- **🔒 Kilitleme ve Saklama:** Pastayı oluşturan kişi pastayı kilitleyip kaydedebilir.
- **📸 Yüksek Çözünürlüklü PNG İndirme:** Canvas API ile pastayı pastel gradyan arka plan ve özel imza ile kaydetme.
- **🎨 Pastel Tasarım Sistemi:** Baloo 2 ve Nunito tipografisi ile yumuşak, neşeli pastel tonlar.
- **🔌 Sıfır Konfigürasyonla Yerel Çalışma:** Supabase hesabı olmadan dahi SQLite ve yerel görsel depolama ile 100% çalışır; Supabase anahtarları girildiğinde otomatik olarak Supabase'e geçer.

---

## 🚀 Yerel Olarak Çalıştırma

### 1. Gereksinimleri Yükleyin
```bash
pip install -r requirements.txt
```

### 2. Uygulamayı Başlatın
```bash
uvicorn api.main:app --reload --port 8000
```

Tarayıcınızda açın:
👉 **http://localhost:8000**

*(Statik frontend ve FastAPI backend aynı port üzerinden birlikte sunulur).*

---

## 🗄️ Supabase Entegrasyonu (İsteğe Bağlı)

Uygulama, `.env` dosyasında Supabase bilgisi olmadığında otomatik olarak yerel SQLite (`hearmeoutcake.db`) ve yerel klasör (`public/uploads`) kullanır.

Supabase'e geçmek istediğinizde:
1. [supabase.com](https://supabase.com) adresinde yeni bir proje oluşturun.
2. **SQL Editor** sekmesine gidin ve `supabase/schema.sql` dosyasının içeriğini yapıştırıp çalıştırın.
3. **Storage** menüsünden `cake-images` adında **Public** bir bucket oluşturun.
4. `.env` dosyasını oluşturun:
```bash
SUPABASE_URL=https://projeniz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...
SUPABASE_STORAGE_BUCKET=cake-images
APP_BASE_URL=http://localhost:8000
```
Uygulamayı yeniden başlattığınızda sistem otomatik olarak Supabase üzerinde çalışacaktır.

---

## ☁️ Vercel'e Dağıtım (Deployment)

Proje monorepo mimarisine ve Vercel Python Runtime'a göre yapılandırılmıştır:
- Giriş noktası: `api/index.py`
- Yönlendirme ve yapılandırma: `vercel.json`
- Statik dosyalar: `public/`

Vercel panosundan projeyi bağladıktan sonra **Environment Variables** bölümüne Supabase ortam değişkenlerinizi eklemeniz yeterlidir.
