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
5. Instalace na hodinky: v hodinkách zapni *Nastavení → O zařízení → vývojářský režim*, v aplikaci Huawei Health povol ladění a nahraj `.bin` přes DevEco Studio (nebo distribuuj přes AppGallery).

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

## Poznámky a omezení
- Android dovoluje kameru jen aplikaci v popředí → aplikace na mobilu musí být otevřená.
- Verze knihoven (`wearengine 5.0.3.300`, CameraX 1.3.4) ověř podle aktuální dokumentace Huawei; API Wear Engine se mezi verzemi mírně mění.
- Pokud máš **telefon Huawei**, GT 5 už má vestavěnou funkci *Vzdálená spoušť* (Remote shutter) – tahle aplikace je hlavně pro ostatní Android telefony nebo pro vlastní funkce.
- iPhone: Wear Engine na iOS P2P se samostatnou aplikací nepodporuje stejným způsobem; tento projekt je pro Android.
