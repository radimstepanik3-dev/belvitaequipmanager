/* CAN monitor: statistiky, seznam ID, zaznam na SD (candump) a hledani rychlosti. */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

#define MON_ROWS      3u
#define AUTOBAUD_TICKS 7u /* 7 x 200 ms na kazdou rychlost */

typedef enum {
    AutobaudOff,
    AutobaudRunning,
    AutobaudFound,
    AutobaudFailed,
} AutobaudState;

typedef struct {
    CanWorkerStats st;
    uint16_t selected;
    uint16_t top;
    CanIdEntry rows[MON_ROWS];
    uint8_t rows_count;
    bool logging;
    uint32_t log_bytes;
    uint32_t log_drops;
    AutobaudState autobaud;
    uint8_t autobaud_index;
    uint8_t autobaud_ticks;
    uint32_t no_frames_ticks;
} MonModel;

/* Poradi zkousenych rychlosti: nejbeznejsi J1939 prvni. */
static const uint8_t autobaud_order[] = {1, 2, 0, 3};

static void mon_draw(Canvas* canvas, void* model) {
    MonModel* m = model;
    char title[24];
    char buf[64];
    char right[16];

    if(m->autobaud == AutobaudRunning) {
        view_draw_header(canvas, "Hledam rychlost", "");
        snprintf(
            buf,
            sizeof(buf),
            "Zkousim %s ...\n(jen poslech, nic nevysila)",
            strojdiag_bitrate_names[autobaud_order[m->autobaud_index]]);
        view_draw_message(canvas, 24, buf);
        return;
    }

    const char* rate_name = "?";
    for(uint8_t i = 0; i < strojdiag_bitrate_count; i++) {
        if(strojdiag_bitrates[i] == m->st.bitrate) rate_name = strojdiag_bitrate_names[i];
    }
    snprintf(title, sizeof(title), "CAN %s %s", rate_name, m->st.listen_only ? "Posl." : "Akt.");
    right[0] = '\0';
    if(m->logging) snprintf(right, sizeof(right), "REC %lukB", (unsigned long)(m->log_bytes / 1024u));
    view_draw_header(canvas, title, right);

    if(!m->st.running) {
        view_draw_message(canvas, 16, view_can_error_text(m->st.init_result));
        return;
    }

    snprintf(
        buf,
        sizeof(buf),
        "%lu ram/s  ID %u  ztr %lu",
        (unsigned long)m->st.fps,
        m->st.id_count,
        (unsigned long)m->st.overflows);
    canvas_draw_str(canvas, 0, 20, buf);

    if(m->autobaud == AutobaudFound) {
        view_draw_message(canvas, 26, "Rychlost nalezena\na ulozena.");
    } else if(m->autobaud == AutobaudFailed) {
        view_draw_message(canvas, 26, "Rychlost nenalezena.\nZapalovani? Zapojeni?");
    } else if(m->st.id_count == 0) {
        const char* msg = "Cekam na ramce...";
        if(m->st.eflg & MCP2515_EFLG_TXBO) {
            msg = "BUS-OFF! Spatna rychlost\nnebo zkrat CAN H/L.";
        } else if(m->no_frames_ticks > 15) {
            msg = "Zadne ramce.\nZapalovani? H/L prohozene?\nDrz > = hledat rychlost";
        }
        view_draw_message(canvas, 26, msg);
    } else {
        for(uint8_t r = 0; r < m->rows_count; r++) {
            const CanIdEntry* e = &m->rows[r];
            if(e->ext) {
                snprintf(buf, sizeof(buf), "%08lX %5lu", (unsigned long)e->id, (unsigned long)j1939_pgn(e->id));
            } else {
                snprintf(buf, sizeof(buf), "%03lX", (unsigned long)e->id);
            }
            snprintf(right, sizeof(right), "%u/s", e->rate);
            view_draw_row(canvas, 22 + (int32_t)r * 10, (uint16_t)(m->top + r) == m->selected, buf, right);
        }
        /* data vybraneho ramce */
        uint16_t sel = (uint16_t)(m->selected - m->top);
        if(sel < m->rows_count) {
            const CanIdEntry* e = &m->rows[sel];
            static const char hex[] = "0123456789ABCDEF";
            char data[20];
            uint8_t p = 0;
            for(uint8_t i = 0; i < e->dlc && i < 8; i++) {
                data[p++] = hex[e->data[i] >> 4];
                data[p++] = hex[e->data[i] & 0x0F];
            }
            data[p] = '\0';
            canvas_set_font(canvas, FontKeyboard);
            canvas_draw_str(canvas, 0, 62, data);
            canvas_set_font(canvas, FontSecondary);
        }
    }

}

static void mon_toggle_log(StrojDiagApp* app) {
    if(sd_log_is_open(app->log)) {
        can_worker_set_log(app->can, NULL);
        sd_log_close(app->log);
        strojdiag_notify(app, &sequence_single_vibro);
        return;
    }
    if(!can_worker_is_running(app->can)) return;
    if(sd_log_open(app->log, "can", "log", NULL, 16 * 1024)) {
        can_worker_set_log(app->can, app->log);
        strojdiag_notify(app, &sequence_success);
    } else {
        strojdiag_notify(app, &sequence_error);
    }
}

