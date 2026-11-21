#include "strojdiag_i.h"

#include <toolbox/stream/file_stream.h>
#include <toolbox/stream/stream.h>

#define MENU_HELP 200u

static const char help_text[] =
    "STROJDIAG " STROJDIAG_VERSION "\n"
    "Diagnostika stavebnich stroju\n"
    "\n"
    "ZAPOJENI MODULU (GPIO):\n"
    " 1 5V   napajeni snimacu\n"
    " 2 PA7  MCP2515 SI\n"
    " 3 PA6  MCP2515 SO\n"
    " 4 PA4  MCP2515 CS\n"
    " 5 PB3  MCP2515 SCK\n"
    " 6 PB2  MCP2515 INT\n"
    " 7 PC3  napeti baterie\n"
    " 8 GND\n"
    " 9 3V3  CAN cast modulu\n"
    "14 PB7  vstup frekvence\n"
    "15 PC1  snimac tlaku A\n"
    "16 PC0  snimac tlaku B\n"
    "17 PB14 teplomer DS18B20\n"
    "18 GND\n"
    "\n"
    "ZASUVKA J1939 (Deutsch 9pin):\n"
    " A = GND (-)\n"
    " B = +baterie\n"
    " C = CAN H\n"
    " D = CAN L\n"
    "Vzdy over podle schematu stroje! Kontrola: zapalovani vyp. -> mezi CAN H a CAN L "
    "ma byt cca 60 ohm. Zapnuto: CAN H 2.5-3.5 V, CAN L 1.5-2.5 V proti GND.\n"
    "\n"
    "OVLADANI:\n"
    "Chyby: nahoru/dolu vyber, OK detail, > historie (DM2), < aktivni, drz OK smazat "
    "(jen v Aktivnim rezimu).\n"
    "Ziva data: nahoru/dolu posun, OK info o ECU.\n"
    "CAN monitor: OK zaznam na SD, drz OK vynulovat, drz > hledat rychlost.\n"
    "Tlak: < nula, drz < zrusit nulu, > reset min/max, OK zaznam CSV, nahoru/dolu graf.\n"
    "Baterie: OK test startovani, drz OK zaznam CSV.\n"
    "Frekvence: nahoru/dolu pulzy na otacku, OK strida z urovne 1/0 (ventil spinany na kostru).\n"
    "Teplota: OK reset min/max.\n"
    "\n"
    "ZAZNAMY NA SD:\n"
    "apps_data/strojdiag/logs\n"
    "CAN = candump (SavvyCAN, can-utils). CSV = strednik a desetinna carka "
    "(primo do Excelu CZ, nebo import do StrojParku).\n"
    "Vlastni popisy SPN: apps_data/strojdiag/spn.txt, radky \"SPN;popis\".\n"
    "\n"
    "BEZPECNOST:\n"
    "Vychozi CAN rezim je POSLECH - modul nic nevysila. Aktivni rezim zapni jen "
    "se spravnou rychlosti sbernice. Chyby maz jen pri vypnutem motoru. Pri "
    "svarovani na stroji modul odpoj!\n";

/* ---------------- Pomocne funkce ---------------- */

void strojdiag_notify(StrojDiagApp* app, const NotificationSequence* seq) {
    notification_message(app->notifications, seq);
}

void strojdiag_sensor_power(StrojDiagApp* app, bool on) {
    if(on) {
        if(!furi_hal_power_is_otg_enabled()) {
            power_enable_otg(app->power, true);
            app->otg_enabled_by_us = true;
        }
    } else if(app->otg_enabled_by_us) {
        power_enable_otg(app->power, false);
        app->otg_enabled_by_us = false;
    }
}

Mcp2515Result strojdiag_can_start(StrojDiagApp* app) {
    if(can_worker_is_running(app->can)) return Mcp2515ResultOk;
    const StrojDiagSettings* s = &app->settings;
    return can_worker_start(
        app->can,
        strojdiag_crystals[s->can_crystal],
        strojdiag_bitrates[s->can_bitrate],
        s->can_active != 0);
}

void strojdiag_stop_all(StrojDiagApp* app) {
    /* Nejdriv odpojit producenty, pak zavrit soubor. */
    can_worker_set_log(app->can, NULL);
    analog_worker_set_log(app->analog, NULL, NULL, NULL);
    sd_log_close(app->log);

    can_worker_stop(app->can);
    analog_worker_stop(app->analog);
    freq_meter_stop(app->freq);
    ds18b20_stop(app->temp);
    strojdiag_sensor_power(app, false);
}

void strojdiag_switch_view(StrojDiagApp* app, StrojDiagViewId id) {
    if(id == StrojDiagViewMenu) {
        strojdiag_stop_all(app);
        if(app->settings_dirty) {
            strojdiag_settings_save(&app->settings);
            app->settings_dirty = false;
        }
        submenu_set_selected_item(app->menu, app->menu_index);
    }
    app->current_view = id;
    view_dispatcher_switch_to_view(app->view_dispatcher, id);
}

