/* Tlak hydrauliky: 2 snimace, rozdil (napr. cerpadlo - LS = LS marze),
 * spicky, graf a zaznam do CSV. */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

typedef enum {
    PressureModeNumbers,
    PressureModeGraphA,
    PressureModeGraphB,
    PressureModeCount,
} PressureMode;

typedef struct {
    SensorConfig cfg[STROJDIAG_SENSOR_COUNT];
    PressureUnit unit;
    float p_bar[STROJDIAG_SENSOR_COUNT];
    float min_bar[STROJDIAG_SENSOR_COUNT];
    float max_bar[STROJDIAG_SENSOR_COUNT];
    SensorStatus status[STROJDIAG_SENSOR_COUNT];
    bool have_data;
    bool temp_valid;
    float temp_c;
    uint8_t mode;
    float graph[ANALOG_HISTORY];
    size_t graph_n;
    bool logging;
    uint32_t log_start;
    char note[24];
    uint32_t note_tick;
} PressureModel;

/* Kontext pro zapis CSV (bezi ve vlakne mereni). */
typedef struct {
    SensorConfig cfg[STROJDIAG_SENSOR_COUNT];
    PressureUnit unit;
    Ds18b20* temp;
} PressureLogCtx;

static PressureLogCtx pressure_log_ctx;

static const AnalogChannel sensor_channel[STROJDIAG_SENSOR_COUNT] = {AnalogChSensorA, AnalogChSensorB};

static uint8_t pressure_decimals(PressureUnit unit, float range_bar) {
    bool small = range_bar <= 40.0f;
    switch(unit) {
    case PressureUnitMpa:
        return small ? 3 : 2;
    case PressureUnitPsi:
        return small ? 1 : 0;
    case PressureUnitBar:
    default:
        return small ? 2 : 1;
    }
}

static void pressure_log_cb(const float mv[AnalogChCount], uint32_t ms, SdLog* log, void* ctx) {
    PressureLogCtx* c = ctx;
    char line[96];
    char field[3][16] = {"", "", ""};
    float p[STROJDIAG_SENSOR_COUNT] = {0};
    bool ok[STROJDIAG_SENSOR_COUNT] = {false};

    for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
        if(c->cfg[i].type == SensorTypeOff) continue;
        SensorStatus st;
        p[i] = measure_pressure_convert(measure_sensor_pressure(&c->cfg[i], mv[sensor_channel[i]], &st), c->unit);
        ok[i] = true;
        view_format_csv(field[i], sizeof(field[i]), p[i], 3);
    }
    if(ok[0] && ok[1]) view_format_csv(field[2], sizeof(field[2]), p[0] - p[1], 3);

    char temp[12] = "";
    float t;
    if(c->temp && ds18b20_get(c->temp, &t)) view_format_csv(temp, sizeof(temp), t, 1);

    int len = snprintf(
        line,
        sizeof(line),
        "%lu,%03lu;%s;%s;%s;%s\n",
        (unsigned long)(ms / 1000u),
        (unsigned long)(ms % 1000u),
        field[0],
        field[1],
        field[2],
        temp);
    if(len > 0) sd_log_write(log, line, (size_t)len);
}

static void pressure_set_note(PressureModel* m, const char* text) {
    snprintf(m->note, sizeof(m->note), "%s", text);
    m->note_tick = furi_get_tick();
}

static void pressure_value_text(const PressureModel* m, uint8_t ch, float bar, char* buf, size_t size) {
    switch(m->status[ch]) {
    case SensorStatusOpen:
        snprintf(buf, size, "%s", m->cfg[ch].type == SensorType4_20mA ? "SMYCKA" : "ODPOJ");
        return;
    case SensorStatusShortHigh:
        snprintf(buf, size, "ZKRAT+");
        return;
    case SensorStatusOff:
        snprintf(buf, size, "VYP");
        return;
    default:
        break;
    }
    view_format_float(
        buf, size, measure_pressure_convert(bar, m->unit), pressure_decimals(m->unit, m->cfg[ch].range_bar));
}

