# StrojDiag modul – hardware pro Flipper Zero

Přídavná deska na GPIO lištu Flipperu Zero. S aplikací **StrojDiag** z něj udělá diagnostický přístroj na stavební stroje:

| Blok | Co měří / umí | Připojení k Flipperu |
|---|---|---|
| **CAN / J1939** | chybové kódy, živá data motoru, záznam komunikace | SPI: piny 2–6, napájení 3,3 V (pin 9) |
| **Napětí baterie** | 0–40 V (12 i 24 V systémy), test startování | ADC pin 7 (PC3) |
| **2× snímač tlaku** | 0,5–4,5 V, 0–5 V nebo 4–20 mA, napájení 5 V | ADC piny 15 (PC1) a 16 (PC0), 5 V z pinu 1 |
| **Frekvence / PWM** | 0,1 Hz – ~20 kHz, signály 3–30 V | pin 14 (PB7) |
| **Teplota** | vodotěsná sonda DS18B20 | 1-Wire pin 17 |

Všechno jde postavit **bez SMD pájení** na univerzální desce plošných spojů (až na jeden malý ochranný prvek v pouzdře SOT-23, který se dá koupit na redukci nebo nahradit – viz níže). Odhadovaná cena součástek bez snímačů tlaku je **cca 600–900 Kč**.

> ⚠️ **Bezpečnost:** modul se připojuje k elektrice a hydraulice stroje. Hydraulické měřicí body připojuj jen bez tlaku (stroj vypnutý, tlak uvolněný), olej pod tlakem prorazí kůži. Při svařování na stroji modul vždy odpoj. Výchozí režim CAN je **jen poslech** – modul na sběrnici nic nevysílá.

---

## 1. Blokové schéma

```
              Flipper Zero GPIO (1x18, 2,54 mm)
  1:5V  2:PA7 3:PA6 4:PA4 5:PB3 6:PB2 7:PC3 8:GND 9:3V3 ... 14:PB7 15:PC1 16:PC0 17:1W 18:GND
   |     |MOSI |MISO |CS   |SCK  |INT  |ADC        |       |      |FREQ  |ADC   |ADC   |
   |   +-v-----^-----v-----v-----^--+  |           |       |      |      |      |      |
   |   |     U1  MCP2515 (3,3 V)    |  |           |       |      |      |      |      |
   |   |   krystal 8 MHz, 2x22 pF   |  |           |       |      |      |      |      |
   |   +-----TXCAN------RXCAN-------+  |           |       |      |      |      |      |
   |           |          ^            |           |       |      |      |      |      |
   |   +-------v----------+---------+  |           |       |      |      |      |      |
   |   |  U2 SN65HVD230 (3,3 V)     |  |           |       |      |      |      |      |
   |   +------CANH--------CANL------+  |           |       |      |      |      |      |
   |           |  NUP2105L  |  J1 120R (zakonceni, normalne ROZPOJENO)    |      |      |
   |           |            |          |                          |      |      |      |
   |       X1: 3 CAN H   4 CAN L   2 +BAT --F1--+--150k--+--> pin7 |      |      |      |
   |                                    1 GND    |      10k||100n  |      |      |      |
   |                                             |                 |      |      |      |
   +--F2(100mA)--> +5V snimacu A/B (J2/J4: 5V nebo +BAT pro 4-20 mA) |      |      |      |
                   X3/X4 signal --10k--+--10k--GND ----------------+---> pin15 / pin16  |
                                       +-- 249R pres J3/J5 (rezim mA)                     |
                   X5 frekvence --10k--+--33k--GND --------------------> pin14            |
                   X6 DS18B20 data ---------------- 4k7 na 3V3 ------------------------> pin17
```

## 2. Podrobné zapojení

### 2.1 CAN rozhraní (MCP2515 + SN65HVD230)

Proč ne hotový modrý modul „MCP2515 + TJA1050“? Transceiver TJA1050 potřebuje **5 V** a pak i MCP2515 běží na 5 V – Flipper má logiku 3,3 V a přijímač MCP2515 by na 5 V nespolehlivě četl jeho signály. Proto zde **MCP2515 i transceiver běží na 3,3 V** (SN65HVD230 je 3,3V verze).

**U1 – MCP2515-I/P (DIP-18)**

