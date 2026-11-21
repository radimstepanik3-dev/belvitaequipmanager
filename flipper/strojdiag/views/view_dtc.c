/* Chybove kody J1939: DM1 (aktivni) a DM2 (historie). */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

#define DTC_ROWS  4u
#define DTC_MAX   32u
#define NOTE_MS   2500u

typedef struct {
    uint8_t sa;
    uint8_t lamp;
    J1939Dtc dtc;
} DtcItem;

typedef struct {
    bool history;
    uint16_t selected;
    uint16_t top;
    uint16_t count;
    DtcItem items[DTC_MAX];
    uint8_t lamps;
    bool running;
    Mcp2515Result init;
    uint32_t frames;
    bool active_mode;
    char note[32];
    uint32_t note_tick;
} DtcModel;

static void dtc_set_note(DtcModel* m, const char* text) {
    snprintf(m->note, sizeof(m->note), "%s", text);
    m->note_tick = furi_get_tick();
}

static void dtc_draw_lamp(Canvas* canvas, int32_t x, const char* name, bool on) {
    if(on) {
        canvas_draw_box(canvas, x, 13, 31, 9);
        canvas_set_color(canvas, ColorWhite);
    } else {
        canvas_draw_frame(canvas, x, 13, 31, 9);
    }
    canvas_draw_str_aligned(canvas, x + 16, 14, AlignCenter, AlignTop, name);
    canvas_set_color(canvas, ColorBlack);
}

static void dtc_draw(Canvas* canvas, void* model) {
    DtcModel* m = model;
    char buf[48];
    char right[8];

    snprintf(right, sizeof(right), "%u", m->count);
    view_draw_header(canvas, m->history ? "Historie chyb" : "Aktivni chyby", m->running ? right : "");

    if(!m->running) {
        view_draw_message(canvas, 16, view_can_error_text(m->init));
        canvas_draw_str_aligned(canvas, 64, 62, AlignCenter, AlignBottom, "OK = zkusit znovu");
        return;
    }

    if(m->history) {
        canvas_draw_str(canvas, 2, 20, "DM2 - drive aktivni kody");
    } else {
        dtc_draw_lamp(canvas, 0, "MIL", j1939_lamp_state(m->lamps, J1939LampMil) == 1);
        dtc_draw_lamp(canvas, 32, "STOP", j1939_lamp_state(m->lamps, J1939LampRedStop) == 1);
        dtc_draw_lamp(canvas, 64, "VAROV", j1939_lamp_state(m->lamps, J1939LampAmber) == 1);
        dtc_draw_lamp(canvas, 96, "OCHR", j1939_lamp_state(m->lamps, J1939LampProtect) == 1);
    }

    if(m->count == 0) {
        const char* msg;
        if(m->frames == 0) {
            msg = "Zadna data z CAN.\nZapalovani? Zapojeni H/L?\nRychlost v Nastaveni.";
        } else if(m->history) {
            msg = m->active_mode ? "Historie je prazdna.\nOK = nacist znovu" :
                                   "Historie se musi vyzadat:\nzapni Aktivni rezim CAN\nv Nastaveni.";
        } else {
            msg = "Zadne aktivni chyby.\n> = historie (DM2)";
        }
        view_draw_message(canvas, 26, msg);
    } else {
        for(uint16_t r = 0; r < DTC_ROWS && (uint16_t)(m->top + r) < m->count; r++) {
            const DtcItem* it = &m->items[m->top + r];
            const char* name = j1939_db_spn_name(it->dtc.spn);
            if(!name) name = j1939_db_fmi(it->dtc.fmi)->short_text;
            snprintf(buf, sizeof(buf), "%lu/%u %s", (unsigned long)it->dtc.spn, it->dtc.fmi, name);
            snprintf(right, sizeof(right), "x%u", it->dtc.oc);
            view_draw_row(canvas, 23 + (int32_t)r * 10, (uint16_t)(m->top + r) == m->selected, buf, right);
        }
        if(m->count > DTC_ROWS) elements_scrollbar(canvas, m->selected, m->count);
    }

    if(m->note[0] && furi_get_tick() - m->note_tick < NOTE_MS) {
        canvas_set_color(canvas, ColorWhite);
        canvas_draw_box(canvas, 4, 40, 120, 14);
        canvas_set_color(canvas, ColorBlack);
        canvas_draw_frame(canvas, 4, 40, 120, 14);
        canvas_draw_str_aligned(canvas, 64, 47, AlignCenter, AlignCenter, m->note);
    }
}

