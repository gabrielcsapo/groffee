var test = require('tape');
const util = require('util');
const Flushable = require('../libs/logFile').Flushable;
const Readable = require('stream').Readable;

function TestReadable() {
    this.i = 0;
    Readable.call(this);
}
util.inherits(TestReadable, Readable);

TestReadable.prototype._read = function() {
    if (this.i++ === 2)
        this.push(null);
    else
        this.push('foo');
};

class TestWritable extends Flushable {
    constructor() {
        super();
    }

    _flush(cb) {
        console.log("Flushed");
        this.flushCalled = true;
        setTimeout(function() {
            cb(this.err);
        }.bind(this), 10);
    }

    _write(data, encoding, cb) {
        cb();
    }
}

test('should call _flush prior to emitting finish', function(t) {
    t.plan(3);
    t.timeoutAfter(1000);

    var r = new TestReadable();
    var w = new TestWritable();
    var finished = false;

    w.on('finish', function() {
        console.log("Finshed");
        finished = true;
    });

    r.pipe(w);

    setTimeout(function() {
        t.equal(w.flushCalled, true);
        t.equal(finished, false);

        setTimeout(function() {
            t.equal(finished, true);
            t.end();
        }, 50);
    }, 5);
});

test('should finish immediately if no _flush is defined', function(t) {
    t.plan(1);
    var r = new TestReadable();
    var w = new TestWritable();
    var finished = false;

    w.on('finish', function() {
        finished = true;
    });

    w._flush = null;

    r.pipe(w);
    setTimeout(function() {
        t.equal(finished, true);
        t.end();
    }, 5);
});

test('should emit error instead of finish for errors in cb', function(t) {
    t.plan(2);
    var r = new TestReadable(),
        w = new TestWritable(),
        finished = false,
        errored = false;

    w.on('finish', function() {
        finished = true;
    });

    w.on('error', function() {
        errored = true;
    });

    w.err = new Error('bar');
    r.pipe(w);

    setTimeout(function() {
        t.equal(finished, false);
        t.equal(errored, true);
        t.end();
    }, 15);
});