void strojdiag_show_text(StrojDiagApp* app, StrojDiagViewId return_view) {
    app->text_return_view = return_view;
    text_box_reset(app->text_box);
    text_box_set_font(app->text_box, TextBoxFontText);
    text_box_set_text(app->text_box, furi_string_get_cstr(app->text));
    text_box_set_focus(app->text_box, TextBoxFocusStart);
    strojdiag_switch_view(app, StrojDiagViewText);
}

static void strojdiag_dialog_callback(DialogExResult result, void* ctx) {
    StrojDiagApp* app = ctx;
    if(result == DialogExResultRight) {
        view_dispatcher_send_custom_event(app->view_dispatcher, StrojDiagEventDialogRight);
    } else if(result == DialogExResultLeft) {
        view_dispatcher_send_custom_event(app->view_dispatcher, StrojDiagEventDialogLeft);
    }
}

void strojdiag_show_dialog(StrojDiagApp* app, StrojDiagDialog kind) {
    app->dialog_kind = kind;
    DialogEx* d = app->dialog;
    dialog_ex_reset(d);
    dialog_ex_set_context(d, app);
    dialog_ex_set_result_callback(d, strojdiag_dialog_callback);
    if(kind == StrojDiagDialogClearDm1) {
        dialog_ex_set_header(d, "Smazat aktivni chyby?", 64, 2, AlignCenter, AlignTop);
        dialog_ex_set_text(
            d,
            "Posle DM11 vsem ECU.\nMotor vypnuty,\nzapalovani zapnute.",
            64,
            34,
            AlignCenter,
            AlignCenter);
    } else {
        dialog_ex_set_header(d, "Smazat historii chyb?", 64, 2, AlignCenter, AlignTop);
        dialog_ex_set_text(
            d,
            "Posle DM3 vsem ECU.\nHistorie (DM2)\nse nevrati!",
            64,
            34,
            AlignCenter,
            AlignCenter);
    }
    dialog_ex_set_left_button_text(d, "Ne");
    dialog_ex_set_right_button_text(d, "Smazat");
    strojdiag_switch_view(app, StrojDiagViewDialog);
}

/* ---------------- Detail chyby ---------------- */

static bool strojdiag_spn_from_file(StrojDiagApp* app, uint32_t spn, FuriString* out) {
    Stream* stream = file_stream_alloc(app->storage);
    FuriString* line = furi_string_alloc();
    bool found = false;
    if(file_stream_open(stream, STROJDIAG_SPN_FILE, FSAM_READ, FSOM_OPEN_EXISTING)) {
        while(!found && stream_read_line(stream, line)) {
            uint32_t value;
            const char* desc;
            size_t len;
            if(j1939_db_parse_spn_line(furi_string_get_cstr(line), &value, &desc, &len) &&
               value == spn) {
                furi_string_set_strn(out, desc, len);
                found = true;
            }
        }
    }
    file_stream_close(stream);
    stream_free(stream);
    furi_string_free(line);
    return found;
}

static const char* lamp_text(uint8_t state) {
    switch(state) {
    case 0:
        return "vyp";
    case 1:
        return "ZAP";
    default:
        return "-";
    }
}

void strojdiag_dtc_detail_text(
    StrojDiagApp* app,
    FuriString* out,
    uint8_t sa,
    uint8_t lamp,
    const J1939Dtc* dtc,
    bool history) {
    char sa_name[24];
    j1939_db_sa_format(sa, sa_name, sizeof(sa_name));
    const J1939FmiInfo* fmi = j1939_db_fmi(dtc->fmi);

    FuriString* name = furi_string_alloc();
    if(!strojdiag_spn_from_file(app, dtc->spn, name)) {
        const char* builtin = j1939_db_spn_name(dtc->spn);
        if(builtin) {
            furi_string_set(name, builtin);
        } else if(j1939_db_spn_is_proprietary(dtc->spn)) {
            furi_string_set(name, "Kod vyrobce (OEM) - viz servisni manual nebo spn.txt");
        } else {
            furi_string_set(name, "Neznamy SPN - doplnte do spn.txt");
        }
    }

    furi_string_printf(
        out,
        "SPN %lu  FMI %u  (%ux)\n"
        "%s\n"
        "Zdroj: %s (SA %u)\n"
        "\n"
        "%s\n"
        "\n"
        "FMI %u: %s\n"
        "\n"
        "CO ZKONTROLOVAT:\n%s\n",
        (unsigned long)dtc->spn,
        dtc->fmi,
        dtc->oc,
        history ? "Drive aktivni (DM2)" : "Aktivni (DM1)",
        sa_name,
        sa,
        furi_string_get_cstr(name),
        dtc->fmi,
        fmi->text,
        fmi->tip);

    if(!history) {
        furi_string_cat_printf(
            out,
            "\nKontrolky ECU: MIL %s, STOP %s, VAROV %s, OCHR %s\n",
            lamp_text(j1939_lamp_state(lamp, J1939LampMil)),
            lamp_text(j1939_lamp_state(lamp, J1939LampRedStop)),
            lamp_text(j1939_lamp_state(lamp, J1939LampAmber)),
            lamp_text(j1939_lamp_state(lamp, J1939LampProtect)));
    }
    if(dtc->cm) {
        furi_string_cat_str(
            out, "\nPozor: ECU pouziva stary format SPN (CM=1), cislo SPN muze byt jine.\n");
    }
    furi_string_free(name);
}

