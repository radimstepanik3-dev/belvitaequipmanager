#include "../strojdiag_i.h"

#include <stdio.h>

static const char* const can_mode_names[] = {"Poslech", "Aktivni"};
static const char* const onoff_names[] = {"Vyp", "Zap"};
static const char* const battery_names[] = {"Auto", "12 V", "24 V"};
static const char* const unit_names[] = {"bar", "MPa", "psi"};

#define CAL_STEPS  21 /* -10..+10 po 0.5 % */
#define PPR_MAX    100

static StrojDiagApp* settings_app(VariableItem* item) {
    return variable_item_get_context(item);
}

static void set_cal_text(VariableItem* item, int8_t cal) {
    char buf[12];
    int v = cal * 5; /* desetiny procenta */
    snprintf(buf, sizeof(buf), "%c%d.%d %%", v < 0 ? '-' : '+', (v < 0 ? -v : v) / 10, (v < 0 ? -v : v) % 10);
    variable_item_set_current_value_text(item, buf);
}

static void set_ppr_text(VariableItem* item, uint8_t ppr) {
    char buf[8];
    snprintf(buf, sizeof(buf), "%u", ppr);
    variable_item_set_current_value_text(item, buf);
}

static void cb_bitrate(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.can_bitrate = i;
    variable_item_set_current_value_text(item, strojdiag_bitrate_names[i]);
    app->settings_dirty = true;
}

static void cb_crystal(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.can_crystal = i;
    variable_item_set_current_value_text(item, strojdiag_crystal_names[i]);
    app->settings_dirty = true;
}

static void cb_can_mode(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.can_active = i;
    variable_item_set_current_value_text(item, can_mode_names[i]);
    app->settings_dirty = true;
}

static void sensor_type(VariableItem* item, uint8_t ch) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.sensor_type[ch] = i;
    app->settings.zero_bar[ch] = 0.0f;
    variable_item_set_current_value_text(item, strojdiag_sensor_type_names[i]);
    app->settings_dirty = true;
}

static void sensor_range(VariableItem* item, uint8_t ch) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.sensor_range[ch] = i;
    app->settings.zero_bar[ch] = 0.0f;
    variable_item_set_current_value_text(item, strojdiag_range_names[i]);
    app->settings_dirty = true;
}

static void cb_type_a(VariableItem* item) {
    sensor_type(item, 0);
}
static void cb_type_b(VariableItem* item) {
    sensor_type(item, 1);
}
static void cb_range_a(VariableItem* item) {
    sensor_range(item, 0);
}
static void cb_range_b(VariableItem* item) {
    sensor_range(item, 1);
}

static void cb_unit(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.pressure_unit = i;
    variable_item_set_current_value_text(item, unit_names[i]);
    app->settings_dirty = true;
}

static void cb_power(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.sensor_power = i;
    variable_item_set_current_value_text(item, onoff_names[i]);
    app->settings_dirty = true;
}

static void cb_battery(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t i = variable_item_get_current_value_index(item);
    app->settings.battery_system = i;
    variable_item_set_current_value_text(item, battery_names[i]);
    app->settings_dirty = true;
}

static void cb_cal(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    int8_t cal = (int8_t)variable_item_get_current_value_index(item) - 10;
    app->settings.battery_cal = cal;
    set_cal_text(item, cal);
    app->settings_dirty = true;
}

static void cb_ppr(VariableItem* item) {
    StrojDiagApp* app = settings_app(item);
    uint8_t ppr = variable_item_get_current_value_index(item) + 1;
    app->settings.freq_ppr = ppr;
    set_ppr_text(item, ppr);
    app->settings_dirty = true;
}

void strojdiag_settings_view_init(StrojDiagApp* app) {
    VariableItemList* list = app->settings_list;
    StrojDiagSettings* s = &app->settings;
    VariableItem* item;

    item = variable_item_list_add(list, "CAN rychlost", strojdiag_bitrate_count, cb_bitrate, app);
    variable_item_set_current_value_index(item, s->can_bitrate);
    variable_item_set_current_value_text(item, strojdiag_bitrate_names[s->can_bitrate]);

    item = variable_item_list_add(list, "Krystal MCP2515", strojdiag_crystal_count, cb_crystal, app);
    variable_item_set_current_value_index(item, s->can_crystal);
    variable_item_set_current_value_text(item, strojdiag_crystal_names[s->can_crystal]);

    item = variable_item_list_add(list, "CAN rezim", 2, cb_can_mode, app);
    variable_item_set_current_value_index(item, s->can_active);
    variable_item_set_current_value_text(item, can_mode_names[s->can_active]);

    item = variable_item_list_add(list, "Snimac A", SensorTypeCount, cb_type_a, app);
    variable_item_set_current_value_index(item, s->sensor_type[0]);
    variable_item_set_current_value_text(item, strojdiag_sensor_type_names[s->sensor_type[0]]);

    item = variable_item_list_add(list, "Rozsah A [bar]", strojdiag_range_count, cb_range_a, app);
    variable_item_set_current_value_index(item, s->sensor_range[0]);
    variable_item_set_current_value_text(item, strojdiag_range_names[s->sensor_range[0]]);

    item = variable_item_list_add(list, "Snimac B", SensorTypeCount, cb_type_b, app);
    variable_item_set_current_value_index(item, s->sensor_type[1]);
    variable_item_set_current_value_text(item, strojdiag_sensor_type_names[s->sensor_type[1]]);

    item = variable_item_list_add(list, "Rozsah B [bar]", strojdiag_range_count, cb_range_b, app);
    variable_item_set_current_value_index(item, s->sensor_range[1]);
    variable_item_set_current_value_text(item, strojdiag_range_names[s->sensor_range[1]]);

    item = variable_item_list_add(list, "Jednotka tlaku", PressureUnitCount, cb_unit, app);
    variable_item_set_current_value_index(item, s->pressure_unit);
    variable_item_set_current_value_text(item, unit_names[s->pressure_unit]);

    item = variable_item_list_add(list, "5V pro snimace", 2, cb_power, app);
    variable_item_set_current_value_index(item, s->sensor_power);
    variable_item_set_current_value_text(item, onoff_names[s->sensor_power]);

    item = variable_item_list_add(list, "System baterie", BatterySystemSettingCount, cb_battery, app);
    variable_item_set_current_value_index(item, s->battery_system);
    variable_item_set_current_value_text(item, battery_names[s->battery_system]);

    item = variable_item_list_add(list, "Kalibrace U", CAL_STEPS, cb_cal, app);
    variable_item_set_current_value_index(item, (uint8_t)(s->battery_cal + 10));
    set_cal_text(item, s->battery_cal);

    uint8_t ppr = s->freq_ppr > PPR_MAX ? PPR_MAX : s->freq_ppr;
    item = variable_item_list_add(list, "Pulzy na otacku", PPR_MAX, cb_ppr, app);
    variable_item_set_current_value_index(item, ppr - 1);
    set_ppr_text(item, ppr);
}
