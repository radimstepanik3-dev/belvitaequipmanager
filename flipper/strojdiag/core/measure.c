#include "measure.h"

/* ---------------- Snimace tlaku ---------------- */

float measure_sensor_pressure(const SensorConfig* cfg, float input_mv, SensorStatus* status) {
    SensorStatus st = SensorStatusOk;
    float frac = 0.0f;

    switch(cfg->type) {
    case SensorType05_45V:
        /* Odpojeny vstup ukazuje 0 V (delic jde na GND), zkrat na 5 V ~5 V. */
        if(input_mv < 250.0f) {
            st = SensorStatusOpen;
        } else if(input_mv > 4800.0f) {
            st = SensorStatusShortHigh;
        }
        frac = (input_mv - 500.0f) / 4000.0f;
        break;
    case SensorType0_5V:
        if(input_mv > 4950.0f) st = SensorStatusShortHigh;
        frac = input_mv / 5000.0f;
        break;
    case SensorType4_20mA: {
        float ma = measure_loop_current_ma(input_mv);
        if(ma < 3.6f) {
            st = SensorStatusOpen;
        } else if(ma > 21.0f) {
            st = SensorStatusShortHigh;
        }
        frac = (ma - 4.0f) / 16.0f;
        break;
    }
    case SensorTypeOff:
    default:
        if(status) *status = SensorStatusOff;
        return 0.0f;
    }

    if(status) *status = st;
    return frac * cfg->range_bar - cfg->zero_bar;
}

float measure_pressure_convert(float bar, PressureUnit unit) {
    switch(unit) {
    case PressureUnitMpa:
        return bar * 0.1f;
    case PressureUnitPsi:
        return bar * 14.5038f;
    case PressureUnitBar:
    default:
        return bar;
    }
}

const char* measure_pressure_unit_name(PressureUnit unit) {
    switch(unit) {
    case PressureUnitMpa:
        return "MPa";
    case PressureUnitPsi:
        return "psi";
    case PressureUnitBar:
    default:
        return "bar";
    }
}

/* ---------------- Baterie ---------------- */

BatterySystem measure_battery_system(float volts) {
    if(volts < 6.0f) return BatterySystemUnknown;
    if(volts < 17.5f) return BatterySystem12V;
    return BatterySystem24V;
}

float measure_battery_per12(float volts, BatterySystem sys) {
    return sys == BatterySystem24V ? volts * 0.5f : volts;
}

BatteryState measure_battery_state(float volts, BatterySystem sys) {
    if(volts < 1.0f || sys == BatterySystemUnknown) return BatteryStateNone;
    float v = measure_battery_per12(volts, sys);
    if(v >= 14.9f) return BatteryStateOvercharge;
    if(v >= 13.6f) return BatteryStateCharging;
    if(v >= 13.0f) return BatteryStateUndercharge;
    if(v >= 12.0f) return BatteryStateRest;
    return BatteryStateDischarged;
}

int measure_battery_soc(float volts, BatterySystem sys) {
    if(sys == BatterySystemUnknown) return -1;
    float v = measure_battery_per12(volts, sys);
    if(v > 13.0f) return -1; /* povrchovy naboj / dobijeni – nelze odhadnout */
    /* Napeti naprazdno olovene baterie po >2 h klidu, 25 C. */
    static const float volt_pts[] = {11.9f, 12.1f, 12.3f, 12.5f, 12.7f};
    static const int soc_pts[] = {0, 25, 50, 75, 100};
    if(v <= volt_pts[0]) return 0;
    if(v >= volt_pts[4]) return 100;
    for(int i = 0; i < 4; i++) {
        if(v < volt_pts[i + 1]) {
            float t = (v - volt_pts[i]) / (volt_pts[i + 1] - volt_pts[i]);
            return soc_pts[i] + (int)(t * (float)(soc_pts[i + 1] - soc_pts[i]) + 0.5f);
        }
    }
    return 100;
}

const char* measure_battery_state_text(BatteryState state) {
    switch(state) {
    case BatteryStateDischarged:
        return "Vybita!";
    case BatteryStateRest:
        return "Klid";
    case BatteryStateCharging:
        return "Dobiji OK";
    case BatteryStateUndercharge:
        return "Slabe dobiji?";
    case BatteryStateOvercharge:
        return "PREBIJI!";
    case BatteryStateNone:
    default:
        return "Bez napeti";
    }
}

/* ---------------- Test startovani ---------------- */