| Pin U1 | Signál | Kam |
|---|---|---|
| 1 TXCAN | data do transceiveru | U2 CTX (D) |
| 2 RXCAN | data z transceiveru | U2 CRX (R) |
| 7 OSC2, 8 OSC1 | krystal | Y1 8 MHz, z obou nožek 22 pF (C1, C2) na GND |
| 9 VSS | zem | GND |
| 12 INT | přerušení | Flipper **pin 6** (PB2) |
| 13 SCK | hodiny SPI | Flipper **pin 5** (PB3) |
| 14 SI | data do čipu | Flipper **pin 2** (PA7) |
| 15 SO | data z čipu | Flipper **pin 3** (PA6) |
| 16 CS | výběr čipu | Flipper **pin 4** (PA4) |
| 17 RESET | reset | 10 kΩ (R10) na 3V3 |
| 18 VDD | napájení | 3V3 (Flipper **pin 9**), 100 nF (C7) co nejblíž na GND |
| 3, 4, 5, 6, 10, 11 | – | nezapojeno |

Krystal může být i **16 MHz** – v aplikaci pak nastav *Nastavení → Krystal MCP2515 → 16 MHz*.

**U2 – modul SN65HVD230** (běžně „CJMCU-230“ / „VP230 CAN module“):

| Pin modulu | Kam |
|---|---|
| 3V3 | 3V3 |
| GND | GND |
| CTX | U1 pin 1 (TXCAN) |
| CRX | U1 pin 2 (RXCAN) |
| CANH | X1 pin 3 (CAN H) |
| CANL | X1 pin 4 (CAN L) |

> ❗ Na těchto modulech bývá napájený **rezistor 120 Ω mezi CANH a CANL** (SMD s potiskem „121“). **Odpájej ho.** Sběrnice stroje už je zakončená na obou koncích (2× 120 Ω) a třetí zakončení by zhoršilo komunikaci. Pro zkoušení na stole s jedinou ECU slouží propojka J1.

**Ochrana a zakončení:**
- **D1 NUP2105L** (SOT-23, ochrana CAN pro 12/24 V systémy): piny 1 a 2 na CAN H a CAN L, pin 3 na GND (zkontroluj podle datasheetu výrobce). Prodává se i na redukci SOT-23 → DIP. Nepoužívej velké transily (P6KE apod.) – mají velkou kapacitu a kazí signál.
- **J1 + R11 120 Ω** mezi CAN H a CAN L – zakončení jen pro zkoušení na stole. Na stroji **rozpojeno**.

### 2.2 Měření napětí baterie

```
X1 pin 2 (+BAT) --F1 (PTC 100 mA)--+--R1 150k 1%--+--------------+---> Flipper pin 7 (PC3)
                                   |              |              |
                                   |          R2 10k 1%     C3 100 nF   D2/D3 BAT85:
                                   |              |              |      GND->uzel, uzel->3V3
                                  (+BAT_F)       GND            GND
```
- Dělič 150k/10k = 16:1 → rozsah **0–40 V** (reference ADC 2,5 V), rozlišení ~10 mV.
- Ochranné diody D2, D3 (Schottky BAT85): anoda D2 na GND, katoda na uzel; anoda D3 na uzel, katoda na 3V3.
- Přesnost doladíš v *Nastavení → Kalibrace U* (±5 % po 0,5 %) podle multimetru.

### 2.3 Snímače tlaku A a B (dva stejné kanály)

```
            J2: napajeni snimace           X3 (snimac A)
 Flipper pin 1 (5V) --F2 PTC 100mA--o 5V \
 +BAT_F --D10 1N4007-----------------o UB  >---- 1 napajeni
                                            2 signal --+--R3 10k--+------------+---> Flipper pin 15 (PC1)
                                            3 GND      |          |            |
                                                       |      R4 10k   C4 100 nF   D4/D5 BAT85 (clamp)
                                                  J3 "mA"         |            |
                                                       |         GND          GND
                                                    R12 249R
                                                       |
                                                      GND
```
Kanál B je stejný: X4, J4, R5/R6, C5, D6/D7, J5 + R13, výstup na Flipper **pin 16** (PC0).

