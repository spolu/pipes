var fwk = require('pipe');

var config = fwk.baseConfig();

config['PIPE_SERVER'] = '127.0.0.1';
config['PIPE_PORT'] = 22222;
config['PIPE_HMAC_KEY'] = 'INSERCURE';
config['PIPE_ADMIN_USER'] = 'admin';

config['TINT_NAME'] = 'pipe';

/** export merged configuration */
exports.config = config;
