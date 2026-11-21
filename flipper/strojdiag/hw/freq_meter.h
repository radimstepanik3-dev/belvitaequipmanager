/**
 * @file freq_meter.h
 * Mereni frekvence a stridy (PWM) na pinu 14 (PB7 / RX). Kazda hrana
 * vyvola preruseni, cas se bere z citace taktu jadra (DWT, 64 MHz).
 * Vstup modulu: 10k do serie + 33k na GND + omezovaci diody -> signaly 3-30 V.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct FreqMeter FreqMeter;

typedef struct {
    bool signal; /**< chodi pulzy */
    bool level; /**< aktualni uroven pinu (kdyz pulzy nechodi) */
    float freq_hz;
    float duty_pct; /**< podil casu v log. 1 */
    float period_us;
    float high_us;
    uint32_t edges_total;
} FreqResult;

FreqMeter* freq_meter_alloc(void);
void freq_meter_free(FreqMeter* meter);

void freq_meter_start(FreqMeter* meter);
void freq_meter_stop(FreqMeter* meter);

/** Vyhodnoti periody od posledniho cteni (volat cca 2-5x za sekundu). */
void freq_meter_read(FreqMeter* meter, FreqResult* out);
