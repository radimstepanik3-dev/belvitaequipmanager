#include "j1939.h"

#include <string.h>

/* Definice zivych dat podle SAE J1939-71. Bajty jsou cislovane od 0
 * (v norme od 1). Tlaky jsou prepoctene rovnou na bar. */
static const J1939ParamDef j1939_params[J1939ParamCount] = {
    [J1939ParamEngineSpeed] = {61444, 190, 3, 2, 0.125f, 0.0f, "Otacky", "rpm", 0},
    [J1939ParamEngineLoad] = {61443, 92, 2, 1, 1.0f, 0.0f, "Zatizeni", "%", 0},
    [J1939ParamActualTorque] = {61444, 513, 2, 1, 1.0f, -125.0f, "Moment", "%", 0},
    [J1939ParamPedal] = {61443, 91, 1, 1, 0.4f, 0.0f, "Plyn pedal", "%", 0},
    [J1939ParamCoolantTemp] = {65262, 110, 0, 1, 1.0f, -40.0f, "Chladivo T", "C", 0},
    [J1939ParamOilPressure] = {65263, 100, 3, 1, 0.04f, 0.0f, "Olej tlak", "bar", 1},
    [J1939ParamOilTemp] = {65262, 175, 2, 2, 0.03125f, -273.0f, "Olej T", "C", 0},
    [J1939ParamFuelTemp] = {65262, 174, 1, 1, 1.0f, -40.0f, "Palivo T", "C", 0},
    [J1939ParamFuelPressure] = {65263, 94, 0, 1, 0.04f, 0.0f, "Palivo tlak", "bar", 1},
    [J1939ParamRailPressure] = {65243, 157, 2, 2, 0.0390625f, 0.0f, "Rail tlak", "bar", 0},
    [J1939ParamBoost] = {65270, 102, 1, 1, 0.02f, 0.0f, "Plnici tlak", "bar", 2},
    [J1939ParamIntakeTemp] = {65270, 105, 2, 1, 1.0f, -40.0f, "Sani T", "C", 0},
    [J1939ParamAirFilterDp] = {65270, 107, 4, 1, 0.05f, 0.0f, "Vzd.filtr dP", "kPa", 2},
    [J1939ParamExhaustTemp] = {65270, 173, 5, 2, 0.03125f, -273.0f, "Vyfuk T", "C", 0},
    [J1939ParamAmbientTemp] = {65269, 171, 3, 2, 0.03125f, -273.0f, "Okoli T", "C", 0},
    [J1939ParamBarometric] = {65269, 108, 0, 1, 0.5f, 0.0f, "Barometr", "kPa", 0},
    [J1939ParamBattery] = {65271, 168, 4, 2, 0.05f, 0.0f, "Baterie", "V", 1},
    [J1939ParamCharging] = {65271, 167, 2, 2, 0.05f, 0.0f, "Dobijeni", "V", 1},
    [J1939ParamFuelRate] = {65266, 183, 0, 2, 0.05f, 0.0f, "Spotreba", "l/h", 1},
    [J1939ParamFuelLevel] = {65276, 96, 1, 1, 0.4f, 0.0f, "Palivo hlad.", "%", 0},
    [J1939ParamCoolantLevel] = {65263, 111, 7, 1, 0.4f, 0.0f, "Chladivo hl.", "%", 0},
    [J1939ParamOilLevel] = {65263, 98, 2, 1, 0.4f, 0.0f, "Olej hlad.", "%", 0},
    [J1939ParamHydraulicTemp] = {65128, 1638, 0, 1, 1.0f, -40.0f, "Hydr.olej T", "C", 0},
    [J1939ParamTransOilTemp] = {65272, 177, 4, 2, 0.03125f, -273.0f, "Prevod. T", "C", 0},
    [J1939ParamTransOilPressure] = {65272, 127, 3, 1, 0.16f, 0.0f, "Prevod.tlak", "bar", 1},
    [J1939ParamCurrentGear] = {61445, 523, 3, 1, 1.0f, -125.0f, "Rychl.stupen", "", 0},
    [J1939ParamSpeed] = {65265, 84, 1, 2, 0.00390625f, 0.0f, "Rychlost", "km/h", 1},
    [J1939ParamDefLevel] = {65110, 1761, 0, 1, 0.4f, 0.0f, "AdBlue", "%", 0},
    [J1939ParamDpfSoot] = {64891, 3719, 0, 1, 1.0f, 0.0f, "DPF saze", "%", 0},
    [J1939ParamEngineHours] = {65253, 247, 0, 4, 0.05f, 0.0f, "Motohodiny", "h", 1},
};

