/*
Generating certs using openssl:

openssl genrsa -out certs/privatekey.pem 4096
openssl req -new -key certs/privatekey.pem -out certs/certrequest.csr -subj "/C=US/ST=California/L=LA/O=ACME Inc/CN=yourdomainname"
openssl x509 -req -in certs/certrequest.csr -signkey certs/privatekey.pem -out certs/certificate.pem
*/

const http = require('http');
const https = require('https');
const httpDuplex = require('./http-duplex');
const url = require('url');
const common = require('./common');
const Router = require('./router');
const expect = common.expect;

class ClientRequest extends httpDuplex {
    constructor(req, res, app) {
        super(req, res);

        this.fin = false;
        this.app = app;
        
        this.semver=false;
        this.uri = decodeURI(url.parse(req.url).pathname);
        this.fname = this.uri;
        this.query = url.parse(req.url, true).query || {};
        this.status = 200;
        this.body = false;
        this.content = '';
        this.ballPostData = true;
        this.postDataLimit = app.postDataLimit;

        app.awaitEvent(this, 'requestInit');

        var decoders = {
            'application/x-www-form-urlencoded': this.decodeFormUrlData.bind(this),
            'application/json': common.parseJson
        };

        if (this.method == 'POST') {
            var contentType = (this.headers['content-type'] || '').split(';')[0];

            // Check if this post needs a streaming read or not
            if (!this.readable) {
                this.body = expect(decoders[contentType], function(c) { return c; })(this.req.body);
            } else if (this.ballPostData) {
                // automatically ball up post data up to post limit and error if it's larger
                this.readPostData(function(content) {
                    this.body = expect(decoders[contentType], function(c) { return c; })(content);
                    this.emit('ready', this);
                }.bind(this), false, this.postDataLimit);
        
                return;
            }
        }

        setTimeout(this.emit.bind(this, 'ready', this), 1);
    }

    decodeFormUrlData(content) {
        var data={};
        content.split('&').map(v => v.split('=')).forEach(val => data[val[0]] = decodeURIComponent(val[1]));
        return data;
    }

    get status() {
        return this.res.statusCode;
    }

    set status(code) {
        this.res.statusCode = code;
    }
    
    getStatusMessage(code) {
        return expect(http.STATUS_CODES[code], '');
    }

    // leaving intact for now, though it's not needed
    end(content) {
        if (!this.fin) {
            console.log("@@@@@ ENDED BEFORE FIN: " + this.fname); // eslint-disable-line
        }

        httpDuplex.prototype.end.call(this, content);
    }

    async streamReadable(readable) {
        return new Promise((resolve) => {
            readable.on('errror', async function() {
                return resolve(false);
            }.bind(this))
            .on('end', async function() {
                return resolve(true);
            }.bind(this));

            readable.pipe(this, { end: false });
        });
    }

    readPostData(callback, onData=false, limit=false) {
        onData = typeof(onData) == 'function' ? onData : function(){};
        var content = '';
        this.on('data', function (data) {
            //  bad client requests, or some sttacks i.e. flood, nuke
            if (limit && content.length > limit) {
                this.emit('error', 500);
                return;
            }

            // Append data.
            content += data;
            onData(data.length);
        }.bind(this))
        .on('end', function () {
            callback(content);
        }.bind(this));
    }
}

class App {

    constructor(host, port, options={}) {
        const filteredOptions = ['secure','certs','modulePath'];

        this.ev = {
            end: [],
            requestInit: [],
            request: [],
            serve: {
                dynamic: [],
                static: [],
                any: []
            },
        };

        this.router = new Router();

        this.host = host;
        this.port = port;
        
        // limit post data, stops flood, nuke, like attacks and bad client requests
        this.postDataLimit = expect(options.postDataLimit, 1e6); // 1e6 = 1,000,000

        this.secure = expect(options.secure, false);
        this.modulePath = expect(options.modulePath, './modules');

        var createServer = http.createServer;
        if (this.secure && (expect(options.certs.key, false) && expect(options.certs.cert, false))) {
            createServer = https.createServer.bind(this, options.certs);
        } else {
            this.secure = false;
        }

        this.modules={};

        // default modules
        this.loadModules([ ['staticFiles', expect(options.staticFiles, true) ] ].concat(
                Object.entries(options).filter(obj => !filteredOptions.includes(obj[0]))
            )
        );

        this.server = createServer(this.handler.bind(this));
        this.server.on('listening', function() {
                        var a = this.address();
                        console.log("Server: running on: " + a.address + ":" + a.port); // eslint-disable-line
                    }.bind(this.server))
                    .on('error', function(err) {
                        console.log("Server Error:: ", err); // eslint-disable-line
                    }.bind(this));

        process.on('shutdown', this.close.bind(this));
        console.log("Created for " +                        // eslint-disable-line
                    (this.secure ? 'https://' : 'http://') + this.host + ":" + this.port); 

        setTimeout(this.binder.bind(this), 1);
    }

    moduleLoaded(name) {
        return expect(this.modules[name], false);
    }

