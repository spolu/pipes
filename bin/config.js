var fwk = require('fwk');

var config = fwk.baseConfig();

config['PIPE_PORT'] = 1984;
config['PIPE_HMAC_KEY'] = 'INSERCURE';
config['PIPE_ADMIN_USER'] = 'admin';

/** export merged configuration */
exports.config = config;
