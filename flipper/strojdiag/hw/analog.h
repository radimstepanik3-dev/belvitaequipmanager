/**
 * @file analog.h
 * Vzorkovani analogovych vstupu modulu (1 kHz):
 *   pin 7  PC3 = napeti baterie (delic 150k/10k),
 *   pin 15 PC1 = snimac A (delic 10k/10k, propojka mA = bocnik 249 R),
 *   pin 16 PC0 = snimac B.
 * Hodnoty jsou prepoctene na napeti na svorce modulu (mV).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "sd_log.h"

typedef enum {
    AnalogChBattery,
    AnalogChSensorA,
    AnalogChSensorB,
    AnalogChCount,
} AnalogChannel;

#define ANALOG_HISTORY      128u /* body grafu */
#define ANALOG_WINDOW_MS    50u /* prumerovani pro displej a graf (20 Hz) */
#define ANALOG_CRANK_RATE   500u /* Hz */
#define ANALOG_CRANK_LEN    3000u /* 6 s */
#define ANALOG_CRANK_PRE    250u /* 0.5 s pred spustenim */

typedef struct {
    float mv[AnalogChCount]; /**< prumer za posledni okno */
    float min_mv[AnalogChCount]; /**< od posledniho resetu (vyhlazeno 4 ms) */
    float max_mv[AnalogChCount];
    uint32_t windows; /**< pocet hotovych oken (0 = zatim nic) */
} AnalogSnapshot;

typedef enum {
    CrankStateIdle,
    CrankStateArmed, /**< ceka na pokles napeti */
    CrankStateRecording,
    CrankStateDone,
} CrankState;

typedef struct AnalogWorker AnalogWorker;

/** Vola se z vlakna mereni po kazdem okne – formatuje radek CSV. */
typedef void (*AnalogLogCallback)(const float mv[AnalogChCount], uint32_t ms, SdLog* log, void* ctx);

AnalogWorker* analog_worker_alloc(void);
void analog_worker_free(AnalogWorker* worker);

void analog_worker_start(AnalogWorker* worker);
void analog_worker_stop(AnalogWorker* worker);

void analog_worker_get(AnalogWorker* worker, AnalogSnapshot* out);
void analog_worker_reset_minmax(AnalogWorker* worker);

/** Zkopiruje historii kanalu (nejstarsi prvni). Vraci pocet bodu. */
size_t analog_worker_get_history(AnalogWorker* worker, AnalogChannel ch, float* out, size_t max);

/** Zapis do CSV v okne 50 ms. log = NULL zapis vypne. */
void analog_worker_set_log(AnalogWorker* worker, SdLog* log, AnalogLogCallback cb, void* ctx);

/* ---- Test startovani ---- */
/** battery_factor = kalibrace delice. Alokuje buffer 6 KB. */
bool analog_worker_crank_arm(AnalogWorker* worker, float battery_factor);
CrankState analog_worker_crank_state(AnalogWorker* worker);
/** Platne ve stavu Done: vzorky v setinach voltu, ANALOG_CRANK_PRE vzorku pred spustenim. */
const uint16_t* analog_worker_crank_data(AnalogWorker* worker, size_t* count);
void analog_worker_crank_reset(AnalogWorker* worker);
