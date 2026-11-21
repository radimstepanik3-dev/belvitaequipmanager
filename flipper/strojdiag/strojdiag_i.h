/**
 * @file strojdiag_i.h
 * Vnitrni hlavicka aplikace StrojDiag – diagnostika stavebnich stroju
 * pro Flipper Zero s pridavnym modulem (CAN J1939, snimace tlaku,
 * mereni baterie, frekvence, teplota). Hardware: flipper/hardware/README.md
 */
#pragma once

#include <furi.h>
#include <furi_hal.h>
#include <gui/gui.h>
#include <gui/view.h>
#include <gui/view_dispatcher.h>
#include <gui/modules/dialog_ex.h>
#include <gui/modules/submenu.h>
#include <gui/modules/text_box.h>
#include <gui/modules/variable_item_list.h>
#include <notification/notification_messages.h>
#include <power/power_service/power.h>
#include <expansion/expansion.h>
#include <storage/storage.h>

#include "settings.h"
#include "core/j1939.h"
#include "core/j1939_db.h"
#include "core/measure.h"
#include "hw/analog.h"
#include "hw/can_worker.h"
#include "hw/ds18b20.h"
#include "hw/freq_meter.h"
#include "hw/sd_log.h"

#define STROJDIAG_VERSION "1.0"
#define STROJDIAG_SPN_FILE APP_DATA_PATH("spn.txt")

typedef enum {
    StrojDiagViewMenu,
    StrojDiagViewDtc,
    StrojDiagViewLive,
    StrojDiagViewCanMon,
    StrojDiagViewPressure,
    StrojDiagViewBattery,
    StrojDiagViewFreq,
    StrojDiagViewTemp,
    StrojDiagViewSettings,
    StrojDiagViewText,
    StrojDiagViewDialog,
    StrojDiagViewCount,
} StrojDiagViewId;

typedef enum {
    StrojDiagEventDialogLeft = 100,
    StrojDiagEventDialogRight,
} StrojDiagEvent;

typedef enum {
    StrojDiagDialogNone,
    StrojDiagDialogClearDm1,
    StrojDiagDialogClearDm2,
} StrojDiagDialog;

typedef struct StrojDiagApp StrojDiagApp;

struct StrojDiagApp {
    Gui* gui;
    ViewDispatcher* view_dispatcher;
    NotificationApp* notifications;
    Storage* storage;
    Power* power;
    Expansion* expansion;

    Submenu* menu;
    VariableItemList* settings_list;
    TextBox* text_box;
    FuriString* text;
    DialogEx* dialog;
    View* views[StrojDiagViewCount]; /**< vlastni pohledy (NULL u modulu) */

    StrojDiagSettings settings;
    bool settings_dirty;

    CanWorker* can;
    AnalogWorker* analog;
    FreqMeter* freq;
    Ds18b20* temp;
    SdLog* log;

    StrojDiagViewId current_view;
    StrojDiagViewId text_return_view;
    StrojDiagDialog dialog_kind;
    uint32_t menu_index;
    bool otg_enabled_by_us;
};

/* --- strojdiag.c --- */
void strojdiag_switch_view(StrojDiagApp* app, StrojDiagViewId id);
/** Zobrazi app->text v textovem okne, Back vrati na return_view. */
void strojdiag_show_text(StrojDiagApp* app, StrojDiagViewId return_view);
void strojdiag_show_dialog(StrojDiagApp* app, StrojDiagDialog kind);
/** Zapne/vypne 5 V na pinu 1 (napajeni snimacu tlaku). */
void strojdiag_sensor_power(StrojDiagApp* app, bool on);
/** Spusti CAN podle nastaveni (kdyz uz nebezi). */
Mcp2515Result strojdiag_can_start(StrojDiagApp* app);
/** Zastavi vsechna mereni a zaznamy (navrat do menu). */
void strojdiag_stop_all(StrojDiagApp* app);
void strojdiag_notify(StrojDiagApp* app, const NotificationSequence* seq);

/* --- views --- */
View* strojdiag_view_dtc_alloc(StrojDiagApp* app);
void strojdiag_view_dtc_tick(StrojDiagApp* app);

View* strojdiag_view_live_alloc(StrojDiagApp* app);
void strojdiag_view_live_tick(StrojDiagApp* app);

View* strojdiag_view_canmon_alloc(StrojDiagApp* app);
void strojdiag_view_canmon_tick(StrojDiagApp* app);

View* strojdiag_view_pressure_alloc(StrojDiagApp* app);
void strojdiag_view_pressure_tick(StrojDiagApp* app);

View* strojdiag_view_battery_alloc(StrojDiagApp* app);
void strojdiag_view_battery_tick(StrojDiagApp* app);

View* strojdiag_view_freq_alloc(StrojDiagApp* app);
void strojdiag_view_freq_tick(StrojDiagApp* app);

View* strojdiag_view_temp_alloc(StrojDiagApp* app);
void strojdiag_view_temp_tick(StrojDiagApp* app);

void strojdiag_settings_view_init(StrojDiagApp* app);

/** Text detailu chyby (pouziva view_dtc). */
void strojdiag_dtc_detail_text(
    StrojDiagApp* app,
    FuriString* out,
    uint8_t sa,
    uint8_t lamp,
    const J1939Dtc* dtc,
    bool history);
