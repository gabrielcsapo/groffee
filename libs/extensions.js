String.prototype.format = function() {
    var args = Array.from(arguments);
    return this.replace(/{(\d+)}/g, function(match, number) {
        return typeof args[number] != 'undefined' ? args[number] : '##' + match;
    });
};

String.prototype.streamlineLineEndings = function(ending = "\n") {
    return this.replace(/[\r\n,\r,\n]+/g, ending);
};

function print(fmt) {
    arguments = Array.from(arguments);
    arguments.shift();
    console.log(fmt.format.apply(fmt, arguments)); // eslint-disable-line
}

exports = module.exports = {
    print: print,
};