static void mon_autobaud_start(StrojDiagApp* app) {
    if(sd_log_is_open(app->log)) return;
    can_worker_stop(app->can);
    can_worker_reset(app->can);
    with_view_model(
        app->views[StrojDiagViewCanMon],
        MonModel * m,
        {
            m->autobaud = AutobaudRunning;
            m->autobaud_index = 0;
            m->autobaud_ticks = 0;
        },
        true);
    can_worker_start(
        app->can,
        strojdiag_crystals[app->settings.can_crystal],
        strojdiag_bitrates[autobaud_order[0]],
        false);
}

static bool mon_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    View* view = app->views[StrojDiagViewCanMon];
    bool consumed = false;
    bool toggle_log = false;
    bool autobaud = false;
    bool reset = false;
    bool busy = false;

    with_view_model(
        view,
        MonModel * m,
        {
            busy = m->autobaud == AutobaudRunning;
            if(m->autobaud == AutobaudFound || m->autobaud == AutobaudFailed) {
                if(event->type == InputTypeShort && event->key != InputKeyBack) {
                    m->autobaud = AutobaudOff;
                    consumed = true;
                }
            }
            if(!busy && !consumed) {
                if(event->type == InputTypeShort || event->type == InputTypeRepeat) {
                    if(event->key == InputKeyUp) {
                        if(m->selected > 0) m->selected--;
                        consumed = true;
                    } else if(event->key == InputKeyDown) {
                        if(m->selected + 1u < m->st.id_count) m->selected++;
                        consumed = true;
                    } else if(event->key == InputKeyOk && event->type == InputTypeShort) {
                        toggle_log = true;
                        consumed = true;
                    }
                } else if(event->type == InputTypeLong) {
                    if(event->key == InputKeyOk) {
                        reset = true;
                        m->selected = 0;
                        m->top = 0;
                        consumed = true;
                    } else if(event->key == InputKeyRight) {
                        autobaud = true;
                        consumed = true;
                    }
                }
                if(m->selected < m->top) m->top = m->selected;
                if(m->selected >= m->top + MON_ROWS) m->top = (uint16_t)(m->selected - MON_ROWS + 1u);
            }
            if(busy && event->key != InputKeyBack) consumed = true;
        },
        true);

    if(toggle_log) mon_toggle_log(app);
    if(reset) can_worker_reset(app->can);
    if(autobaud) mon_autobaud_start(app);
    return consumed;
}

static void mon_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    with_view_model(
        app->views[StrojDiagViewCanMon],
        MonModel * m,
        {
            m->autobaud = AutobaudOff;
            m->no_frames_ticks = 0;
        },
        false);
    strojdiag_can_start(app);
    strojdiag_view_canmon_tick(app);
}

static void mon_autobaud_tick(StrojDiagApp* app, MonModel* m) {
    CanWorkerStats st;
    can_worker_get_stats(app->can, &st);
    if(st.running && st.frames > 0) {
        app->settings.can_bitrate = autobaud_order[m->autobaud_index];
        app->settings_dirty = true;
        m->autobaud = AutobaudFound;
        strojdiag_notify(app, &sequence_success);
        /* restart v rezimu podle nastaveni (muze byt aktivni) */
        can_worker_stop(app->can);
        can_worker_reset(app->can);
        strojdiag_can_start(app);
        return;
    }
    if(++m->autobaud_ticks < AUTOBAUD_TICKS) return;
    m->autobaud_ticks = 0;
    m->autobaud_index++;
    can_worker_stop(app->can);
    if(m->autobaud_index >= COUNT_OF(autobaud_order)) {
        m->autobaud = AutobaudFailed;
        strojdiag_notify(app, &sequence_error);
        strojdiag_can_start(app);
        return;
    }
    can_worker_reset(app->can);
    can_worker_start(
        app->can,
        strojdiag_crystals[app->settings.can_crystal],
        strojdiag_bitrates[autobaud_order[m->autobaud_index]],
        false);
}

void strojdiag_view_canmon_tick(StrojDiagApp* app) {
    with_view_model(
        app->views[StrojDiagViewCanMon],
        MonModel * m,
        {
            if(m->autobaud == AutobaudRunning) {
                mon_autobaud_tick(app, m);
            }
            can_worker_get_stats(app->can, &m->st);
            if(m->st.id_count == 0) {
                m->selected = 0;
                m->top = 0;
            } else if(m->selected >= m->st.id_count) {
                m->selected = (uint16_t)(m->st.id_count - 1u);
            }
            if(m->selected < m->top) m->top = m->selected;
            m->rows_count = (uint8_t)can_worker_get_ids(app->can, m->rows, MON_ROWS, m->top);
            m->no_frames_ticks = m->st.frames == 0 ? m->no_frames_ticks + 1u : 0u;
            m->logging = sd_log_is_open(app->log);
            m->log_bytes = sd_log_bytes(app->log);
            m->log_drops = sd_log_drops(app->log);
        },
        true);
}

View* strojdiag_view_canmon_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(MonModel));
    view_set_draw_callback(view, mon_draw);
    view_set_input_callback(view, mon_input);
    view_set_enter_callback(view, mon_enter);
    return view;
}
