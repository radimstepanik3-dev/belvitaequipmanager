/* Baterie a startovani: napeti, stav nabiti, test startovani s grafem. */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

#define GRAPH_W 126u

typedef struct {
    bool have;
    float volts;
    float vmin;
    float vmax;
    BatterySystem sys;
    BatteryState state;
    int soc;
    CrankState crank;
    bool result_valid;
    CrankResult result;
    float graph[GRAPH_W];
    bool logging;
} BatteryModel;

static BatterySystem battery_system(const StrojDiagApp* app, float volts) {
    switch(app->settings.battery_system) {
    case BatterySystemSetting12V:
        return BatterySystem12V;
    case BatterySystemSetting24V:
        return BatterySystem24V;
    default:
        return measure_battery_system(volts);
    }
}

static void battery_log_cb(const float mv[AnalogChCount], uint32_t ms, SdLog* log, void* ctx) {
    float factor = *(const float*)ctx;
    char line[40];
    char v[12];
    view_format_csv(v, sizeof(v), mv[AnalogChBattery] / 1000.0f * factor, 2);
    int len = snprintf(line, sizeof(line), "%lu,%03lu;%s\n", (unsigned long)(ms / 1000u), (unsigned long)(ms % 1000u), v);
    if(len > 0) sd_log_write(log, line, (size_t)len);
}

static float battery_log_factor;

static void battery_draw(Canvas* canvas, void* model) {
    BatteryModel* m = model;
    char buf[40];
    char num[16];

    if(m->crank == CrankStateDone && m->result_valid) {
        const CrankResult* r = &m->result;
        view_draw_header(canvas, measure_crank_verdict_text(r->verdict), "");
        view_draw_graph(canvas, 0, 13, 128, 31, m->graph, GRAPH_W, 1.0f, 1);
        snprintf(
            buf,
            sizeof(buf),
            "Klid %.1f Min %.1f  %.1fs",
            (double)r->rest_v,
            (double)r->min_crank_v,
            (double)((float)r->crank_ms / 1000.0f));
        canvas_draw_str(canvas, 0, 52, buf);
        elements_button_left(canvas, "Znovu");
        elements_button_center(canvas, "Detail");
        elements_button_right(canvas, "Konec");
        return;
    }

    const char* sys = m->sys == BatterySystem24V ? "24V" : (m->sys == BatterySystem12V ? "12V" : "?");
    if(m->crank == CrankStateArmed || m->crank == CrankStateRecording) {
        view_draw_header(canvas, "Test startovani", sys);
    } else {
        view_draw_header(canvas, "Baterie", m->logging ? "REC" : sys);
    }

    if(!m->have) {
        view_draw_message(canvas, 28, "Merim...");
        return;
    }

    view_format_float(num, sizeof(num), m->volts, 2);
    canvas_set_font(canvas, FontBigNumbers);
    canvas_draw_str_aligned(canvas, 100, 33, AlignRight, AlignBottom, num);
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 103, 32, "V");

    canvas_set_font(canvas, FontPrimary);
    if(m->crank == CrankStateArmed) {
        canvas_draw_str_aligned(canvas, 64, 43, AlignCenter, AlignBottom, "STARTUJ MOTOR");
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str_aligned(canvas, 64, 53, AlignCenter, AlignBottom, "ceka na pokles napeti");
        elements_button_left(canvas, "Zrusit");
        return;
    }
    if(m->crank == CrankStateRecording) {
        canvas_draw_str_aligned(canvas, 64, 43, AlignCenter, AlignBottom, "Nahravam 6 s...");
        return;
    }

    if(m->state == BatteryStateRest && m->soc >= 0) {
        snprintf(buf, sizeof(buf), "Klid, nabito ~%d %%", m->soc);
    } else if(m->state == BatteryStateDischarged && m->soc >= 0) {
        snprintf(buf, sizeof(buf), "VYBITA ~%d %%", m->soc);
    } else {
        snprintf(buf, sizeof(buf), "%s", measure_battery_state_text(m->state));
    }
    canvas_draw_str_aligned(canvas, 64, 43, AlignCenter, AlignBottom, buf);

    canvas_set_font(canvas, FontSecondary);
    snprintf(buf, sizeof(buf), "min %.2f", (double)m->vmin);
    canvas_draw_str(canvas, 0, 52, buf);
    snprintf(buf, sizeof(buf), "max %.2f", (double)m->vmax);
    canvas_draw_str_aligned(canvas, 127, 52, AlignRight, AlignBottom, buf);
    elements_button_center(canvas, "Test startu");
}

