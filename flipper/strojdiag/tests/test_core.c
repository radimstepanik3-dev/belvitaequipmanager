/* Testy platformove nezavisle logiky StrojDiag. Spusteni: make -C tests */
#include "../core/j1939.h"
#include "../core/j1939_db.h"
#include "../core/measure.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

static int failures = 0;
static int checks = 0;

#define CHECK(cond)                                                    \
    do {                                                               \
        checks++;                                                      \
        if(!(cond)) {                                                  \
            failures++;                                                \
            printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);     \
        }                                                              \
    } while(0)

#define CHECK_NEAR(a, b, eps) CHECK(fabs((double)(a) - (double)(b)) <= (double)(eps))

static CanFrame frame(uint32_t id, uint8_t dlc, const uint8_t* data) {
    CanFrame f = {0};
    f.id = id;
    f.ext = true;
    f.dlc = dlc;
    memcpy(f.data, data, dlc);
    return f;
}

static void test_ids(void) {
    CHECK(j1939_pgn(0x18FEEE00u) == 65262u);
    CHECK(j1939_sa(0x18FEEE00u) == 0x00u);
    CHECK(j1939_da(0x18FEEE00u) == 0xFFu);
    CHECK(j1939_pgn(0x18EAFFF9u) == J1939_PGN_REQUEST);
    CHECK(j1939_da(0x18EAFFF9u) == 0xFFu);
    CHECK(j1939_sa(0x18EAFFF9u) == 0xF9u);
    CHECK(j1939_pgn(0x18EA00F9u) == J1939_PGN_REQUEST);
    CHECK(j1939_da(0x18EA00F9u) == 0x00u);
    CHECK(j1939_pgn(0x0CF00400u) == 61444u);
    CHECK(j1939_priority(0x0CF00400u) == 3u);
    CHECK(j1939_make_id(6, J1939_PGN_REQUEST, 0xFF, 0xF9) == 0x18EAFFF9u);
    CHECK(j1939_make_id(6, J1939_PGN_REQUEST, 0x00, 0xF9) == 0x18EA00F9u);
    CHECK(j1939_make_id(6, 65262u, 0x12, 0x00) == 0x18FEEE00u); /* PDU2 ignoruje DA */

    CanFrame req;
    j1939_build_request(&req, J1939_PGN_DM2, 0xFF, J1939_SA_TOOL);
    CHECK(req.id == 0x18EAFFF9u);
    CHECK(req.dlc == 3);
    CHECK(req.data[0] == 0xCB && req.data[1] == 0xFE && req.data[2] == 0x00);
}