static void pressure_draw_buttons(Canvas* canvas, const PressureModel* m) {
    canvas_set_font(canvas, FontSecondary);
    elements_button_left(canvas, "Nula");
    elements_button_center(canvas, m->logging ? "Stop" : "Zaznam");
    elements_button_right(canvas, "Max");
}

static void pressure_draw_header(Canvas* canvas, const PressureModel* m, const char* title) {
    char right[16] = "";
    if(m->logging) {
        uint32_t s = (furi_get_tick() - m->log_start) / 1000u;
        snprintf(right, sizeof(right), "REC %lu:%02lu", (unsigned long)(s / 60u), (unsigned long)(s % 60u));
    } else if(m->temp_valid) {
        snprintf(right, sizeof(right), "%.1f C", (double)m->temp_c);
    }
    view_draw_header(canvas, title, right);
}

static void pressure_draw(Canvas* canvas, void* model) {
    PressureModel* m = model;
    char buf[24];
    char buf2[48];
    const char* unit = measure_pressure_unit_name(m->unit);
    bool on_a = m->cfg[0].type != SensorTypeOff;
    bool on_b = m->cfg[1].type != SensorTypeOff;

    if(!on_a && !on_b) {
        view_draw_header(canvas, "Tlak", "");
        view_draw_message(canvas, 20, "Oba snimace jsou vypnute.\nZapni je v Nastaveni\n(typ a rozsah snimace).");
        return;
    }
    if(!m->have_data) {
        view_draw_header(canvas, "Tlak", "");
        view_draw_message(canvas, 28, "Merim...");
        return;
    }

    if(m->mode == PressureModeGraphA || m->mode == PressureModeGraphB) {
        uint8_t ch = m->mode == PressureModeGraphA ? 0 : 1;
        pressure_value_text(m, ch, m->p_bar[ch], buf, sizeof(buf));
        snprintf(buf2, sizeof(buf2), "%c %s %s", ch == 0 ? 'A' : 'B', buf, unit);
        pressure_draw_header(canvas, m, buf2);
        float span = measure_pressure_convert(m->cfg[ch].range_bar * 0.01f, m->unit);
        view_draw_graph(
            canvas, 0, 13, 128, 39, m->graph, m->graph_n, span, pressure_decimals(m->unit, m->cfg[ch].range_bar));
        pressure_draw_buttons(canvas, m);
    } else if(on_a != on_b) {
        /* jeden snimac - velka cisla */
        uint8_t ch = on_a ? 0 : 1;
        pressure_draw_header(canvas, m, ch == 0 ? "Tlak A" : "Tlak B");
        pressure_value_text(m, ch, m->p_bar[ch], buf, sizeof(buf));
        if(m->status[ch] == SensorStatusOk) {
            canvas_set_font(canvas, FontBigNumbers);
            canvas_draw_str_aligned(canvas, 104, 34, AlignRight, AlignBottom, buf);
            canvas_set_font(canvas, FontSecondary);
            canvas_draw_str(canvas, 106, 33, unit);
        } else {
            canvas_set_font(canvas, FontPrimary);
            canvas_draw_str_aligned(canvas, 64, 27, AlignCenter, AlignCenter, buf);
            canvas_set_font(canvas, FontSecondary);
        }
        char lo[12];
        char hi[12];
        pressure_value_text(m, ch, m->min_bar[ch], lo, sizeof(lo));
        pressure_value_text(m, ch, m->max_bar[ch], hi, sizeof(hi));
        snprintf(buf2, sizeof(buf2), "min %s  max %s", lo, hi);
        canvas_draw_str_aligned(canvas, 64, 44, AlignCenter, AlignBottom, buf2);
        pressure_draw_buttons(canvas, m);
    } else {
        /* dva snimace + rozdil */
        pressure_draw_header(canvas, m, "Tlak A / B");
        static const char* labels[] = {"A", "B"};
        for(uint8_t ch = 0; ch < 2; ch++) {
            int32_t y = 22 + ch * 11;
            canvas_set_font(canvas, FontPrimary);
            canvas_draw_str(canvas, 0, y, labels[ch]);
            pressure_value_text(m, ch, m->p_bar[ch], buf, sizeof(buf));
            canvas_draw_str_aligned(canvas, 62, y, AlignRight, AlignBottom, buf);
            canvas_set_font(canvas, FontSecondary);
            canvas_draw_str(canvas, 64, y, unit);
            pressure_value_text(m, ch, m->max_bar[ch], buf, sizeof(buf));
            snprintf(buf2, sizeof(buf2), "^%s", buf);
            canvas_draw_str_aligned(canvas, 127, y, AlignRight, AlignBottom, buf2);
        }
        int32_t y = 44;
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str(canvas, 0, y, "dP");
        if(m->status[0] == SensorStatusOk && m->status[1] == SensorStatusOk) {
            view_format_float(
                buf,
                sizeof(buf),
                measure_pressure_convert(m->p_bar[0] - m->p_bar[1], m->unit),
                pressure_decimals(m->unit, m->cfg[1].range_bar));
        } else {
            snprintf(buf, sizeof(buf), "--");
        }
        canvas_draw_str_aligned(canvas, 62, y, AlignRight, AlignBottom, buf);
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str(canvas, 64, y, unit);
        pressure_draw_buttons(canvas, m);
    }

    if(m->note[0] && furi_get_tick() - m->note_tick < 2000u) {
        canvas_set_color(canvas, ColorWhite);
        canvas_draw_box(canvas, 14, 24, 100, 14);
        canvas_set_color(canvas, ColorBlack);
        canvas_draw_frame(canvas, 14, 24, 100, 14);
        canvas_draw_str_aligned(canvas, 64, 31, AlignCenter, AlignCenter, m->note);
    }
}

