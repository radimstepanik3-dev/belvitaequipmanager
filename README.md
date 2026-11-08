# StrojPark – správa stavebních strojů, servisu a půjčovny

Jedna aplikace pro **Windows, macOS, Android (telefony i tablety) a iOS/iPadOS**.
Celý tým sdílí stejná data, fotky a dokumenty v cloudu a změny od kolegů se zobrazí okamžitě.

## Co aplikace umí

| Oblast | Funkce |
|---|---|
| **Stroje** | Karta stroje (kategorie, značka, typ, rok, motohodiny, výr. číslo, hmotnost, výkon, stav, umístění, popis), prodejní a pořizovací cena, zařazení na prodej a do půjčovny, stroje zákazníků. Vyhledávání a filtry, dlaždice nebo tabulka. |
| **Fotky a dokumenty** | Vyfocení přímo v aplikaci nebo výběr více fotek z galerie, automatické zmenšení před nahráním, hlavní fotka, prohlížeč fotek. Dokumenty (PDF, Word, Excel…) ke každému stroji. Vše je v cloudovém úložišti. |
| **AI rozpoznání** | Z 1–5 fotek rozpozná druh stroje, značku, typ, odhadne rok výroby, hmotnost, výkon a popíše viditelný stav. Údaje jdou jedním kliknutím převzít do formuláře. Používá model Claude (Anthropic). |
| **Servis** | Příjem stroje (zákazník, motohodiny, závada, stav, příslušenství, fotky z příjmu) → diagnostika → čekání na díly → oprava → hotovo → předáno. Pracovní list (práce techniků v hodinách), náhradní díly (objednáno/skladem/použito), fotky průběhu i dokončení, kalkulace s DPH, **PDF pracovní list** s podpisy. |
| **Půjčovna** | Ceník každého stroje (hodina, den, víkend, týden, měsíc, kauce, obsluha), **cenotvorba** – dopočítání sazeb z denní ceny nebo návrh z hodnoty stroje podle nastavitelných koeficientů. **PDF ceník** (s fotkami, s/bez DPH, volba sloupců). |
| **Rezervace a vytížení** | Pronájem, rezervace k pronájmu, rezervace k prodeji, prodej. Automatický výpočet ceny z ceníku, kontrola kolizí termínů, akce Vydat / Vráceno / Prodáno. Stav stroje se ukazuje všude: **Volný · Půjčeno · Po termínu · Rezervováno k pronájmu · Rezervováno k prodeji · V servisu · Prodáno**. Časová osa vytížení s procentem využití. |
| **Přehled** | Počty strojů podle stavu, rozpracovaný servis, výdeje a vrácení na 7 dní, upozornění na stroje po termínu. |

Všichni přihlášení uživatelé mohou vše prohlížet i upravovat; u záznamů se ukládá, kdo je založil a kdo je naposledy změnil.

## Architektura

```
React + TypeScript (Vite, Tailwind)  ← jeden kód pro všechny platformy
 ├─ PWA (instalace z prohlížeče)      → Windows, macOS, Android, iOS
 └─ Capacitor                         → nativní aplikace Android (Google Play) a iOS (App Store)

Supabase (cloud)
 ├─ PostgreSQL – data + realtime synchronizace mezi uživateli
 ├─ Storage    – fotky a dokumenty (soukromý bucket)
 ├─ Auth       – přihlášení e-mailem a heslem
 └─ Edge Function recognize-machine → Claude API (API klíč zůstává na serveru)
```

Bez nastaveného cloudu běží aplikace v **lokálním (demo) režimu** – data jsou jen v daném zařízení (IndexedDB). Hodí se k vyzkoušení; v Nastavení lze vložit ukázková data.

## Rychlé vyzkoušení

```bash
npm install
```

```bash
npm run dev
```

