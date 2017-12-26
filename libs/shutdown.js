const expect = require('./common').expect;

/*
Note about shutdown function:
    Only call finished if you're actually done shutting down.
    This will cleanup the event handlers and shutdown will not be called again after. This signals to the 
    shutdown handler that you've handled everything you need to.
*/
function finished() {
    process.removeListener('exit', onexit);
    process.removeListener('SIGINT', sighandler);
    process.removeListener('uncaughtException', catchException);
    process.exit();
}

function shutdown(req, next=false) {
    process.emit('shutdown', req, next !== false ? next : finished);
}

function onexit() {
    console.log("Process Exit, emitting shutdown..."); // eslint-disable-line
    shutdown(false);
}

function sighandler() {
    console.log("Received signal SIGINT"); // eslint-disable-line
    shutdown(2);
}

function catchException(e) {
    console.log("Uncaught Exception...\n", e.stack); // eslint-disable-line
    shutdown(99);
}

function install(callback) {
    if (typeof callback !== 'function')
        throw new Error("Shutdown: callbacks must be functions");

    process.on('shutdown', callback);
}

if (!expect(process.shutdown, false)) {
    process.on('exit', onexit);
    process.on('SIGINT', sighandler);
    process.on('uncaughtException', catchException);
    process.shutdown = function(err=false) {
        shutdown(err);
    };
    if (process.platform.slice(0,3) == 'win') {
        var rl = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.on("SIGINT", function () {
            process.emit('SIGINT');
        });
    }
}

exports = module.exports = install;


