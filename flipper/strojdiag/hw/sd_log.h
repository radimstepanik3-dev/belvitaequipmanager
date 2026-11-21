/**
 * @file sd_log.h
 * Neblokujici zapis zaznamu na SD kartu. Producent (jedno vlakno) zapisuje
 * do kruhoveho bufferu, vlastni vlakno ho prubezne uklada do souboru.
 * Soubory jsou v /ext/apps_data/strojdiag/logs/.
 */
#pragma once

#include <furi.h>
#include <stdbool.h>
#include <stddef.h>

typedef struct SdLog SdLog;

SdLog* sd_log_alloc(void);
void sd_log_free(SdLog* log);

/**
 * Vytvori soubor logs/<prefix>_RRRRMMDD_HHMMSS.<ext>, zapise hlavicku
 * a spusti zapisovaci vlakno. buffer_size = velikost bufferu v bajtech.
 */
bool sd_log_open(SdLog* log, const char* prefix, const char* ext, const char* header, size_t buffer_size);

/** Zapise data (jen z jednoho vlakna). Pri plnem bufferu radek zahodi a vrati false. */
bool sd_log_write(SdLog* log, const char* data, size_t len);

void sd_log_close(SdLog* log);

bool sd_log_is_open(SdLog* log);
uint32_t sd_log_bytes(SdLog* log);
uint32_t sd_log_drops(SdLog* log);

/** Jmeno souboru (bez cesty) posledniho zaznamu. */
const char* sd_log_name(SdLog* log);

/** Unixovy cas spusteni zaznamu (z RTC). */
uint32_t sd_log_start_time(SdLog* log);