    async loadModules(module, options) {
        var config;

        if (Array.isArray(module)) {
            for (var i=0, max=module.length; i < max; i++) {
                await this.loadModules.apply(this, module[i]);
            }

            return;
        }

        if (typeof module !== 'string') {
            console.log(":: Module Unknown spec: ", typeof module); // eslint-disable-line
            return;
        } 

        if (this.moduleLoaded(module)) {
            console.log(":: Module Already Loaded: ", module); // eslint-disable-line
            return;
        }

        console.log("Loading Module: ", module); // eslint-disable-line
        config = this.modules[module] = require(this.modulePath + '/' + module).Configure(this, options);

        if (expect(config.required, false))
            await this.loadModules(Object.entries(config.required));
    }

    binder() {
        for (var name in this.modules) {
            if (!this.modules.hasOwnProperty(name)) 
                continue;
            
            if (typeof this.modules[name].bind === 'function') {
                console.log("Binding Module: ", name); // eslint-disable-line
                this.modules[name].bind(this);
            }
        }

        // collapses 'any' handlers into every event, so there isn't an uneeded array map operation every request
        for (var event in this.ev) {
            if (!this.ev.hasOwnProperty(event)) 
                continue;

            switch (event) {
                case 'serve':
                    this.ev[event]['static'] = this.ev[event]['static'].concat(this.ev[event]['any']);
                    this.ev[event]['dynamic'] = this.ev[event]['dynamic'].concat(this.ev[event]['any']);

                    delete this.ev[event]['any'];
                    break;
                default:
                    break;
            }
        }
    }

    async handler(req, res) {
        var conn = new ClientRequest(req, res, this);
        await this.awaitEvent(conn, 'request');
        conn.on('ready', this.route.bind(this, conn));
    }

    async route(conn) {
        var endpoint = this.router.route(conn.method, conn.uri);
        
        if (endpoint !== false) {
            await this.awaitEvent(conn, 'serve', 'dynamic');
            this._finalize(conn, await endpoint.handler.apply(conn, Object.values(endpoint.params[2])));
        } else {
            await this.awaitEvent(conn, 'serve', 'static');
            this._finalize(conn, true);
        }
    }

    get(uri, handler=false) {
        this.router._addScan('GET', uri, handler);
        return this;
    }

    post(uri, handler=false) {
        this.router._addScan('POST', uri, handler);
        return this;
    }

    add(uri, methods, handler=false) {
        if (Array.isArray(uri)) {
            for (var i=0, max=uri.length; i < max; i++) {
                this.router._addScan.apply(this, uri[i]);    
            }
        } else {
            this.router._addScan(methods, uri, handler);
        }
        return this;
    }

    //any(uri, handler) {
    //    this.router.add('*', uri, handler);
    //}
    
    async _finalize(conn, res) {  // eslint-disable-line
        if (!conn.fin) {
            conn.fin = true;
            conn.end(conn.content.length > 0 ? conn.content : '');
        } else {
            console.log("WARNING: CONNECTION ALREADY ENDED: ", conn.uri); // eslint-disable-line
        }

        await this.awaitEvent(conn, 'end');
    }

    start() {
        this.server.listen(this.port, this.host);
        //console.log("Routes: ", util.inspect(this.router.getRoutes(), { depth: 5 }));
    }
    
    close() {
        console.log ("Server: Shutting down..."); // eslint-disable-line
        this.server.close();
    }

    restart() {
        this.close();
        this.start();
    }

    async awaitEvent(conn, event, options=false) {
        var handlers;
        switch (event) {
            case 'serve':
                handlers = options ? this.ev[event][options] : [];
                //handlers = Array.prototype.concat.apply([], options.map(key => this.ev[event][key]));
                break;
            default:
                handlers = this.ev[event];
                break;
        }

        for (var i=0, max=handlers.length; i < max; i++) {
            await handlers[i](conn);
        }
    }

    on(event, cb=false, option=false) {
        if (cb === false) return this;
        switch(event) {
            case 'requestInit':
            case 'request':
            case 'end':
                console.log("::    Binding App Event: " + event); // eslint-disable-line
                if (this.ev[event].indexOf(cb) == -1)
                    this.ev[event].push(cb);
            break;
            case 'serve':
                switch(option) {
                    case 'static':
                    case 'dynamic':
                    case 'any':
                        console.log("::    Binding App Event: " + event + ": ", option); // eslint-disable-line
                        if (this.ev[event][option].indexOf(cb) == -1)
                            this.ev[event][option].push(cb);
                    break;
                    default:
                        console.log("App Event: Unknown option for event '" + event + "': " + option); // eslint-disable-line
                    break;
                }
            break;
            default:
            break;
        }

        return this;
    }

}

App.create = function (addr, options={}) {
    var parsed = url.parse(addr, true);
    options.secure = expect(options.secure, false) && parsed.protocol === 'https:';

    return new App(parsed.hostname, parsed.port, options);
};

exports = module.exports = App;