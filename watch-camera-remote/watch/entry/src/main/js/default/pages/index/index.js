import app from '@system.app';
import interconnect from '@system.interconnect';
import vibrator from '@system.vibrator';

const TIMERS = [0, 3, 10];
const FLASH = ['auto', 'on', 'off'];
const FLASH_LABEL = { auto: 'BLESK A', on: 'BLESK', off: 'BEZ' };

export default {
  data: {
    status: 'Připojuji…',
    connected: false,
    countdown: 0,
    timerIdx: 0,
    timerLabel: 'TEĎ',
    flashIdx: 0,
    flashLabel: 'BLESK A',
    photos: 0
  },

  onInit() {
    this.conn = interconnect.instance();
    const self = this;

    this.conn.onmessage = function (msg) {
      self.handleMessage(msg.data);
    };
    this.conn.onclose = function () {
      self.setConnected(false, 'Odpojeno');
    };
    this.conn.onerror = function () {
      self.setConnected(false, 'Chyba spojení');
    };

    // Ask the phone to open camera and report its state
    this.send({ cmd: 'hello' });
  },

  onDestroy() {
    this.clearCountdown();
    this.send({ cmd: 'bye' });
  },

  // ---------- Actions ----------
  onShutter() {
    const seconds = TIMERS[this.timerIdx];
    if (seconds === 0) {
      this.takePhoto();
      return;
    }
    this.send({ cmd: 'countdown', seconds: seconds });
    this.countdown = seconds;
    const self = this;
    this.countdownTimer = setInterval(function () {
      self.countdown -= 1;
      if (self.countdown <= 0) {
        self.clearCountdown();
        self.takePhoto();
      } else {
        vibrator.vibrate({ mode: 'short' });
      }
    }, 1000);
  },

  onTimer() {
    this.timerIdx = (this.timerIdx + 1) % TIMERS.length;
    const s = TIMERS[this.timerIdx];
    this.timerLabel = s === 0 ? 'TEĎ' : s + ' s';
  },

  onSwitch() {
    this.send({ cmd: 'switch' });
  },

  onFlash() {
    this.flashIdx = (this.flashIdx + 1) % FLASH.length;
    const mode = FLASH[this.flashIdx];
    this.flashLabel = FLASH_LABEL[mode];
    this.send({ cmd: 'flash', mode: mode });
  },

  onSwipe(e) {
    // Swipe right closes the app (standard watch gesture)
    if (e.direction === 'right') {
      app.terminate();
    }
  },

  // ---------- Helpers ----------
  takePhoto() {
    vibrator.vibrate({ mode: 'long' });
    this.status = 'Fotím…';
    this.send({ cmd: 'shoot' });
  },

  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdown = 0;
  },

  setConnected(ok, text) {
    this.connected = ok;
    this.status = text;
  },

  send(payload) {
    const self = this;
    this.conn.send({
      data: payload,
      success: function () {},
      fail: function (data, code) {
        console.error('WatchCam send fail ' + code);
        self.setConnected(false, 'Otevři app v mobilu');
      }
    });
  },

  handleMessage(raw) {
    let msg = raw;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }
    }
    switch (msg.event) {
      case 'ready':
        this.setConnected(true, msg.lens === 'front' ? 'Přední kamera' : 'Zadní kamera');
        break;
      case 'saved':
        this.photos += 1;
        this.setConnected(true, 'Uloženo ✓');
        vibrator.vibrate({ mode: 'short' });
        break;
      case 'error':
        this.setConnected(true, msg.text || 'Chyba fotoaparátu');
        break;
      default:
        break;
    }
  }
};
