/**
 * @file measure.h
 * Prepocty mereni (ciste C, testovatelne na PC):
 *  - snimace tlaku 0.5-4.5 V / 0-5 V / 4-20 mA,
 *  - napeti baterie a vyhodnoceni 12/24 V systemu,
 *  - vyhodnoceni testu startovani,
 *  - casovani CAN radice MCP2515.
 *
 * Hodnoty deliciho pomeru odpovidaji schematu v flipper/hardware/README.md.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---------- Analogove vstupy modulu ---------- */
/** Delic baterie 150k / 10k -> rozsah 0-40 V pri referenci ADC 2.5 V. */
#define MEASURE_BAT_DIVIDER   16.0f
/** Delic snimacu 10k / 10k -> rozsah 0-5 V. */
#define MEASURE_SENS_DIVIDER  2.0f
/** Bocnik pro proudovou smycku 4-20 mA (propojka "mA"): 249 R paralelne
 *  s delicem 10k+10k = 249 * 20000 / 20249 = 245.94 R. */
#define MEASURE_SHUNT_OHM     245.94f

typedef enum {
    SensorTypeOff,
    SensorType05_45V, /**< ratiometricky 0.5-4.5 V, napajeni 5 V */
    SensorType0_5V,
    SensorType4_20mA,
    SensorTypeCount,
} SensorType;

typedef enum {
    SensorStatusOff,
    SensorStatusOk,
    SensorStatusOpen, /**< odpojeno / zkrat na GND / prerusena smycka */
    SensorStatusShortHigh, /**< zkrat na + / prekroceni */
} SensorStatus;

typedef enum {
    PressureUnitBar,
    PressureUnitMpa,
    PressureUnitPsi,
    PressureUnitCount,
} PressureUnit;

typedef struct {
    SensorType type;
    float range_bar; /**< tlak odpovidajici 100 % vystupu */
    float zero_bar; /**< offset po stisku "Nula" */
} SensorConfig;

/**
 * Prevede napeti na vstupu modulu (za delicem, tj. skutecne napeti snimace,
 * v mV) na tlak v barech. Status rika, zda signal dava smysl.
 */
float measure_sensor_pressure(const SensorConfig* cfg, float input_mv, SensorStatus* status);

/** Proud smyckou v mA z napeti na bocniku (mV). */
static inline float measure_loop_current_ma(float input_mv) {
    return input_mv / MEASURE_SHUNT_OHM;
}

float measure_pressure_convert(float bar, PressureUnit unit);
const char* measure_pressure_unit_name(PressureUnit unit);

/* ---------- Baterie ---------- */
typedef enum {
    BatterySystemUnknown,
    BatterySystem12V,
    BatterySystem24V,
} BatterySystem;

typedef enum {
    BatteryStateNone, /**< bez napeti / nepripojeno */
    BatteryStateDischarged, /**< vybita */
    BatteryStateRest, /**< v klidu, motor nebezi */
    BatteryStateCharging, /**< motor bezi, dobijeni OK */
    BatteryStateUndercharge, /**< motor bezi?, malo dobiji */
    BatteryStateOvercharge, /**< prebijeni – vadny regulator */
} BatteryState;

BatterySystem measure_battery_system(float volts);

/** Prepocet na "12V ekvivalent" (u 24 V systemu napeti / 2). */
float measure_battery_per12(float volts, BatterySystem sys);

BatteryState measure_battery_state(float volts, BatterySystem sys);

/** Odhad nabiti olovene baterie v klidu (0-100 %), -1 kdyz nelze. */
int measure_battery_soc(float volts, BatterySystem sys);

const char* measure_battery_state_text(BatteryState state);

/* ---------- Test startovani ---------- */
typedef enum {
    CrankVerdictNone,
    CrankVerdictOk,
    CrankVerdictWeak,
    CrankVerdictBad,
    CrankVerdictNoCrank,
} CrankVerdict;

typedef struct {
    float rest_v; /**< napeti pred startem */
    float min_v; /**< minimum behem startovani */
    float avg_crank_v; /**< prumer behem startovani */
    float min_crank_v; /**< vyhlazene minimum pri protaceni (bez narazove spicky) - podle nej verdikt */
    float end_v; /**< napeti na konci zaznamu */
    uint32_t crank_ms; /**< jak dlouho byl starter zatizeny */
    uint32_t min_at_ms; /**< cas minima od zacatku zaznamu */
    bool engine_started; /**< napeti na konci > klidove + 0.5 V (12 V) = dobiji */
    BatterySystem sys;
    CrankVerdict verdict;
} CrankResult;

/**
 * Vyhodnoti zaznam startovani. samples_cv = napeti v setinach voltu,
 * pre_samples = pocet vzorku pred spoustenim (klidove napeti),
 * force_sys = BatterySystemUnknown -> 12/24 V se urci automaticky.
 */
void measure_crank_analyze(
    const uint16_t* samples_cv,
    size_t count,
    size_t pre_samples,
    uint32_t sample_rate_hz,
    BatterySystem force_sys,
    CrankResult* out);

const char* measure_crank_verdict_text(CrankVerdict verdict);

/* ---------- CAN casovani MCP2515 ---------- */
typedef struct {
    uint8_t cnf1;
    uint8_t cnf2;
    uint8_t cnf3;
    uint8_t tq_total; /**< pocet kvant na bit */
    uint8_t sample_point_pct;
} CanTiming;

/**
 * Spocita registry CNF1-3 pro dany krystal a rychlost. Cil: 16 kvant
 * a vzorkovani kolem 87.5 % (J1939). Vraci false, kdyz kombinace nejde.
 */
bool measure_can_timing(uint32_t fosc_hz, uint32_t bitrate, CanTiming* out);

#ifdef __cplusplus
}
#endif
