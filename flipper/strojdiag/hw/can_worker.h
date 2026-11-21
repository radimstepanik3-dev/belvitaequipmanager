/**
 * @file can_worker.h
 * Vlakno, ktere obsluhuje MCP2515: prijem ramcu (preruseni na PB2),
 * dekodovani J1939, statistiky ID, zapis na SD a odesilani dotazu.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "../core/j1939.h"
#include "mcp2515.h"
#include "sd_log.h"

#define CAN_WORKER_MAX_IDS 64u

typedef struct CanWorker CanWorker;

typedef struct {
    bool running;
    Mcp2515Result init_result;
    bool listen_only;
    uint32_t bitrate;
    uint32_t frames;
    uint32_t fps;
    uint32_t overflows;
    uint32_t tx_ok;
    uint32_t tx_fail;
    uint8_t eflg;
    uint8_t tec;
    uint8_t rec;
    uint16_t id_count;
} CanWorkerStats;

typedef struct {
    uint32_t id;
    bool ext;
    uint8_t dlc;
    uint8_t data[8];
    uint32_t count;
    uint32_t prev_count;
    uint16_t rate; /**< ramcu za sekundu */
} CanIdEntry;

CanWorker* can_worker_alloc(void);
void can_worker_free(CanWorker* worker);

/** Spusti prijem. active = false -> radic jen posloucha (nic nevysila). */
Mcp2515Result can_worker_start(CanWorker* worker, uint32_t fosc_hz, uint32_t bitrate, bool active);
void can_worker_stop(CanWorker* worker);
bool can_worker_is_running(CanWorker* worker);

void can_worker_get_stats(CanWorker* worker, CanWorkerStats* stats);

/** Pristup ke stavu J1939 – drz zamek jen kratce (kopiruj, co potrebujes). */
const J1939State* can_worker_lock_j1939(CanWorker* worker);
void can_worker_unlock(CanWorker* worker);

/** Zkopiruje az max zaznamu ID serazenych podle ID, od pozice offset. */
size_t can_worker_get_ids(CanWorker* worker, CanIdEntry* out, size_t max, size_t offset);

/** Vymaze statistiky ID a nactena data J1939. */
void can_worker_reset(CanWorker* worker);

/** Smaze lokalne nactene chyby (history = DM2, jinak DM1). */
void can_worker_clear_dtc(CanWorker* worker, bool history);

/** Zaradi ramec k odeslani (jen v aktivnim rezimu). */
bool can_worker_send(CanWorker* worker, const CanFrame* frame);

/** Vyzada PGN od vsech ECU (Request na adresu 0xFF). */
bool can_worker_request_pgn(CanWorker* worker, uint32_t pgn);

/** Pripoji / odpoji zapis ramcu na SD ve formatu candump. log = NULL odpoji. */
void can_worker_set_log(CanWorker* worker, SdLog* log);