const J1939ParamDef* j1939_param_def(J1939ParamId id) {
    if((unsigned)id >= J1939ParamCount) return NULL;
    return &j1939_params[id];
}

uint32_t j1939_make_id(uint8_t priority, uint32_t pgn, uint8_t da, uint8_t sa) {
    uint32_t id = ((uint32_t)(priority & 0x7u) << 26) | ((pgn & 0x3FFFFu) << 8) | sa;
    uint8_t pf = (uint8_t)((pgn >> 8) & 0xFFu);
    if(pf < 240u) {
        id = (id & ~0xFF00u) | ((uint32_t)da << 8);
    }
    return id;
}

void j1939_build_request(CanFrame* out, uint32_t requested_pgn, uint8_t da, uint8_t sa) {
    memset(out, 0, sizeof(*out));
    out->id = j1939_make_id(6, J1939_PGN_REQUEST, da, sa);
    out->ext = true;
    out->dlc = 3;
    out->data[0] = (uint8_t)(requested_pgn & 0xFFu);
    out->data[1] = (uint8_t)((requested_pgn >> 8) & 0xFFu);
    out->data[2] = (uint8_t)((requested_pgn >> 16) & 0xFFu);
}

bool j1939_decode_param(const J1939ParamDef* def, const uint8_t* data, uint8_t dlc, float* out) {
    if(!def || !data || !out) return false;
    if((unsigned)def->start + def->len > dlc) return false;

    uint32_t raw = 0;
    for(uint8_t i = 0; i < def->len; i++) {
        raw |= (uint32_t)data[def->start + i] << (8u * i);
    }

    /* Rozsahy platnych hodnot dle J1939-71 (vyssi = chyba / nedostupne). */
    switch(def->len) {
    case 1:
        if(raw > 0xFAu) return false;
        break;
    case 2:
        if(raw > 0xFAFFu) return false;
        break;
    case 4:
        if(raw > 0xFAFFFFFFu) return false;
        break;
    default:
        return false;
    }

    *out = (float)raw * def->scale + def->offset;
    return true;
}

/* ---------------- DTC ---------------- */

static J1939DtcSource* dtc_source_slot(J1939DtcTable* table, uint8_t sa) {
    J1939DtcSource* free_slot = NULL;
    J1939DtcSource* oldest = &table->src[0];
    for(size_t i = 0; i < J1939_MAX_SOURCES; i++) {
        J1939DtcSource* s = &table->src[i];
        if(s->used && s->sa == sa) return s;
        if(!s->used && !free_slot) free_slot = s;
        if(s->tick < oldest->tick) oldest = s;
    }
    J1939DtcSource* slot = free_slot ? free_slot : oldest;
    memset(slot, 0, sizeof(*slot));
    slot->used = true;
    slot->sa = sa;
    return slot;
}

uint8_t j1939_parse_dm(J1939DtcTable* table, uint8_t sa, const uint8_t* data, uint16_t len, uint32_t now) {
    if(!table || !data || len < 2) return 0;

    J1939DtcSource* src = dtc_source_slot(table, sa);
    J1939Dtc list[J1939_MAX_DTC_PER_SA];
    uint8_t count = 0;

    for(uint16_t off = 2; (uint16_t)(off + 4) <= len && count < J1939_MAX_DTC_PER_SA; off += 4) {
        uint32_t spn = (uint32_t)data[off] | ((uint32_t)data[off + 1] << 8) |
                       ((uint32_t)(data[off + 2] & 0xE0u) << 11);
        uint8_t fmi = data[off + 2] & 0x1Fu;
        uint8_t oc = data[off + 3] & 0x7Fu;
        bool cm = (data[off + 3] & 0x80u) != 0;

        if(spn == 0 && fmi == 0) continue; /* "zadna chyba" */
        if(spn == 0x7FFFFu && fmi == 0x1Fu) continue; /* vypln 0xFF */

        list[count].spn = spn;
        list[count].fmi = fmi;
        list[count].oc = oc;
        list[count].cm = cm;
        count++;
    }

    bool changed = (src->count != count) || (src->lamp != data[0]) ||
                   (memcmp(src->dtc, list, sizeof(J1939Dtc) * count) != 0);

    src->lamp = data[0];
    src->flash = data[1];
    src->tick = now ? now : 1;
    src->count = count;
    memcpy(src->dtc, list, sizeof(J1939Dtc) * count);

    if(changed) table->updates++;
    return count;
}

