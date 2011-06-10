var fwk = require('pipes');

var config = fwk.baseConfig();

config['PIPES_SERVER'] = '127.0.0.1';
config['PIPES_PORT'] = 22222;
config['PIPES_HMAC_KEY'] = 'INSERCURE';
config['PIPES_ADMIN_USER'] = 'admin';

config['TINT_NAME'] = 'pipes';

/** export merged configuration */
exports.config = config;
