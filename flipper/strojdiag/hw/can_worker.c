#include "can_worker.h"

#include <furi.h>
#include <furi_hal.h>
#include <stdio.h>

#define FLAG_IRQ  (1u << 0)
#define FLAG_STOP (1u << 1)
#define FLAG_TX   (1u << 2)

#define CAN_INT_PIN (&gpio_ext_pb2)

struct CanWorker {
    FuriThread* thread;
    FuriMutex* mutex;
    FuriMessageQueue* tx_queue;
    J1939State* j1939;
    CanIdEntry ids[CAN_WORKER_MAX_IDS];
    uint16_t id_count;
    CanWorkerStats stats;
    SdLog* log;
    uint32_t log_tick0;
    uint32_t log_time0;
};

static void can_worker_isr(void* ctx) {
    CanWorker* w = ctx;
    furi_thread_flags_set(furi_thread_get_id(w->thread), FLAG_IRQ);
}

/* Binarni hledani v serazene tabulce ID. Vraci index nebo misto pro vlozeni. */
static size_t id_find(const CanWorker* w, uint32_t key, bool* found) {
    size_t lo = 0;
    size_t hi = w->id_count;
    while(lo < hi) {
        size_t mid = (lo + hi) / 2;
        uint32_t mk = w->ids[mid].id | (w->ids[mid].ext ? 0x80000000u : 0u);
        if(mk == key) {
            *found = true;
            return mid;
        }
        if(mk < key) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    *found = false;
    return lo;
}

static void id_update(CanWorker* w, const CanFrame* f) {
    uint32_t key = f->id | (f->ext ? 0x80000000u : 0u);
    bool found;
    size_t idx = id_find(w, key, &found);
    if(!found) {
        if(w->id_count >= CAN_WORKER_MAX_IDS) return;
        memmove(&w->ids[idx + 1], &w->ids[idx], sizeof(CanIdEntry) * (w->id_count - idx));
        memset(&w->ids[idx], 0, sizeof(CanIdEntry));
        w->ids[idx].id = f->id;
        w->ids[idx].ext = f->ext;
        w->id_count++;
    }
    CanIdEntry* e = &w->ids[idx];
    e->dlc = f->dlc;
    memcpy(e->data, f->data, 8);
    e->count++;
}

static void log_frame(CanWorker* w, const CanFrame* f, uint32_t now) {
    char line[64];
    uint32_t elapsed = now - w->log_tick0;
    int len = snprintf(
        line,
        sizeof(line),
        f->ext ? "(%lu.%03lu000) can0 %08lX#" : "(%lu.%03lu000) can0 %03lX#",
        (unsigned long)(w->log_time0 + elapsed / 1000u),
        (unsigned long)(elapsed % 1000u),
        (unsigned long)f->id);
    if(len < 0) return;
    size_t pos = (size_t)len;
    static const char hex[] = "0123456789ABCDEF";
    if(f->rtr) {
        line[pos++] = 'R';
    } else {
        for(uint8_t i = 0; i < f->dlc && i < 8; i++) {
            line[pos++] = hex[f->data[i] >> 4];
            line[pos++] = hex[f->data[i] & 0x0F];
        }
    }
    line[pos++] = '\n';
    sd_log_write(w->log, line, pos);
}

static int32_t can_worker_thread(void* ctx) {
    CanWorker* w = ctx;
    CanFrame frames[2];
    uint32_t last_status = furi_get_tick();
    uint32_t last_second = last_status;
    uint32_t frames_at_second = 0;

    while(true) {
        uint32_t flags =
            furi_thread_flags_wait(FLAG_IRQ | FLAG_STOP | FLAG_TX, FuriFlagWaitAny, 1);
        if(flags & FuriFlagError) flags = 0; /* timeout -> jen kontrola (kdyby INT nebyl zapojen) */
        if(flags & FLAG_STOP) break;

        /* Vycist vse, co je v radici (2 buffery). */
        for(uint8_t guard = 0; guard < 64; guard++) {
            uint8_t n = mcp2515_read_frames(frames, 2);
            if(n == 0) break;
            uint32_t now = furi_get_tick();
            furi_mutex_acquire(w->mutex, FuriWaitForever);
            for(uint8_t i = 0; i < n; i++) {
                w->stats.frames++;
                id_update(w, &frames[i]);
                j1939_process(w->j1939, &frames[i], now);
                if(w->log) log_frame(w, &frames[i], now);
            }
            furi_mutex_release(w->mutex);
        }

        CanFrame tx;
        while(furi_message_queue_get(w->tx_queue, &tx, 0) == FuriStatusOk) {
            bool ok = mcp2515_send(&tx, 50);
            furi_mutex_acquire(w->mutex, FuriWaitForever);
            if(ok) {
                w->stats.tx_ok++;
            } else {
                w->stats.tx_fail++;
            }
            furi_mutex_release(w->mutex);
        }

        uint32_t now = furi_get_tick();
        if(now - last_status >= 200u) {
            last_status = now;
            Mcp2515Status st;
            mcp2515_get_status(&st);
            uint8_t eflg = mcp2515_clear_errors();
            furi_mutex_acquire(w->mutex, FuriWaitForever);
            if(eflg & (MCP2515_EFLG_RX0OVR | MCP2515_EFLG_RX1OVR)) w->stats.overflows++;
            w->stats.eflg = st.eflg;
            w->stats.tec = st.tec;
            w->stats.rec = st.rec;
            furi_mutex_release(w->mutex);
        }
        if(now - last_second >= 1000u) {
            last_second = now;
            furi_mutex_acquire(w->mutex, FuriWaitForever);
            w->stats.fps = w->stats.frames - frames_at_second;
            frames_at_second = w->stats.frames;
            for(size_t i = 0; i < w->id_count; i++) {
                uint32_t diff = w->ids[i].count - w->ids[i].prev_count;
                w->ids[i].rate = diff > 0xFFFFu ? 0xFFFFu : (uint16_t)diff;
                w->ids[i].prev_count = w->ids[i].count;
            }
            j1939_expire(w->j1939, now);
            furi_mutex_release(w->mutex);
        }
    }
    return 0;
}

CanWorker* can_worker_alloc(void) {
    CanWorker* w = malloc(sizeof(CanWorker));
    memset(w, 0, sizeof(CanWorker));
    w->mutex = furi_mutex_alloc(FuriMutexTypeNormal);
    w->tx_queue = furi_message_queue_alloc(8, sizeof(CanFrame));
    w->j1939 = malloc(sizeof(J1939State));
    j1939_state_init(w->j1939);
    return w;
}

void can_worker_free(CanWorker* w) {
    can_worker_stop(w);
    furi_message_queue_free(w->tx_queue);
    furi_mutex_free(w->mutex);
    free(w->j1939);
    free(w);
}

Mcp2515Result can_worker_start(CanWorker* w, uint32_t fosc_hz, uint32_t bitrate, bool active) {
    if(w->stats.running) return Mcp2515ResultOk;

    Mcp2515Result res =
        mcp2515_init(fosc_hz, bitrate, active ? Mcp2515ModeNormal : Mcp2515ModeListenOnly);
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->stats.init_result = res;
    w->stats.bitrate = bitrate;
    w->stats.listen_only = !active;
    furi_mutex_release(w->mutex);
    if(res != Mcp2515ResultOk) return res;

    furi_message_queue_reset(w->tx_queue);
    w->thread = furi_thread_alloc_ex("StrojDiagCan", 2048, can_worker_thread, w);
    furi_thread_set_priority(w->thread, FuriThreadPriorityHigh);
    furi_thread_start(w->thread);

    /* Preruseni az po startu vlakna (ISR posila priznak vlaknu). */
    furi_hal_gpio_init(CAN_INT_PIN, GpioModeInterruptFall, GpioPullUp, GpioSpeedVeryHigh);
    furi_hal_gpio_add_int_callback(CAN_INT_PIN, can_worker_isr, w);

    w->stats.running = true;
    return Mcp2515ResultOk;
}

void can_worker_stop(CanWorker* w) {
    if(!w->stats.running) return;
    can_worker_set_log(w, NULL);

    furi_hal_gpio_remove_int_callback(CAN_INT_PIN);
    furi_hal_gpio_init(CAN_INT_PIN, GpioModeAnalog, GpioPullNo, GpioSpeedLow);

    furi_thread_flags_set(furi_thread_get_id(w->thread), FLAG_STOP);
    furi_thread_join(w->thread);
    furi_thread_free(w->thread);
    w->thread = NULL;

    mcp2515_deinit();
    w->stats.running = false;
}

bool can_worker_is_running(CanWorker* w) {
    return w->stats.running;
}

void can_worker_get_stats(CanWorker* w, CanWorkerStats* stats) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    *stats = w->stats;
    stats->id_count = w->id_count;
    furi_mutex_release(w->mutex);
}

