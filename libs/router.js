const TYPE_DEF = 'frag';
const TYPE_VAR = 'var';
const TYPE_WILD = 'wild';

class Router {
    constructor() {
        this._routes={};
        this._callbacks=[];
        this.tagParamEndPoints = false;
    }

    _getType(item) {
        var type=TYPE_DEF;
        
        if (item[0] == ':') {
            type = TYPE_VAR;
        } else if (item.indexOf('*') >= 0) {
            type = TYPE_WILD;
        }

        return ({
            type: type,
            frag: item
        });
    }

    _pieces(uri) {
        var str = uri[0] === '/' ? uri.slice(1) : uri;
        str = str[str.length-1] === '/' ? str.slice(0, -1) : str;

        return str.split('/');
    }

    _tokens(uri) {
        return this._pieces(uri).map(item => this._getType(item));
    }

    add(method, uri, handler) {
        var toks = this._tokens(uri);
        var path = '', 
            item,
            i, max,
            params=[],
            current=this._routes;

        for (i=0, max=toks.length; i < max; i++) {
            item = toks[i];

            switch(item.type) {
                case TYPE_DEF:
                    if (path == '' && item.frag == '')
                        continue;

                    if (!current[item.frag])
                        current[item.frag] = {};

                    current = current[item.frag];
                    path += '/' + item.frag;
                break;
                case TYPE_VAR:
                    if (this.tagParamEndPoints) {
                        if (!current.__v)
                            current.__v = {};

                        if (current.__v.name && current.__v.name != item.frag.slice(1))
                            throw new Error("Route Error: different fragments at {0} in {1}".format(item.frag, uri));

                        current = current.__v;
                        current.name = item.frag.slice(1);
                        params.push(current.name);
                    } else {
                        params.push(item.frag.slice(1));
                    }
                break;
                case TYPE_WILD:
                    continue;
                break; // eslint-disable-line
                default:
                    throw new Error("Route Error: unknown fragment at {0} in {1}".format(item.frag, uri));
                break; // eslint-disable-line
            }
        }

        if (!current['__c'])
            current['__c'] = {};

        var methods, index=-1;
        if (!Array.isArray(method)) {
            methods = [method];
        } else {
            //creates an array with unique values only
            methods = Array.from(new Set(method));
        }

        for (i=0, max=methods.length; i < max; i++) {
            method=methods[i];

            if (!current.__c[method]) {
                if (index < 0) {
                    index = this._callbacks.indexOf(handler);
                    if (index < 0) {
                        index = this._callbacks.length;
                        this._callbacks.push(handler);
                    }
                }

                current.__c[method] = index;
            } else {
                throw new Error("Error: Duplicate route detected: {0} {1} in uri: {2}".format(method, path, uri));
            }
        }
    }

    _addScan(method, uri, handler=false) {
        if (handler === false && typeof(uri) == 'object') {
            for (var path in uri) {
                if (!uri.hasOwnProperty(path)) continue;

                this.add(method, path, uri[path]);
            }

            return this;
        }

        this.add(method, uri, handler);
    }

    route(method, uri) {
        var toks = this._pieces(uri),
            path = '',
            item,
            params = this.tagParamEndPoints ? {} : [],
            current = this._routes;

        for (var i=0, max=toks.length; i < max; i++) {
            item = toks[i];

            if (item == '') { // this shouldn't happen unless it's the end of a path, and only the root
                break;
            } else if (current[item]) {
                current = current[item];
                path += '/' + item;
            } else if (this.tagParamEndPoints) {
                if (current.__v) {
                    current = current.__v;
                    params[current.name] = item;
                    path += '/:' + current.name;
                } else {
                    return false;
                }
            } else {
                params.push(item);
            }
        }

        if (!current['__c'] || typeof(current['__c'][method]) != 'number')
            return false;

        var index = current.__c[method];
        var cb = this._callbacks[index];

        if (params.length > cb.length)
            return false;

        return {
            handler: cb,
            params: [method, path, params]
        };
    }

    getRoutes() {
        return this._routes;
    }
}

exports = module.exports = Router;