uint16_t j1939_dtc_total(const J1939DtcTable* table) {
    uint16_t total = 0;
    for(size_t i = 0; i < J1939_MAX_SOURCES; i++) {
        if(table->src[i].used) total += table->src[i].count;
    }
    return total;
}

bool j1939_dtc_get(
    const J1939DtcTable* table,
    uint16_t index,
    const J1939DtcSource** src_out,
    const J1939Dtc** dtc_out) {
    for(size_t i = 0; i < J1939_MAX_SOURCES; i++) {
        const J1939DtcSource* s = &table->src[i];
        if(!s->used) continue;
        if(index < s->count) {
            if(src_out) *src_out = s;
            if(dtc_out) *dtc_out = &s->dtc[index];
            return true;
        }
        index -= s->count;
    }
    return false;
}

uint8_t j1939_dtc_lamps(const J1939DtcTable* table) {
    static const uint8_t positions[] = {6, 4, 2, 0};
    uint8_t result = 0;
    for(size_t i = 0; i < J1939_MAX_SOURCES; i++) {
        const J1939DtcSource* s = &table->src[i];
        if(!s->used) continue;
        for(size_t p = 0; p < sizeof(positions); p++) {
            if(((s->lamp >> positions[p]) & 0x3u) == 1u) result |= (uint8_t)(1u << positions[p]);
        }
    }
    return result;
}

void j1939_dtc_clear(J1939DtcTable* table) {
    uint32_t updates = table->updates;
    memset(table, 0, sizeof(*table));
    table->updates = updates + 1;
}

/* ---------------- Identifikace ---------------- */

static void copy_id_text(char* dst, const uint8_t* src, uint16_t len) {
    size_t n = 0;
    for(uint16_t i = 0; i < len && n + 1 < J1939_ID_TEXT_LEN; i++) {
        uint8_t c = src[i];
        if(c == 0x00u || c == 0xFFu) break;
        dst[n++] = (c >= 0x20u && c < 0x7Fu) ? (char)c : '?';
    }
    while(n > 0 && (dst[n - 1] == '*' || dst[n - 1] == ' ')) n--;
    dst[n] = '\0';
}

/* ---------------- Zpracovani zprav ---------------- */

static void handle_message(J1939State* s, uint32_t pgn, uint8_t sa, const uint8_t* data, uint16_t len, uint32_t now) {
    switch(pgn) {
    case J1939_PGN_DM1:
        j1939_parse_dm(&s->dm1, sa, data, len, now);
        return;
    case J1939_PGN_DM2:
        j1939_parse_dm(&s->dm2, sa, data, len, now);
        return;
    case J1939_PGN_VIN:
        copy_id_text(s->vin, data, len);
        s->vin_sa = sa;
        s->id_updates++;
        return;
    case J1939_PGN_COMP_ID:
        copy_id_text(s->comp_id, data, len);
        s->comp_sa = sa;
        s->id_updates++;
        return;
    case J1939_PGN_SOFT_ID:
        /* bajt 0 = pocet poli, pak text oddeleny '*' */
        if(len > 1) {
            copy_id_text(s->soft_id, data + 1, (uint16_t)(len - 1));
            s->soft_sa = sa;
            s->id_updates++;
        }
        return;
    default:
        break;
    }

    if(len > 8) return;
    for(size_t i = 0; i < J1939ParamCount; i++) {
        const J1939ParamDef* def = &j1939_params[i];
        if(def->pgn != pgn) continue;
        float v;
        if(j1939_decode_param(def, data, (uint8_t)len, &v)) {
            s->params[i].value = v;
            s->params[i].tick = now ? now : 1;
            s->params[i].sa = sa;
        }
    }
}

static J1939TpSession* tp_find(J1939State* s, uint8_t sa, uint8_t da) {
    for(size_t i = 0; i < J1939_TP_SESSIONS; i++) {
        J1939TpSession* t = &s->tp[i];
        if(t->active && t->sa == sa && t->da == da) return t;
    }
    return NULL;
}

static J1939TpSession* tp_alloc(J1939State* s, uint8_t sa, uint8_t da) {
    J1939TpSession* t = tp_find(s, sa, da);
    if(!t) {
        J1939TpSession* oldest = &s->tp[0];
        for(size_t i = 0; i < J1939_TP_SESSIONS; i++) {
            if(!s->tp[i].active) {
                t = &s->tp[i];
                break;
            }
            if(s->tp[i].tick < oldest->tick) oldest = &s->tp[i];
        }
        if(!t) t = oldest;
    }
    memset(t, 0, sizeof(*t));
    t->sa = sa;
    t->da = da;
    return t;
}

