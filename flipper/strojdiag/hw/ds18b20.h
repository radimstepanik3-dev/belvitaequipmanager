/**
 * @file ds18b20.h
 * Teplomer DS18B20 (1-Wire) na pinu 17 (iButton), pull-up 4,7k na 3V3.
 * Vodotesna sonda se hodi na hydraulicky olej, chladic, prevodovku.
 */
#pragma once

#include <stdbool.h>

typedef struct Ds18b20 Ds18b20;

Ds18b20* ds18b20_alloc(void);
void ds18b20_free(Ds18b20* sensor);

void ds18b20_start(Ds18b20* sensor);
void ds18b20_stop(Ds18b20* sensor);

/** Posledni teplota ve C. Vraci false, kdyz sonda neodpovida. */
bool ds18b20_get(Ds18b20* sensor, float* celsius);
