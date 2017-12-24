const util = require('util');
const path = require('path');
const Router = require('../libs/router');

function compare(id, v1, v2) {
    var type = typeof(v1);
    
    if (type !== typeof(v2))
        return false;
    
    if (type === "function")
        return v1.toString() === v2.toString();

    if (type !== 'object')
        return (v1 === v2)

    var k1 = Object.keys(v1), 
        k2 = Object.keys(v2),
        k;

    if (k1.length != k2.length)
        return false;

    for (var i=0, max=k1.length; i < max; i++) { 
        k = k1[i];

        if (!compare(id, v1[k], v2[k]))
            return false;
    }

    return true;
}

const tests = [
    { method: 'GET', uri: '/api/1/' },
    { method: 'GET', uri: '/' },
    { method: 'GET', uri: '/users/:user/:thing' },
    { method: 'GET', uri: '/users/:user/:thing/:another' },
    { method: 'POST', uri: '/users/:user/:thing/:another' },
    { method: 'GET', uri: '/users/:user/:thing/another/test/:here' },
    //{ method: 'GET', url: '/static/*' },
    { method: 'GET', uri: '/static/robots.txt' },
    { method: 'GET', uri: '/users/tim/lamp' },
    { method: 'GET', uri: '/static/main/js/local/script.js' },
];

const checks = [
    { method: 'GET', uri: '/api/1/', expect: ['GET', '/api/1', [] ] },
    { method: 'POST', uri: '/api/1/', expect: false },
    { method: 'GET', uri: '/', expect: [ 'GET', '', [] ] },
    { method: 'POST', uri: '/', expect: false },
    // -- GROUP: Tagged params are counted as endpoints
    //{ method: 'GET', uri: '/users/12/pages', expect: [ 'GET', '/users', [ '12', 'pages' ] ] },
    //{ method: 'POST', uri: '/users/15/pages/book', 
    //  expect: [ 'POST', '/users', [ '15', 'pages', 'book' ] ] },
    //{ method: 'GET', uri: '/users/12/book/another/test/author', 
    //  expect: [ 'GET', '/users/another/test', [ '12', 'book', 'author' ] ] },
    // -- END GROUP
    
    // -- GROUP: Tagged params are optional and NOT counted as endpoints
    { method: 'GET', uri: '/users/12/pages', expect: [ 'GET', '/users', [ '12', 'pages' ] ] },
    { method: 'POST', uri: '/users/15/pages/book', 
      expect: [ 'POST', '/users', [ '15', 'pages', 'book' ] ] },
    { method: 'GET', uri: '/users/12/book/another/test/author', 
      expect: [ 'GET', '/users/another/test', [ '12', 'book', 'author' ] ] },
    // -- END GROUP

    { method: 'GET', uri: '/static/robots.txt', expect: [ 'GET', '/static/robots.txt', [] ] },
    { method: 'GET', uri: '/users/tim/lamp', expect: [ 'GET', '/users/tim/lamp', [] ] },
    { method: 'POST', uri: '/users/tim/lamp', expect: false },
    { method: 'GET', uri: '/static/main/js/local/script.js', 
      expect: [ 'GET', '/static/main/js/local/script.js', [] ] },
    { method: 'POST', uri: '/static/main/js/local/script.js', expect: false },
];

function handler(method, endpoint) {
    console.log("-----------> Handler: ", Array.from(arguments));
    return Array.from(arguments)[2];
}

var router = new Router();

console.log("-----------------------------------");
console.log("Tests\n");
for (var i=0; i < tests.length; i++) {
    var item = tests[i];

    router.add(tests[i].method, tests[i].uri, handler);
}


var item, check, i=1, res=false;
//check = router.route(checks[i].method, checks[i].uri);
//console.log("\nCheck: ", check);

for (i=0; i < checks.length; i++) {
    item = checks[i];
    check = router.route(item.method, item.uri);
    //console.log("\nCheck: ", check);

    if (typeof item.expect === 'object' || typeof item.expect === 'array') {
        res = compare(i, item.expect, check.params);
    } else {
        res = compare(i, item.expect, check);
    }

    if (!res) {
        print("Failed: {0} :: {1} {2}", i, item.method, item.uri)
        console.log("    Expect:", item.expect, "\n     Check:", check);
    } else {
        console.log("----- Passed: ", i);
    }
}

console.log("\n-----------------------------------");
console.log("Routes: \n", util.inspect(router.getRoutes(), { depth: 10 }));
console.log("Handlers: \n", router._callbacks);
