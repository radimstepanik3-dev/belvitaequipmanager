#pragma once

#include <gui/canvas.h>
#include <gui/elements.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "../hw/mcp2515.h"

/** Titulek nahore (FontPrimary) s volitelnym textem vpravo a cara pod nim. */
void view_draw_header(Canvas* canvas, const char* title, const char* right);

/** Vykresli text oriznuty na sirku max_w (pridava ".."). */
void view_draw_clipped(Canvas* canvas, int32_t x, int32_t y, int32_t max_w, const char* text);

/** Radek seznamu (vyska 10 px), vybrany je inverzne. */
void view_draw_row(Canvas* canvas, int32_t y_top, bool selected, const char* left, const char* right);

/** Graf hodnot (auto meritko), min_span = nejmensi rozsah osy. */
void view_draw_graph(
    Canvas* canvas,
    int32_t x,
    int32_t y,
    int32_t w,
    int32_t h,
    const float* values,
    size_t count,
    float min_span,
    uint8_t decimals);

/** Cislo s danym poctem desetinnych mist. */
void view_format_float(char* buf, size_t size, float value, uint8_t decimals);

/** Cislo s desetinnou carkou pro CSV (cesky Excel). */
void view_format_csv(char* buf, size_t size, float value, uint8_t decimals);

/** Kratky popis vysledku inicializace MCP2515. */
const char* view_can_error_text(Mcp2515Result r);

/** Viceradkova zprava uprostred obrazovky. */
void view_draw_message(Canvas* canvas, int32_t y, const char* text);
