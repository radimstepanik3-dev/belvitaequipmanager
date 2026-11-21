/* Frekvence / PWM: snimace otacek a rychlosti (Hall), rizeni proporcionalnich
 * ventilu, signaly z ECU. Vstup pin 14. */
#include "../strojdiag_i.h"
#include "view_common.h"

#include <stdio.h>

typedef struct {
    FreqResult r;
    uint8_t ppr;
    bool invert; /**< ventil spinany na kostru: aktivni je uroven 0 */
} FreqModel;

static void freq_format(char* buf, size_t size, float hz) {
    if(hz >= 10000.0f) {
        snprintf(buf, size, "%.0f", (double)hz);
    } else if(hz >= 1000.0f) {
        snprintf(buf, size, "%.1f", (double)hz);
    } else if(hz >= 10.0f) {
        snprintf(buf, size, "%.2f", (double)hz);
    } else {
        snprintf(buf, size, "%.3f", (double)hz);
    }
}

static void freq_draw(Canvas* canvas, void* model) {
    FreqModel* m = model;
    char buf[40];
    char num[16];

    view_draw_header(canvas, "Frekvence / PWM", "pin 14");

    if(!m->r.signal) {
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str_aligned(canvas, 64, 26, AlignCenter, AlignBottom, "Zadne pulzy");
        canvas_set_font(canvas, FontSecondary);
        snprintf(
            buf, sizeof(buf), "Uroven: %s", m->r.level ? "1 (napeti > 3 V)" : "0 (pod 2 V / nic)");
        canvas_draw_str_aligned(canvas, 64, 38, AlignCenter, AlignBottom, buf);
        canvas_draw_str_aligned(canvas, 64, 48, AlignCenter, AlignBottom, "Signal 3-30 V proti GND");
        snprintf(buf, sizeof(buf), "Pulzy/ot.: %u (nahoru/dolu)", m->ppr);
        canvas_draw_str_aligned(canvas, 64, 60, AlignCenter, AlignBottom, buf);
        return;
    }

    freq_format(num, sizeof(num), m->r.freq_hz);
    canvas_set_font(canvas, FontBigNumbers);
    canvas_draw_str_aligned(canvas, 104, 30, AlignRight, AlignBottom, num);
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 107, 29, "Hz");

    float duty = m->invert ? 100.0f - m->r.duty_pct : m->r.duty_pct;
    const char* tag = m->invert ? "Strida(0)" : "Strida";
    if(m->r.period_us >= 10000.0f) {
        snprintf(buf, sizeof(buf), "%s %.1f %%  T %.1f ms", tag, (double)duty, (double)(m->r.period_us / 1000.0f));
    } else {
        snprintf(buf, sizeof(buf), "%s %.1f %%  T %.0f us", tag, (double)duty, (double)m->r.period_us);
    }
    canvas_draw_str(canvas, 0, 41, buf);

    float rpm = m->r.freq_hz * 60.0f / (float)(m->ppr ? m->ppr : 1);
    snprintf(buf, sizeof(buf), "Otacky %.0f rpm  (%u p/ot)", (double)rpm, m->ppr);
    canvas_draw_str(canvas, 0, 51, buf);

    /* prouzek stridy */
    canvas_draw_frame(canvas, 0, 55, 128, 8);
    int32_t w = (int32_t)(duty * 1.26f);
    if(w > 126) w = 126;
    if(w > 0) canvas_draw_box(canvas, 1, 56, (size_t)w, 6);
}

static bool freq_input(InputEvent* event, void* ctx) {
    StrojDiagApp* app = ctx;
    if(event->type == InputTypeShort && event->key == InputKeyOk) {
        /* OK = prepnout, zda se strida pocita z urovne 1 nebo 0 (low-side spinani) */
        with_view_model(app->views[StrojDiagViewFreq], FreqModel * m, { m->invert = !m->invert; }, true);
        return true;
    }
    if(event->type != InputTypeShort && event->type != InputTypeRepeat) return false;
    if(event->key != InputKeyUp && event->key != InputKeyDown) return false;
    uint8_t ppr = app->settings.freq_ppr;
    if(event->key == InputKeyUp && ppr < 100) ppr++;
    if(event->key == InputKeyDown && ppr > 1) ppr--;
    app->settings.freq_ppr = ppr;
    app->settings_dirty = true;
    with_view_model(app->views[StrojDiagViewFreq], FreqModel * m, { m->ppr = ppr; }, true);
    return true;
}

static void freq_enter(void* ctx) {
    StrojDiagApp* app = ctx;
    freq_meter_start(app->freq);
    with_view_model(
        app->views[StrojDiagViewFreq],
        FreqModel * m,
        {
            memset(&m->r, 0, sizeof(m->r));
            m->ppr = app->settings.freq_ppr;
        },
        true);
}

void strojdiag_view_freq_tick(StrojDiagApp* app) {
    FreqResult r;
    freq_meter_read(app->freq, &r);
    with_view_model(app->views[StrojDiagViewFreq], FreqModel * m, { m->r = r; }, true);
}

View* strojdiag_view_freq_alloc(StrojDiagApp* app) {
    View* view = view_alloc();
    view_set_context(view, app);
    view_allocate_model(view, ViewModelTypeLocking, sizeof(FreqModel));
    view_set_draw_callback(view, freq_draw);
    view_set_input_callback(view, freq_input);
    view_set_enter_callback(view, freq_enter);
    return view;
}