/* ---------------- Udalosti ---------------- */

static void strojdiag_menu_callback(void* ctx, uint32_t index) {
    StrojDiagApp* app = ctx;
    app->menu_index = index;
    if(index == MENU_HELP) {
        furi_string_set(app->text, help_text);
        strojdiag_show_text(app, StrojDiagViewMenu);
        return;
    }
    if(index == StrojDiagViewSettings) {
        /* hodnoty mohly zmenit jine obrazovky (nula tlaku, pulzy na otacku) */
        variable_item_list_reset(app->settings_list);
        strojdiag_settings_view_init(app);
    }
    strojdiag_switch_view(app, (StrojDiagViewId)index);
}

static bool strojdiag_custom_event(void* ctx, uint32_t event) {
    StrojDiagApp* app = ctx;
    if(event == StrojDiagEventDialogRight) {
        if(app->dialog_kind == StrojDiagDialogClearDm1) {
            bool sent = can_worker_request_pgn(app->can, J1939_PGN_DM11);
            strojdiag_notify(app, sent ? &sequence_success : &sequence_error);
        } else if(app->dialog_kind == StrojDiagDialogClearDm2) {
            bool sent = can_worker_request_pgn(app->can, J1939_PGN_DM3);
            if(sent) can_worker_clear_dtc(app->can, true);
            strojdiag_notify(app, sent ? &sequence_success : &sequence_error);
        }
        app->dialog_kind = StrojDiagDialogNone;
        strojdiag_switch_view(app, StrojDiagViewDtc);
        return true;
    }
    if(event == StrojDiagEventDialogLeft) {
        app->dialog_kind = StrojDiagDialogNone;
        strojdiag_switch_view(app, StrojDiagViewDtc);
        return true;
    }
    return false;
}

static bool strojdiag_navigation_event(void* ctx) {
    StrojDiagApp* app = ctx;
    switch(app->current_view) {
    case StrojDiagViewMenu:
        return false; /* konec aplikace */
    case StrojDiagViewText:
        strojdiag_switch_view(app, app->text_return_view);
        return true;
    case StrojDiagViewDialog:
        strojdiag_switch_view(app, StrojDiagViewDtc);
        return true;
    default:
        strojdiag_switch_view(app, StrojDiagViewMenu);
        return true;
    }
}

static void strojdiag_tick_event(void* ctx) {
    StrojDiagApp* app = ctx;
    switch(app->current_view) {
    case StrojDiagViewDtc:
        strojdiag_view_dtc_tick(app);
        break;
    case StrojDiagViewLive:
        strojdiag_view_live_tick(app);
        break;
    case StrojDiagViewCanMon:
        strojdiag_view_canmon_tick(app);
        break;
    case StrojDiagViewPressure:
        strojdiag_view_pressure_tick(app);
        break;
    case StrojDiagViewBattery:
        strojdiag_view_battery_tick(app);
        break;
    case StrojDiagViewFreq:
        strojdiag_view_freq_tick(app);
        break;
    case StrojDiagViewTemp:
        strojdiag_view_temp_tick(app);
        break;
    default:
        break;
    }
}

/* ---------------- Zivotni cyklus ---------------- */

