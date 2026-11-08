# StrojPark – prodej, nákup, servis a půjčovna stavebních strojů

Jedna aplikace pro **Windows, macOS, Android (telefony i tablety) a iOS/iPadOS**.
Celý tým sdílí stejná data, fotky a dokumenty v cloudu a změny od kolegů se zobrazí okamžitě.

## Co aplikace umí

| Oblast | Funkce |
|---|---|
| **Prodej** (hlavní) | Nabídka strojů s cenou, náklady, marží a dobou na skladě. **Zájemci a poptávky** (zdroj, stav jednání, nabídnutá cena, datum dalšího kontaktu, volání jedním klepnutím), obecné poptávky „zákazník hledá…“. **Prodejní list stroje v PDF** s fotkami a **PDF katalog nabídky**. **AI inzerát** v češtině, angličtině a němčině. Záznam prodeje (cena, kupec) se skutečným ziskem, přehled prodaných strojů, tržeb a zisku za rok. |
| **Nákup a dovoz** | Nákupní karta stroje: prodejce, země, odkaz na inzerát/aukci, měna a kurz (**kurzy ČNB jedním tlačítkem**), daňový režim (EU reverse charge, tuzemsko, dovoz mimo EU, § 90, neplátce), doprava, clo, aukční poplatek, prohlídka, registrace. Náklady na opravy se přičtou ze servisu → **skutečná pořizovací cena a návrh prodejní ceny** podle cílové marže. Stav nákupu (vyhlédnuto → prověřování → vyjednávání → koupeno → na cestě → dorazilo), **kontrolní seznam** (19 bodů), **kalkulačka dopravy do ČR** s upozorněním na nadrozměrnou přepravu, **Průvodce nákupem a dovozem**. |
| **Přehled** | Hodnota a očekávaný zisk strojů na prodej, prodeje a zisk za rok, komu se dnes ozvat, stroje dlouho na skladě, nákupy na cestě, servis, půjčovna. |
| **Stroje** | Karta stroje (kategorie, značka, typ, rok, motohodiny, výr. číslo, hmotnost, výkon, přepravní rozměry, stav, umístění, popis), stroje zákazníků. Vyhledávání a filtry, dlaždice nebo tabulka. |
| **Fotky a dokumenty** | Vyfocení přímo v aplikaci nebo výběr více fotek z galerie, automatické zmenšení, hlavní fotka, prohlížeč. Dokumenty (PDF, Word, Excel…) ke každému stroji. Vše v cloudovém úložišti. |
| **AI** | Rozpoznání stroje z 1–5 fotek (druh, značka, typ, rok, hmotnost, výkon, přepravní rozměry, viditelný stav) a psaní inzerátů. Model Claude (Anthropic), klíč je jen na serveru. |
| **Servis** | Příjem → diagnostika → čeká na díly → oprava → hotovo → předáno. Pracovní list, náhradní díly, fotky z příjmu, průběhu i dokončení, kalkulace s DPH, **PDF pracovní list**. Servis vlastních strojů se počítá do nákladů stroje. |
| **Půjčovna** | Ceník a cenotvorba, **PDF ceník**, pronájmy a rezervace s kontrolou kolizí, stavy strojů, časová osa vytížení. |

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
 ├─ Edge Function ai        → Claude API: rozpoznání stroje, inzeráty (klíč zůstává na serveru)
 └─ Edge Function cnb-rates → denní kurzy ČNB
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
2. **SQL Editor** → vložte obsah `supabase/migrations/001_init.sql` → **Run**, potom stejně `supabase/migrations/002_prodej_nakup.sql`. Vytvoří tabulky, oprávnění, úložiště `media` a realtime.
3. **Authentication → Providers → Email**: vypněte „Allow new users to sign up“ (účty bude zakládat jen správce).
4. **Authentication → Users → Invite user**: pozvěte kolegy e-mailem. Jméno, které se zobrazuje u záznamů, nastavíte v uživateli jako `full_name` v *User Metadata*.
5. **Project Settings → API**: zkopírujte *Project URL* a *anon public key*.

### 2. AI (rozpoznávání strojů, inzeráty) a kurzy ČNB

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
npx supabase functions deploy ai
```

```bash
npx supabase functions deploy cnb-rates
```

Funkce `ai` umí jen dvě úlohy – rozpoznat stroj z fotek a napsat inzerát. Používá model `claude-opus-5-5`, vrací strukturovaný JSON a při odmítnutí požadavku automaticky zkusí záložní model. Jedno volání stojí v řádu jednotek korun. Funkce `cnb-rates` stahuje denní kurzy ČNB pro přepočet nákupních cen.

### 3. Konfigurace aplikace

Zkopírujte `.env.example` na `.env` a doplňte URL a klíč ze Supabase:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

(Alternativně lze cloud připojit přímo v aplikaci v **Nastavení → Připojit cloud**.)

### 4. Web / PWA – Windows, Mac, Android, iPhone, iPad

Aplikace se po každé změně ve větvi `main` automaticky sestaví a zveřejní na **GitHub Pages** (`.github/workflows/deploy.yml`):
**https://radimstepanik3-dev.github.io/belvitaequipmanager/**

Pro připojení cloudu v této verzi nastavte v GitHubu *Settings → Secrets and variables → Actions → Variables* proměnné `VITE_SUPABASE_URL` a `VITE_SUPABASE_ANON_KEY` a spusťte workflow znovu. (Jinde lze `npm run build` a nahrát složku `dist/` na libovolný HTTPS hosting.)

Instalace do zařízení:

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
    trade.ts            prodej a nákup: zájemci, marže, pořizovací náklady, země, doprava, kontrolní seznam
    backend/            local.ts (IndexedDB) a supabase.ts (cloud) se stejným rozhraním
    ai.ts               AI rozpoznávání strojů
    pdf.ts              PDF prodejní list, katalog nabídky, ceník půjčovny, pracovní list (plná čeština)
    media.ts            focení, zmenšení a nahrávání fotek/dokumentů
  pages/                Přehled, Prodej, Nákup, Průvodce, Stroje, Detail stroje, Servis, Půjčovna, Nastavení
  components/           UI prvky, fotky, rezervace, ceník
supabase/
  migrations/001_init.sql, 002_prodej_nakup.sql
  functions/ai/           AI rozpoznávání a inzeráty (Claude)
  functions/cnb-rates/    kurzy ČNB
  functions/_shared/      zadání pro AI a parser kurzů (sdílí je i aplikace)
android/                nativní Android projekt (Capacitor)
```

## Možná další rozšíření

- Veřejný katalog strojů na webu firmy (napojený na data z aplikace)
- Automatické odesílání inzerátů na Mascus / Machineryline přes jejich API
- Kupní smlouva a předávací protokol v PDF
- Evidence zákazníků jako samostatný adresář, historie nákupů zákazníka
- Role uživatelů (např. technik nevidí nákupní ceny a marže)
- Export do účetnictví (Pohoda, Money S3), fakturace
- Offline režim v cloudu (fronta změn při výpadku signálu)
