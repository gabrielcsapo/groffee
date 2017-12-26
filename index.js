const fs = require('fs');
const path = require('path');
const util = require('util');

require('./libs/extensions');
const LogFile = require('./libs/logfile').LogFile;
const App = require('./libs/app');
const expect = require('./libs/common').expect;


const certPath = path.resolve(path.join(process.cwd(), 'certs'));

// take in parameters from the command line and apply to settings
const SETTINGS = require('./libs/cmdParams')(function (params) {
    return {
        logPath: path.resolve(params.get('log') || 'server-log.txt'),
        host: params.get('host') || 'http://localhost:7000',
        key: params.get('key') || path.join(certPath, 'privatekey.pem'),
        cert: params.get('cert') || path.join(certPath, 'certificate.pem'),
    };
});

var logger = new LogFile(SETTINGS.logPath);

require('./libs/shutdown')(shutdown);
function shutdown(req=false, finished) {
    console.log("Shutting down...: {0}", req);

    if (expect(logger, false)) {
        console.log("Closing log...");
        logger.on('finish', function() {
            console.log("Logging completed");
            finished();
        });
        logger.end();
    }
}

var server = App.create(SETTINGS.host, { // app config
    secure: true,
    certs: {
        key: fs.readFileSync(SETTINGS.key),
        cert: fs.readFileSync(SETTINGS.cert),
    }
});

server.get('/', function() {
    this.content = "<h1>It just works!</h1>";
    return 200;    
});

server.start();

