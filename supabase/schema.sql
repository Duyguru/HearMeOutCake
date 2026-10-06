-- ============================================================
-- Hear Me Out Cake — Supabase / PostgreSQL Veritabanı Şeması
-- ============================================================

create extension if not exists "pgcrypto";

-- Pastalar Tablosu
create table if not exists cakes (
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

-- Ortak Oda Ayarları (Sadece collab modundaki pastalar için)
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references cakes(id) on delete cascade,
  invite_code text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,8),
  max_participants int not null check (max_participants between 2 and 24),
  items_per_participant int not null check (items_per_participant between 1 and 10),
  created_at timestamptz not null default now()
);

-- Katılımcılar
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  slice_index int not null,                       -- Atanan dilim numarası (0'dan başlar)
  is_creator boolean not null default false,
  token text not null default encode(gen_random_bytes(16),'hex'),
  joined_at timestamptz not null default now(),
  unique (room_id, slice_index)
);

-- Pastaya Eklenen Öğeler (İsim / Resim / Kürdanlı Tabela / Sticker)
create table if not exists cake_items (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references cakes(id) on delete cascade,
  participant_id uuid references participants(id) on delete set null,  -- Solo modda null olabilir
  type text not null check (type in ('topper','text','image','sticker')),
  content text not null,            -- text: yazı | image: URL | topper: JSON veya resim URL | sticker: sticker kodu
  x real not null default 0.5,      -- 0..1 normalize x koordinatı
  y real not null default 0.5,      -- 0..1 normalize y koordinatı
  scale real not null default 1.0,
  rotation real not null default 0.0,
  z_index int not null default 0,
  style jsonb not null default '{}'::jsonb,   -- font, renk, etiket yazısı, topper stili vb.
  created_at timestamptz not null default now()
);

-- İndeksler
create index if not exists idx_cake_items_cake_id on cake_items (cake_id);
create index if not exists idx_participants_room_id on participants (room_id);
create index if not exists idx_rooms_invite_code on rooms (invite_code);
create index if not exists idx_cakes_share_code on cakes (share_code);

-- RLS (Row Level Security) - Güvenlik İçin Açık
alter table cakes enable row level security;
alter table rooms enable row level security;
alter table participants enable row level security;
alter table cake_items enable row level security;
-- Not: Anonim kullanıcılara direkt erişim verilmez; tüm CRUD işlemleri
-- FastAPI backend üzerinden service_role yetkisi ile gerçekleştirilir.
