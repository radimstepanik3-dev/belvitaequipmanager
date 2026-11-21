#include "freq_meter.h"

#include <furi.h>
#include <furi_hal.h>

#define FREQ_PIN        (&gpio_usart_rx) /* pin 14, PB7 */
#define SIGNAL_TIMEOUT  2000u /* ms bez periody = zadny signal */

struct FreqMeter {
    bool running;
    /* zapisuje ISR */
    volatile uint32_t last_rise;
    volatile uint32_t last_fall;
    volatile bool have_rise;
    volatile bool have_fall;
    volatile uint32_t sum_period;
    volatile uint32_t periods;
    volatile uint32_t sum_high;
    volatile uint32_t highs;
    volatile uint32_t edges;
    /* vlakno UI */
    uint32_t last_period_tick;
    FreqResult last;
};

static void freq_isr(void* ctx) {
    FreqMeter* m = ctx;
    uint32_t now = DWT->CYCCNT;
    bool level = furi_hal_gpio_read(FREQ_PIN);
    if(level) {
        if(m->have_rise) {
            uint32_t period = now - m->last_rise;
            m->sum_period += period;
            m->periods++;
            if(m->have_fall) {
                uint32_t high = m->last_fall - m->last_rise;
                if(high < period) {
                    m->sum_high += high;
                    m->highs++;
                }
            }
        }
        m->last_rise = now;
        m->have_rise = true;
    } else {
        m->last_fall = now;
        m->have_fall = true;
    }
    m->edges++;
}

FreqMeter* freq_meter_alloc(void) {
    FreqMeter* m = malloc(sizeof(FreqMeter));
    memset(m, 0, sizeof(FreqMeter));
    return m;
}

void freq_meter_free(FreqMeter* m) {
    freq_meter_stop(m);
    free(m);
}

void freq_meter_start(FreqMeter* m) {
    if(m->running) return;
    FURI_CRITICAL_ENTER();
    m->have_rise = false;
    m->have_fall = false;
    m->sum_period = 0;
    m->periods = 0;
    m->sum_high = 0;
    m->highs = 0;
    m->edges = 0;
    FURI_CRITICAL_EXIT();
    memset(&m->last, 0, sizeof(m->last));
    m->last_period_tick = 0;

    /* Externi delic ma pull-down 33k, vnitrni odpor nepouzivame. */
    furi_hal_gpio_init(FREQ_PIN, GpioModeInterruptRiseFall, GpioPullNo, GpioSpeedVeryHigh);
    furi_hal_gpio_add_int_callback(FREQ_PIN, freq_isr, m);
    m->running = true;
}

void freq_meter_stop(FreqMeter* m) {
    if(!m->running) return;
    furi_hal_gpio_remove_int_callback(FREQ_PIN);
    furi_hal_gpio_init(FREQ_PIN, GpioModeAnalog, GpioPullNo, GpioSpeedLow);
    m->running = false;
}

void freq_meter_read(FreqMeter* m, FreqResult* out) {
    uint32_t sum_period = 0;
    uint32_t periods = 0;
    uint32_t sum_high = 0;
    uint32_t highs = 0;

    FURI_CRITICAL_ENTER();
    if(m->periods > 0) {
        sum_period = m->sum_period;
        periods = m->periods;
        sum_high = m->sum_high;
        highs = m->highs;
        m->sum_period = 0;
        m->periods = 0;
        m->sum_high = 0;
        m->highs = 0;
    }
    uint32_t edges = m->edges;
    FURI_CRITICAL_EXIT();

    uint32_t now = furi_get_tick();
    float cpu_hz = (float)furi_hal_cortex_instructions_per_microsecond() * 1e6f;

    if(periods > 0 && sum_period > 0) {
        float avg_period = (float)sum_period / (float)periods; /* takty */
        m->last.freq_hz = cpu_hz / avg_period;
        m->last.period_us = avg_period * 1e6f / cpu_hz;
        if(highs > 0) {
            float avg_high = (float)sum_high / (float)highs;
            m->last.high_us = avg_high * 1e6f / cpu_hz;
            m->last.duty_pct = avg_high / avg_period * 100.0f;
            if(m->last.duty_pct > 100.0f) m->last.duty_pct = 100.0f;
        }
        m->last.signal = true;
        m->last_period_tick = now;
    } else if(m->last.signal && (now - m->last_period_tick) > SIGNAL_TIMEOUT) {
        m->last.signal = false;
        m->last.freq_hz = 0.0f;
        m->last.duty_pct = 0.0f;
        m->last.period_us = 0.0f;
        m->last.high_us = 0.0f;
    }

    m->last.level = m->running ? furi_hal_gpio_read(FREQ_PIN) : false;
    m->last.edges_total = edges;
    *out = m->last;
}