static void test_live(void) {
    J1939State s;
    j1939_state_init(&s);

    /* EEC1: 1500 rpm = 12000 = 0x2EE0, moment 50 % = 175 */
    const uint8_t eec1[8] = {0xF0, 0x7D, 175, 0xE0, 0x2E, 0x00, 0xFF, 0xFF};
    CanFrame f = frame(0x0CF00400u, 8, eec1);
    j1939_process(&s, &f, 1000);
    CHECK(j1939_param_fresh(&s, J1939ParamEngineSpeed, 1500, 3000));
    CHECK_NEAR(s.params[J1939ParamEngineSpeed].value, 1500.0f, 0.01f);
    CHECK_NEAR(s.params[J1939ParamActualTorque].value, 50.0f, 0.01f);
    CHECK(!j1939_param_fresh(&s, J1939ParamEngineSpeed, 5000, 3000));

    /* ET1: chladivo 90 C (130), palivo N/A (0xFF), olej 95 C = (95+273)/0.03125 = 11776 */
    const uint8_t et1[8] = {130, 0xFF, 0x00, 0x2E, 0xFF, 0xFF, 0xFF, 0xFF};
    f = frame(0x18FEEE00u, 8, et1);
    j1939_process(&s, &f, 2000);
    CHECK_NEAR(s.params[J1939ParamCoolantTemp].value, 90.0f, 0.01f);
    CHECK(s.params[J1939ParamFuelTemp].tick == 0); /* nedostupne -> neulozeno */
    CHECK_NEAR(s.params[J1939ParamOilTemp].value, 95.0f, 0.01f);

    /* HOURS: 12345.6 h = 246912 */
    uint32_t raw = 246912u;
    const uint8_t hours[8] = {
        (uint8_t)raw, (uint8_t)(raw >> 8), (uint8_t)(raw >> 16), (uint8_t)(raw >> 24), 0xFF, 0xFF, 0xFF, 0xFF};
    f = frame(0x18FEE500u, 8, hours);
    j1939_process(&s, &f, 2000);
    CHECK_NEAR(s.params[J1939ParamEngineHours].value, 12345.6f, 0.01f);

    /* VEP1: baterie 27.6 V = 552 v bajtech 4-5 */
    const uint8_t vep[8] = {0xFF, 0xFF, 0xFF, 0xFF, 0x28, 0x02, 0xFF, 0xFF};
    f = frame(0x18FEF700u, 8, vep);
    j1939_process(&s, &f, 2000);
    CHECK_NEAR(s.params[J1939ParamBattery].value, 27.6f, 0.001f);

    /* EFL/P1: tlak oleje 4.0 bar = 100 * 0.04 */
    const uint8_t eflp[8] = {0xFF, 0xFF, 0xFF, 100, 0xFF, 0xFF, 0xFF, 0xFF};
    f = frame(0x18FEEF00u, 8, eflp);
    j1939_process(&s, &f, 2000);
    CHECK_NEAR(s.params[J1939ParamOilPressure].value, 4.0f, 0.001f);

    /* kratky ramec nesmi nic rozbit */
    f = frame(0x18FEEF00u, 2, eflp);
    j1939_process(&s, &f, 2100);
    CHECK_NEAR(s.params[J1939ParamOilPressure].value, 4.0f, 0.001f);

    /* 11bitove ramce se ignoruji */
    CanFrame std = frame(0x123, 8, eec1);
    std.ext = false;
    uint32_t before = s.frames_j1939;
    j1939_process(&s, &std, 2200);
    CHECK(s.frames_j1939 == before);
    CHECK(j1939_sa_count(&s) == 1);
}

static void test_dm1_single(void) {
    J1939State s;
    j1939_state_init(&s);

    /* AWL zap (bity 3-2 = 01), SPN 100 FMI 1 OC 3 */
    const uint8_t dm1[8] = {0x04, 0xFF, 0x64, 0x00, 0x01, 0x03, 0xFF, 0xFF};
    CanFrame f = frame(0x18FECA00u, 8, dm1);
    j1939_process(&s, &f, 1000);
    CHECK(j1939_dtc_total(&s.dm1) == 1);
    const J1939DtcSource* src;
    const J1939Dtc* dtc;
    CHECK(j1939_dtc_get(&s.dm1, 0, &src, &dtc));
    CHECK(src->sa == 0);
    CHECK(dtc->spn == 100 && dtc->fmi == 1 && dtc->oc == 3 && !dtc->cm);
    CHECK(j1939_lamp_state(j1939_dtc_lamps(&s.dm1), J1939LampAmber) == 1);
    CHECK(j1939_lamp_state(j1939_dtc_lamps(&s.dm1), J1939LampMil) == 0);

    /* Zadna chyba: SPN 0 FMI 0 -> 0 DTC, kontrolky vyp */
    const uint8_t none[8] = {0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF};
    f = frame(0x18FECA00u, 8, none);
    uint32_t upd = s.dm1.updates;
    j1939_process(&s, &f, 2000);
    CHECK(j1939_dtc_total(&s.dm1) == 0);
    CHECK(s.dm1.updates != upd);
    CHECK(j1939_dtc_lamps(&s.dm1) == 0);

    /* Proprietarni SPN 520192 (0x7F000), FMI 31 */
    const uint8_t prop[8] = {0x10, 0xFF, 0x00, 0xF0, (uint8_t)(0xE0 | 31), 0x81, 0xFF, 0xFF};
    f = frame(0x18FECA03u, 8, prop);
    j1939_process(&s, &f, 2500);
    CHECK(j1939_dtc_get(&s.dm1, 0, &src, &dtc));
    CHECK(src->sa == 3);
    CHECK(dtc->spn == 520192u && dtc->fmi == 31 && dtc->oc == 1 && dtc->cm);
    CHECK(j1939_db_spn_is_proprietary(dtc->spn));
    CHECK(j1939_lamp_state(j1939_dtc_lamps(&s.dm1), J1939LampRedStop) == 1);

    /* Vyprseni: SA 0 posledni DM1 v 2000, SA 3 v 2500 */
    j1939_expire(&s, 7200);
    CHECK(!s.dm1.src[0].used || s.dm1.src[0].sa != 0);
    CHECK(j1939_dtc_total(&s.dm1) == 1);
    j1939_expire(&s, 8000);
    CHECK(j1939_dtc_total(&s.dm1) == 0);
}

