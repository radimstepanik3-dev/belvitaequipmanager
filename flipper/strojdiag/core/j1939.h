/**
 * @file j1939.h
 * Dekodovani SAE J1939 (CAN 29 bit) – ciste C bez zavislosti na Flipper SDK,
 * aby slo testovat na PC (viz tests/).
 *
 * Umi:
 *  - vypocet PGN / SA / DA z 29bitoveho identifikatoru,
 *  - ziva data (otacky, teploty, tlaky, motohodiny, napeti ...),
 *  - DM1 (aktivni chyby) a DM2 (historie chyb) vcetne kontrolek,
 *  - skladani viceramcovych zprav (TP.BAM i pasivne odposlouchane TP.RTS/CTS),
 *  - identifikaci ECU (VIN, Component ID, Software ID).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Jeden CAN ramec. */
typedef struct {
    uint32_t id; /**< 29bitovy (ext=true) nebo 11bitovy identifikator */
    uint8_t dlc;
    uint8_t data[8];
    bool ext;
    bool rtr;
} CanFrame;

/* ---------- Zname PGN ---------- */
#define J1939_PGN_REQUEST   59904u /* 0xEA00 */
#define J1939_PGN_ADDR_CLAIM 60928u /* 0xEE00 */
#define J1939_PGN_TP_CM     60416u /* 0xEC00 */
#define J1939_PGN_TP_DT     60160u /* 0xEB00 */
#define J1939_PGN_DM1       65226u /* 0xFECA aktivni chyby */
#define J1939_PGN_DM2       65227u /* 0xFECB drive aktivni chyby */
#define J1939_PGN_DM3       65228u /* 0xFECC smazat historii */
#define J1939_PGN_DM11      65235u /* 0xFED3 smazat aktivni chyby */
#define J1939_PGN_SOFT_ID   65242u /* 0xFEDA */
#define J1939_PGN_COMP_ID   65259u /* 0xFEEB */
#define J1939_PGN_VIN       65260u /* 0xFEEC */

#define J1939_SA_GLOBAL     0xFFu
#define J1939_SA_TOOL       0xF9u /* Off-board diagnostic-service tool #1 */

#define J1939_MAX_SOURCES   8u /* pocet ECU sledovanych v DM tabulce */
#define J1939_MAX_DTC_PER_SA 16u
#define J1939_TP_SESSIONS   4u
#define J1939_TP_MAX_BYTES  256u
#define J1939_ID_TEXT_LEN   48u

/** Vypocte PGN z identifikatoru (u PDU1 se vynecha cilova adresa). */
static inline uint32_t j1939_pgn(uint32_t id) {
    uint32_t pgn = (id >> 8) & 0x3FFFFu;
    if(((pgn >> 8) & 0xFFu) < 240u) pgn &= 0x3FF00u;
    return pgn;
}

static inline uint8_t j1939_sa(uint32_t id) {
    return (uint8_t)(id & 0xFFu);
}

/** Cilova adresa – jen u PDU1 (PF < 240), jinak 0xFF (vsem). */
static inline uint8_t j1939_da(uint32_t id) {
    uint8_t pf = (uint8_t)((id >> 16) & 0xFFu);
    return pf < 240u ? (uint8_t)((id >> 8) & 0xFFu) : J1939_SA_GLOBAL;
}

static inline uint8_t j1939_priority(uint32_t id) {
    return (uint8_t)((id >> 26) & 0x7u);
}

/** Sestavi 29bitovy identifikator. U PDU1 se do PS vlozi cilova adresa. */
uint32_t j1939_make_id(uint8_t priority, uint32_t pgn, uint8_t da, uint8_t sa);

/** Ramec Request (PGN 59904) pro vyzadani jineho PGN. */
void j1939_build_request(CanFrame* out, uint32_t requested_pgn, uint8_t da, uint8_t sa);

/* ---------- Ziva data ---------- */
typedef enum {
    J1939ParamEngineSpeed,
    J1939ParamEngineLoad,
    J1939ParamActualTorque,
    J1939ParamPedal,
    J1939ParamCoolantTemp,
    J1939ParamOilPressure,
    J1939ParamOilTemp,
    J1939ParamFuelTemp,
    J1939ParamFuelPressure,
    J1939ParamRailPressure,
    J1939ParamBoost,
    J1939ParamIntakeTemp,
    J1939ParamAirFilterDp,
    J1939ParamExhaustTemp,
    J1939ParamAmbientTemp,
    J1939ParamBarometric,
    J1939ParamBattery,
    J1939ParamCharging,
    J1939ParamFuelRate,
    J1939ParamFuelLevel,
    J1939ParamCoolantLevel,
    J1939ParamOilLevel,
    J1939ParamHydraulicTemp,
    J1939ParamTransOilTemp,
    J1939ParamTransOilPressure,
    J1939ParamCurrentGear,
    J1939ParamSpeed,
    J1939ParamDefLevel,
    J1939ParamDpfSoot,
    J1939ParamEngineHours,
    J1939ParamCount,
} J1939ParamId;