const J1939State* can_worker_lock_j1939(CanWorker* w) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    return w->j1939;
}

void can_worker_unlock(CanWorker* w) {
    furi_mutex_release(w->mutex);
}

size_t can_worker_get_ids(CanWorker* w, CanIdEntry* out, size_t max, size_t offset) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    size_t n = 0;
    for(size_t i = offset; i < w->id_count && n < max; i++) out[n++] = w->ids[i];
    furi_mutex_release(w->mutex);
    return n;
}

void can_worker_reset(CanWorker* w) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->id_count = 0;
    w->stats.frames = 0;
    w->stats.overflows = 0;
    w->stats.tx_ok = 0;
    w->stats.tx_fail = 0;
    j1939_state_init(w->j1939);
    furi_mutex_release(w->mutex);
}

void can_worker_clear_dtc(CanWorker* w, bool history) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    j1939_dtc_clear(history ? &w->j1939->dm2 : &w->j1939->dm1);
    furi_mutex_release(w->mutex);
}

bool can_worker_send(CanWorker* w, const CanFrame* frame) {
    if(!w->stats.running || w->stats.listen_only) return false;
    if(furi_message_queue_put(w->tx_queue, frame, 0) != FuriStatusOk) return false;
    furi_thread_flags_set(furi_thread_get_id(w->thread), FLAG_TX);
    return true;
}

bool can_worker_request_pgn(CanWorker* w, uint32_t pgn) {
    CanFrame f;
    j1939_build_request(&f, pgn, J1939_SA_GLOBAL, J1939_SA_TOOL);
    return can_worker_send(w, &f);
}

void can_worker_set_log(CanWorker* w, SdLog* log) {
    furi_mutex_acquire(w->mutex, FuriWaitForever);
    w->log = log;
    if(log) {
        w->log_tick0 = furi_get_tick();
        w->log_time0 = sd_log_start_time(log);
    }
    furi_mutex_release(w->mutex);
}
