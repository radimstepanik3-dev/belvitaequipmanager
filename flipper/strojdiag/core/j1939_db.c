#include "j1939_db.h"

#include <stdio.h>
#include <string.h>

/* FMI 0-31 dle SAE J1939-73. Rady jsou obecne – vzdy ma prednost
 * servisni dokumentace vyrobce stroje. */
static const J1939FmiInfo fmi_table[32] = {
    {"Nad rozsahem!",
     "Hodnota je platna, ale NAD normalnim rozsahem (nejzavaznejsi uroven).",
     "Skutecna velicina je mimo rozsah (prehrati, pretlak, vysoke otacky). Over ji nezavislym meridlem (teplomer, manometr). Az kdyz sedi, podezirej snimac."},
    {"Pod rozsahem!",
     "Hodnota je platna, ale POD normalnim rozsahem (nejzavaznejsi uroven).",
     "Napr. nizky tlak oleje nebo nizka hladina. Over skutecny stav manometrem/merkou drive, nez vymenis snimac."},
    {"Neplatna data",
     "Data jsou nestabilni, prerusovana nebo nespravna.",
     "Typicky uvolneny konektor, prodrena kabelaz, vlhkost nebo ruseni. Zkontroluj konektory a piny, pohybuj kabelazi pri zapnutem stroji a sleduj, zda chyba naskoci."},
    {"Napeti vysoke",
     "Napeti nad normalem nebo zkrat na vyssi napeti.",
     "Signal zkratovany na +5 V / +baterie nebo preruseny GND snimace. Odpoj snimac, zmer napeti signalu a odpor vodicu proti kostre a proti +."},
    {"Napeti nizke",
     "Napeti pod normalem nebo zkrat na kostru.",
     "Signal zkratovany na kostru nebo chybi napajeni snimace (5 V reference). Zmer napajeni na konektoru snimace a izolaci vodicu proti kostre."},
    {"Proud nizky/prerus.",
     "Proud pod normalem nebo preruseny obvod.",
     "Preruseny vodic, konektor nebo civka (ventil, rele, vstrikovac). Zmer odpor civky a vodicu az k ECU. Civka 24 V miva 15-40 ohm, 12 V 4-10 ohm (over v dokumentaci)."},
    {"Proud vysoky/zkrat",
     "Proud nad normalem nebo obvod uzemnen.",
     "Zkrat civky nebo vodice na kostru. Zmer odpor civky (prilis nizky = zkrat zavitu) a izolaci vodicu proti kostre (ma byt v MOhm)."},
    {"Mechan. nereaguje",
     "Mechanicky system nereaguje nebo je mimo serizeni.",
     "Akcni clen se nehybe, jak ECU ocekava: zadreny ventil, klapka EGR, aktuator turba, cuprik. Over volny chod, mechanicke serizeni a proved kalibraci."},
    {"Frekv./PWM chyba",
     "Abnormalni frekvence, sirka pulzu nebo perioda.",
     "Snimac otacek/rychlosti: vzduchova mezera, kovove pilinky na magnetu, poskozene ozubeni. Over signal v menu Frekvence / PWM."},
    {"Zprava chodi pozde",
     "Abnormalni rychlost aktualizace (zprava po CAN neprisla vcas).",
     "Zkontroluj CAN kabelaz a konektory. Pri vypnutem zapalovani zmer odpor mezi CAN H a CAN L: ma byt cca 60 ohm (2x120 ohm zakonceni). Over napajeni ECU, ktera zpravu posila."},
    {"Rychla zmena",
     "Abnormalni rychlost zmeny hodnoty.",
     "Skoky signalu: spatny kontakt, ruseni nebo vadny snimac."},
    {"Nezn. pricina",
     "Pricina neni znama.",
     "Postupuj dle servisni dokumentace vyrobce pro dane SPN."},
    {"Vadne zarizeni",
     "Vadne inteligentni zarizeni nebo soucast.",
     "Vnitrni chyba snimace nebo ECU. Nejdriv over napajeni a kostru zarizeni, teprve pak vymenuj."},
    {"Mimo kalibraci",
     "Soucast je mimo kalibraci.",
     "Proved kalibraci / uceni (pedal, joystick, proporcionalni ventily, vstrikovace - kody IMA) dle postupu vyrobce."},
    {"Zvl. instrukce",
     "Specialni instrukce.",
     "Postup je popsan v dokumentaci vyrobce."},
    {"Nad rozs. (mirne)",
     "Hodnota nad normalnim rozsahem - nejmene zavazna uroven.",
     "Sleduj trend v menu Ziva data, hlavne pri zatizeni. Casto signal blizici se poruchy (zaneseny chladic, filtr)."},
    {"Nad rozs. (stredne)",
     "Hodnota nad normalnim rozsahem - stredne zavazna uroven.",
     "Sleduj hodnotu v zivych datech a over nezavislym meridlem."},
    {"Pod rozs. (mirne)",
     "Hodnota pod normalnim rozsahem - nejmene zavazna uroven.",
     "Sleduj trend v menu Ziva data (napr. pokles tlaku oleje za tepla)."},
    {"Pod rozs. (stredne)",
     "Hodnota pod normalnim rozsahem - stredne zavazna uroven.",
     "Sleduj hodnotu v zivych datech a over nezavislym meridlem."},
    {"Chyba dat ze site",
     "Data prijata po siti (CAN) jsou chybna.",
     "Jina ECU posila neplatnou hodnotu. Hledej puvodni chybu v DM1 te ECU, ktera hodnotu meri."},
    {"Data ujizdi nahoru",
     "Hodnota driftuje nahoru.",
     "Starnouci snimac nebo prechodovy odpor v obvodu. Porovnej s nezavislym meridlem."},
    {"Data ujizdi dolu",
     "Hodnota driftuje dolu.",
     "Starnouci snimac nebo prechodovy odpor v obvodu. Porovnej s nezavislym meridlem."},
    {"Rezervovano", "FMI 22 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 23 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 24 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 25 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 26 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 27 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 28 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 29 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Rezervovano", "FMI 30 je rezervovano normou.", "Viz dokumentace vyrobce."},
    {"Stav nastal",
     "Podminka nastala (informacni kod).",
     "Stav je aktivni - napr. ucpany filtr, pozadavek na regeneraci DPF, nizka hladina. Viz dokumentace vyrobce."},
};