| Typ snímače | Propojka napájení (J2/J4) | Propojka mA (J3/J5) | V aplikaci |
|---|---|---|---|
| 0,5–4,5 V ratiometrický (nejběžnější levné snímače) | **5V** | rozpojeno | Snímač = 0.5-4.5V |
| 0–5 V | 5V | rozpojeno | 0-5V |
| 4–20 mA dvouvodičový (průmyslové, napájení 10–30 V) | **UB** (+baterie stroje) | **spojeno** | 4-20mA |

- Dělič 10k/10k → vstup 0–5 V. Vstupní odpor 20 kΩ je pro běžné snímače v pořádku.
- Bočník R12/R13 **249 Ω** (stačí 1 %, lépe 0,1 %): 20 mA → 4,98 V. Aplikace počítá s tím, že je paralelně s děličem (výsledně 245,9 Ω).
- 5 V pro snímače dává Flipper z pinu 1 – aplikace ho zapíná jen na obrazovce *Tlak* (*Nastavení → 5V pro snímače*).
- Aplikace hlídá poruchy: **ODPOJ** (pod 0,25 V u 0,5–4,5 V snímače), **SMYCKA** (pod 3,6 mA), **ZKRAT+** (nad rozsahem).

### 2.4 Vstup frekvence / PWM

```
X5 pin 1 (signal) --+--R7 10k--+-----------+---> Flipper pin 14 (PB7)
                    |          |           |
              D8 SMBJ33CA   R8 33k    C6 1 nF   D9/D11 BAT85 (clamp na GND a 3V3)
                    |          |           |
X5 pin 2 (GND) -----+---------GND---------GND
```
- Dělič 33/43 → log. 1 od ~3 V, log. 0 pod ~1,3 V. Funguje pro Hallovy snímače 5 V, PWM 12/24 V, výstupy ECU.
- Transil D8 (obousměrný 33 V) pohltí napěťové špičky z cívek ventilů. Varianta s vývody: P6KE33CA.
- **Indukční (VR) snímače** se dvěma vodiči dávají střídavý signál – na ty je potřeba komparátor (např. LM393), tento vstup je přímo neměří.
- Ventil spínaný ECU na kostru (low-side): měříš-li na „zemním“ vodiči cívky, je střída obrácená – v aplikaci stiskni **OK** (zobrazí se „Strida(0)“).

### 2.5 Teploměr DS18B20

Vodotěsná sonda (kabel 1–3 m) na X6: červený = 3V3 (pin 9), černý = GND, žlutý = data → Flipper **pin 17**. **R9 4,7 kΩ** mezi daty a 3V3.

### 2.6 Konektory (doporučení pro práci v terénu)

| Konektor | Typ | Piny |
|---|---|---|
| **X0** k Flipperu | kolíková lišta 1×18, 2,54 mm (přímá) | piny podle tabulky výše |
| **X1** ke stroji | GX16-5 (letecký konektor) | 1 GND, 2 +BAT, 3 CAN H, 4 CAN L, 5 stínění (nezapojeno) |
| **X3, X4** snímače | GX12-3 | 1 napájení, 2 signál, 3 GND |
| **X5** frekvence | GX12-2 nebo 2 zdířky 4 mm | 1 signál, 2 GND |
| **X6** teploměr | GX12-3 | 1 3V3, 2 data, 3 GND |

Konektory GX nejsou určené k rozpojování pod napětím – zapojuj je před připojením ke stroji.

### 2.7 Kabel ke stroji

**A) Diagnostická zásuvka J1939 – Deutsch HD10 9pin** (nákladní auta, mnoho motorů Cummins, Deutz, Perkins, Volvo, John Deere…). Kup kabel „J1939 Deutsch 9 pin female – open end“ nebo konektor HD16-9-1939S a zapoj:

| Pin zásuvky | Signál (SAE J1939-13) | X1 |
|---|---|---|
| A | GND (−baterie) | 1 |
| B | +baterie | 2 |
| C | CAN H (J1939) | 3 |
| D | CAN L (J1939) | 4 |
| E | stínění | 5 / nezapojeno |

Zelený kabelový konektor (Type 2, 500 kb/s) pasuje i do černé zásuvky stroje (Type 1, 250 kb/s), obráceně to nejde – vyplatí se koupit **zelený**.

