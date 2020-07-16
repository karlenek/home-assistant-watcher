const convict = require('convict');
const fs = require('fs');
const path = require('path');

const config = convict({
  configPath: {
    format: 'String',
    default: './config.json',
    env: 'CONFIG_PATH',
  },
  client: {
    enabled: {
      format: 'Boolean',
      default: true,
      env: 'CLIENT_ENABLED',
    },
    host: {
      format: 'String',
      default: 'localhost:8040',
      env: 'CLIENT_HOST',
    },
    token: {
      format: 'String',
      default: '1234',
      env: 'CLIENT_TOKEN',
    },
    retryTime: {
      format: 'Number',
      default: 10,
      env: 'CLIENT_RETRY_TIME',
    },
    tls: {
      format: 'Boolean',
      default: false,
      env: 'CLIENT_TLS',
    },
  },
  server: {
    enabled: {
      format: 'Boolean',
      default: true,
      env: 'SERVER_ENABLED',
    },
    port: {
      format: 'Number',
      default: 8040,
      env: 'SERVER_PORT',
    },
    token: {
      format: 'String',
      default: '1234',
      env: 'SERVER_TOKEN',
    }
  },
  mqtt: {
    host: {
      format: 'String',
      default: 'localhost',
      env: 'MQTT_HOST'
    },
    port: {
      format: 'Number',
      default: 1883,
      env: 'MQTT_PORT',
    },
    username: {
      format: 'String',
      default: undefined,
      env: 'MQTT_USERNAME',
    },
    password: {
      format: 'String',
      default: undefined,
      env: 'MQTT_PASSWORD',
    },
    discoveryPrefix: {
      format: 'String',
      default: 'hass',
      env: 'MQTT_DISCOVERY_PREFIX',
    },
    hassStatusTopic: {
      format: 'String',
      default: 'hass/status',
      env: 'MQTT_STATUS_TOPIC',
    },
  },
});

const configPath = path.join(__dirname, '../', config.get('configPath'));
console.log(`Using configuration from ${configPath}`);

if (fs.existsSync(configPath)) {
  config.loadFile(configPath);
  console.log('Loaded configuration file');
}

config.validate();

module.exports = config.getProperties();