void measure_crank_analyze(
    const uint16_t* samples_cv,
    size_t count,
    size_t pre_samples,
    uint32_t sample_rate_hz,
    BatterySystem force_sys,
    CrankResult* out) {
    CrankResult r = {0};
    if(!samples_cv || count == 0 || sample_rate_hz == 0) {
        *out = r;
        return;
    }
    if(pre_samples > count) pre_samples = count;

    /* Klidove napeti */
    uint32_t sum = 0;
    size_t n_rest = pre_samples ? pre_samples : 1;
    for(size_t i = 0; i < n_rest; i++) sum += samples_cv[i];
    r.rest_v = (float)sum / (float)n_rest / 100.0f;
    r.sys = force_sys != BatterySystemUnknown ? force_sys : measure_battery_system(r.rest_v);
    float k = r.sys == BatterySystem24V ? 2.0f : 1.0f;

    /* Minimum (vcetne spicky pri zaberu starteru) */
    uint16_t min_cv = 0xFFFF;
    size_t min_idx = 0;
    for(size_t i = pre_samples; i < count; i++) {
        if(samples_cv[i] < min_cv) {
            min_cv = samples_cv[i];
            min_idx = i;
        }
    }
    if(min_cv == 0xFFFF) {
        min_cv = samples_cv[0];
        min_idx = 0;
    }
    r.min_v = (float)min_cv / 100.0f;
    r.min_at_ms = (uint32_t)min_idx * 1000u / sample_rate_hz;

    /* Konec zaznamu (poslednich 100 ms) */
    size_t tail = sample_rate_hz / 10u;
    if(tail == 0) tail = 1;
    if(tail > count) tail = count;
    sum = 0;
    for(size_t i = count - tail; i < count; i++) sum += samples_cv[i];
    r.end_v = (float)sum / (float)tail / 100.0f;

    /* Oblast startovani = vzorky pod (klid - 0.5 V na 12 V) */
    uint16_t th_cv = (uint16_t)((r.rest_v - 0.5f * k) * 100.0f);
    size_t start = count;
    size_t end = 0;
    for(size_t i = pre_samples; i < count; i++) {
        if(samples_cv[i] < th_cv) {
            if(start == count) start = i;
            end = i;
        }
    }

    if(start == count || r.sys == BatterySystemUnknown) {
        r.verdict = r.sys == BatterySystemUnknown ? CrankVerdictNone : CrankVerdictNoCrank;
        *out = r;
        return;
    }

    r.crank_ms = (uint32_t)(end - start + 1u) * 1000u / sample_rate_hz;
    sum = 0;
    for(size_t i = start; i <= end; i++) sum += samples_cv[i];
    r.avg_crank_v = (float)sum / (float)(end - start + 1u) / 100.0f;

    /* Vyhladene minimum: 20ms klouzavy prumer, prvnich 50 ms (naraz proudu) se vynecha. */
    size_t win = sample_rate_hz / 50u;
    if(win == 0) win = 1;
    size_t from = start + sample_rate_hz / 20u;
    float min_smooth = r.avg_crank_v;
    if(from + win <= end + 1u) {
        uint32_t wsum = 0;
        for(size_t i = from; i < from + win; i++) wsum += samples_cv[i];
        min_smooth = (float)wsum / (float)win;
        for(size_t i = from + win; i <= end; i++) {
            wsum += samples_cv[i];
            wsum -= samples_cv[i - win];
            float avg = (float)wsum / (float)win;
            if(avg < min_smooth) min_smooth = avg;
        }
        min_smooth /= 100.0f;
    }

    r.min_crank_v = min_smooth;
    float per12 = min_smooth / k;
    if(per12 >= 9.6f) {
        r.verdict = CrankVerdictOk;
    } else if(per12 >= 8.5f) {
        r.verdict = CrankVerdictWeak;
    } else {
        r.verdict = CrankVerdictBad;
    }

    r.engine_started = (r.end_v / k) > 13.0f && r.end_v > r.rest_v + 0.3f * k;
    *out = r;
}

const char* measure_crank_verdict_text(CrankVerdict verdict) {
    switch(verdict) {
    case CrankVerdictOk:
        return "Baterie+starter OK";
    case CrankVerdictWeak:
        return "SLABA baterie/kabely";
    case CrankVerdictBad:
        return "SPATNE: baterie/starter";
    case CrankVerdictNoCrank:
        return "Startovani nezachyceno";
    case CrankVerdictNone:
    default:
        return "Bez napeti";
    }
}

/* ---------------- CAN casovani ---------------- */

bool measure_can_timing(uint32_t fosc_hz, uint32_t bitrate, CanTiming* out) {
    if(!fosc_hz || !bitrate || !out) return false;

    int best_brp = -1;
    uint32_t best_n = 0;
    for(uint32_t brp = 0; brp < 64; brp++) {
        uint32_t div = 2u * (brp + 1u) * bitrate;
        if(fosc_hz % div) continue;
        uint32_t n = fosc_hz / div;
        if(n < 8u || n > 25u) continue;
        if(n == 16u) {
            best_brp = (int)brp;
            best_n = n;
            break;
        }
        if(best_brp < 0 || n > best_n) {
            best_brp = (int)brp;
            best_n = n;
        }
    }
    if(best_brp < 0) return false;

    uint32_t n = best_n;
    uint32_t ps2 = (n + 4u) / 8u; /* ~12.5 % -> vzorkovani ~87.5 % */
    if(ps2 < 2u) ps2 = 2u;
    uint32_t rem = n - 1u - ps2;
    if(rem > 16u) {
        rem = 16u;
        ps2 = n - 1u - rem;
    }
    uint32_t ps1 = (rem + 1u) / 2u;
    if(ps1 > 8u) ps1 = 8u;
    uint32_t prop = rem - ps1;
    if(prop > 8u) {
        prop = 8u;
        ps1 = rem - prop;
    }
    if(ps2 > ps1 + prop || ps2 > 8u || ps1 < 1u || prop < 1u) return false;

    out->cnf1 = (uint8_t)best_brp; /* SJW = 1 TQ */
    out->cnf2 = (uint8_t)(0x80u | ((ps1 - 1u) << 3) | (prop - 1u)); /* BTLMODE=1, SAM=0 */
    out->cnf3 = (uint8_t)(ps2 - 1u);
    out->tq_total = (uint8_t)n;
    out->sample_point_pct = (uint8_t)((1u + prop + ps1) * 100u / n);
    return true;
}
