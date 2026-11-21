#include "settings.h"

#include <furi.h>
#include <storage/storage.h>
#include <toolbox/saved_struct.h>

#define SETTINGS_PATH    APP_DATA_PATH("settings.bin")
#define SETTINGS_MAGIC   0x5D
#define SETTINGS_VERSION 1

const uint32_t strojdiag_bitrates[] = {125000, 250000, 500000, 1000000};
const char* const strojdiag_bitrate_names[] = {"125k", "250k", "500k", "1M"};
const uint8_t strojdiag_bitrate_count = COUNT_OF(strojdiag_bitrates);

const uint32_t strojdiag_crystals[] = {8000000, 16000000};
const char* const strojdiag_crystal_names[] = {"8 MHz", "16 MHz"};
const uint8_t strojdiag_crystal_count = COUNT_OF(strojdiag_crystals);

const uint16_t strojdiag_ranges_bar[] = {10, 16, 25, 40, 60, 100, 160, 250, 400, 600, 700, 1000};
const char* const strojdiag_range_names[] =
    {"10", "16", "25", "40", "60", "100", "160", "250", "400", "600", "700", "1000"};
const uint8_t strojdiag_range_count = COUNT_OF(strojdiag_ranges_bar);

const char* const strojdiag_sensor_type_names[SensorTypeCount] = {
    "Vyp",
    "0.5-4.5V",
    "0-5V",
    "4-20mA",
};

void strojdiag_settings_default(StrojDiagSettings* s) {
    memset(s, 0, sizeof(*s));
    s->can_bitrate = 1; /* 250k = J1939 */
    s->can_crystal = 0; /* 8 MHz - bezne moduly MCP2515 */
    s->can_active = 0;
    s->sensor_type[0] = SensorType05_45V;
    s->sensor_range[0] = 9; /* 600 bar */
    s->sensor_type[1] = SensorTypeOff;
    s->sensor_range[1] = 9;
    s->pressure_unit = PressureUnitBar;
    s->battery_system = BatterySystemSettingAuto;
    s->battery_cal = 0;
    s->freq_ppr = 1;
    s->sensor_power = 1;
}

static void settings_sanitize(StrojDiagSettings* s) {
    if(s->can_bitrate >= strojdiag_bitrate_count) s->can_bitrate = 1;
    if(s->can_crystal >= strojdiag_crystal_count) s->can_crystal = 0;
    s->can_active = s->can_active ? 1 : 0;
    for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
        if(s->sensor_type[i] >= SensorTypeCount) s->sensor_type[i] = SensorTypeOff;
        if(s->sensor_range[i] >= strojdiag_range_count) s->sensor_range[i] = 9;
        if(s->zero_bar[i] != s->zero_bar[i] || s->zero_bar[i] > 100.0f || s->zero_bar[i] < -100.0f) {
            s->zero_bar[i] = 0.0f; /* NaN nebo nesmysl */
        }
    }
    if(s->pressure_unit >= PressureUnitCount) s->pressure_unit = PressureUnitBar;
    if(s->battery_system >= BatterySystemSettingCount) s->battery_system = BatterySystemSettingAuto;
    if(s->battery_cal < -10 || s->battery_cal > 10) s->battery_cal = 0;
    if(s->freq_ppr == 0) s->freq_ppr = 1;
    s->sensor_power = s->sensor_power ? 1 : 0;
}

bool strojdiag_settings_load(StrojDiagSettings* s) {
    StrojDiagSettings loaded;
    bool ok = saved_struct_load(SETTINGS_PATH, &loaded, sizeof(loaded), SETTINGS_MAGIC, SETTINGS_VERSION);
    if(ok) {
        *s = loaded;
    } else {
        strojdiag_settings_default(s);
    }
    settings_sanitize(s);
    return ok;
}

bool strojdiag_settings_save(const StrojDiagSettings* s) {
    /* Slozka /ext/apps_data/strojdiag se pri pouziti aliasu /data vytvori sama. */
    return saved_struct_save(SETTINGS_PATH, s, sizeof(*s), SETTINGS_MAGIC, SETTINGS_VERSION);
}

SensorConfig strojdiag_settings_sensor(const StrojDiagSettings* s, uint8_t index) {
    SensorConfig c = {
        .type = (SensorType)s->sensor_type[index],
        .range_bar = (float)strojdiag_ranges_bar[s->sensor_range[index]],
        .zero_bar = s->zero_bar[index],
    };
    return c;
}

float strojdiag_settings_battery_factor(const StrojDiagSettings* s) {
    return 1.0f + (float)s->battery_cal * 0.005f;
}
