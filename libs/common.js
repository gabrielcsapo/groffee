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

function ASYNC(fn) {
    return function(...args) {
        return new Promise(resolve => {
            try {                
                fn(...args, function(error, data) {
                    if (error)
                        return resolve(false);

                    return resolve(data);
                });
            } catch(e) {
                console.trace(e);
                return resolve(false);
            }
        });
    };
}

/* TODO: will be improved later */
async function asyncFilter(arr, callback) {
    var i, 
        max = arr.length,
        results = new Array(arr.length),
        list = [];

    for (i=0; i < max; i++) {
        results[i] = callback(arr[i]);
    }

    for (i=0; i < max; i++) {
        if (await results[i])
            list.push(results[i]);
    }

    return list;
}

const stat = ASYNC(fs.stat);
const readdir = ASYNC(fs.readdir);
const writeFile = ASYNC(fs.writeFile);
const readFile = ASYNC(fs.readFile);
const unlink = ASYNC(fs.unlink);

async function dirList(fpath, encoding='utf8') {
    var list = await asyncFilter(await readdir(fpath, encoding), async function(file) {
        var fname = path.join(fpath, file),
            fstat = await stat(fname);

        if (!fstat || !fstat.isDirectory())
            return false;

        return fname;
    }.bind(this));

    return list;
};

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

exports = module.exports = {
    MSONEHOUR: MSONEHOUR,
    expect: expect,
    trim: trim,
    utcnow: utcnow,
    getFutureDays: getFutureDays,
    getFutureMs: getFutureMs,
    parseJson: parseJson,
    toJson: toJson,
    filterDir: filterDir,
    genRandomToken: genRandomToken,
    ASYNC: ASYNC,
    asyncFilter: asyncFilter,
    stat: stat,
    readdir: readdir,    
    writeFile: writeFile,
    readFile: readFile,    
    unlink: unlink,
    dirList: dirList,    
    readJSON: readJSON,
    writeJSON: writeJSON,
};