typedef struct {
    uint32_t spn;
    const char* name;
} SpnName;

/* Serazeno podle SPN (binarni vyhledavani). Obecne nazvy dle SAE J1939-71. */
static const SpnName spn_table[] = {
    {27, "Poloha ventilu EGR"},
    {51, "Poloha skrtici klapky"},
    {84, "Rychlost stroje"},
    {91, "Plynovy pedal 1"},
    {94, "Tlak paliva (nizkotlaky)"},
    {96, "Hladina paliva"},
    {97, "Voda v palivu"},
    {98, "Hladina oleje motoru"},
    {100, "Tlak oleje motoru"},
    {101, "Tlak v klikove skrini"},
    {102, "Plnici tlak (sani)"},
    {105, "Teplota vzduchu v sani"},
    {107, "Tlakova ztrata vzduch. filtru"},
    {108, "Barometricky tlak"},
    {110, "Teplota chladici kapaliny"},
    {111, "Hladina chladici kapaliny"},
    {157, "Tlak paliva v railu"},
    {158, "Napeti za spinaci skrinkou"},
    {164, "Tlak rizeni vstrikovani"},
    {167, "Napeti dobijeni (alternator)"},
    {168, "Napeti baterie"},
    {171, "Teplota okoli"},
    {172, "Teplota nasavaneho vzduchu"},
    {173, "Teplota vyfukovych plynu"},
    {174, "Teplota paliva"},
    {175, "Teplota oleje motoru"},
    {177, "Teplota oleje prevodovky"},
    {190, "Otacky motoru"},
    {237, "VIN - identifikace stroje"},
    {247, "Motohodiny"},
    {412, "Teplota EGR"},
    {512, "Pozadovany moment motoru"},
    {513, "Skutecny moment motoru"},
    {523, "Zarazeny rychlostni stupen"},
    {627, "Napajeni ridici jednotky"},
    {629, "Ridici jednotka (ECU)"},
    {636, "Snimac polohy motoru (vacka)"},
    {637, "Snimac casovani motoru (klika)"},
    {639, "Sit CAN J1939 #1"},
    {641, "Akcni clen VGT turba"},
    {651, "Vstrikovac valec 1"},
    {652, "Vstrikovac valec 2"},
    {653, "Vstrikovac valec 3"},
    {654, "Vstrikovac valec 4"},
    {655, "Vstrikovac valec 5"},
    {656, "Vstrikovac valec 6"},
    {1136, "Teplota ridici jednotky"},
    {1347, "Regulator VT cerpadla paliva"},
    {1569, "Omezeni vykonu motoru (derate)"},
    {1638, "Teplota hydraulickeho oleje"},
    {1761, "Hladina AdBlue (DEF)"},
    {2659, "Prutok EGR"},
    {2791, "Ventil EGR - rizeni"},
    {3031, "Teplota AdBlue v nadrzi"},
    {3216, "Snimac NOx pred SCR"},
    {3226, "Snimac NOx za SCR"},
    {3242, "Teplota plynu pred DPF"},
    {3246, "Teplota plynu za DPF"},
    {3251, "Tlakova diference DPF"},
    {3361, "Davkovaci jednotka AdBlue"},
    {3364, "Kvalita AdBlue"},
    {3509, "Napajeni snimacu 1 (5 V)"},
    {3510, "Napajeni snimacu 2 (5 V)"},
    {3511, "Napajeni snimacu 3 (5 V)"},
    {3512, "Napajeni snimacu 4 (5 V)"},
    {3513, "Napajeni snimacu 5"},
    {3514, "Napajeni snimacu 6"},
    {3700, "Stav aktivni regenerace DPF"},
    {3719, "Zaneseni DPF sazemi"},
    {3936, "System DPF"},
    {4364, "Ucinnost katalyzatoru SCR"},
    {5246, "Omezeni stroje (AdBlue/SCR)"},
};

