function cmdParams(switches='--', debug=false) {
    function isSwitch(str) {
        if (Array.isArray(switches)) {
            for (var i=0; i < switches.length; i++) {
                if (str.slice(0,switches[i].length) == switches[i])
                    return true;
            }
            
            return false;
        } else {
            return str.slice(0,switches.length) == switches;
        }
    }

    var self = {
        _: [],
        args: {},
        get: function (key) {
            return this.args.hasOwnProperty(key) ? this.args[key] : null;
        }
    };

    // get rid of node specific params
    const input = process.argv.slice(2);

    var key='';
    for (var i=0; i < input.length; i++) {
        if (isSwitch(input[i])) {
            key = input[i].slice(switches.length);
            if (i+1 <= input.length-1 && !isSwitch(input[i+1])) {
                self.args[key]=input[i+1];
                i++;
            } else {
                self.args[key]=true;
            }
        } else {
            self._.push(input[i]);
        }
    }
    
    if (debug) {
        console.log("Parameters: ", self); // eslint-disable-line
    }

    return self;
}

exports = module.exports = function(handler, switches='--', debug=false) {
    if (typeof handler !== 'function' || handler === null)
        return null;

    return handler(cmdParams(switches, debug));
};
