const common = require('../common');
const expect = common.expect;

const VALIDOPTIONS = ['value','expires','path','domain','secure','httpOnly'];

class Cookies {

    // this manages the cookies available
    constructor(conn) {
        this.cookies = {};
        this.conn = conn;

        var tokens = conn.headers.cookie ? conn.headers.cookie.split(';').map(val => common.trim(val)) : [],
            vals;

        for (var i=0, max=tokens.length; i < max; i++) {
            vals = tokens[i].split('=').map(val => unescape(common.trim(val)));
            this.cookies[vals[0]] = vals[1];
        }
    }

    all() {
        return this.cookies;
    }

    get(name) {
        return this.cookies[name] || null;
    }

    expire(name, options) {
        if (!this.cookies[name])
            return;

        if (typeof options !== 'object')
            options={};

        options.value = expect(options.value, '');
        options.expires = expect(options.expires, "Thu, 01-Jan-1970 00:00:01 GMT");

        this.set(name, options);
        this.cookies[name]=null;
    }

    set(name, attributes={}) {
        // 'max-age' isn't supported by IE, so keep using expires
        var str, key, attr={};

        if (typeof attributes !== 'object')
            return;

        for (var i=0, max=VALIDOPTIONS.length; i < max; i++) {
            key = VALIDOPTIONS[i];

            if (attributes[key] === null || typeof attributes[key] === 'undefined')
                continue;

            attr[key] = attributes[key];
        }
        attr.value = expect(attributes.value, '');

        switch(typeof attr.expires) {
            case 'string':
                attr.expires = common.trim(attr.expires);
                if (attr.expires.length < 1)
                    attr.expires = null;
            break;
            case 'number':
                attr.expires = common.getFutureDays(attr.expires).toUTCString();
            break;
            default:
                attr.expires = common.getFutureMs(common.MSONEHOUR).toUTCString();
            break;
        }

        str = escape(name) + "=" + escape(attr.value) +
              (attr.expires ? "; expires=" + attr.expires : '') +
              (attr.path ? "; path=" + attr.path : '') +
              (attr.domain ? "; domain=" + attr.domain : '') +
              (attr.secure ? "; secure" : '') +
              (attr.httpOnly ? "; httponly" : '');

        this.conn.setHeader('Set-Cookie', str);
        this.cookies[name] = attr.value;
    }

}

Cookies.Configure = function(app, options=false) {
    var config = {};
    config.enabled = (typeof options === 'boolean') ? options : expect(options.enabled, false);
    if (config.enabled) {
        config.bind = function(app) {
            app.on('request', async function(conn) {
                conn.cookies = config.enabled ? new Cookies(conn) : false;
            });
        };
    }

    return config;
};

exports = module.exports = Cookies;