static void pressure_toggle_log(StrojDiagApp* app) {
    if(sd_log_is_open(app->log)) {
        analog_worker_set_log(app->analog, NULL, NULL, NULL);
        sd_log_close(app->log);
        strojdiag_notify(app, &sequence_single_vibro);
        return;
    }
    for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
        pressure_log_ctx.cfg[i] = strojdiag_settings_sensor(&app->settings, i);
    }
    pressure_log_ctx.unit = (PressureUnit)app->settings.pressure_unit;
    pressure_log_ctx.temp = app->temp;

    const char* u = measure_pressure_unit_name(pressure_log_ctx.unit);
    char header[96];
    snprintf(header, sizeof(header), "cas_s;tlak_A_%s;tlak_B_%s;rozdil_A-B_%s;teplota_C\n", u, u, u);
    if(sd_log_open(app->log, "tlak", "csv", header, 4096)) {
        analog_worker_set_log(app->analog, app->log, pressure_log_cb, &pressure_log_ctx);
        strojdiag_notify(app, &sequence_success);
    } else {
        strojdiag_notify(app, &sequence_error);
    }
}

static bool pressure_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    bool consumed = false;
    bool toggle_log = false;
    bool reset_minmax = false;

    with_view_model(
        app->views[StrojDiagViewPressure],
        PressureModel * m,
        {
            if(event->type == InputTypeShort) {
                switch(event->key) {
                case InputKeyLeft:
                    for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
                        if(m->cfg[i].type != SensorTypeOff && m->status[i] == SensorStatusOk) {
                            app->settings.zero_bar[i] += m->p_bar[i];
                            m->cfg[i].zero_bar = app->settings.zero_bar[i];
                        }
                    }
                    app->settings_dirty = true;
                    reset_minmax = true;
                    pressure_set_note(m, "Vynulovano");
                    consumed = true;
                    break;
                case InputKeyRight:
                    reset_minmax = true;
                    pressure_set_note(m, "Min/max smazano");
                    consumed = true;
                    break;
                case InputKeyOk:
                    toggle_log = true;
                    consumed = true;
                    break;
                case InputKeyUp:
                case InputKeyDown:
                    for(uint8_t step = 0; step < PressureModeCount; step++) {
                        m->mode = (uint8_t)((m->mode + (event->key == InputKeyDown ? 1u : PressureModeCount - 1u)) %
                                            PressureModeCount);
                        if(m->mode == PressureModeNumbers) break;
                        if(m->mode == PressureModeGraphA && m->cfg[0].type != SensorTypeOff) break;
                        if(m->mode == PressureModeGraphB && m->cfg[1].type != SensorTypeOff) break;
                    }
                    m->graph_n = 0;
                    consumed = true;
                    break;
                default:
                    break;
                }
            } else if(event->type == InputTypeLong && event->key == InputKeyLeft) {
                for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
                    app->settings.zero_bar[i] = 0.0f;
                    m->cfg[i].zero_bar = 0.0f;
                }
                app->settings_dirty = true;
                reset_minmax = true;
                pressure_set_note(m, "Nula zrusena");
                consumed = true;
            }
        },
        true);

    if(reset_minmax) analog_worker_reset_minmax(app->analog);
    if(toggle_log) pressure_toggle_log(app);
    return consumed;
}

