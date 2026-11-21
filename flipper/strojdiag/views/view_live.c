/* Ziva data J1939: zobrazuje jen hodnoty, ktere stroj opravdu vysila. */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

#define LIVE_ROWS     5u
#define LIVE_MAX_AGE  3000u /* ms - starsi hodnota se nezobrazi */
#define REQUEST_EVERY 10000u

typedef struct {
    uint8_t id;
    float value;
} LiveItem;

typedef struct {
    bool running;
    Mcp2515Result init;
    uint32_t frames;
    uint32_t fps;
    uint16_t ecus;
    uint8_t count;
    uint8_t top;
    LiveItem items[J1939ParamCount];
} LiveModel;

static uint32_t live_last_request;

static void live_draw(Canvas* canvas, void* model) {
    LiveModel* m = model;
    char right[24];
    char value[24];

    snprintf(right, sizeof(right), "ECU %u  %lu/s", m->ecus, (unsigned long)m->fps);
    view_draw_header(canvas, "Ziva data", m->running ? right : "");

    if(!m->running) {
        view_draw_message(canvas, 16, view_can_error_text(m->init));
        return;
    }
    if(m->count == 0) {
        view_draw_message(
            canvas,
            18,
            m->frames == 0 ? "Zadna data z CAN.\nZapalovani? Zapojeni H/L?\nRychlost v Nastaveni." :
                             "CAN bezi, ale zadne\nzname J1939 hodnoty.\nZkus CAN monitor.");
        return;
    }

    for(uint8_t r = 0; r < LIVE_ROWS && (uint8_t)(m->top + r) < m->count; r++) {
        const LiveItem* it = &m->items[m->top + r];
        const J1939ParamDef* def = j1939_param_def((J1939ParamId)it->id);
        char num[16];
        view_format_float(num, sizeof(num), it->value, def->decimals);
        snprintf(value, sizeof(value), "%s %s", num, def->unit);
        view_draw_row(canvas, 13 + (int32_t)r * 10, false, def->label, value);
    }
    if(m->count > LIVE_ROWS) elements_scrollbar(canvas, m->top, (size_t)(m->count - LIVE_ROWS + 1u));
}

static void live_request_ids(StrojDiagApp* app) {
    if(!app->settings.can_active) return;
    /* Hodnoty, ktere ECU casto posilaji jen na vyzadani. */
    can_worker_request_pgn(app->can, 65253u); /* motohodiny */
    can_worker_request_pgn(app->can, J1939_PGN_COMP_ID);
    can_worker_request_pgn(app->can, J1939_PGN_VIN);
    can_worker_request_pgn(app->can, J1939_PGN_SOFT_ID);
    live_last_request = furi_get_tick();
}

static void live_info_text(StrojDiagApp* app) {
    FuriString* t = app->text;
    const J1939State* j = can_worker_lock_j1939(app->can);
    furi_string_printf(t, "ECU NA SBERNICI (%u):\n", j1939_sa_count(j));
    for(uint16_t sa = 0; sa < 256; sa++) {
        if(j->sa_seen[sa >> 3] & (1u << (sa & 7u))) {
            char name[24];
            j1939_db_sa_format((uint8_t)sa, name, sizeof(name));
            furi_string_cat_printf(t, " %3u  %s\n", sa, name);
        }
    }
    furi_string_cat_printf(t, "\nVIN: %s\n", j->vin[0] ? j->vin : "-");
    furi_string_cat_printf(t, "Soucast (vyrobce*typ*cislo): %s\n", j->comp_id[0] ? j->comp_id : "-");
    furi_string_cat_printf(t, "Software: %s\n", j->soft_id[0] ? j->soft_id : "-");
    float hours = j->params[J1939ParamEngineHours].value;
    bool has_hours = j->params[J1939ParamEngineHours].tick != 0;
    can_worker_unlock(app->can);

    if(has_hours) {
        furi_string_cat_printf(t, "Motohodiny z ECU: %.1f h\n", (double)hours);
    }
    furi_string_cat_str(
        t,
        app->settings.can_active ?
            "\nIdentifikace se vyzaduje automaticky (Aktivni rezim).\n" :
            "\nV rezimu Poslech se ukaze jen to, co ECU samy vysilaji. Pro VIN a motohodiny "
            "zapni Aktivni rezim.\n");
}

static bool live_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    bool consumed = false;
    bool show_info = false;
    if(event->type == InputTypeShort || event->type == InputTypeRepeat) {
        with_view_model(
            app->views[StrojDiagViewLive],
            LiveModel * m,
            {
                if(event->key == InputKeyUp) {
                    if(m->top > 0) m->top--;
                    consumed = true;
                } else if(event->key == InputKeyDown) {
                    if(m->top + LIVE_ROWS < m->count) m->top++;
                    consumed = true;
                } else if(event->key == InputKeyOk && event->type == InputTypeShort) {
                    show_info = m->running;
                    consumed = true;
                }
            },
            true);
    }
    if(show_info) {
        live_request_ids(app);
        live_info_text(app);
        strojdiag_show_text(app, StrojDiagViewLive);
    }
    return consumed;
}

static void live_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    if(strojdiag_can_start(app) == Mcp2515ResultOk) live_request_ids(app);
    strojdiag_view_live_tick(app);
}

void strojdiag_view_live_tick(StrojDiagApp* app) {
    CanWorkerStats st;
    can_worker_get_stats(app->can, &st);
    uint32_t now = furi_get_tick();
    if(st.running && app->settings.can_active && now - live_last_request > REQUEST_EVERY) {
        can_worker_request_pgn(app->can, 65253u);
        live_last_request = now;
    }

    with_view_model(
        app->views[StrojDiagViewLive],
        LiveModel * m,
        {
            m->running = st.running;
            m->init = st.init_result;
            m->frames = st.frames;
            m->fps = st.fps;
            m->count = 0;
            if(st.running) {
                const J1939State* j = can_worker_lock_j1939(app->can);
                for(uint8_t i = 0; i < J1939ParamCount; i++) {
                    /* motohodiny chodi zridka - ukazuj posledni znamou hodnotu */
                    uint32_t age = i == J1939ParamEngineHours ? 0xFFFFFFFFu : LIVE_MAX_AGE;
                    if(j1939_param_fresh(j, (J1939ParamId)i, now, age)) {
                        m->items[m->count].id = i;
                        m->items[m->count].value = j->params[i].value;
                        m->count++;
                    }
                }
                m->ecus = j1939_sa_count(j);
                can_worker_unlock(app->can);
            }
            if(m->top + LIVE_ROWS > m->count) {
                m->top = m->count > LIVE_ROWS ? (uint8_t)(m->count - LIVE_ROWS) : 0;
            }
        },
        true);
}

View* strojdiag_view_live_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(LiveModel));
    view_set_draw_callback(view, live_draw);
    view_set_input_callback(view, live_input);
    view_set_enter_callback(view, live_enter);
    return view;
}