static void tp_process_cm(J1939State* s, uint8_t sa, uint8_t da, const uint8_t* d, uint8_t dlc, uint32_t now) {
    if(dlc < 8) return;
    uint8_t control = d[0];
    if(control == 32u || control == 16u) { /* BAM nebo RTS */
        uint16_t size = (uint16_t)(d[1] | (d[2] << 8));
        uint8_t packets = d[3];
        if(size < 9 || packets == 0) return;
        J1939TpSession* t = tp_alloc(s, sa, control == 32u ? J1939_SA_GLOBAL : da);
        t->active = true;
        t->size = size;
        t->packets = packets;
        t->pgn = (uint32_t)d[5] | ((uint32_t)d[6] << 8) | ((uint32_t)d[7] << 16);
        t->tick = now ? now : 1;
    } else if(control == 255u) { /* Abort – muze poslat kterakoli strana */
        J1939TpSession* t = tp_find(s, sa, da);
        if(!t) t = tp_find(s, da, sa);
        if(t) t->active = false;
    }
}

static void tp_process_dt(J1939State* s, uint8_t sa, uint8_t da, const uint8_t* d, uint8_t dlc, uint32_t now) {
    if(dlc < 2) return;
    J1939TpSession* t = tp_find(s, sa, da);
    if(!t) return;
    uint8_t seq = d[0];
    if(seq == 0 || seq > t->packets) return;

    uint8_t bit = (uint8_t)(1u << (seq & 7u));
    if(t->seen[seq >> 3] & bit) return; /* duplicita (opakovane vysilani po CTS) */
    t->seen[seq >> 3] |= bit;
    t->received++;
    t->tick = now ? now : 1;

    uint32_t offset = (uint32_t)(seq - 1u) * 7u;
    for(uint8_t i = 1; i < dlc && i < 8; i++) {
        uint32_t pos = offset + (i - 1u);
        if(pos < J1939_TP_MAX_BYTES && pos < t->size) t->data[pos] = d[i];
    }

    if(t->received >= t->packets) {
        uint16_t len = t->size > J1939_TP_MAX_BYTES ? J1939_TP_MAX_BYTES : t->size;
        t->active = false;
        handle_message(s, t->pgn, t->sa, t->data, len, now);
    }
}

void j1939_state_init(J1939State* s) {
    memset(s, 0, sizeof(*s));
}

void j1939_process(J1939State* s, const CanFrame* f, uint32_t now_ms) {
    if(!f->ext || f->rtr) return;

    uint8_t sa = j1939_sa(f->id);
    uint8_t da = j1939_da(f->id);
    uint32_t pgn = j1939_pgn(f->id);
    uint8_t dlc = f->dlc > 8 ? 8 : f->dlc;

    s->sa_seen[sa >> 3] |= (uint8_t)(1u << (sa & 7u));
    s->frames_j1939++;

    if(pgn == J1939_PGN_TP_CM) {
        tp_process_cm(s, sa, da, f->data, dlc, now_ms);
    } else if(pgn == J1939_PGN_TP_DT) {
        tp_process_dt(s, sa, da, f->data, dlc, now_ms);
    } else {
        handle_message(s, pgn, sa, f->data, dlc, now_ms);
    }
}

void j1939_expire(J1939State* s, uint32_t now_ms) {
    /* DM1 se vysila 1x za sekundu – kdyz 5 s nic neprislo, ECU je vypnuta. */
    for(size_t i = 0; i < J1939_MAX_SOURCES; i++) {
        J1939DtcSource* src = &s->dm1.src[i];
        if(src->used && (now_ms - src->tick) > 5000u) {
            src->used = false;
            s->dm1.updates++;
        }
    }
    for(size_t i = 0; i < J1939_TP_SESSIONS; i++) {
        J1939TpSession* t = &s->tp[i];
        if(t->active && (now_ms - t->tick) > 2000u) t->active = false;
    }
}

bool j1939_param_fresh(const J1939State* s, J1939ParamId id, uint32_t now_ms, uint32_t max_age_ms) {
    if((unsigned)id >= J1939ParamCount) return false;
    const J1939ParamValue* v = &s->params[id];
    return v->tick != 0 && (now_ms - v->tick) <= max_age_ms;
}

uint16_t j1939_sa_count(const J1939State* s) {
    uint16_t n = 0;
    for(size_t i = 0; i < sizeof(s->sa_seen); i++) {
        uint8_t b = s->sa_seen[i];
        while(b) {
            n += b & 1u;
            b >>= 1;
        }
    }
    return n;
}
