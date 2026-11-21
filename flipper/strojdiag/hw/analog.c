#include "analog.h"

#include <furi.h>
#include <furi_hal.h>

#include "../core/measure.h"

#define FLAG_STOP (1u << 0)
#define SMOOTH    4u

typedef struct {
    const GpioPin* pin;
    FuriHalAdcChannel channel;
    float divider;
} AnalogInput;

static const AnalogInput analog_inputs[AnalogChCount] = {
    [AnalogChBattery] = {&gpio_ext_pc3, FuriHalAdcChannel4, MEASURE_BAT_DIVIDER},
    [AnalogChSensorA] = {&gpio_ext_pc1, FuriHalAdcChannel2, MEASURE_SENS_DIVIDER},
    [AnalogChSensorB] = {&gpio_ext_pc0, FuriHalAdcChannel1, MEASURE_SENS_DIVIDER},
};

struct AnalogWorker {
    FuriThread* thread;
    FuriMutex* mutex;
    bool running;

    AnalogSnapshot snap;
    bool minmax_valid;
    float history[AnalogChCount][ANALOG_HISTORY];
    size_t hist_pos;
    size_t hist_count;

    SdLog* log;
    AnalogLogCallback log_cb;
    void* log_ctx;
    uint32_t log_t0;

    CrankState crank_state;
    uint16_t* crank_buf;
    size_t crank_w;
    uint32_t crank_total;
    uint32_t crank_stop;
    uint32_t crank_rest_sum;
    float crank_factor;
};

static void crank_rotate(uint16_t* buf, size_t len, size_t first) {
    /* rotace vlevo o "first" pomoci tri obraceni */
    size_t ranges[3][2] = {{0, first}, {first, len}, {0, len}};
    for(size_t r = 0; r < 3; r++) {
        size_t a = ranges[r][0];
        size_t b = ranges[r][1];
        while(b > a + 1) {
            b--;
            uint16_t t = buf[a];
            buf[a] = buf[b];
            buf[b] = t;
            a++;
        }
    }
}

/* Vola se s drzenym mutexem. */
static void crank_sample(AnalogWorker* w, float volts) {
    float cvf = volts * w->crank_factor * 100.0f;
    uint16_t cv = cvf <= 0.0f ? 0 : (cvf >= 65535.0f ? 65535 : (uint16_t)cvf);

    w->crank_buf[w->crank_w] = cv;
    size_t written = w->crank_w;
    w->crank_w = (w->crank_w + 1u) % ANALOG_CRANK_LEN;
    w->crank_total++;

    if(w->crank_state == CrankStateArmed) {
        w->crank_rest_sum += cv;
        if(w->crank_total > ANALOG_CRANK_PRE) {
            size_t old = (written + ANALOG_CRANK_LEN - ANALOG_CRANK_PRE) % ANALOG_CRANK_LEN;
            w->crank_rest_sum -= w->crank_buf[old];
            uint32_t rest = w->crank_rest_sum / ANALOG_CRANK_PRE;
            uint32_t drop = rest > 1750u ? 150u : 75u; /* 1.5 V / 0.75 V */
            if(rest > 600u && (uint32_t)cv + drop < rest) {
                w->crank_state = CrankStateRecording;
                w->crank_stop = w->crank_total - 1u + ANALOG_CRANK_LEN - ANALOG_CRANK_PRE;
            }
        }
    } else if(w->crank_state == CrankStateRecording) {
        if(w->crank_total >= w->crank_stop) {
            crank_rotate(w->crank_buf, ANALOG_CRANK_LEN, w->crank_w);
            w->crank_state = CrankStateDone;
        }
    }
}

static int32_t analog_thread(void* ctx) {
    AnalogWorker* w = ctx;

    for(size_t i = 0; i < AnalogChCount; i++) {
        furi_hal_gpio_init(analog_inputs[i].pin, GpioModeAnalog, GpioPullNo, GpioSpeedLow);
    }
    FuriHalAdcHandle* adc = furi_hal_adc_acquire();
    furi_hal_adc_configure_ex(
        adc,
        FuriHalAdcScale2500,
        FuriHalAdcClockSync64,
        FuriHalAdcOversample16,
        FuriHalAdcSamplingtime47_5);

    float acc[AnalogChCount] = {0};
    uint32_t acc_n = 0;
    float smooth_buf[AnalogChCount][SMOOTH] = {{0}};
    uint8_t smooth_pos = 0;
    uint8_t smooth_fill = 0;
    uint8_t decim = 0;
    uint32_t window_start = furi_get_tick();

    while(true) {
        float mv[AnalogChCount];
        for(size_t i = 0; i < AnalogChCount; i++) {
            uint16_t raw = furi_hal_adc_read(adc, analog_inputs[i].channel);
            mv[i] = furi_hal_adc_convert_to_voltage(adc, raw) * analog_inputs[i].divider;
            acc[i] += mv[i];
            smooth_buf[i][smooth_pos] = mv[i];
        }
        acc_n++;
        smooth_pos = (uint8_t)((smooth_pos + 1u) % SMOOTH);
        if(smooth_fill < SMOOTH) smooth_fill++;

        furi_mutex_acquire(w->mutex, FuriWaitForever);
        if(smooth_fill == SMOOTH) {
            for(size_t i = 0; i < AnalogChCount; i++) {
                float s = 0.0f;
                for(size_t k = 0; k < SMOOTH; k++) s += smooth_buf[i][k];
                s /= (float)SMOOTH;
                if(!w->minmax_valid) {
                    w->snap.min_mv[i] = s;
                    w->snap.max_mv[i] = s;
                } else {
                    if(s < w->snap.min_mv[i]) w->snap.min_mv[i] = s;
                    if(s > w->snap.max_mv[i]) w->snap.max_mv[i] = s;
                }
            }
            w->minmax_valid = true;
        }

        if(w->crank_state == CrankStateArmed || w->crank_state == CrankStateRecording) {
            if(++decim >= 1000u / ANALOG_CRANK_RATE) {
                decim = 0;
                crank_sample(w, mv[AnalogChBattery] / 1000.0f);
            }
        }

        uint32_t now = furi_get_tick();
        if(now - window_start >= ANALOG_WINDOW_MS && acc_n > 0) {
            for(size_t i = 0; i < AnalogChCount; i++) {
                float avg = acc[i] / (float)acc_n;
                w->snap.mv[i] = avg;
                w->history[i][w->hist_pos] = avg;
                acc[i] = 0.0f;
            }
            w->hist_pos = (w->hist_pos + 1u) % ANALOG_HISTORY;
            if(w->hist_count < ANALOG_HISTORY) w->hist_count++;
            w->snap.windows++;
            if(w->log && w->log_cb) w->log_cb(w->snap.mv, now - w->log_t0, w->log, w->log_ctx);
            acc_n = 0;
            window_start = now;
        }
        furi_mutex_release(w->mutex);

        /* ~1 kHz: cekani do dalsiho ticku jadra, zaroven kontrola konce */
        uint32_t flags = furi_thread_flags_wait(FLAG_STOP, FuriFlagWaitAny, 1);
        if(!(flags & FuriFlagError) && (flags & FLAG_STOP)) break;
    }

    furi_hal_adc_release(adc);
    for(size_t i = 0; i < AnalogChCount; i++) {
        furi_hal_gpio_init(analog_inputs[i].pin, GpioModeAnalog, GpioPullNo, GpioSpeedLow);
    }
    return 0;
}

