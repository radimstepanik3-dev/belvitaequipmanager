/**
 * @file j1939_db.h
 * Textova databaze: popisy FMI s radami pro opravu, nazvy beznych SPN
 * a nazvy ridicich jednotek (zdrojovych adres). Texty jsou bez diakritiky,
 * protoze fonty Flipperu umi jen ASCII.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char* short_text; /**< max ~18 znaku pro seznam */
    const char* text; /**< plny popis */
    const char* tip; /**< co zkontrolovat */
} J1939FmiInfo;

const J1939FmiInfo* j1939_db_fmi(uint8_t fmi);

/** Nazev SPN z vestavene tabulky, NULL kdyz neni znamy. */
const char* j1939_db_spn_name(uint32_t spn);

/** SPN 520192 - 524287 jsou vyhrazene pro vyrobce (CAT, Komatsu, JCB, ...). */
static inline bool j1939_db_spn_is_proprietary(uint32_t spn) {
    return spn >= 520192u && spn <= 524287u;
}

/** Nazev ECU podle zdrojove adresy. Vraci NULL pro neznamou adresu. */
const char* j1939_db_sa_name(uint8_t sa);

/** Zapise do buf nazev ECU nebo "ECU 0xNN". */
void j1939_db_sa_format(uint8_t sa, char* buf, size_t size);

/** Pocet polozek vestavene SPN tabulky (pro testy). */
size_t j1939_db_spn_count(void);

/**
 * Najde SPN v textu uzivatelskeho souboru (radky "SPN;Popis", '#' = komentar).
 * Pouziva se pro vlastni/OEM kody ulozene na SD karte. Vraci true a kopii
 * popisu do out, kdyz radek existuje.
 */
bool j1939_db_parse_spn_line(const char* line, uint32_t* spn, const char** desc, size_t* desc_len);

#ifdef __cplusplus
}
#endif