static void test_dm1_bam(void) {
    J1939State s;
    j1939_state_init(&s);

    /* 3 DTC = 2 + 12 = 14 bajtu -> 2 pakety */
    const uint8_t msg[14] = {
        0x40, 0xFF, /* MIL zap */
        0x6E, 0x00, 0x00, 0x05, /* SPN 110 FMI 0 OC 5 */
        0x9D, 0x00, 0x04, 0x01, /* SPN 157 FMI 4 OC 1 */
        0xBD, 0x0D, 0x02, 0x02, /* SPN 3517? -> 0x0DBD = 3517 FMI 2 OC 2 */
    };
    const uint8_t cm[8] = {32, 14, 0, 2, 0xFF, 0xCA, 0xFE, 0x00};
    CanFrame f = frame(0x1CECFF00u, 8, cm);
    j1939_process(&s, &f, 100);

    uint8_t dt1[8] = {1};
    memcpy(&dt1[1], &msg[0], 7);
    uint8_t dt2[8] = {2, 0, 0, 0, 0, 0, 0, 0};
    memcpy(&dt2[1], &msg[7], 7);

    f = frame(0x1CEBFF00u, 8, dt1);
    j1939_process(&s, &f, 150);
    CHECK(j1939_dtc_total(&s.dm1) == 0); /* jeste neni kompletni */
    f = frame(0x1CEBFF00u, 8, dt2);
    j1939_process(&s, &f, 200);

    CHECK(j1939_dtc_total(&s.dm1) == 3);
    const J1939Dtc* dtc;
    CHECK(j1939_dtc_get(&s.dm1, 0, NULL, &dtc) && dtc->spn == 110 && dtc->fmi == 0 && dtc->oc == 5);
    CHECK(j1939_dtc_get(&s.dm1, 1, NULL, &dtc) && dtc->spn == 157 && dtc->fmi == 4);
    CHECK(j1939_dtc_get(&s.dm1, 2, NULL, &dtc) && dtc->spn == 3517 && dtc->fmi == 2);
    CHECK(!j1939_dtc_get(&s.dm1, 3, NULL, &dtc));
    CHECK(j1939_lamp_state(j1939_dtc_lamps(&s.dm1), J1939LampMil) == 1);
}

static void test_tp_rts_cts_passive(void) {
    J1939State s;
    j1939_state_init(&s);

    /* DM2 z ECU 0x00 testeru 0xF9 pres RTS/CTS, paket 1 prijde dvakrat */
    const uint8_t msg[10] = {0x00, 0xFF, 0xBE, 0x00, 0x03, 0x07, 0xAF, 0x00, 0x12, 0x02};
    const uint8_t rts[8] = {16, 10, 0, 2, 0xFF, 0xCB, 0xFE, 0x00};
    CanFrame f = frame(0x1CECF900u, 8, rts);
    j1939_process(&s, &f, 10);

    uint8_t dt1[8] = {1};
    memcpy(&dt1[1], &msg[0], 7);
    uint8_t dt2[8] = {2, msg[7], msg[8], msg[9], 0xFF, 0xFF, 0xFF, 0xFF};
    f = frame(0x1CEBF900u, 8, dt1);
    j1939_process(&s, &f, 20);
    j1939_process(&s, &f, 30); /* duplicita */
    CHECK(j1939_dtc_total(&s.dm2) == 0);
    f = frame(0x1CEBF900u, 8, dt2);
    j1939_process(&s, &f, 40);
    CHECK(j1939_dtc_total(&s.dm2) == 2);
    const J1939Dtc* dtc;
    CHECK(j1939_dtc_get(&s.dm2, 0, NULL, &dtc) && dtc->spn == 190 && dtc->fmi == 3 && dtc->oc == 7);
    CHECK(j1939_dtc_get(&s.dm2, 1, NULL, &dtc) && dtc->spn == 175 && dtc->fmi == 18 && dtc->oc == 2);

    /* DM2 nevyprsi */
    j1939_expire(&s, 100000);
    CHECK(j1939_dtc_total(&s.dm2) == 2);

    /* Abort zrusi relaci */
    f = frame(0x1CECF900u, 8, rts);
    j1939_process(&s, &f, 200000);
    const uint8_t abort_msg[8] = {255, 1, 0xFF, 0xFF, 0xFF, 0xCB, 0xFE, 0x00};
    f = frame(0x1CEC00F9u, 8, abort_msg); /* tester -> ECU */
    j1939_process(&s, &f, 200010);
    bool any_active = false;
    for(size_t i = 0; i < J1939_TP_SESSIONS; i++) any_active |= s.tp[i].active;
    CHECK(!any_active);
}

