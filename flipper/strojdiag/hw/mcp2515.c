#include "mcp2515.h"

#include <furi.h>
#include <furi_hal.h>

#include "../core/measure.h"

#define SPI_TIMEOUT 10

/* Instrukce */
#define CMD_RESET       0xC0u
#define CMD_READ        0x03u
#define CMD_WRITE       0x02u
#define CMD_BIT_MODIFY  0x05u
#define CMD_READ_STATUS 0xA0u
#define CMD_READ_RXB0   0x90u /* od RXB0SIDH */
#define CMD_READ_RXB1   0x94u /* od RXB1SIDH */
#define CMD_LOAD_TXB0   0x40u /* od TXB0SIDH */
#define CMD_RTS_TXB0    0x81u

/* Registry */
#define REG_CANSTAT  0x0Eu
#define REG_CANCTRL  0x0Fu
#define REG_TEC      0x1Cu
#define REG_REC      0x1Du
#define REG_CNF3     0x28u
#define REG_CNF2     0x29u
#define REG_CNF1     0x2Au
#define REG_CANINTE  0x2Bu
#define REG_CANINTF  0x2Cu
#define REG_EFLG     0x2Du
#define REG_TXB0CTRL 0x30u
#define REG_RXB0CTRL 0x60u
#define REG_RXB1CTRL 0x70u

/* CANCTRL REQOP */
#define MODE_NORMAL   0x00u
#define MODE_SLEEP    0x20u
#define MODE_LOOPBACK 0x40u
#define MODE_LISTEN   0x60u
#define MODE_CONFIG   0x80u
#define MODE_MASK     0xE0u

#define TXB_TXREQ 0x08u
#define TXB_ERR   0x70u /* ABTF | MLOA | TXERR */

static const FuriHalSpiBusHandle* const spi = &furi_hal_spi_bus_handle_external;
static bool spi_ready = false;

static void spi_xfer(const uint8_t* tx, uint8_t* rx, size_t len) {
    furi_hal_spi_acquire(spi);
    if(rx) {
        furi_hal_spi_bus_trx(spi, tx, rx, len, SPI_TIMEOUT);
    } else {
        furi_hal_spi_bus_tx(spi, tx, len, SPI_TIMEOUT);
    }
    furi_hal_spi_release(spi);
}

static uint8_t reg_read(uint8_t addr) {
    uint8_t tx[3] = {CMD_READ, addr, 0x00};
    uint8_t rx[3] = {0};
    spi_xfer(tx, rx, sizeof(tx));
    return rx[2];
}

static void reg_write(uint8_t addr, uint8_t value) {
    uint8_t tx[3] = {CMD_WRITE, addr, value};
    spi_xfer(tx, NULL, sizeof(tx));
}

static void reg_modify(uint8_t addr, uint8_t mask, uint8_t value) {
    uint8_t tx[4] = {CMD_BIT_MODIFY, addr, mask, value};
    spi_xfer(tx, NULL, sizeof(tx));
}

static bool set_mode(uint8_t mode) {
    reg_modify(REG_CANCTRL, MODE_MASK, mode);
    for(uint8_t i = 0; i < 20; i++) {
        if((reg_read(REG_CANSTAT) & MODE_MASK) == mode) return true;
        furi_delay_ms(1);
    }
    return false;
}

Mcp2515Result mcp2515_init(uint32_t fosc_hz, uint32_t bitrate, Mcp2515Mode mode) {
    CanTiming timing;
    if(!measure_can_timing(fosc_hz, bitrate, &timing)) return Mcp2515ResultBadTiming;

    if(!spi_ready) {
        furi_hal_spi_bus_handle_init(spi);
        spi_ready = true;
    }

    uint8_t reset = CMD_RESET;
    spi_xfer(&reset, NULL, 1);
    furi_delay_ms(5);

    /* Po resetu je radic v konfiguracnim rezimu a CANCTRL = 0x87. */
    uint8_t canstat = reg_read(REG_CANSTAT);
    uint8_t canctrl = reg_read(REG_CANCTRL);
    if((canstat & MODE_MASK) != MODE_CONFIG || canctrl != 0x87u) {
        mcp2515_deinit();
        return Mcp2515ResultNoChip;
    }

    reg_write(REG_CNF1, timing.cnf1);
    reg_write(REG_CNF2, timing.cnf2);
    reg_write(REG_CNF3, timing.cnf3);
    if(reg_read(REG_CNF2) != timing.cnf2) {
        mcp2515_deinit();
        return Mcp2515ResultNoChip;
    }

    /* Prijimat vse (masky/filtry vypnute), RXB0 pretece do RXB1. */
    reg_write(REG_RXB0CTRL, 0x64u);
    reg_write(REG_RXB1CTRL, 0x60u);
    reg_write(REG_CANINTF, 0x00u);
    reg_write(REG_CANINTE, 0x03u); /* RX0IE | RX1IE -> pin INT */
    reg_write(REG_EFLG, 0x00u);

    uint8_t reqop = MODE_LISTEN;
    if(mode == Mcp2515ModeNormal) reqop = MODE_NORMAL;
    if(mode == Mcp2515ModeLoopback) reqop = MODE_LOOPBACK;
    if(!set_mode(reqop)) {
        mcp2515_deinit();
        return Mcp2515ResultModeFail;
    }
    return Mcp2515ResultOk;
}

