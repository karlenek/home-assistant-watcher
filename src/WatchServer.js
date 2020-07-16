const WebSocket = require('ws');
const log = require('./logger');
const { version } = require('../package.json');

const AUTH_TIMEOUT = 5000;

class Client {
  constructor(ws, { accessToken }) {
    this._isAuthenticated =  false;
    this._accessToken = accessToken;
    this._ws = ws;

    this._setupListeners();
    this._requestAuthentication();
  }

  _requestAuthentication() {
    this._ws.send(JSON.stringify({
      type: 'auth_required',
      version,
    }));
  }

  _handleAuth(accessToken) {
    if (!accessToken) {
      this._ws.send(JSON.stringify({
        type: 'auth_invalid',
        message: 'AccessToken not provided',
      }));

      return;
    }

    if (this._accessToken !== accessToken) {
      this._ws.send(JSON.stringify({
        type: 'auth_invalid',
        message: 'AccessToken invalid',
      }));

      return;
    }

    this._isAuthenticated = true;

    this._ws.send(JSON.stringify({
      type: 'auth_ok',
      version,
    }));
  }

  async _handleStatusRequest() {
    const currentStatus = await this.onRequestStatus();

    this._ws.send(JSON.stringify({
      ...currentStatus,
      type: 'status',
    }))
  }

  async _onMessage(message) {
    try {
      const { type, ...data } = JSON.parse(message);

      switch (type) {
        case 'auth':
          this._handleAuth(data.accessToken);
          break;
        case 'getStatus':
          this._handleStatusRequest();
          break;
        default:
          break;
      }
    } catch (err) {
      log.error(err);
    }
  }

  _setupListeners() {
    this._ws.on('ping', () => {
      this._ws.pong();
    });

    this._onMessage = this._onMessage.bind(this);
    this._ws.on('message', this._onMessage);
  }

  onRequestStatus() {
    throw new Error('onRequestStatus not defined');
  }

  isAuthenticated() {
    return !!this._isAuthenticated;
  }

  close() {
    this._ws.terminate();
  }
}

class WatchServer {
  constructor({ accessToken, port = 8040 }) {
    this._clients = [];

    this._wss = new WebSocket.Server({
      port,
    });

    this._wss.on('connection', (ws) => {
      const client = new Client(ws, {
        accessToken,
      });

      client.onRequestStatus = async () => {
        try {
          const currentStatus = await this.onRequestStatus();
          return currentStatus;
        } catch (err) {
          log.error(err);
        }
      };

      this._clients.push(ws);

      setTimeout(() => {
        // Terminate the connection if the client has not authenticated within set timeout
        if (!client.isAuthenticated()) {
          client.close();
          this._clients = this._clients.filter(c => c !== client);
        }
      }, AUTH_TIMEOUT);
    });
  }

  /**
   * @virtual
   *
   * Method will be called everytime a client requests status
   * Must return a an object describing the status
   *
   * @returns { Promise<{ online: Boolian, message: String }> }
   */
  async onRequestStatus() {
    return Promise.resolve({
      ok: true,
      status: 'All systems operational',
    });
  }
}

module.exports = WatchServer;