static void test_identification(void) {
    J1939State s;
    j1939_state_init(&s);
    /* Component ID: "CAT*C4.4*ABC123*" pres BAM (16 bajtu = 3 pakety) */
    const char* text = "CAT*C4.4*ABC123*";
    const uint8_t cm[8] = {32, 16, 0, 3, 0xFF, 0xEB, 0xFE, 0x00};
    CanFrame f = frame(0x1CECFF00u, 8, cm);
    j1939_process(&s, &f, 1);
    for(uint8_t p = 1; p <= 3; p++) {
        uint8_t d[8];
        memset(d, 0xFF, sizeof(d));
        d[0] = p;
        for(int i = 0; i < 7; i++) {
            size_t pos = (size_t)(p - 1) * 7u + (size_t)i;
            if(pos < 16) d[1 + i] = (uint8_t)text[pos];
        }
        f = frame(0x1CEBFF00u, 8, d);
        j1939_process(&s, &f, 2);
    }
    CHECK(strcmp(s.comp_id, "CAT*C4.4*ABC123") == 0);
    CHECK(s.comp_sa == 0);
}

static void test_db(void) {
    size_t n = j1939_db_spn_count();
    CHECK(n > 50);
    for(uint32_t spn = 0; spn < 6000; spn++) {
        const char* name = j1939_db_spn_name(spn);
        if(name) {
            for(const char* c = name; *c; c++) CHECK((unsigned char)*c < 0x80);
            CHECK(strlen(name) <= 32);
        }
    }
    CHECK(j1939_db_spn_name(100) != NULL);
    CHECK(j1939_db_spn_name(110) != NULL);
    CHECK(j1939_db_spn_name(5246) != NULL);
    CHECK(j1939_db_spn_name(4) == NULL);

    for(uint8_t fmi = 0; fmi < 32; fmi++) {
        const J1939FmiInfo* info = j1939_db_fmi(fmi);
        CHECK(info && info->short_text && info->text && info->tip);
        CHECK(strlen(info->short_text) <= 19);
        for(const char* c = info->text; *c; c++) CHECK((unsigned char)*c < 0x80);
        for(const char* c = info->tip; *c; c++) CHECK((unsigned char)*c < 0x80);
    }

    char buf[24];
    j1939_db_sa_format(0, buf, sizeof(buf));
    CHECK(strcmp(buf, "Motor") == 0);
    j1939_db_sa_format(0x8C, buf, sizeof(buf));
    CHECK(strcmp(buf, "ECU 0x8C") == 0);

    uint32_t spn;
    const char* desc;
    size_t len;
    CHECK(j1939_db_parse_spn_line("520300;Tlak pilotniho rizeni\r\n", &spn, &desc, &len));
    CHECK(spn == 520300u && len == strlen("Tlak pilotniho rizeni") && strncmp(desc, "Tlak", 4) == 0);
    CHECK(j1939_db_parse_spn_line("  1638 = Hydraulika  ", &spn, &desc, &len) && spn == 1638 && len == 10);
    CHECK(!j1939_db_parse_spn_line("# komentar", &spn, &desc, &len));
    CHECK(!j1939_db_parse_spn_line("123;", &spn, &desc, &len));
    CHECK(!j1939_db_parse_spn_line("", &spn, &desc, &len));
}

