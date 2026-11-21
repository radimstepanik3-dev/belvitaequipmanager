/* Teplota z vodotesne sondy DS18B20 (hydraulicky olej, chladic, prevodovka). */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

typedef struct {
    bool valid;
    float celsius;
    bool have_minmax;
    float tmin;
    float tmax;
} TempModel;

static void temp_draw(Canvas* canvas, void* model) {
    TempModel* m = model;
    char buf[32];

    view_draw_header(canvas, "Teplota", "DS18B20");
    if(!m->valid) {
        view_draw_message(
            canvas, 18, "Sonda neodpovida.\nData = pin 17, GND = 18,\nVDD = 9 (3V3), pull-up 4k7");
        return;
    }
    view_format_float(buf, sizeof(buf), m->celsius, 1);
    canvas_set_font(canvas, FontBigNumbers);
    canvas_draw_str_aligned(canvas, 100, 36, AlignRight, AlignBottom, buf);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 104, 34, "C");
    canvas_set_font(canvas, FontSecondary);
    if(m->have_minmax) {
        snprintf(buf, sizeof(buf), "min %.1f  max %.1f", (double)m->tmin, (double)m->tmax);
        canvas_draw_str_aligned(canvas, 64, 48, AlignCenter, AlignBottom, buf);
    }
    elements_button_center(canvas, "Reset");
}

static bool temp_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    if(event->type == InputTypeShort && event->key == InputKeyOk) {
        with_view_model(app->views[StrojDiagViewTemp], TempModel * m, { m->have_minmax = false; }, true);
        return true;
    }
    return false;
}

static void temp_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    ds18b20_start(app->temp);
    with_view_model(
        app->views[StrojDiagViewTemp],
        TempModel * m,
        {
            m->valid = false;
            m->have_minmax = false;
        },
        true);
}

void strojdiag_view_temp_tick(StrojDiagApp* app) {
    float t = 0.0f;
    bool ok = ds18b20_get(app->temp, &t);
    with_view_model(
        app->views[StrojDiagViewTemp],
        TempModel * m,
        {
            m->valid = ok;
            if(ok) {
                m->celsius = t;
                if(!m->have_minmax) {
                    m->tmin = t;
                    m->tmax = t;
                    m->have_minmax = true;
                } else {
                    if(t < m->tmin) m->tmin = t;
                    if(t > m->tmax) m->tmax = t;
                }
            }
        },
        true);
}

View* strojdiag_view_temp_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(TempModel));
    view_set_draw_callback(view, temp_draw);
    view_set_input_callback(view, temp_input);
    view_set_enter_callback(view, temp_enter);
    return view;
}