static void battery_detail_text(StrojDiagApp* app, const CrankResult* r) {
    bool is24 = r->sys == BatterySystem24V;
    FuriString* t = app->text;
    furi_string_printf(
        t,
        "TEST STARTOVANI\n"
        "System: %s\n"
        "Napeti v klidu: %.2f V\n"
        "Minimum (naraz): %.2f V\n"
        "Minimum pri protaceni: %.2f V\n"
        "Prumer pri protaceni: %.2f V\n"
        "Doba protaceni: %.1f s\n"
        "Konec zaznamu: %.2f V\n",
        is24 ? "24 V" : "12 V",
        (double)r->rest_v,
        (double)r->min_v,
        (double)r->min_crank_v,
        (double)r->avg_crank_v,
        (double)((float)r->crank_ms / 1000.0f),
        (double)r->end_v);
    furi_string_cat_printf(
        t,
        "%s\n\nVERDIKT: %s\n\n",
        r->engine_started ? "Motor nastartoval, alternator dobiji." :
                            "Napeti po startu nevzrostlo (motor nenastartoval nebo nedobiji).",
        measure_crank_verdict_text(r->verdict));
    furi_string_cat_printf(
        t,
        "MEZE (%s):\n"
        "protaceni >= %s V = OK\n"
        "%s V = slabe\n"
        "dobijeni %s V\n\n",
        is24 ? "24 V" : "12 V",
        is24 ? "19.2" : "9.6",
        is24 ? "17.0-19.2" : "8.5-9.6",
        is24 ? "27.2-29.8" : "13.6-14.9");
    furi_string_cat_str(
        t,
        "PRI SPATNEM VYSLEDKU:\n"
        "1) Nabij baterii a test opakuj.\n"
        "2) Behem startu mer ubytek napeti na kabelech: + baterie -> svorka starteru "
        "a kostra baterie -> blok motoru. Kazdy max 0.5 V (12 V) / 1 V (24 V).\n"
        "3) Zkontroluj svorky, hlavni vypinac a ukostreni.\n"
        "4) Dobra baterie + velky ubytek = vadny starter nebo kabely.\n");
}

static void battery_toggle_log(StrojDiagApp* app) {
    if(sd_log_is_open(app->log)) {
        analog_worker_set_log(app->analog, NULL, NULL, NULL);
        sd_log_close(app->log);
        strojdiag_notify(app, &sequence_single_vibro);
        return;
    }
    battery_log_factor = strojdiag_settings_battery_factor(&app->settings);
    if(sd_log_open(app->log, "baterie", "csv", "cas_s;napeti_V\n", 2048)) {
        analog_worker_set_log(app->analog, app->log, battery_log_cb, &battery_log_factor);
        strojdiag_notify(app, &sequence_success);
    } else {
        strojdiag_notify(app, &sequence_error);
    }
}

