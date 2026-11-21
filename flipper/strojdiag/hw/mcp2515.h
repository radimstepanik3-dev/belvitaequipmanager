/**
 * @file mcp2515.h
 * Minimalni ovladac CAN radice Microchip MCP2515 na externi SPI Flipperu.
 *
 * Zapojeni (GPIO lista Flipperu):
 *   pin 2 PA7 = SI (MOSI), pin 3 PA6 = SO (MISO), pin 4 PA4 = CS,
 *   pin 5 PB3 = SCK, pin 6 PB2 = INT, pin 9 = 3V3, pin 8/11/18 = GND.
 * MCP2515 i transceiver (SN65HVD230) musi bezet na 3,3 V.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "../core/j1939.h"

typedef enum {
    Mcp2515ModeNormal,
    Mcp2515ModeListenOnly, /**< jen poslech - neposila ACK ani chybove ramce */
    Mcp2515ModeLoopback,
} Mcp2515Mode;

typedef enum {
    Mcp2515ResultOk,
    Mcp2515ResultNoChip, /**< po resetu necte spravne registry - zkontroluj SPI */
    Mcp2515ResultBadTiming, /**< rychlost s timto krystalem nejde */
    Mcp2515ResultModeFail, /**< nepodarilo se prepnout rezim */
} Mcp2515Result;

typedef struct {
    uint8_t canstat;
    uint8_t eflg;
    uint8_t tec;
    uint8_t rec;
} Mcp2515Status;

/* EFLG bity */
#define MCP2515_EFLG_RX1OVR 0x80u
#define MCP2515_EFLG_RX0OVR 0x40u
#define MCP2515_EFLG_TXBO   0x20u /* bus-off */
#define MCP2515_EFLG_TXEP   0x10u /* error passive TX */
#define MCP2515_EFLG_RXEP   0x08u /* error passive RX */

/** Inicializuje SPI a radic. Pri chybe vola mcp2515_deinit() sam. */
Mcp2515Result mcp2515_init(uint32_t fosc_hz, uint32_t bitrate, Mcp2515Mode mode);

/** Uvede radic do sleep a uvolni piny. */
void mcp2515_deinit(void);

/** Precte az max prijatych ramcu (0-2). */
uint8_t mcp2515_read_frames(CanFrame* out, uint8_t max);

/** Odesle ramec pres TXB0 a pocka max timeout_ms na odvysilani. */
bool mcp2515_send(const CanFrame* frame, uint32_t timeout_ms);

void mcp2515_get_status(Mcp2515Status* status);

/** Smaze priznaky preteceni a chyb. Vraci puvodni EFLG. */
uint8_t mcp2515_clear_errors(void);
