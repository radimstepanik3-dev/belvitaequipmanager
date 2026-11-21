#include "ds18b20.h"

#include <furi.h>
#include <furi_hal.h>
#include <one_wire/maxim_crc.h>
#include <one_wire/one_wire_host.h>

#define CMD_SKIP_ROM        0xCCu
#define CMD_CONVERT         0x44u
#define CMD_READ_SCRATCHPAD 0xBEu
#define FLAG_STOP           (1u << 0)
#define CONVERSION_MS       800u /* 12 bitu = max 750 ms */

struct Ds18b20 {
    OneWireHost* bus;
    FuriThread* thread;
    FuriMutex* mutex;
    bool running;
    bool valid;
    float celsius;
};

static bool ds18b20_convert(Ds18b20* s) {
    /* 1-Wire casovani nesmi prerusit jine preruseni. */
    FURI_CRITICAL_ENTER();
    bool ok = onewire_host_reset(s->bus);
    if(ok) {
        onewire_host_write(s->bus, CMD_SKIP_ROM);
        onewire_host_write(s->bus, CMD_CONVERT);
    }
    FURI_CRITICAL_EXIT();
    return ok;
}

static bool ds18b20_read(Ds18b20* s, float* out) {
    uint8_t buf[9];
    bool ok = false;
    for(uint8_t attempt = 0; attempt < 3 && !ok; attempt++) {
        FURI_CRITICAL_ENTER();
        bool present = onewire_host_reset(s->bus);
        if(present) {
            onewire_host_write(s->bus, CMD_SKIP_ROM);
            onewire_host_write(s->bus, CMD_READ_SCRATCHPAD);
            onewire_host_read_bytes(s->bus, buf, sizeof(buf));
        }
        FURI_CRITICAL_EXIT();
        if(!present) return false;
        ok = maxim_crc8(buf, 8, MAXIM_CRC8_INIT) == buf[8];
    }
    if(!ok) return false;

    int16_t raw = (int16_t)((uint16_t)buf[0] | ((uint16_t)buf[1] << 8));
    /* 0x0550 = 85.0 C je hodnota po zapnuti - pri prvnim cteni ji ignorujeme. */
    if(raw == 0x0550 && !s->valid) return false;
    *out = (float)raw / 16.0f;
    return true;
}

static int32_t ds18b20_thread(void* ctx) {
    Ds18b20* s = ctx;
    while(true) {
        bool present = ds18b20_convert(s);
        uint32_t flags = furi_thread_flags_wait(FLAG_STOP, FuriFlagWaitAny, CONVERSION_MS);
        if(!(flags & FuriFlagError) && (flags & FLAG_STOP)) break;

        float t = 0.0f;
        bool ok = present && ds18b20_read(s, &t);
        furi_mutex_acquire(s->mutex, FuriWaitForever);
        s->valid = ok;
        if(ok) s->celsius = t;
        furi_mutex_release(s->mutex);

        flags = furi_thread_flags_wait(FLAG_STOP, FuriFlagWaitAny, 200);
        if(!(flags & FuriFlagError) && (flags & FLAG_STOP)) break;
    }
    return 0;
}

Ds18b20* ds18b20_alloc(void) {
    Ds18b20* s = malloc(sizeof(Ds18b20));
    memset(s, 0, sizeof(Ds18b20));
    s->mutex = furi_mutex_alloc(FuriMutexTypeNormal);
    s->bus = onewire_host_alloc(&gpio_ibutton);
    return s;
}

void ds18b20_free(Ds18b20* s) {
    ds18b20_stop(s);
    onewire_host_free(s->bus);
    furi_mutex_free(s->mutex);
    free(s);
}

void ds18b20_start(Ds18b20* s) {
    if(s->running) return;
    s->valid = false;
    onewire_host_start(s->bus);
    s->thread = furi_thread_alloc_ex("StrojDiagTemp", 1024, ds18b20_thread, s);
    s->running = true;
    furi_thread_start(s->thread);
}

void ds18b20_stop(Ds18b20* s) {
    if(!s->running) return;
    furi_thread_flags_set(furi_thread_get_id(s->thread), FLAG_STOP);
    furi_thread_join(s->thread);
    furi_thread_free(s->thread);
    s->thread = NULL;
    onewire_host_stop(s->bus);
    s->running = false;
}

bool ds18b20_get(Ds18b20* s, float* celsius) {
    furi_mutex_acquire(s->mutex, FuriWaitForever);
    bool ok = s->valid;
    if(ok && celsius) *celsius = s->celsius;
    furi_mutex_release(s->mutex);
    return ok;
}