static void check_timing(uint32_t fosc, uint32_t rate, bool expect_ok, uint8_t min_sp, uint8_t max_sp) {
    CanTiming t;
    bool ok = measure_can_timing(fosc, rate, &t);
    CHECK(ok == expect_ok);
    if(!ok || !expect_ok) return;
    /* zpetny vypocet z registru */
    uint32_t brp = t.cnf1 & 0x3Fu;
    uint32_t prop = (t.cnf2 & 0x07u) + 1u;
    uint32_t ps1 = ((t.cnf2 >> 3) & 0x07u) + 1u;
    uint32_t ps2 = (t.cnf3 & 0x07u) + 1u;
    uint32_t n = 1u + prop + ps1 + ps2;
    CHECK(n == t.tq_total);
    CHECK(fosc / (2u * (brp + 1u) * n) == rate);
    CHECK(fosc % (2u * (brp + 1u) * n) == 0);
    CHECK((t.cnf2 & 0x80u) != 0); /* BTLMODE */
    CHECK(ps2 >= 2u && ps2 <= ps1 + prop);
    CHECK(t.sample_point_pct >= min_sp && t.sample_point_pct <= max_sp);
}

static void test_can_timing(void) {
    CanTiming t;
    CHECK(measure_can_timing(8000000u, 250000u, &t));
    CHECK(t.cnf1 == 0x00 && t.cnf2 == 0xB5 && t.cnf3 == 0x01 && t.tq_total == 16);
    CHECK(measure_can_timing(16000000u, 250000u, &t));
    CHECK(t.cnf1 == 0x01 && t.cnf2 == 0xB5 && t.cnf3 == 0x01);
    CHECK(measure_can_timing(8000000u, 500000u, &t));
    CHECK(t.cnf1 == 0x00 && t.cnf2 == 0x91 && t.cnf3 == 0x01 && t.sample_point_pct == 75);

    check_timing(8000000u, 125000u, true, 85, 90);
    check_timing(8000000u, 250000u, true, 85, 90);
    check_timing(8000000u, 500000u, true, 75, 75);
    check_timing(8000000u, 1000000u, false, 0, 0);
    check_timing(16000000u, 125000u, true, 85, 90);
    check_timing(16000000u, 250000u, true, 85, 90);
    check_timing(16000000u, 500000u, true, 85, 90);
    check_timing(16000000u, 1000000u, true, 75, 75);
    check_timing(20000000u, 250000u, true, 60, 90);
}

static void test_sensors(void) {
    SensorConfig c = {SensorType05_45V, 600.0f, 0.0f};
    SensorStatus st;
    CHECK_NEAR(measure_sensor_pressure(&c, 2500.0f, &st), 300.0f, 0.01f);
    CHECK(st == SensorStatusOk);
    CHECK_NEAR(measure_sensor_pressure(&c, 500.0f, &st), 0.0f, 0.01f);
    measure_sensor_pressure(&c, 100.0f, &st);
    CHECK(st == SensorStatusOpen);
    measure_sensor_pressure(&c, 4990.0f, &st);
    CHECK(st == SensorStatusShortHigh);

    c.zero_bar = 1.5f;
    CHECK_NEAR(measure_sensor_pressure(&c, 500.0f, &st), -1.5f, 0.01f);

    SensorConfig m = {SensorType4_20mA, 400.0f, 0.0f};
    CHECK_NEAR(measure_sensor_pressure(&m, 12.0f * MEASURE_SHUNT_OHM, &st), 200.0f, 0.01f);
    CHECK(st == SensorStatusOk);
    measure_sensor_pressure(&m, 2.0f * MEASURE_SHUNT_OHM, &st);
    CHECK(st == SensorStatusOpen);

    SensorConfig v = {SensorType0_5V, 250.0f, 0.0f};
    CHECK_NEAR(measure_sensor_pressure(&v, 1000.0f, &st), 50.0f, 0.01f);

    SensorConfig off = {SensorTypeOff, 250.0f, 0.0f};
    measure_sensor_pressure(&off, 1000.0f, &st);
    CHECK(st == SensorStatusOff);

    CHECK_NEAR(measure_pressure_convert(100.0f, PressureUnitMpa), 10.0f, 0.001f);
    CHECK_NEAR(measure_pressure_convert(1.0f, PressureUnitPsi), 14.5038f, 0.001f);
}

