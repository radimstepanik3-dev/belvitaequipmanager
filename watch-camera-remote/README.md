# Watch Fotak – ovládání fotoaparátu mobilu z Huawei Watch GT 5

Dvě aplikace, které spolu komunikují přes **Huawei Wear Engine**:

| Část | Složka | Technologie |
|---|---|---|
| Hodinky (GT 5, 466×466) | `watch/` | HarmonyOS Lite Wearable (JS, DevEco Studio) |
| Mobil (Android) | `phone/` | Kotlin, CameraX, Wear Engine SDK |

## Funkce
- **Spoušť** – velké kulaté tlačítko na hodinkách
- **Samospoušť** – TEĎ / 3 s / 10 s (odpočet vibruje na hodinkách a ukazuje se velkými čísly na mobilu)
- **OTOČ** – přepnutí přední/zadní kamery
- **Blesk** – auto / zapnuto / vypnuto
- Potvrzení „Uloženo ✓“ a počítadlo fotek na hodinkách
- Fotky se ukládají do `Pictures/WatchCam` v galerii

## Jak spojení funguje
```
Hodinky (interconnect.send)  ── {"cmd":"shoot"} ──▶  Mobil (P2pClient Receiver) → CameraX
Hodinky (onmessage)          ◀── {"event":"saved"} ──  Mobil (P2pClient.send)
```
Příkazy: `hello`, `shoot`, `countdown{seconds}`, `switch`, `flash{mode}`.
Události: `ready{lens}`, `saved{name}`, `error{text}`.

## Postup zprovoznění

### 1. Huawei Developer účet a Wear Engine
1. Zaregistruj se na <https://developer.huawei.com> (ověření identity).
2. V **AppGallery Connect** vytvoř projekt a Android aplikaci s balíčkem `cz.watchcam.remote`. Zkopíruj **App ID** do `phone/app/src/main/res/values/strings.xml` (`hms_app_id`).
3. Požádej o službu **Wear Engine** (Console → Health Kit / Wear Engine → Apply) a zaškrtni oprávnění *Device manager*. Schválení trvá obvykle pár dní.
4. Do konzole nahraj SHA-256 otisk podpisového certifikátu Android aplikace.

### 2. Aplikace pro hodinky
1. Nainstaluj **DevEco Studio** (verze s podporou *Lite Wearable*).
2. Vytvoř nový projekt *Lite Wearable → Empty Ability (JS)*, bundle `cz.watchcam.remote`, a nahraď obsah `entry/src/main` soubory z `watch/entry/src/main`. Přidej ikonu `resources/base/media/icon.png`.
3. Vygeneruj podpisový certifikát (Build → Generate Key and CSR) a profil v AppGallery Connect.
4. **Otisk (fingerprint) podpisu hodinkové aplikace** vlož do `strings.xml` → `watch_fingerprint` (podle návodu Wear Engine „Obtaining the fingerprint of the watch app“).
5. Instalace na hodinky (hodinky se přes USB nepřipojují, aplikace se posílá přes mobil):
   - na mobil nainstaluj z **AppGallery** aplikaci **HUAWEI DevEco Assistant**,
   - v ní na kartě *Lite Wearable* se přes Huawei Health připoj k hodinkám – ukáže model a **UDID**,
   - UDID zaregistruj v AppGallery Connect jako testovací zařízení a vytvoř pro něj ladicí profil,
   - podepsaný `.hap` z DevEco Studia zkopíruj do mobilu do složky `/sdcard/haps/`,
   - v DevEco Assistant zvol *Install watch app*.

### 3. Aplikace pro mobil
```bash
cd phone
# otevři v Android Studiu, nebo:
./gradlew assembleDebug   # (gradle wrapper vygeneruje Android Studio)
```
Na mobilu musí být nainstalovaná **Huawei Health** a hodinky v ní spárované.

### 4. Použití
1. Otevři na mobilu aplikaci **Watch Fotak** (běží náhled kamery, displej zůstává zapnutý).
2. Na hodinkách otevři **Fotak** – nahoře se ukáže „Zadní kamera“ = spojeno.
3. Mačkej spoušť. 📸

## Samsung Galaxy Z Fold 7
- Vestavěná *Vzdálená spoušť* hodinek GT 5 se Samsungem nefunguje (jen Huawei telefony a iPhone), takže tahle aplikace je pro tuhle kombinaci správná cesta.
- **Huawei Health** a **HMS Core** musí být z **AppGallery** (ne z Google Play). V nastavení Samsungu povol Huawei Health běh na pozadí: *Nastavení → Aplikace → Health → Baterie → Neomezeno*, jinak One UI spojení uspává.
- **Riziko – Android 16:** Fold 7 má Android 16 (One UI 8), ale Huawei u Wear Engine pro cizí telefony dokumentuje jen Android 6–14 (podporu Androidu 14 přidala verze SDK 5.0.3.304, vyžaduje Huawei Health 14.0.12.310+). Jestli spojení na Androidu 16 funguje, je potřeba vyzkoušet – nejdřív si to ověř na oficiální ukázce Wear Engine, než budeš čekat na schválení a ladit tuhle aplikaci.
- Podporu GT 5 ve Wear Engine si ověř v tabulce *Supported Devices* na developer.huawei.com (starší seznamy končí u GT 4).
- Aplikace se při složení/rozložení telefonu nerestartuje, takže spojení s hodinkami i nastavení kamery zůstane. Funguje na vnějším i vnitřním displeji.
- **Flex režim (stativ):** když Fold postavíš polorozložený na stůl, náhled kamery, odpočet a stav se přesunou do horní (stojící) poloviny displeje a náhled ukáže celý záběr. Tlačítko *Vyfotit* zůstane na spodní polovině ležící na stole. Po narovnání nebo složení se náhled vrátí přes celý displej.
- Aplikace se otáčí podle polohy telefonu i při zamknutém automatickém otáčení – jinak by v poloze na stole nepoznala, která polovina je nahoře.

## Poznámky a omezení
- Android dovoluje kameru jen aplikaci v popředí → aplikace na mobilu musí být otevřená.
- Verze knihoven (`wearengine 5.0.3.304`, CameraX 1.3.4) ověř podle aktuální dokumentace Huawei; API Wear Engine se mezi verzemi mírně mění.
- Pokud máš **telefon Huawei** nebo iPhone, GT 5 už má vestavěnou funkci *Vzdálená spoušť* – tahle aplikace je pro ostatní Android telefony.
- iPhone: Wear Engine na iOS P2P se samostatnou aplikací nepodporuje stejným způsobem; tento projekt je pro Android.