AnalogWorker* analog_worker_alloc(void) {
    AnalogWorker* w = malloc(sizeof(AnalogWorker));
    memset(w, 0, sizeof(AnalogWorker));
    w->mutex = furi_mutex_alloc(FuriMutexTypeNormal);
    return w;
}

void analog_worker_free(AnalogWorker* w) {
    analog_worker_stop(w);
    furi_mutex_free(w->mutex);
    free(w->crank_buf);
    free(w);
}

void analog_worker_start(AnalogWorker* w) {
    if(w->running) return;
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    memset(&w->snap, 0, sizeof(w->snap));
    w->minmax_valid = false;
    w->hist_pos = 0;
    w->hist_count = 0;
    w->crank_state = CrankStateIdle;
    furi_mutex_release(w->mutex);

    w->thread = furi_thread_alloc_ex("StrojDiagAdc", 2048, analog_thread, w);
    furi_thread_set_priority(w->thread, FuriThreadPriorityHigh);
    w->running = true;
    furi_thread_start(w->thread);
}

void analog_worker_stop(AnalogWorker* w) {
    if(!w->running) return;
    analog_worker_set_log(w, NULL, NULL, NULL);
    furi_thread_flags_set(furi_thread_get_id(w->thread), FLAG_STOP);
    furi_thread_join(w->thread);
    furi_thread_free(w->thread);
    w->thread = NULL;
    w->running = false;
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->crank_state = CrankStateIdle;
    free(w->crank_buf);
    w->crank_buf = NULL;
    furi_mutex_release(w->mutex);
}

void analog_worker_get(AnalogWorker* w, AnalogSnapshot* out) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    *out = w->snap;
    furi_mutex_release(w->mutex);
}

void analog_worker_reset_minmax(AnalogWorker* w) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->minmax_valid = false;
    furi_mutex_release(w->mutex);
}

size_t analog_worker_get_history(AnalogWorker* w, AnalogChannel ch, float* out, size_t max) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    size_t n = w->hist_count < max ? w->hist_count : max;
    size_t start = (w->hist_pos + ANALOG_HISTORY - n) % ANALOG_HISTORY;
    for(size_t i = 0; i < n; i++) out[i] = w->history[ch][(start + i) % ANALOG_HISTORY];
    furi_mutex_release(w->mutex);
    return n;
}

void analog_worker_set_log(AnalogWorker* w, SdLog* log, AnalogLogCallback cb, void* ctx) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->log = log;
    w->log_cb = cb;
    w->log_ctx = ctx;
    w->log_t0 = furi_get_tick();
    furi_mutex_release(w->mutex);
}

bool analog_worker_crank_arm(AnalogWorker* w, float battery_factor) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    if(!w->crank_buf) w->crank_buf = malloc(sizeof(uint16_t) * ANALOG_CRANK_LEN);
    memset(w->crank_buf, 0, sizeof(uint16_t) * ANALOG_CRANK_LEN);
    w->crank_w = 0;
    w->crank_total = 0;
    w->crank_stop = 0;
    w->crank_rest_sum = 0;
    w->crank_factor = battery_factor;
    w->crank_state = CrankStateArmed;
    furi_mutex_release(w->mutex);
    return true;
}

CrankState analog_worker_crank_state(AnalogWorker* w) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    CrankState s = w->crank_state;
    furi_mutex_release(w->mutex);
    return s;
}

const uint16_t* analog_worker_crank_data(AnalogWorker* w, size_t* count) {
    if(analog_worker_crank_state(w) != CrankStateDone) {
        if(count) *count = 0;
        return NULL;
    }
    if(count) *count = ANALOG_CRANK_LEN;
    return w->crank_buf;
}

void analog_worker_crank_reset(AnalogWorker* w) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->crank_state = CrankStateIdle;
    furi_mutex_release(w->mutex);
}