static void test_battery(void) {
    CHECK(measure_battery_system(12.6f) == BatterySystem12V);
    CHECK(measure_battery_system(25.2f) == BatterySystem24V);
    CHECK(measure_battery_system(3.0f) == BatterySystemUnknown);
    CHECK(measure_battery_state(12.6f, BatterySystem12V) == BatteryStateRest);
    CHECK(measure_battery_state(25.2f, BatterySystem24V) == BatteryStateRest);
    CHECK(measure_battery_state(28.4f, BatterySystem24V) == BatteryStateCharging);
    CHECK(measure_battery_state(30.2f, BatterySystem24V) == BatteryStateOvercharge);
    CHECK(measure_battery_state(11.5f, BatterySystem12V) == BatteryStateDischarged);
    CHECK(measure_battery_state(13.2f, BatterySystem12V) == BatteryStateUndercharge);
    CHECK(measure_battery_soc(12.7f, BatterySystem12V) == 100);
    CHECK(measure_battery_soc(12.3f, BatterySystem12V) == 50);
    CHECK(measure_battery_soc(24.6f, BatterySystem24V) == 50);
    CHECK(measure_battery_soc(11.0f, BatterySystem12V) == 0);
    CHECK(measure_battery_soc(14.0f, BatterySystem12V) == -1);
}

static uint16_t crank_buf[4000];

static size_t make_crank(float rest, float inrush, float crank, float run) {
    size_t n = 0;
    for(int i = 0; i < 250; i++) crank_buf[n++] = (uint16_t)(rest * 100.0f); /* 0.5 s */
    for(int i = 0; i < 10; i++) crank_buf[n++] = (uint16_t)(inrush * 100.0f); /* 20 ms spicka */
    for(int i = 0; i < 1000; i++) {
        /* zvlneni podle komprese valcu */
        float wobble = (i % 50 < 25) ? 0.2f : -0.2f;
        crank_buf[n++] = (uint16_t)((crank + wobble) * 100.0f);
    }
    for(int i = 0; i < 1000; i++) crank_buf[n++] = (uint16_t)(run * 100.0f);
    return n;
}

static void test_crank(void) {
    CrankResult r;
    size_t n = make_crank(25.0f, 15.0f, 20.5f, 28.0f);
    measure_crank_analyze(crank_buf, n, 250, 500, BatterySystemUnknown, &r);
    CHECK(r.sys == BatterySystem24V);
    CHECK_NEAR(r.rest_v, 25.0f, 0.01f);
    CHECK_NEAR(r.min_v, 15.0f, 0.01f);
    CHECK(r.min_crank_v > 19.5f && r.min_crank_v < 20.6f);
    CHECK(r.crank_ms >= 2000 && r.crank_ms <= 2100);
    CHECK(r.verdict == CrankVerdictOk); /* spicka 15 V verdikt nekazi */
    CHECK(r.engine_started);

    n = make_crank(12.4f, 7.0f, 9.0f, 12.3f);
    measure_crank_analyze(crank_buf, n, 250, 500, BatterySystemUnknown, &r);
    CHECK(r.sys == BatterySystem12V);
    CHECK(r.verdict == CrankVerdictWeak);
    CHECK(!r.engine_started);

    n = make_crank(12.4f, 6.0f, 7.5f, 12.0f);
    measure_crank_analyze(crank_buf, n, 250, 500, BatterySystemUnknown, &r);
    CHECK(r.verdict == CrankVerdictBad);

    /* bez poklesu = startovani nezachyceno */
    for(size_t i = 0; i < 1000; i++) crank_buf[i] = 1260;
    measure_crank_analyze(crank_buf, 1000, 250, 500, BatterySystemUnknown, &r);
    CHECK(r.verdict == CrankVerdictNoCrank);

    /* vynuceny 24V system u hluboce vybite baterie (16 V by auto vyhodnotilo jako 12 V) */
    n = make_crank(16.0f, 9.0f, 12.0f, 16.0f);
    measure_crank_analyze(crank_buf, n, 250, 500, BatterySystem24V, &r);
    CHECK(r.sys == BatterySystem24V);
    CHECK(r.verdict == CrankVerdictBad);
    measure_crank_analyze(crank_buf, n, 250, 500, BatterySystemUnknown, &r);
    CHECK(r.sys == BatterySystem12V);
}

int main(void) {
    test_ids();
    test_live();
    test_dm1_single();
    test_dm1_bam();
    test_tp_rts_cts_passive();
    test_identification();
    test_db();
    test_can_timing();
    test_sensors();
    test_battery();
    test_crank();

    printf("%d kontrol, %d chyb\n", checks, failures);
    return failures ? 1 : 0;
}
