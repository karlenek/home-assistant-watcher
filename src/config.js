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
    host: {
      format: 'String',
      default: 'localhost:8040',
    },
    token: {
      format: 'String',
      default: '1234',
    },
    retryTime: {
      format: 'Number',
      default: 10,
    },
    tls: {
      format: 'Boolean',
      default: false,
    },
  },
  server: {
    port: {
      format: 'Number',
      default: 8040,
    },
    token: {
      format: 'String',
      default: '1234'
    }
  },
  mqtt: {
    host: {
      format: 'String',
      default: 'localhost',
    },
    port: {
      format: 'String',
      default: 1883,
    },
    username: {
      format: 'String',
      default: undefined,
    },
    password: {
      format: 'String',
      default: undefined,
    },
  },
});

const configPath = path.join(__dirname, '../', config.get('configPath'));
console.log(`Using configuration from ${configPath}`);

if (fs.existsSync(configPath)) {
  config.loadFile(configPath);
  console.log('Loaded configuration file');
}

module.exports = config.getProperties();