static StrojDiagApp* strojdiag_alloc(void) {
    StrojDiagApp* app = malloc(sizeof(StrojDiagApp));
    memset(app, 0, sizeof(StrojDiagApp));

    app->gui = furi_record_open(RECORD_GUI);
    app->notifications = furi_record_open(RECORD_NOTIFICATION);
    app->storage = furi_record_open(RECORD_STORAGE);
    app->power = furi_record_open(RECORD_POWER);
    /* Piny 13/14 (USART) pouziva sluzba rozsirujicich modulu - uvolnit. */
    app->expansion = furi_record_open(RECORD_EXPANSION);
    expansion_disable(app->expansion);

    strojdiag_settings_load(&app->settings);

    app->can = can_worker_alloc();
    app->analog = analog_worker_alloc();
    app->freq = freq_meter_alloc();
    app->temp = ds18b20_alloc();
    app->log = sd_log_alloc();
    app->text = furi_string_alloc();

    app->view_dispatcher = view_dispatcher_alloc();
    view_dispatcher_set_event_callback_context(app->view_dispatcher, app);
    view_dispatcher_set_custom_event_callback(app->view_dispatcher, strojdiag_custom_event);
    view_dispatcher_set_navigation_event_callback(app->view_dispatcher, strojdiag_navigation_event);
    view_dispatcher_set_tick_event_callback(app->view_dispatcher, strojdiag_tick_event, 200);
    view_dispatcher_attach_to_gui(app->view_dispatcher, app->gui, ViewDispatcherTypeFullscreen);

    app->menu = submenu_alloc();
    submenu_set_header(app->menu, "StrojDiag " STROJDIAG_VERSION);
    submenu_add_item(app->menu, "Chybove kody (DM1)", StrojDiagViewDtc, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Ziva data motoru", StrojDiagViewLive, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "CAN monitor / zaznam", StrojDiagViewCanMon, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Tlak hydrauliky", StrojDiagViewPressure, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Baterie a startovani", StrojDiagViewBattery, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Frekvence / PWM", StrojDiagViewFreq, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Teplota (1-Wire)", StrojDiagViewTemp, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Nastaveni", StrojDiagViewSettings, strojdiag_menu_callback, app);
    submenu_add_item(app->menu, "Zapojeni a napoveda", MENU_HELP, strojdiag_menu_callback, app);
    view_dispatcher_add_view(app->view_dispatcher, StrojDiagViewMenu, submenu_get_view(app->menu));

    app->views[StrojDiagViewDtc] = strojdiag_view_dtc_alloc(app);
    app->views[StrojDiagViewLive] = strojdiag_view_live_alloc(app);
    app->views[StrojDiagViewCanMon] = strojdiag_view_canmon_alloc(app);
    app->views[StrojDiagViewPressure] = strojdiag_view_pressure_alloc(app);
    app->views[StrojDiagViewBattery] = strojdiag_view_battery_alloc(app);
    app->views[StrojDiagViewFreq] = strojdiag_view_freq_alloc(app);
    app->views[StrojDiagViewTemp] = strojdiag_view_temp_alloc(app);
    for(size_t i = 0; i < StrojDiagViewCount; i++) {
        if(app->views[i]) view_dispatcher_add_view(app->view_dispatcher, i, app->views[i]);
    }

    app->settings_list = variable_item_list_alloc();
    strojdiag_settings_view_init(app);
    view_dispatcher_add_view(
        app->view_dispatcher, StrojDiagViewSettings, variable_item_list_get_view(app->settings_list));

    app->text_box = text_box_alloc();
    view_dispatcher_add_view(app->view_dispatcher, StrojDiagViewText, text_box_get_view(app->text_box));

    app->dialog = dialog_ex_alloc();
    view_dispatcher_add_view(app->view_dispatcher, StrojDiagViewDialog, dialog_ex_get_view(app->dialog));

    return app;
}

static void strojdiag_free(StrojDiagApp* app) {
    strojdiag_stop_all(app);
    if(app->settings_dirty) strojdiag_settings_save(&app->settings);

    view_dispatcher_remove_view(app->view_dispatcher, StrojDiagViewMenu);
    view_dispatcher_remove_view(app->view_dispatcher, StrojDiagViewSettings);
    view_dispatcher_remove_view(app->view_dispatcher, StrojDiagViewText);
    view_dispatcher_remove_view(app->view_dispatcher, StrojDiagViewDialog);
    for(size_t i = 0; i < StrojDiagViewCount; i++) {
        if(app->views[i]) {
            view_dispatcher_remove_view(app->view_dispatcher, i);
            view_free(app->views[i]);
        }
    }
    submenu_free(app->menu);
    variable_item_list_free(app->settings_list);
    text_box_free(app->text_box);
    dialog_ex_free(app->dialog);
    view_dispatcher_free(app->view_dispatcher);

    can_worker_free(app->can);
    analog_worker_free(app->analog);
    freq_meter_free(app->freq);
    ds18b20_free(app->temp);
    sd_log_free(app->log);
    furi_string_free(app->text);

    expansion_enable(app->expansion);
    furi_record_close(RECORD_EXPANSION);
    furi_record_close(RECORD_POWER);
    furi_record_close(RECORD_STORAGE);
    furi_record_close(RECORD_NOTIFICATION);
    furi_record_close(RECORD_GUI);
    free(app);
}

int32_t strojdiag_app(void* p) {
    UNUSED(p);
    StrojDiagApp* app = strojdiag_alloc();
    strojdiag_switch_view(app, StrojDiagViewMenu);
    view_dispatcher_run(app->view_dispatcher);
    strojdiag_free(app);
    return 0;
}