> ⚠️ Výrobci stavebních strojů (CAT, Komatsu, JCB, Volvo CE, Bobcat, Kubota…) často používají **vlastní diagnostické konektory a vlastní zapojení**. Vždy si CAN H / CAN L najdi ve schématu elektroinstalace konkrétního stroje.

**B) Univerzální měřicí šňůry** – X1 zakončený 4 zkušebními hroty / krokosvorkami (GND, +BAT, CAN H, CAN L). Hrotem lze píchnout ze zadní strany konektoru libovolné ECU (back-probe) bez poškození kabeláže.

**Jak najít a ověřit CAN H / CAN L:**
1. Zapalování **vypnuto**: mezi CAN H a CAN L změř odpor → **cca 60 Ω** (dva zakončovací rezistory 120 Ω). 120 Ω = chybí jedno zakončení, ~40 Ω = jedno navíc.
2. Zapalování **zapnuto**: proti kostře CAN H ≈ 2,5–3,5 V, CAN L ≈ 1,5–2,5 V (multimetr ukazuje průměr).
3. Prohozené H a L poznáš tak, že CAN monitor neukazuje žádné rámce – prohoď vodiče.

### 2.8 Hydraulické připojení snímačů

- Snímač tlaku s výstupem **0,5–4,5 V, závit G1/4** (běžně 0–250, 0–400, 0–600 bar). Rozsah volit aspoň **1,25× vyšší** než maximální tlak systému (bagry 350–400 bar → snímač 600 bar).
- Na stroj přes **měřicí body Minimess** (např. M16×2) a měřicí hadičku s koncovkou na G1/4.
- V aplikaci nastav *Typ* a *Rozsah* snímače. Před měřením při nulovém tlaku stiskni **← (Nula)**.

---

## 3. Seznam součástek (BOM)

