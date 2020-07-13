
class Logger {
  debug(...args) {
    console.debug(...args);
  }

  info(...args) {
    console.log(...args);
  }

  warn(...args) {
    console.log(...args);
  }

  error(...args) {
    console.log(...args);
  }
}

module.exports = new Logger();