#include "sd_log.h"

#include <datetime/datetime.h>
#include <furi_hal_rtc.h>
#include <storage/storage.h>

#define LOG_DIR       APP_DATA_PATH("logs")
#define CHUNK_SIZE    512u
#define FLAG_STOP     (1u << 0)

struct SdLog {
    Storage* storage;
    File* file;
    FuriStreamBuffer* stream;
    FuriThread* thread;
    FuriString* name;
    volatile bool open;
    volatile uint32_t bytes;
    volatile uint32_t drops;
    uint32_t start_time;
};

SdLog* sd_log_alloc(void) {
    SdLog* log = malloc(sizeof(SdLog));
    memset(log, 0, sizeof(SdLog));
    log->storage = furi_record_open(RECORD_STORAGE);
    log->name = furi_string_alloc();
    return log;
}

void sd_log_free(SdLog* log) {
    sd_log_close(log);
    furi_string_free(log->name);
    furi_record_close(RECORD_STORAGE);
    free(log);
}

static int32_t sd_log_thread(void* ctx) {
    SdLog* log = ctx;
    uint8_t* chunk = malloc(CHUNK_SIZE);
    bool stopping = false;

    while(true) {
        size_t n = furi_stream_buffer_receive(log->stream, chunk, CHUNK_SIZE, 100);
        if(n > 0) {
            size_t written = storage_file_write(log->file, chunk, n);
            log->bytes += written;
            if(written != n) log->drops++;
            continue; /* nejdriv vyprazdnit buffer */
        }
        if(stopping) break;
        uint32_t flags = furi_thread_flags_get();
        if(flags & FLAG_STOP) {
            furi_thread_flags_clear(FLAG_STOP);
            stopping = true; /* jeste jedno kolo na doplneni zbytku */
        }
    }

    free(chunk);
    return 0;
}

bool sd_log_open(SdLog* log, const char* prefix, const char* ext, const char* header, size_t buffer_size) {
    sd_log_close(log);

    DateTime dt;
    furi_hal_rtc_get_datetime(&dt);
    log->start_time = datetime_datetime_to_timestamp(&dt);
    furi_string_printf(
        log->name,
        "%s_%04u%02u%02u_%02u%02u%02u.%s",
        prefix,
        dt.year,
        dt.month,
        dt.day,
        dt.hour,
        dt.minute,
        dt.second,
        ext);

    storage_simply_mkdir(log->storage, LOG_DIR);
    FuriString* path = furi_string_alloc_printf("%s/%s", LOG_DIR, furi_string_get_cstr(log->name));

    log->file = storage_file_alloc(log->storage);
    bool ok = storage_file_open(log->file, furi_string_get_cstr(path), FSAM_WRITE, FSOM_CREATE_ALWAYS);
    furi_string_free(path);
    if(!ok) {
        storage_file_free(log->file);
        log->file = NULL;
        return false;
    }

    log->bytes = 0;
    log->drops = 0;
    if(header) {
        size_t len = strlen(header);
        log->bytes += storage_file_write(log->file, header, len);
    }

    log->stream = furi_stream_buffer_alloc(buffer_size, 1);
    log->thread = furi_thread_alloc_ex("StrojDiagLog", 2048, sd_log_thread, log);
    log->open = true;
    furi_thread_start(log->thread);
    return true;
}

bool sd_log_write(SdLog* log, const char* data, size_t len) {
    if(!log->open) return false;
    /* Jediny producent -> kontrola mista a zapis jsou bezpecne za sebou. */
    if(furi_stream_buffer_spaces_available(log->stream) < len) {
        log->drops++;
        return false;
    }
    furi_stream_buffer_send(log->stream, data, len, 0);
    return true;
}

void sd_log_close(SdLog* log) {
    if(!log->open) return;
    log->open = false;
    furi_thread_flags_set(furi_thread_get_id(log->thread), FLAG_STOP);
    furi_thread_join(log->thread);
    furi_thread_free(log->thread);
    log->thread = NULL;
    furi_stream_buffer_free(log->stream);
    log->stream = NULL;
    storage_file_close(log->file);
    storage_file_free(log->file);
    log->file = NULL;
}

bool sd_log_is_open(SdLog* log) {
    return log->open;
}

uint32_t sd_log_bytes(SdLog* log) {
    return log->bytes;
}

uint32_t sd_log_drops(SdLog* log) {
    return log->drops;
}

const char* sd_log_name(SdLog* log) {
    return furi_string_get_cstr(log->name);
}

uint32_t sd_log_start_time(SdLog* log) {
    return log->start_time;
}
