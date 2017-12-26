const fs = require('fs');
const EventEmitter = require('events').EventEmitter;
const Writable = require('stream').Writable;
const common = require('./common');

class Flushable extends Writable {
    constructor() {
        super();
    }
    
    emit(event) {
        if (event === 'finish' && this._flush && !Writable.prototype._flush) {
            this._flush(this.delayFlush.bind(this));
        } else {
            EventEmitter.prototype.emit.apply(this, Array.from(arguments));
        }
    }

    delayFlush(err) {
        if (err) {
            this.emit('error', err);
        } else {
            EventEmitter.prototype.emit.call(this, 'finish');
        }
    }
}

class LogFile extends Flushable {
    constructor(file='logtest.txt') {
        super();

        this.stream = fs.createWriteStream(file, {'flags': 'a'});
        this.stdout = process.stdout._write;
        this.stderr = process.stderr._write;
        this.dates = true;

        process.stdout._write = this._write.bind(this);
        process.stderr._write = this.writeError.bind(this);
        this.on('finish', this.destroy.bind(this));
    }

    destroy() {
        process.stdout._write = this.stdout;
        process.stderr._write = this.stderr;
        this.stdout = this.stderr = this.stream = null;
    }

    _flush(cb) {
        this.stream.on('finish', function(err) {
            if (typeof cb === 'function')
                cb(err);
        }.bind(this));
        this.stream.end();
    }

    _write(data, encoding='utf8') {
        data = (data + "\n").streamlineLineEndings();
        if (this.dates === true) {
            var now = common.utcnow();

            this.stdout.apply(process.stdout, arguments);
            this.stream.write(now +  ' ' + data, encoding);
        } else {
            this.stdout.apply(process.stdout, arguments);
            this.stream.write(data, encoding);
        }
    }

    writeError(chunk, encoding='utf8') {
        this.stderr.apply(process.stderr, arguments);
        this.stream.write(('Error: ' + chunk).streamlineLineEndings(), encoding);
    }
    
    showDates(show=true) {
        this.dates = show;
    }
}

exports = module.exports = {
    LogFile: LogFile,
    Flushable: Flushable
};