const J1939FmiInfo* j1939_db_fmi(uint8_t fmi) {
    return &fmi_table[fmi & 0x1Fu];
}

const char* j1939_db_spn_name(uint32_t spn) {
    size_t lo = 0;
    size_t hi = sizeof(spn_table) / sizeof(spn_table[0]);
    while(lo < hi) {
        size_t mid = (lo + hi) / 2;
        if(spn_table[mid].spn == spn) return spn_table[mid].name;
        if(spn_table[mid].spn < spn) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return NULL;
}

size_t j1939_db_spn_count(void) {
    return sizeof(spn_table) / sizeof(spn_table[0]);
}

const char* j1939_db_sa_name(uint8_t sa) {
    switch(sa) {
    case 0:
        return "Motor";
    case 1:
        return "Motor 2";
    case 3:
        return "Prevodovka";
    case 4:
        return "Prevodovka 2";
    case 11:
        return "Brzdy";
    case 15:
        return "Retarder";
    case 23:
        return "Pristrojovka";
    case 33:
        return "Karoserie";
    case 61:
        return "Emise SCR/DPF";
    case 249:
        return "Diag. tester 1";
    case 250:
        return "Diag. tester 2";
    case 254:
        return "Bez adresy";
    default:
        return NULL;
    }
}

void j1939_db_sa_format(uint8_t sa, char* buf, size_t size) {
    const char* name = j1939_db_sa_name(sa);
    if(name) {
        snprintf(buf, size, "%s", name);
    } else {
        snprintf(buf, size, "ECU 0x%02X", sa);
    }
}

bool j1939_db_parse_spn_line(const char* line, uint32_t* spn, const char** desc, size_t* desc_len) {
    if(!line) return false;
    while(*line == ' ' || *line == '\t') line++;
    if(*line < '0' || *line > '9') return false; /* komentar nebo prazdny radek */

    uint32_t value = 0;
    while(*line >= '0' && *line <= '9') {
        value = value * 10u + (uint32_t)(*line - '0');
        if(value > 0xFFFFFFu) return false;
        line++;
    }
    while(*line == ' ' || *line == '\t') line++;
    if(*line != ';' && *line != ',' && *line != '=') return false;
    line++;
    while(*line == ' ' || *line == '\t') line++;

    size_t len = 0;
    while(line[len] && line[len] != '\r' && line[len] != '\n') len++;
    while(len > 0 && (line[len - 1] == ' ' || line[len - 1] == '\t')) len--;
    if(len == 0) return false;

    *spn = value;
    *desc = line;
    *desc_len = len;
    return true;
}
