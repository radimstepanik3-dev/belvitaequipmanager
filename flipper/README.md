# StrojDiag – Flipper Zero jako diagnostika stavebních strojů

Aplikace pro **Flipper Zero** + přídavný modul, který si postavíš sám ([návod na hardware](hardware/README.md)).
Doplňuje StrojPark o měření přímo u stroje: chybové kódy, živá data motoru, tlaky hydrauliky, baterie a startování, signály snímačů a teploty. Záznamy se ukládají na SD kartu Flipperu a dají se přiložit k servisní zakázce ve StrojParku.

```
flipper/
  strojdiag/            zdrojáky aplikace (.fap)
    core/               J1939, databáze kódů, přepočty měření (čisté C, testy na PC)
    hw/                 ovladače: MCP2515, ADC, frekvence, DS18B20, zápis na SD
    views/              obrazovky
    tests/              testy jádra (make -C flipper/strojdiag/tests)
    spn.txt.example     vzor vlastních popisů kódů výrobce
  hardware/README.md    schéma, součástky, stavba a oživení modulu
```

## Co umí

| Menu | Funkce |
|---|---|
| **Chybové kódy (DM1)** | Aktivní chyby všech ECU (motor, převodovka, emise…) – SPN, FMI, počet výskytů, stav kontrolek MIL/STOP/VAROV/OCHR. Detail s popisem a **radou, co zkontrolovat**. Historie chyb (DM2) a mazání (DM11/DM3) v aktivním režimu. |
| **Živá data motoru** | Otáčky, zatížení, teploty (chladivo, olej, palivo, sání, výfuk, **hydraulický olej**, převodovka), tlaky (olej, palivo, **rail**, plnicí tlak), napětí, spotřeba, hladiny, AdBlue, zanesení DPF, **motohodiny**. Zobrazí se jen to, co stroj opravdu vysílá. Informace o ECU (VIN, výrobce/typ motoru, software). |
| **CAN monitor / záznam** | Přehled všech ID na sběrnici, rámce/s, data. Záznam na SD ve formátu *candump* (SavvyCAN, can-utils, Wireshark). **Automatické hledání rychlosti** sběrnice. |
| **Tlak hydrauliky** | 2 snímače (0,5–4,5 V / 0–5 V / 4–20 mA), **rozdíl A−B** (LS marže), špičky min/max (vzorkování 1 kHz), graf, nulování, bar / MPa / psi, záznam do CSV včetně teploty oleje. |
| **Baterie a startování** | Napětí 0–40 V, rozpoznání 12/24 V, stav nabití, kontrola dobíjení a přebíjení. **Test startování** s grafem a verdiktem (baterie / kabely / startér). Záznam napětí do CSV (hledání výpadků). |
| **Frekvence / PWM** | Snímače otáček a rychlosti (Hall), řízení proporcionálních ventilů: frekvence, střída, perioda, přepočet na otáčky. |
| **Teplota (1-Wire)** | Vodotěsná sonda DS18B20 – hydraulický olej, chladič, převodovka. Min/max. |
| **Nastavení** | Rychlost CAN, krystal MCP2515, režim Poslech/Aktivní, typy a rozsahy snímačů, jednotky, 12/24 V, kalibrace, pulzy na otáčku. |

Aplikace je česky (bez diakritiky – Flipper nemá česká písmena).

## Instalace

