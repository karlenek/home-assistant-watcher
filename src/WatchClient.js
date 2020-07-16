const WebSocket = require('ws');
const log = require('./logger');
const { EventEmitter } = require('events');


const CONNECTED_EVENT = 'connected';
const STATUS_EVENT = 'status';
const DISCONNECTED_EVENT = 'disconnected';

class WatchClient extends EventEmitter {
  constructor(config) {
    super();
    this._config = {
      accessToken: config.accessToken || '',
      host: config.host || 'localhost',
      tls: config.tls || false,
      retryTime: config.retryTime || 10,
    };

    this._started = false;
    this._connected = false;
    this._connecting = false;
    this._retryConnection = true;
    this._disconnectReason = null;
    this._watchingConnection = false;
    this._watchingStatus = false;
    this._status = {
      updated: Date.now(),
      online: false,
      ok: false,
      status: 'Not connected',
    };
    this._ws = null;

    this._onMessage = this._onMessage.bind(this);

    this.on(CONNECTED_EVENT, () => this._watchConnection());
    this.on(CONNECTED_EVENT, () => this._watchStatus());
  }

  _watchConnection() {
    if (this._watchingConnection) return;
    this._watchingConnection = true;

    setInterval(() => {
      if (!this._connected) return;
      this._ws.ping();

      let pongReceived = false;

      const onPong = () => { pongReceived = true; };
      this._ws.once('pong', onPong);

      setTimeout(() => {
        if (pongReceived) return;

        this._ws.removeListener('pong', onPong);
        this._disconnectReason = 'Server not responding';
        this._ws.terminate();
      }, 1500);
    }, 5000);
  }

  getStatus() {
    return JSON.parse(JSON.stringify(this._status));
  }

  _setStatus(newStatus) {
    const oldStatus = JSON.parse(JSON.stringify(this._status));

    this._status = {
      ...newStatus,
      updated: Date.now(),
    };

    const hasChanged = Object.entries(oldStatus)
      .filter(([key]) => !['updated'].includes(key))
      .some(([key, value]) => this._status[key] !== value);

    if (hasChanged) {
      this.emit(STATUS_EVENT, this.getStatus());
    }
  }

  _watchStatus() {
    if (this._watchingStatus) return;
    this._watchingStatus = true;

    setInterval(() => {
      if (!this._connected) return;
      const now = Date.now();
      this._ws.send(JSON.stringify({ type: 'getStatus' }));

      setTimeout(() => {
        if (this._status.updated > now) {
          return;
        }

        this._setStatus({
          online: true,
          ok: false,
          status: 'Not responding',
        });
      }, 3000);
    }, 10000);
  }

  _login() {
    log.debug('[CLIENT]: Authenticating...')
    this._ws.send(JSON.stringify({
      type: 'auth',
      accessToken: this._config.accessToken,
    }));

    setTimeout(() => {
      if (!this._connected && this._connecting) {
        this._disconnectReason = 'Server never responded to auth request';
        this._ws.close();
      }
    }, 3000)
  }
  
  _authFailed() {
    log.warn(`[CLIENT]: Failed connecting to ${this._config.host}, invalid apiKey`);
    this._retryConnection = false;
    this._disconnectReason = 'Failed to authenticate with server';
    this._ws.close();
  }
  
  _authSucceded() {
    log.debug(`[CLIENT]: Authenticated to ${this._config.host}`);
    this._connected = true;
    this.emit(CONNECTED_EVENT);
  }

  _handleStatus({ status, ok }) {
    this._setStatus({
      online: true,
      ok,
      status,
    });
  }
  
  _onMessage(message) {
    const { type, ...data } = JSON.parse(message);

    switch (type) {
      case 'auth_required':
        return this._login();
      case 'auth_invalid':
        return this._authFailed();
      case 'auth_ok':
        return this._authSucceded();
      case 'status':
        return this._handleStatus(data);
      default:
        break;
    }
  }

  connect() {
    if (this._connecting || this._connected) return;

    this._connecting = true;

    if (this._ws) {
      this._ws.terminate();
      this._ws.removeAllListeners();
      this._ws = null;
    }

    this._ws = new WebSocket(`${this._config.tls ? 'wss' : 'ws'}://${this._config.host}/api/websocket`);

    this._ws.on('open', () => {
      this._disconnectReason = 'Connection lost';
    });
    
    this._ws.on('close', () => {
      this._connected = false;
      this._connecting = false;

      this.emit(DISCONNECTED_EVENT, {
        reason: this._disconnectReason || 'Connection failed',
        willRetry: this._retryConnection,
      });

      this._setStatus({
        online: false,
        ok: false,
        status: this._disconnectReason,
      });

      this._disconnectReason = null;
  
      if (!this._retryConnection) {
        log.debug('[CLIENT]: Not connected, no reconnection attempts will be made.');
        return;
      }
  
      log.debug(`[CLIENT]: Not connected, retrying in ${this._config.retryTime} seconds`);
  
      setTimeout(() => { this.connect() }, this._config.retryTime * 1000);
    });
  
    this._ws.on('error', (err) => {
      log.error(err);
    });

    this._retryConnection = true;
    this._ws.on('message', this._onMessage);
  }

  disconnect() {
    if (!this._ws || !this._connecting) {
      return;
    }
    this._retryConnection = false;
    this._ws.close();
  }

  isConnected() {
    return !!this._connected;
  }
}

module.exports = {
  WatchClient,
  CONNECTED_EVENT,
  DISCONNECTED_EVENT,
  STATUS_EVENT,
};