Otevřete adresu, kterou vypíše (např. http://localhost:5173), jděte do **Nastavení → Vložit ukázková data**.

## Nasazení pro tým (cloud)

### 1. Supabase projekt

1. Založte projekt na [supabase.com](https://supabase.com) (region např. Frankfurt – `eu-central-1`).
2. **SQL Editor** → vložte obsah `supabase/migrations/001_init.sql` → **Run**. Vytvoří tabulky, oprávnění, úložiště `media` a realtime.
3. **Authentication → Providers → Email**: vypněte „Allow new users to sign up“ (účty bude zakládat jen správce).
4. **Authentication → Users → Invite user**: pozvěte kolegy e-mailem. Jméno, které se zobrazuje u záznamů, nastavíte v uživateli jako `full_name` v *User Metadata*.
5. **Project Settings → API**: zkopírujte *Project URL* a *anon public key*.

### 2. AI rozpoznávání strojů

Potřebujete API klíč z [console.anthropic.com](https://console.anthropic.com) a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
```

```bash
npx supabase link --project-ref VAS_PROJECT_REF
```

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npx supabase functions deploy recognize-machine
```

Funkce používá model `claude-opus-5-5`, odpověď vrací ve strukturovaném JSON a při odmítnutí požadavku automaticky zkusí záložní model. Jedno rozpoznání (až 5 fotek) stojí v řádu jednotek korun.

### 3. Konfigurace aplikace

Zkopírujte `.env.example` na `.env` a doplňte URL a klíč ze Supabase:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

(Alternativně lze cloud připojit přímo v aplikaci v **Nastavení → Připojit cloud**.)

### 4. Web / PWA – Windows, Mac, Android, iPhone, iPad

```bash
npm run build
```

Složku `dist/` nahrajte na libovolný HTTPS hosting (Netlify, Vercel, Cloudflare Pages, firemní web…). Pak:

- **Windows / Mac**: otevřít v Chrome nebo Edge → ikona *Instalovat* v adresním řádku → aplikace se chová jako běžný program (vlastní okno, ikona na ploše / v Docku).
- **Android**: Chrome → menu → *Přidat na plochu / Instalovat aplikaci*.
- **iPhone / iPad**: Safari → Sdílet → *Přidat na plochu*.

Aktualizace se do všech zařízení dostanou automaticky po nahrání nové verze.

### 5. Nativní aplikace (volitelně, pro Google Play / App Store)

Android projekt je v `android/` (oprávnění pro fotoaparát a galerii jsou nastavena):

```bash
npm run cap:sync
```

```bash
npm run cap:android
```

Otevře se Android Studio → *Build → Generate Signed Bundle*.

iOS (vyžaduje Mac s Xcode):

```bash
npx cap add ios
```

```bash
npm run cap:sync
```

```bash
npm run cap:ios
```

V Xcode doplňte do `Info.plist` texty `NSCameraUsageDescription` a `NSPhotoLibraryUsageDescription` (např. „Pro focení strojů“).

## Struktura projektu

```
src/
  lib/
    types.ts            datový model
    domain.ts           stavy strojů, cenotvorba, výpočet ceny pronájmu, kolize, vytížení
    backend/            local.ts (IndexedDB) a supabase.ts (cloud) se stejným rozhraním
    ai.ts               AI rozpoznávání strojů
    pdf.ts              PDF ceník a PDF pracovní list (pdfmake, plná podpora češtiny)
    media.ts            focení, zmenšení a nahrávání fotek/dokumentů
  pages/                Přehled, Stroje, Detail stroje, Servis, Půjčovna, Nastavení
  components/           UI prvky, fotky, rezervace, ceník
supabase/
  migrations/001_init.sql
  functions/recognize-machine/index.ts
android/                nativní Android projekt (Capacitor)
```

## Možná další rozšíření

- Předávací protokol a nájemní smlouva v PDF pro půjčovnu
- Evidence zákazníků jako samostatný adresář
- Připomínky pravidelného servisu podle motohodin, STK/revize
- Role uživatelů (např. technik nevidí nákupní ceny)
- Export do účetnictví (Pohoda, Money S3), fakturace
- Offline režim v cloudu (fronta změn při výpadku signálu na stavbě)
