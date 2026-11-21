#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "core/measure.h"

#define STROJDIAG_SENSOR_COUNT 2

typedef enum {
    BatterySystemSettingAuto,
    BatterySystemSetting12V,
    BatterySystemSetting24V,
    BatterySystemSettingCount,
} BatterySystemSetting;

typedef struct {
    uint8_t can_bitrate; /**< index do strojdiag_bitrates */
    uint8_t can_crystal; /**< index do strojdiag_crystals */
    uint8_t can_active; /**< 0 = jen poslech, 1 = smi vysilat (dotazy, mazani chyb) */
    uint8_t sensor_type[STROJDIAG_SENSOR_COUNT]; /**< SensorType */
    uint8_t sensor_range[STROJDIAG_SENSOR_COUNT]; /**< index do strojdiag_ranges_bar */
    uint8_t pressure_unit; /**< PressureUnit */
    uint8_t battery_system; /**< BatterySystemSetting */
    int8_t battery_cal; /**< korekce delice v krocich 0.5 %, -10..+10 */
    uint8_t freq_ppr; /**< pulzu na otacku pro prepocet na rpm */
    uint8_t sensor_power; /**< 1 = zapnout 5 V (pin 1) pro snimace */
    float zero_bar[STROJDIAG_SENSOR_COUNT];
} StrojDiagSettings;

extern const uint32_t strojdiag_bitrates[];
extern const char* const strojdiag_bitrate_names[];
extern const uint8_t strojdiag_bitrate_count;

extern const uint32_t strojdiag_crystals[];
extern const char* const strojdiag_crystal_names[];
extern const uint8_t strojdiag_crystal_count;

extern const uint16_t strojdiag_ranges_bar[];
extern const char* const strojdiag_range_names[];
extern const uint8_t strojdiag_range_count;

extern const char* const strojdiag_sensor_type_names[];

void strojdiag_settings_default(StrojDiagSettings* s);
bool strojdiag_settings_load(StrojDiagSettings* s);
bool strojdiag_settings_save(const StrojDiagSettings* s);

/** Sestavi konfiguraci snimace 0/1 pro prepocty. */
SensorConfig strojdiag_settings_sensor(const StrojDiagSettings* s, uint8_t index);

/** Korekce delice baterie jako nasobitel (napr. 1.005). */
float strojdiag_settings_battery_factor(const StrojDiagSettings* s);