void mcp2515_deinit(void) {
    if(!spi_ready) return;
    /* Konfiguracni rezim + sleep: radic se odpoji od sbernice. */
    reg_write(REG_CANINTE, 0x00u);
    set_mode(MODE_CONFIG);
    reg_modify(REG_CANCTRL, MODE_MASK, MODE_SLEEP);
    furi_hal_spi_bus_handle_deinit(spi);
    spi_ready = false;
}

static void parse_rx(const uint8_t* b, CanFrame* f) {
    /* b[0]=SIDH b[1]=SIDL b[2]=EID8 b[3]=EID0 b[4]=DLC b[5..12]=data */
    uint8_t sidl = b[1];
    if(sidl & 0x08u) {
        f->ext = true;
        f->id = ((uint32_t)b[0] << 21) | ((uint32_t)(sidl & 0xE0u) << 13) |
                ((uint32_t)(sidl & 0x03u) << 16) | ((uint32_t)b[2] << 8) | b[3];
        f->rtr = (b[4] & 0x40u) != 0;
    } else {
        f->ext = false;
        f->id = ((uint32_t)b[0] << 3) | (sidl >> 5);
        f->rtr = (sidl & 0x10u) != 0;
    }
    f->dlc = b[4] & 0x0Fu;
    if(f->dlc > 8) f->dlc = 8;
    memcpy(f->data, &b[5], 8);
}

static void read_rx_buffer(uint8_t cmd, CanFrame* f) {
    uint8_t tx[14] = {cmd};
    uint8_t rx[14] = {0};
    /* Prikaz READ RX BUFFER po zvednuti CS sam smaze priznak RXnIF. */
    spi_xfer(tx, rx, sizeof(tx));
    parse_rx(&rx[1], f);
}

uint8_t mcp2515_read_frames(CanFrame* out, uint8_t max) {
    if(!spi_ready || max == 0) return 0;
    uint8_t tx[2] = {CMD_READ_STATUS, 0x00};
    uint8_t rx[2] = {0};
    spi_xfer(tx, rx, sizeof(tx));
    uint8_t status = rx[1];

    uint8_t n = 0;
    if(status & 0x01u) read_rx_buffer(CMD_READ_RXB0, &out[n++]);
    if((status & 0x02u) && n < max) read_rx_buffer(CMD_READ_RXB1, &out[n++]);
    return n;
}

bool mcp2515_send(const CanFrame* frame, uint32_t timeout_ms) {
    if(!spi_ready) return false;
    if(reg_read(REG_TXB0CTRL) & TXB_TXREQ) return false; /* buffer obsazeny */

    uint8_t tx[14] = {CMD_LOAD_TXB0};
    uint32_t id = frame->id;
    if(frame->ext) {
        tx[1] = (uint8_t)(id >> 21);
        tx[2] = (uint8_t)(((id >> 13) & 0xE0u) | 0x08u | ((id >> 16) & 0x03u));
        tx[3] = (uint8_t)(id >> 8);
        tx[4] = (uint8_t)id;
    } else {
        tx[1] = (uint8_t)(id >> 3);
        tx[2] = (uint8_t)((id & 0x07u) << 5);
    }
    uint8_t dlc = frame->dlc > 8 ? 8 : frame->dlc;
    tx[5] = dlc | (frame->rtr ? 0x40u : 0x00u);
    memcpy(&tx[6], frame->data, dlc);
    spi_xfer(tx, NULL, (size_t)(6u + dlc));

    uint8_t rts = CMD_RTS_TXB0;
    spi_xfer(&rts, NULL, 1);

    uint32_t start = furi_get_tick();
    while(true) {
        uint8_t ctrl = reg_read(REG_TXB0CTRL);
        if(!(ctrl & TXB_TXREQ)) return (ctrl & TXB_ERR) == 0;
        if(furi_get_tick() - start > timeout_ms) break;
        furi_delay_ms(1);
    }
    /* Nikdo nepotvrdil (ACK) - zrus vysilani, at neblokujeme sbernici. */
    reg_modify(REG_TXB0CTRL, TXB_TXREQ, 0x00u);
    return false;
}

void mcp2515_get_status(Mcp2515Status* status) {
    if(!spi_ready) {
        memset(status, 0, sizeof(*status));
        return;
    }
    status->canstat = reg_read(REG_CANSTAT);
    status->eflg = reg_read(REG_EFLG);
    status->tec = reg_read(REG_TEC);
    status->rec = reg_read(REG_REC);
}

uint8_t mcp2515_clear_errors(void) {
    if(!spi_ready) return 0;
    uint8_t eflg = reg_read(REG_EFLG);
    if(eflg & (MCP2515_EFLG_RX0OVR | MCP2515_EFLG_RX1OVR)) {
        reg_modify(REG_EFLG, MCP2515_EFLG_RX0OVR | MCP2515_EFLG_RX1OVR, 0x00u);
    }
    /* ERRIF (0x20), MERRF (0x80) */
    reg_modify(REG_CANINTF, 0xA0u, 0x00u);
    return eflg;
}