static void pressure_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    bool any = false;
    with_view_model(
        app->views[StrojDiagViewPressure],
        PressureModel * m,
        {
            for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
                m->cfg[i] = strojdiag_settings_sensor(&app->settings, i);
                any |= m->cfg[i].type != SensorTypeOff;
            }
            m->unit = (PressureUnit)app->settings.pressure_unit;
            m->have_data = false;
            m->graph_n = 0;
            if(m->mode == PressureModeGraphA && m->cfg[0].type == SensorTypeOff) m->mode = 0;
            if(m->mode == PressureModeGraphB && m->cfg[1].type == SensorTypeOff) m->mode = 0;
        },
        true);
    if(any && app->settings.sensor_power) strojdiag_sensor_power(app, true);
    analog_worker_start(app->analog);
    ds18b20_start(app->temp);
}

void strojdiag_view_pressure_tick(StrojDiagApp* app) {
    AnalogSnapshot snap;
    analog_worker_get(app->analog, &snap);
    float temp = 0.0f;
    bool temp_ok = ds18b20_get(app->temp, &temp);
    float hist_mv[ANALOG_HISTORY];

    with_view_model(
        app->views[StrojDiagViewPressure],
        PressureModel * m,
        {
            m->have_data = snap.windows > 0;
            for(uint8_t i = 0; i < STROJDIAG_SENSOR_COUNT; i++) {
                AnalogChannel ch = sensor_channel[i];
                m->p_bar[i] = measure_sensor_pressure(&m->cfg[i], snap.mv[ch], &m->status[i]);
                SensorStatus dummy;
                m->min_bar[i] = measure_sensor_pressure(&m->cfg[i], snap.min_mv[ch], &dummy);
                m->max_bar[i] = measure_sensor_pressure(&m->cfg[i], snap.max_mv[ch], &dummy);
            }
            m->temp_valid = temp_ok;
            m->temp_c = temp;
            m->logging = sd_log_is_open(app->log);
            if(m->logging && m->log_start == 0) m->log_start = furi_get_tick();
            if(!m->logging) m->log_start = 0;

            if(m->mode == PressureModeGraphA || m->mode == PressureModeGraphB) {
                uint8_t i = m->mode == PressureModeGraphA ? 0 : 1;
                size_t n = analog_worker_get_history(app->analog, sensor_channel[i], hist_mv, ANALOG_HISTORY);
                for(size_t k = 0; k < n; k++) {
                    SensorStatus dummy;
                    m->graph[k] = measure_pressure_convert(
                        measure_sensor_pressure(&m->cfg[i], hist_mv[k], &dummy), m->unit);
                }
                m->graph_n = n;
            }
        },
        true);
}

View* strojdiag_view_pressure_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(PressureModel));
    view_set_draw_callback(view, pressure_draw);
    view_set_input_callback(view, pressure_input);
    view_set_enter_callback(view, pressure_enter);
    return view;
}