static bool battery_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    bool consumed = false;
    bool arm = false;
    bool cancel = false;
    bool detail = false;
    bool toggle_log = false;
    bool reset_minmax = false;
    CrankResult result = {0};

    with_view_model(
        app->views[StrojDiagViewBattery],
        BatteryModel * m,
        {
            bool done = m->crank == CrankStateDone && m->result_valid;
            bool waiting = m->crank == CrankStateArmed || m->crank == CrankStateRecording;
            if(event->type == InputTypeShort) {
                if(done) {
                    if(event->key == InputKeyLeft) {
                        arm = true;
                        consumed = true;
                    } else if(event->key == InputKeyOk) {
                        result = m->result;
                        detail = true;
                        consumed = true;
                    } else if(event->key == InputKeyRight) {
                        cancel = true;
                        consumed = true;
                    }
                } else if(waiting) {
                    if(event->key == InputKeyLeft) {
                        cancel = true;
                        consumed = true;
                    }
                } else if(event->key == InputKeyOk) {
                    arm = !sd_log_is_open(app->log);
                    consumed = true;
                } else if(event->key == InputKeyLeft || event->key == InputKeyRight) {
                    reset_minmax = true;
                    consumed = true;
                }
            } else if(event->type == InputTypeLong && event->key == InputKeyOk && !done && !waiting) {
                toggle_log = true;
                consumed = true;
            }
            if(arm || cancel) m->result_valid = false;
        },
        true);

    if(arm) analog_worker_crank_arm(app->analog, strojdiag_settings_battery_factor(&app->settings));
    if(cancel) analog_worker_crank_reset(app->analog);
    if(reset_minmax) analog_worker_reset_minmax(app->analog);
    if(toggle_log) battery_toggle_log(app);
    if(detail) {
        battery_detail_text(app, &result);
        strojdiag_show_text(app, StrojDiagViewBattery);
    }
    return consumed;
}

static void battery_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    analog_worker_start(app->analog);
    strojdiag_view_battery_tick(app);
}

static void battery_build_graph(BatteryModel* m, const uint16_t* data, size_t count) {
    size_t per = count / GRAPH_W;
    if(per == 0) per = 1;
    for(size_t col = 0; col < GRAPH_W; col++) {
        uint16_t lo = 0xFFFF;
        for(size_t k = col * per; k < (col + 1u) * per && k < count; k++) {
            if(data[k] < lo) lo = data[k];
        }
        m->graph[col] = lo == 0xFFFF ? 0.0f : (float)lo / 100.0f;
    }
}

void strojdiag_view_battery_tick(StrojDiagApp* app) {
    AnalogSnapshot snap;
    analog_worker_get(app->analog, &snap);
    CrankState crank = analog_worker_crank_state(app->analog);
    float factor = strojdiag_settings_battery_factor(&app->settings);
    bool notify_done = false;

    with_view_model(
        app->views[StrojDiagViewBattery],
        BatteryModel * m,
        {
            m->have = snap.windows > 0;
            m->volts = snap.mv[AnalogChBattery] / 1000.0f * factor;
            m->vmin = snap.min_mv[AnalogChBattery] / 1000.0f * factor;
            m->vmax = snap.max_mv[AnalogChBattery] / 1000.0f * factor;
            m->sys = battery_system(app, m->volts);
            m->state = measure_battery_state(m->volts, m->sys);
            m->soc = measure_battery_soc(m->volts, m->sys);
            m->logging = sd_log_is_open(app->log);

            if(crank == CrankStateDone && !m->result_valid) {
                size_t count = 0;
                const uint16_t* data = analog_worker_crank_data(app->analog, &count);
                if(data && count) {
                    BatterySystem force = app->settings.battery_system == BatterySystemSettingAuto ?
                                              BatterySystemUnknown :
                                              battery_system(app, 0.0f);
                    measure_crank_analyze(data, count, ANALOG_CRANK_PRE, ANALOG_CRANK_RATE, force, &m->result);
                    battery_build_graph(m, data, count);
                    m->result_valid = true;
                    notify_done = true;
                }
            }
            if(crank == CrankStateIdle) m->result_valid = false;
            m->crank = crank;
        },
        true);

    if(notify_done) strojdiag_notify(app, &sequence_success);
}

View* strojdiag_view_battery_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(BatteryModel));
    view_set_draw_callback(view, battery_draw);
    view_set_input_callback(view, battery_input);
    view_set_enter_callback(view, battery_enter);
    return view;
}
