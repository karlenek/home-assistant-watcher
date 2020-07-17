const mqtt = require('mqtt');

const { WatchClient, CONNECTED_EVENT, DISCONNECTED_EVENT, STATUS_EVENT } = require('./WatchClient');
const WatchServer = require('./WatchServer');
const config = require('./config');
const log = require('./logger');
const { version, author } = require('../package.json');

const watchServer = new WatchServer({
  accessToken: config.server.token,
  port: config.server.port,
});

if (config.server.enabled) {
  watchServer.start();
}

const watchClient = new WatchClient({
  accessToken: config.client.token,
  host: config.client.host,
  tls: config.client.tls,
  retryTime: config.client.retryTime,
});

if (config.client.enabled) {
  watchClient.connect();
}


const client = mqtt.connect(`mqtt://${config.mqtt.host}`, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  port: config.mqtt.port,
});

const OBJECT_ID = config.client.host.replace(/[\.\-\:]/g, '_');
const HASS_SYSTEM_STATUS_GET = 'hass/system/status/get';
const HASS_SYSTEM_STATUS = 'hass/system/status';

const HASS_STATUS_TOPIC = config.mqtt.hassStatusTopic;
const HASS_STATE_TOPIC = `hasswatcher/${OBJECT_ID}/status/state`;
const HASS_AVAILABILITY_TOPIC = `hasswatcher/${OBJECT_ID}/status`;

const SERVER_CONNECTIONS_TOPIC = `hasswatcher/server/connections`;

function sendDiscovery() {
  log.debug('[MQTT]: Sending discovery to home assistant');
  client.publish(`${config.mqtt.discoveryPrefix}/binary_sensor/${OBJECT_ID}/status/config`, JSON.stringify({
    name: `${OBJECT_ID}_status`,
    unique_id: `${OBJECT_ID}_status`,
    device_class: 'connectivity',
    availability_topic: HASS_AVAILABILITY_TOPIC,
    payload_available: "online",
    payload_not_available: "offline",
    state_topic: HASS_STATE_TOPIC,
    value_template: '{{ value_json.status }}',
    expire_after: 30,
    device: {
      identifiers:[
        `hasswatcher_${OBJECT_ID}`,
      ],
      manufacturer: author,
      model: 'Home Assistant watcher',
      name: 'Home Assistant watcher',
      sw_version: version,
    },
  }));
}


function sendAvailableStatus() {
  if (client.connected) {
    client.publish(HASS_AVAILABILITY_TOPIC, 'online');
  }
}

function sendWatcherStatus() {
  if (watchClient.isConnected() && client.connected) {
    const { status: message, online, ok } = watchClient.getStatus();
    const status = online && ok ? 'ON' : 'OFF';

    client.publish(HASS_STATE_TOPIC, JSON.stringify({
      status,
      message,
    }));
  }
}
if (config.client.enabled) {
  setInterval(() => sendWatcherStatus(), 15000);
}

function sendServerConnections() {
  if (client.connected) {
    const connections = watchServer.getClients();

    client.publish(SERVER_CONNECTIONS_TOPIC, JSON.stringify({
      connections,
      count: connections.length,
    }));
  }
}


client.on('connect', () => {
  log.info('[MQTT]: Connected to broker');

  if (config.client.enabled) {
    sendDiscovery();
    sendAvailableStatus();
  }

  if (config.server.enabled) {
    sendServerConnections();
  }
});

client.on('message', (topic, buffer) => {
  const data = buffer.toString();

  if (topic === HASS_STATUS_TOPIC && data === 'online') {
    sendDiscovery();
  }
});

client.on('error', (err) => {
  log.error('[MQTT]:');
  log.error(err);
});

client.subscribe(HASS_STATUS_TOPIC);
client.subscribe(HASS_SYSTEM_STATUS);

watchServer.on(WatchServer.CLIENT_CONNECTED, (clientId) => {
  const connections = watchServer.getClients();
  log.info(`[SERVER]: New client connected: ${clientId}`);
  log.info(`[SERVER]: Connected clients: ${watchServer.getConnectionCount()}`);

  sendServerConnections();
});
watchServer.on(WatchServer.CLIENT_DISCONNECTED, (clientId) => {
  const connections = watchServer.getClients();
  log.info(`[SERVER]: Client disconnected: ${clientId}`);
  log.info(`[SERVER]: Connected clients: ${watchServer.getConnectionCount()}`);

  sendServerConnections();
});

watchServer.onRequestStatus = async () => {
  let status = {
    ok: false,
    status: 'No status has been provided',
  };

  try {
    if (!client.connected) {
      return {
        ok: false,
        status: 'Not able to connect to event bus',
      };
    }

    await new Promise((resolve, reject) => {
      try {
        client.publish(HASS_SYSTEM_STATUS_GET);
        let resolved = false;
        const onMessage = (topic, buffer) => {
          if (topic === HASS_SYSTEM_STATUS) {
            const data = JSON.parse(buffer.toString());

            status = {
              ok: data.ok || false,
              status: data.status || 'No description provided',
            };

            client.removeListener('message', onMessage);
            resolved = true;
            resolve();
          }
        };
  
        client.on('message', onMessage);
  
        // If we dont get a response in time
        setTimeout(() => {
          if (!resolved) {
            client.removeListener('message', onMessage);
            status = {
              ok: false,
              status: 'Status request timeout',
            }
            resolve();
          }
        }, 2000);
      } catch (err) {
        reject(err);
      }
    });
  } catch (err) {
    log.error('[SERVER]:');
    log.error(err);
  }
  return status;
}

watchClient.on(CONNECTED_EVENT, () => {
  log.info('[CLIENT]: Connected to remote server');
});

watchClient.on(STATUS_EVENT, (data) => {
  log.info(`[CLIENT]: New remote status: "${data.status}"`);
  log.debug(data);
  sendWatcherStatus();
});