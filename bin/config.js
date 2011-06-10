var fwk = require('pipe');

var config = fwk.baseConfig();

config['PIPE_PORT'] = 22222;
config['PIPE_HMAC_KEY'] = 'INSECURE';
config['PIPE_ADMIN_USER'] = 'admin';
config['PIPE_TIMEOUT'] = 10000;

/** export merged configuration */
exports.config = config;