typedef struct {
    uint32_t pgn;
    uint16_t spn;
    uint8_t start; /**< prvni bajt (od 0) */
    uint8_t len; /**< 1, 2 nebo 4 bajty, little endian */
    float scale;
    float offset;
    const char* label; /**< kratky popisek pro displej (ASCII) */
    const char* unit;
    uint8_t decimals;
} J1939ParamDef;

typedef struct {
    float value;
    uint32_t tick; /**< cas posledni aktualizace v ms, 0 = nikdy */
    uint8_t sa;
} J1939ParamValue;

const J1939ParamDef* j1939_param_def(J1939ParamId id);

/**
 * Vytahne surovou hodnotu a prevede ji. Vraci false, pokud je hodnota
 * "nedostupna" / "chyba" (0xFF.., 0xFE..) nebo ramec je kratky.
 */
bool j1939_decode_param(const J1939ParamDef* def, const uint8_t* data, uint8_t dlc, float* out);

/* ---------- Chybove kody (DTC) ---------- */
typedef struct {
    uint32_t spn;
    uint8_t fmi;
    uint8_t oc; /**< pocet vyskytu */
    bool cm; /**< conversion method = 1 (stary format SPN, jen informativne) */
} J1939Dtc;

typedef struct {
    bool used;
    uint8_t sa;
    uint8_t lamp; /**< bajt 0: MIL(7-6) RSL(5-4) AWL(3-2) PL(1-0) */
    uint8_t flash;
    uint8_t count;
    uint32_t tick;
    J1939Dtc dtc[J1939_MAX_DTC_PER_SA];
} J1939DtcSource;

typedef struct {
    J1939DtcSource src[J1939_MAX_SOURCES];
    uint32_t updates; /**< zvysi se pri kazde zmene – pro prekresleni UI */
} J1939DtcTable;

/** Stav kontrolky: 0 vyp, 1 zap, 2/3 nedostupne. */
typedef enum {
    J1939LampMil = 6,
    J1939LampRedStop = 4,
    J1939LampAmber = 2,
    J1939LampProtect = 0,
} J1939Lamp;

static inline uint8_t j1939_lamp_state(uint8_t lamp_byte, J1939Lamp lamp) {
    return (uint8_t)((lamp_byte >> (uint8_t)lamp) & 0x3u);
}

/** Rozparsuje DM1/DM2 data do tabulky pro dany zdroj. Vraci pocet DTC. */
uint8_t j1939_parse_dm(J1939DtcTable* table, uint8_t sa, const uint8_t* data, uint16_t len, uint32_t now);

/** Celkovy pocet DTC v tabulce. */
uint16_t j1939_dtc_total(const J1939DtcTable* table);

/** Najde n-ty DTC (pres vsechny zdroje). */
bool j1939_dtc_get(
    const J1939DtcTable* table,
    uint16_t index,
    const J1939DtcSource** src_out,
    const J1939Dtc** dtc_out);

/** Logicky OR kontrolek ze vsech ECU (zap = 1 vyhrava). */
uint8_t j1939_dtc_lamps(const J1939DtcTable* table);

void j1939_dtc_clear(J1939DtcTable* table);

/* ---------- Transportni protokol ---------- */
typedef struct {
    bool active;
    uint8_t sa;
    uint8_t da;
    uint32_t pgn;
    uint16_t size;
    uint8_t packets;
    uint8_t received;
    uint32_t tick;
    uint8_t seen[32]; /**< bitmapa prijatych paketu (1..255) */
    uint8_t data[J1939_TP_MAX_BYTES];
} J1939TpSession;

/* ---------- Souhrnny stav ---------- */
typedef struct {
    J1939ParamValue params[J1939ParamCount];
    J1939DtcTable dm1;
    J1939DtcTable dm2;
    J1939TpSession tp[J1939_TP_SESSIONS];

    uint8_t sa_seen[32]; /**< bitmapa adres, ktere vysilaly */
    uint32_t frames_j1939;

    char vin[J1939_ID_TEXT_LEN];
    char comp_id[J1939_ID_TEXT_LEN];
    char soft_id[J1939_ID_TEXT_LEN];
    uint8_t vin_sa;
    uint8_t comp_sa;
    uint8_t soft_sa;
    uint32_t id_updates;
} J1939State;

void j1939_state_init(J1939State* s);

/** Zpracuje jeden ramec (jen 29bitove ramce jsou J1939). */
void j1939_process(J1939State* s, const CanFrame* f, uint32_t now_ms);

/** Odstrani DM1 od ECU, ktera prestala vysilat, a zastarale TP relace. */
void j1939_expire(J1939State* s, uint32_t now_ms);

/** Je hodnota cerstva (prisla v poslednich max_age_ms)? */
bool j1939_param_fresh(const J1939State* s, J1939ParamId id, uint32_t now_ms, uint32_t max_age_ms);

/** Pocet ECU (zdrojovych adres), ktere byly videt. */
uint16_t j1939_sa_count(const J1939State* s);

#ifdef __cplusplus
}
#endif