### Hotový soubor z GitHubu
Každá změna ve složce `flipper/` spustí workflow **Flipper aplikace StrojDiag** (záložka *Actions*), který aplikaci otestuje a sestaví. Ve výsledku běhu stáhni artefakt `strojdiag-fap-release` (pro oficiální firmware; `-dev` je pro vývojovou větev) a soubor `strojdiag.fap` nahraj přes [qFlipper](https://flipperzero.one/update) nebo mobilní aplikaci Flipper do složky **`SD Card/apps/GPIO/`**. Na Flipperu pak *Apps → GPIO → StrojDiag*.

### Sestavení na vlastním PC
Potřebuješ Python 3 a nástroj [ufbt](https://github.com/flipperdevices/flipperzero-ufbt):

```bash
pip install --upgrade ufbt
```

```bash
cd flipper/strojdiag
```

```bash
ufbt
```

Hotový soubor je v `flipper/strojdiag/dist/strojdiag.fap`. S Flipperem připojeným přes USB jde rovnou spustit:

```bash
ufbt launch
```

Aplikace je ověřená proti oficiálnímu firmwaru **1.5.1** (API 88.2) i aktuální vývojové větvi. Na jiném firmwaru ji sestav pomocí `ufbt update --channel=dev` / `--channel=release`.

## Ovládání

| Obrazovka | Nahoru/dolů | OK | ← / → | Držet OK |
|---|---|---|---|---|
| Chybové kódy | výběr | detail chyby | aktivní / historie (DM2) | smazat chyby (jen aktivní režim) |
| Živá data | posun | info o ECU (VIN, motor) | – | – |
| CAN monitor | výběr ID | záznam na SD start/stop | držet → = hledat rychlost | vynulovat statistiky |
| Tlak | čísla / graf A / graf B | záznam CSV start/stop | ← nula (držet = zrušit), → reset min/max | – |
| Baterie | – | test startování | reset min/max | záznam CSV |
| Frekvence | pulzy na otáčku | střída z úrovně 1 / 0 | – | – |
| Teplota | – | reset min/max | – | – |

**Zpět** vždy vrací do menu a vypne všechna měření (a 5 V pro snímače).

## Režimy CAN – Poslech vs. Aktivní

- **Poslech (výchozí):** MCP2515 je v režimu *listen-only* – nic nevysílá, ani potvrzení (ACK). Nemůže ovlivnit stroj, ani při špatně nastavené rychlosti. Stačí pro aktivní chyby (DM1) a většinu živých dat, která ECU vysílají samy.
- **Aktivní:** modul se chová jako servisní tester (adresa 0xF9) a posílá dotazy: historie chyb (DM2), motohodiny, VIN, identifikace motoru a **mazání chyb** (DM11 aktivní / DM3 historie). Zapínej jen se **správnou rychlostí sběrnice** a chyby maž jen při vypnutém motoru po opravě.

## Diagnostické postupy

> Hodnoty berte jako orientační – vždy mají přednost hodnoty ze servisní dokumentace konkrétního stroje.

### 1. Chybové kódy
1. Zapalování zapnuto, modul připojen → *Chybové kódy*.
2. U každého kódu: **SPN** = co (snímač/systém), **FMI** = jaký typ poruchy. Detail ukazuje radu – např. FMI 3/4 = zkrat na +/kostru, FMI 5 = přerušený obvod, FMI 0/1 = skutečná hodnota mimo rozsah (nejdřív ověř manometrem/teploměrem, teprve pak měň snímač).
3. Kódy výrobce (SPN ≥ 520192) si můžeš popsat sám v souboru `apps_data/strojdiag/spn.txt` na SD kartě (vzor: [`spn.txt.example`](strojdiag/spn.txt.example)).
4. Po opravě v aktivním režimu: držet OK → smazat. Pokud se kód vrátí, porucha trvá.

### 2. Hydraulika s load-sensingem – LS marže (rozdíl tlaků)
1. Snímač **A** na měřicí bod čerpadla (P), snímač **B** na měřicí bod LS signálu. Olej zahřátý na provozní teplotu (sonda DS18B20 na nádrž/zpětné potrubí – teplota se ukazuje v záhlaví).
2. Motor na vysoké volnoběžné otáčky, bez pohybu: A = **standby tlak**.
3. Pomalu ovládej jednu funkci (bez dorazu): **dP = A − B = LS marže**. Typicky 15–35 bar (dle výrobce). Nízká marže → pomalé pohyby; vysoká → přehřívání oleje.
4. Stiskni OK pro záznam do CSV a celý průběh si pak prohlédni v Excelu.

### 3. Pojistný ventil / maximální tlak
1. Snímač A na měřicí bod čerpadla nebo okruhu, olej zahřátý.
2. Vynuluj min/max (→), funkci najeď do dorazu a krátce podrž.
3. Odečti **max** (špičky se vzorkují 1000× za sekundu) a porovnej s předepsaným tlakem pojistného ventilu.
4. Graf (nahoru/dolů) ukáže, jestli tlak drží nebo kolísá (opotřebené čerpadlo, netěsný ventil).

### 4. Baterie, startér, alternátor
1. Modul na svorky baterie (nebo diagnostickou zásuvku – pin B má napětí baterie).
2. V klidu: stav nabití (12,7 V = 100 %, 12,3 V = 50 %, u 24 V dvojnásobek).
3. OK → **STARTUJ MOTOR**. Po rozběhu ukáže graf, minimum při protáčení, dobu startu a verdikt. Pod 9,6 V (19,2 V u 24 V) = slabá baterie nebo velký úbytek na kabelech.
4. Po nastartování musí napětí stoupnout na 13,6–14,9 V (27,2–29,8 V). Víc = vadný regulátor („PREBIJI!“).
5. Hledání občasného výpadku: držet OK = záznam napětí do CSV během práce stroje.

### 5. Snímače otáček a PWM ventilů
- **Hallův snímač otáček:** signál na X5. Při protáčení motoru má být frekvence = zuby × ot/min / 60. Nastav počet pulzů na otáčku → přepočet na rpm.
- **Proporcionální ventil:** změř PWM z ECU při pohybu joystickem – střída se má měnit plynule s výchylkou. Bez změny = chyba ECU / joysticku, změna bez pohybu = ventil nebo hydraulika.

### 6. Občasná porucha na CAN
CAN monitor → OK = záznam. Pracuj se strojem, až porucha nastane, záznam zastav. Soubor `can_*.log` otevři v SavvyCAN (File → Load Log → candump) a hledej, která ECU přestala vysílat.

## Soubory na SD kartě

Vše je ve složce `SD Card/apps_data/strojdiag/`:

| Soubor | Obsah |
|---|---|
| `logs/can_RRRRMMDD_HHMMSS.log` | CAN rámce ve formátu candump: `(1732185600.123000) can0 18FEEE00#8C4A...` |
| `logs/tlak_*.csv` | `cas_s;tlak_A_bar;tlak_B_bar;rozdil_A-B_bar;teplota_C`, 20 řádků/s |
| `logs/baterie_*.csv` | `cas_s;napeti_V`, 20 řádků/s |
| `spn.txt` | vlastní popisy SPN (`520300;Tlak pilotniho rizeni`) |
| `settings.bin` | nastavení |

CSV používají **středník a desetinnou čárku** – v českém Excelu se otevřou dvojklikem. Soubory přeneseš do PC přes qFlipper a ve StrojParku je přiložíš k servisní zakázce jako dokument.

## Testy

Jádro (dekódování J1939, BAM/RTS-CTS, DM1/DM2, převody snímačů, vyhodnocení startování, časování MCP2515) má testy, které běží na PC:

```bash
make -C flipper/strojdiag/tests
```

## Omezení

- Podporován je **SAE J1939** (29bitové identifikátory). Proprietární protokoly výrobců (CAT Data Link, Komatsu…) a 11bitové CAN protokoly se jen zaznamenají v CAN monitoru.
- Výrobci mohou používat vlastní SPN a vlastní zprávy – obecné popisy z normy u nich nemusí sedět.
- Nejde o náhradu značkového diagnostického softwaru (kalibrace, programování ECU).
