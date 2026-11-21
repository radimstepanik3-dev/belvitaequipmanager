#include "view_common.h"

#include <furi.h>
#include <stdio.h>
#include <string.h>

void view_draw_header(Canvas* canvas, const char* title, const char* right) {
    canvas_set_color(canvas, ColorBlack);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 0, 9, title);
    if(right && right[0]) {
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str_aligned(canvas, 127, 1, AlignRight, AlignTop, right);
    }
    canvas_draw_line(canvas, 0, 11, 127, 11);
    canvas_set_font(canvas, FontSecondary);
}

void view_draw_clipped(Canvas* canvas, int32_t x, int32_t y, int32_t max_w, const char* text) {
    if((int32_t)canvas_string_width(canvas, text) <= max_w) {
        canvas_draw_str(canvas, x, y, text);
        return;
    }
    char buf[48];
    size_t len = strlen(text);
    if(len >= sizeof(buf)) len = sizeof(buf) - 1;
    memcpy(buf, text, len);
    buf[len] = '\0';
    while(len > 0) {
        buf[len - 1] = '\0';
        len--;
        char tmp[52];
        snprintf(tmp, sizeof(tmp), "%s..", buf);
        if((int32_t)canvas_string_width(canvas, tmp) <= max_w) {
            canvas_draw_str(canvas, x, y, tmp);
            return;
        }
    }
}

void view_draw_row(Canvas* canvas, int32_t y_top, bool selected, const char* left, const char* right) {
    canvas_set_font(canvas, FontSecondary);
    if(selected) {
        canvas_set_color(canvas, ColorBlack);
        canvas_draw_box(canvas, 0, y_top, 124, 10);
        canvas_set_color(canvas, ColorWhite);
    } else {
        canvas_set_color(canvas, ColorBlack);
    }
    int32_t right_w = 0;
    if(right && right[0]) {
        right_w = (int32_t)canvas_string_width(canvas, right) + 3;
        canvas_draw_str_aligned(canvas, 122, y_top + 1, AlignRight, AlignTop, right);
    }
    view_draw_clipped(canvas, 2, y_top + 8, 120 - right_w, left);
    canvas_set_color(canvas, ColorBlack);
}

void view_draw_graph(
    Canvas* canvas,
    int32_t x,
    int32_t y,
    int32_t w,
    int32_t h,
    const float* values,
    size_t count,
    float min_span,
    uint8_t decimals) {
    canvas_set_color(canvas, ColorBlack);
    canvas_draw_frame(canvas, x, y, (size_t)w, (size_t)h);
    if(count < 2) {
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str_aligned(canvas, x + w / 2, y + h / 2, AlignCenter, AlignCenter, "Cekam na data");
        return;
    }

    float lo = values[0];
    float hi = values[0];
    for(size_t i = 1; i < count; i++) {
        if(values[i] < lo) lo = values[i];
        if(values[i] > hi) hi = values[i];
    }
    if(hi - lo < min_span) {
        float mid = (hi + lo) * 0.5f;
        lo = mid - min_span * 0.5f;
        hi = mid + min_span * 0.5f;
    }

    int32_t inner_h = h - 3;
    int32_t inner_w = w - 2;
    int32_t prev_x = 0;
    int32_t prev_y = 0;
    for(size_t i = 0; i < count; i++) {
        int32_t px = x + 1 + (int32_t)i * (inner_w - 1) / (int32_t)(count - 1);
        float t = (values[i] - lo) / (hi - lo);
        int32_t py = y + 1 + inner_h - (int32_t)(t * (float)inner_h + 0.5f);
        if(i > 0) canvas_draw_line(canvas, prev_x, prev_y, px, py);
        prev_x = px;
        prev_y = py;
    }

    char buf[16];
    canvas_set_font(canvas, FontSecondary);
    view_format_float(buf, sizeof(buf), hi, decimals);
    canvas_draw_str(canvas, x + 2, y + 8, buf);
    view_format_float(buf, sizeof(buf), lo, decimals);
    canvas_draw_str(canvas, x + 2, y + h - 2, buf);
}

void view_format_float(char* buf, size_t size, float value, uint8_t decimals) {
    switch(decimals) {
    case 0:
        snprintf(buf, size, "%.0f", (double)value);
        break;
    case 1:
        snprintf(buf, size, "%.1f", (double)value);
        break;
    case 2:
        snprintf(buf, size, "%.2f", (double)value);
        break;
    default:
        snprintf(buf, size, "%.3f", (double)value);
        break;
    }
    /* "-0" vypada divne */
    if(strcmp(buf, "-0") == 0 || strcmp(buf, "-0.0") == 0 || strcmp(buf, "-0.00") == 0) {
        memmove(buf, buf + 1, strlen(buf));
    }
}

void view_format_csv(char* buf, size_t size, float value, uint8_t decimals) {
    view_format_float(buf, size, value, decimals);
    for(char* c = buf; *c; c++) {
        if(*c == '.') *c = ',';
    }
}

const char* view_can_error_text(Mcp2515Result r) {
    switch(r) {
    case Mcp2515ResultOk:
        return "OK";
    case Mcp2515ResultNoChip:
        return "MCP2515 neodpovida.\nZkontroluj modul, 3V3\na piny 2-6.";
    case Mcp2515ResultBadTiming:
        return "Tato rychlost s timto\nkrystalem nejde.\nZmen Nastaveni.";
    case Mcp2515ResultModeFail:
        return "MCP2515 nejde prepnout.\nZkontroluj krystal.";
    default:
        return "Neznama chyba";
    }
}

void view_draw_message(Canvas* canvas, int32_t y, const char* text) {
    canvas_set_color(canvas, ColorBlack);
    canvas_set_font(canvas, FontSecondary);
    elements_multiline_text_aligned(canvas, 64, y, AlignCenter, AlignTop, text);
}
