const fs = require('fs');
const path = require('path');
const stat = require('../common').stat;
const expect = require('../common').expect;

async function serveStatic(conn) {
    var type;
    
    if (!conn.writable) {
        console.log("**** RESPONSE NOT WRITEABLE"); // eslint-disable-line
        return false;
    }

    //transform for static file in the webroot path    
    conn.uri = conn.uri + (conn.uri.slice(-1) == '/' ? 'index.html' : '');
    conn.fname = path.join(this.webRoot, conn.uri);
    type = conn.mime.type(path.extname(conn.fname), 'utf8');

    conn.stat = await stat(conn.fname);
    if (conn.stat === false) {
        console.log(conn.uri + " :: 404 Doesn't exist"); // eslint-disable-line

        conn.writeHead(404, {
            'Content-Type': conn.mime.type('.html', 'utf-8'),
        }, conn.getStatusMessage(404));

        return false;
    }

    if (conn.stat.isDirectory()) {
        console.log(conn.uri + " :: Directory Read Attempt: "); // eslint-disable-line
        conn.writeHead(403, conn.getStatusMessage(403));

        return false;
    }

    if (cacheControl(conn))
        return false;

    conn.writeHead(200, {
        'Content-Type': type,
        'Last-Modified': conn.stat.mtime.toUTCString(),
        'Content-Length': conn.stat.size
    });

    return conn.streamReadable(fs.createReadStream(conn.fname));
}

function nocache(conn) {
    conn.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    conn.setHeader('Expires', '-1');
    conn.setHeader('Pragma', 'no-cache');
}

function cacheControl(conn) {
    var cControl = conn.headers['cache-control'] || null;
    var modifiedDate = conn.headers['if-modified-since'] || null;

    if (cControl == 'no-cache') {
        nocache(conn);
    } else if (modifiedDate != null)  {
        modifiedDate = new Date(modifiedDate);

        //diff check for time < 0 should be cached: hasn't been modified since the time requested
        var diff = modifiedDate.getTime() - conn.stat.mtime.getTime();
        if (diff <= 0) {
           conn.setHeader('Last-Modified', conn.stat.mtime.toUTCString());
           conn.status = 304;
           return true;
        }
    }

    return false;
}

function configure(app, options=false) {
    var config = {};

    config.required = { 'mime': true };

    config.enabled = (typeof options === 'boolean') ? options : expect(options.enabled, false);
    config.webRoot = expect(options.webRoot, path.resolve(path.join(process.cwd(), 'www')));
    if (config.enabled) {
        config.bind = function(app) {
            app.on('serve', serveStatic.bind(config), 'static');
        };
    }

    return config;
}

exports = module.exports = {
    serveStatic: serveStatic,
    cacheControl: cacheControl,
    nocache: nocache,
    Configure: configure
};
