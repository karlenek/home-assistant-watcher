const { EventEmitter } = require('events');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const log = require('./logger');
const { version } = require('../package.json');

const AUTH_TIMEOUT = 5000;

class Client {
  constructor(ws, { accessToken }) {
    this._isAuthenticated =  false;
    this._accessToken = accessToken;
    this._ws = ws;

    this._id = uuidv4();

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
      log.error('[SERVER]:');
      log.error(err);
    }
  }

  _setupListeners() {
    this._ws.on('ping', () => {
      this._ws.pong();
    });

    this._ws.on('close', () => {
      this._isAuthenticated = false;
      this._ws.removeAllListeners();
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

  getId() {
    return this._id;
  }
}

class WatchServer extends EventEmitter {
  constructor({ accessToken, port = 8040 }) {
    super();
    this._clients = new Map();
    this._accessToken = accessToken;
    this._port = port;
  }

  start() {
    this._wss = new WebSocket.Server({
      port: this._port,
    });

    log.info(`[SERVER]: Server listening on port ${this._port}`);

    this._wss.on('connection', (ws, ...args) => {
      const client = new Client(ws, {
        accessToken: this._accessToken,
      });
      const clientId = client.getId();

      client.onRequestStatus = async () => {
        try {
          const currentStatus = await this.onRequestStatus();
          return currentStatus;
        } catch (err) {
          log.error('[SERVER]:');
          log.error(err);
        }
      };
      
      this._clients.set(clientId, ws);

      this.emit(WatchServer.CLIENT_CONNECTED, clientId);

      ws.on('close', () => {
        ws.removeAllListeners();
        this._clients.delete(clientId)
        this.emit(WatchServer.CLIENT_DISCONNECTED, clientId);
      });

      setTimeout(() => {
        // Terminate the connection if the client has not authenticated within set timeout
        if (!client.isAuthenticated()) {
          client.close();
          this._clients.delete(clientId);
        }
      }, AUTH_TIMEOUT);
    });
  }

  getClients() {
    return Array.from(this._clients.keys());
  }

  getConnectionCount() {
    return this._clients.size;
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

WatchServer.CLIENT_CONNECTED = 'clientConnected';
WatchServer.CLIENT_DISCONNECTED = 'clientDisconnected';

module.exports = WatchServer;