Ceny jsou orientační (2025/2026, v Kč s DPH). Dodavatelé: [GM Electronic](https://www.gme.cz), [TME](https://www.tme.eu/cz/), [LaskaKit](https://www.laskakit.cz), AliExpress (moduly, konektory, snímače).

| Ozn. | Součástka | Hodnota / typ | Ks | Cca Kč |
|---|---|---|---|---|
| U1 | CAN řadič | MCP2515-I/P (DIP-18) + patice DIP-18 | 1 | 70 |
| U2 | CAN transceiver | modul SN65HVD230 (CJMCU-230) | 1 | 60 |
| Y1 | krystal | 8 MHz HC-49 | 1 | 10 |
| C1, C2 | kondenzátor keramický | 22 pF | 2 | 4 |
| C3, C4, C5, C7 | kondenzátor keramický | 100 nF | 4 | 8 |
| C6 | kondenzátor keramický | 1 nF | 1 | 2 |
| C8 | kondenzátor | 10 µF / 16 V (na 3V3) | 1 | 3 |
| R1 | rezistor 1 % | 150 kΩ | 1 | 2 |
| R2, R3, R4, R5, R6, R7, R10 | rezistor 1 % | 10 kΩ | 7 | 10 |
| R8 | rezistor 1 % | 33 kΩ | 1 | 2 |
| R9 | rezistor | 4,7 kΩ | 1 | 2 |
| R11 | rezistor | 120 Ω | 1 | 2 |
| R12, R13 | rezistor 0,1–1 % | 249 Ω | 2 | 10 |
| D1 | ochrana CAN | NUP2105L (SOT-23) + redukce na DIP | 1 | 30 |
| D2–D7, D9, D11 | Schottkyho dioda | BAT85 (DO-35) | 8 | 25 |
| D8 | transil obousměrný | SMBJ33CA nebo P6KE33CA | 1 | 10 |
| D10 | dioda | 1N4007 | 1 | 2 |
| F1, F2 | vratná pojistka PTC | 100 mA (např. MF-R010) | 2 | 15 |
| J1–J5 | propojky | kolíková lišta 2×3 / 1×2 + jumpery | 5 | 15 |
| X0 | kolíková lišta | 1×18, 2,54 mm, přímá | 1 | 10 |
| X1 | letecký konektor | GX16-5 (pár) | 1 | 60 |
| X3, X4, X6 | letecký konektor | GX12-3 (pár) | 3 | 120 |
| X5 | letecký konektor | GX12-2 (pár) nebo zdířky 4 mm | 1 | 40 |
| – | univerzální DPS | 5×7 cm, oboustranná | 1 | 40 |
| – | krabička | plastová cca 80×60×30 mm | 1 | 60 |
| – | teploměr | DS18B20 vodotěsná sonda 1 m | 1 | 60 |
| – | kabel ke stroji | Deutsch 9pin J1939 (zelený) – volný konec | 1 | 250–450 |
| | | **Celkem bez snímačů tlaku** | | **≈ 950** |
| – | snímač tlaku | 0–600 bar, 0,5–4,5 V, G1/4, 5 V | 1–2 | 500–900 /ks |
| – | měřicí hadička | Minimess M16×2 → G1/4, 1 m | 1–2 | 300–600 /ks |

Ušetřit jde vynecháním leteckých konektorů (svorkovnice) a kabelu J1939 (měřicí šňůry s hroty).

---

## 4. Stavba krok za krokem

1. **Rozvržení:** lištu X0 umísti na okraj desky tak, aby deska po zasunutí do Flipperu ležela za jeho zády (podobně jako oficiální Wi-Fi deska). Pin 1 lišty = pin 1 Flipperu – orientuj se podle popisků na těle Flipperu u konektoru (5V, A7, A6 … 1W, GND). **Zkontroluj orientaci dvakrát** – otočená lišta propojí 5 V se signály.
2. **Napájení:** rozveď sběrnice **3V3** (pin 9) a **GND** (piny 8, 11, 18 – stačí 8 a 18). Hned u lišty C8 10 µF.
3. **CAN:** patice U1, krystal Y1 co nejblíž pinům 7/8 s C1, C2; C7 přímo mezi piny 18 a 9 patice. Připoj modul U2 (s odpájeným 120 Ω) a D1. Spoje SPI krátké (do 5 cm).
4. **Analogové vstupy:** děliče, kondenzátory a ochranné diody umísti blízko lišty, vodiče k pinům 7, 15, 16 veď dál od SPI hodin (pin 5).
5. **Frekvence a teplota:** R7, R8, C6, D8, D9, D11 a R9.
6. **Konektory** do krabičky, spoje k desce lankem 0,25 mm², vstupy od stroje (X1) aspoň 0,5 mm².
7. **Kontrola bez Flipperu:** multimetrem zkontroluj, že **3V3–GND, 5V–GND a 5V–3V3 nejsou ve zkratu** (> 1 kΩ) a že piny lišty vedou tam, kam mají.

## 5. Oživení

| Krok | Postup | Očekávaný výsledek |
|---|---|---|
| 1 | Zasuň modul do Flipperu, spusť *Apps → GPIO → StrojDiag → CAN monitor* (bez stroje) | „CAN 250k Posl.“ a „Čekám na rámce…“. Hláška „MCP2515 neodpovídá“ = chyba SPI, krystalu nebo 3V3. |
| 2 | Na X1 (+BAT / GND) připoj zdroj 12,0 V, obrazovka *Baterie* | 12,0 V ± 0,2 V, „System 12V“. Doladit v *Kalibrace U*. |
| 3 | Na signál snímače A přiveď 2,50 V (zdroj nebo potenciometr z 5 V), typ 0.5-4.5V, rozsah 600 | ≈ 300 bar. Bez signálu „ODPOJ“. |
| 4 | Na X5 přiveď obdélník 5 V (např. PWM z Arduina 490 Hz) | ≈ 490 Hz, střída 50 % |
| 5 | Připoj sondu DS18B20 | pokojová teplota |
| 6 | Na stroji: zapalování vypnuto, změř 60 Ω mezi CAN H a L, připoj modul, zapni zapalování | CAN monitor ukazuje rámce/s a ID, *Živá data* ukazují otáčky, teploty… Když nic: drž **→** = automatické hledání rychlosti. |

## 6. Rozšíření do budoucna

- Komparátor LM393 pro indukční snímače otáček.
- Druhý CAN kanál (některé stroje mají oddělenou sběrnici hydrauliky a motoru).
- Výkonový spínač (MOSFET + pojistka) pro zkoušení cívek ventilů a relé z baterie stroje.
- Navržení jednostranné DPS (KiCad) podle tohoto schématu.