static void dtc_request_history(StrojDiagApp* app, DtcModel* m) {
    if(!m->active_mode) return;
    if(can_worker_request_pgn(app->can, J1939_PGN_DM2)) {
        dtc_set_note(m, "Dotaz na historii odeslan");
    } else {
        dtc_set_note(m, "Odeslani selhalo");
    }
}

static bool dtc_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    View* view = app->views[StrojDiagViewDtc];
    bool consumed = false;
    bool open_detail = false;
    bool open_dialog = false;
    bool retry = false;
    DtcItem detail = {0};
    bool history = false;

    with_view_model(
        view,
        DtcModel * m,
        {
            history = m->history;
            if(event->type == InputTypeShort || event->type == InputTypeRepeat) {
                switch(event->key) {
                case InputKeyUp:
                    if(m->selected > 0) m->selected--;
                    consumed = true;
                    break;
                case InputKeyDown:
                    if(m->selected + 1u < m->count) m->selected++;
                    consumed = true;
                    break;
                case InputKeyRight:
                    if(!m->history) {
                        m->history = true;
                        m->selected = 0;
                        m->top = 0;
                        m->count = 0;
                        dtc_request_history(app, m);
                    }
                    consumed = true;
                    break;
                case InputKeyLeft:
                    if(m->history) {
                        m->history = false;
                        m->selected = 0;
                        m->top = 0;
                        m->count = 0;
                    }
                    consumed = true;
                    break;
                case InputKeyOk:
                    if(event->type != InputTypeShort) break;
                    if(!m->running) {
                        retry = true;
                    } else if(m->count > 0) {
                        detail = m->items[m->selected];
                        open_detail = true;
                    } else if(m->history) {
                        dtc_request_history(app, m);
                    }
                    consumed = true;
                    break;
                default:
                    break;
                }
            } else if(event->type == InputTypeLong && event->key == InputKeyOk) {
                if(!m->running) {
                    /* nic */
                } else if(!m->active_mode) {
                    dtc_set_note(m, "Jen v Aktivnim rezimu");
                } else {
                    open_dialog = true;
                }
                consumed = true;
            }
            if(m->selected < m->top) m->top = m->selected;
            if(m->selected >= m->top + DTC_ROWS) m->top = (uint16_t)(m->selected - DTC_ROWS + 1u);
        },
        true);

    if(retry) {
        Mcp2515Result r = strojdiag_can_start(app);
        with_view_model(view, DtcModel * m, { m->init = r; }, true);
    } else if(open_detail) {
        strojdiag_dtc_detail_text(app, app->text, detail.sa, detail.lamp, &detail.dtc, history);
        strojdiag_show_text(app, StrojDiagViewDtc);
    } else if(open_dialog) {
        strojdiag_show_dialog(app, history ? StrojDiagDialogClearDm2 : StrojDiagDialogClearDm1);
    }
    return consumed;
}

static void dtc_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    Mcp2515Result r = strojdiag_can_start(app);
    with_view_model(
        app->views[StrojDiagViewDtc],
        DtcModel * m,
        {
            m->init = r;
            m->active_mode = app->settings.can_active != 0;
        },
        true);
    strojdiag_view_dtc_tick(app);
}

void strojdiag_view_dtc_tick(StrojDiagApp* app) {
    CanWorkerStats st;
    can_worker_get_stats(app->can, &st);
    with_view_model(
        app->views[StrojDiagViewDtc],
        DtcModel * m,
        {
            m->running = st.running;
            m->init = st.init_result;
            m->frames = st.frames;
            if(st.running) {
                const J1939State* j = can_worker_lock_j1939(app->can);
                const J1939DtcTable* t = m->history ? &j->dm2 : &j->dm1;
                uint16_t total = j1939_dtc_total(t);
                m->count = 0;
                for(uint16_t i = 0; i < total && m->count < DTC_MAX; i++) {
                    const J1939DtcSource* src;
                    const J1939Dtc* dtc;
                    if(!j1939_dtc_get(t, i, &src, &dtc)) break;
                    m->items[m->count].sa = src->sa;
                    m->items[m->count].lamp = src->lamp;
                    m->items[m->count].dtc = *dtc;
                    m->count++;
                }
                m->lamps = j1939_dtc_lamps(&j->dm1);
                can_worker_unlock(app->can);
            }
            if(m->count == 0) {
                m->selected = 0;
                m->top = 0;
            } else if(m->selected >= m->count) {
                m->selected = (uint16_t)(m->count - 1u);
                if(m->top > m->selected) m->top = m->selected;
            }
        },
        true);
}

View* strojdiag_view_dtc_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(DtcModel));
    view_set_draw_callback(view, dtc_draw);
    view_set_input_callback(view, dtc_input);
    view_set_enter_callback(view, dtc_enter);
    return view;
}
