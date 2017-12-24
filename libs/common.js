const fs = require('fs');
const path = require('path');

// minute * seconds * milliseconds
const MSONEHOUR = 60 * 60 * 1000;

function expect() {
    for (var i=0, max = arguments.length; i < max; i++) {
        if (arguments[i] !== null && arguments[i] !== undefined)
            return arguments[i];
    }

    return null;
}

function trim(str) {
	return str.replace(/^\s+|\s+$/g, '');
}

function utcnow() {
    return new Date().toISOString();
}

//* @now = current date
//* @days = int, number of days before cookie expires
function getFutureDays(days) {
    var now = new Date();
    now.setTime(now.getTime() + (days * 24 * 60 * 60 * 1000));
    return now;
}

//* @now = current date
//* @ms = int, number of milliseconds before cookie expires
function getFutureMs(ms) {
    var now = new Date();
    now.setMilliseconds(now.getMilliseconds() + ms);
    return now;
}

function parseJson(str) {
    try {
        return JSON.parse(str);
    } catch (err) {
        return false;
    }
}

function toJson(obj) {
    try {
        return JSON.stringify(obj);
    } catch (err) {
        return false;
    }
}

async function stat(fname) {
    return new Promise((resolve) => {
        fs.stat(fname, async function(error, fstat) {
            if (error)
                return resolve(false);

            return resolve(fstat);
        }.bind(this));
    });
}

async function writeFile(fpath, data, options) {
    return new Promise((resolve) => {
        fs.writeFile(fpath, data, options, async function(error) {
            if (error)
                return resolve(false);

            return resolve(true);
        }.bind(this));
    });
}

async function readFile(fpath, options) {
    return new Promise((resolve) => {
        fs.readFile(fpath, options, async function(error, data) {
            if (error)
                return resolve(false);

            return resolve(data);
        }.bind(this));
    });
}

async function unlink(fpath) {
    return new Promise((resolve) => {
        fs.unlink(fpath, async function(error, data) {
            if (error)
                return resolve(false);

            return resolve(data);
        }.bind(this));
    });
}

async function readJSON(fpath, encoding='utf8') {
    var content = await readFile(fpath, encoding);
    if (content === false)
        return false;
    
    return parseJson(content);
}

async function writeJSON(fpath, data, options='utf8') {
    var dataObj = toJson(data);
    if (!dataObj)
        return false;

    return writeFile(fpath, dataObj, options);
}

function filterDir(fpath, extension='.json', recursive=true, encoding='utf8') {
    var list=[];

    fs.readdirSync(fpath, encoding).forEach(file => {
        var fstat,
            fname = path.join(fpath, file);

        fstat = fs.statSync(fname);
        if (!fstat)
            return;

        if (fstat.isDirectory()) {
            list = list.concat(filterDir(fname, extension));
        } else if (fstat.isFile() && path.extname(file) == extension) {
            list.push(fname);
        }
    });

    return list;
}

function genRandomToken(length=32) {
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        token = "";

    for (var i = 0; i < length; i++) {
        token += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return token;
}

exports = module.exports = {
    expect: expect,
    trim: trim,
    utcnow: utcnow,
    getFutureDays: getFutureDays,
    getFutureMs: getFutureMs,
    parseJson: parseJson,
    toJson: toJson,
    filterDir: filterDir,
    stat: stat,
    writeFile: writeFile,
    readFile: readFile,
    unlink: unlink,
    readJSON: readJSON,
    writeJSON: writeJSON,
    genRandomToken: genRandomToken,
    MSONEHOUR: MSONEHOUR    
};