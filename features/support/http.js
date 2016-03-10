var Timeout = require('node-timeout');
var request = require('request');

module.exports = function () {
    // Converts an array [["param","val1"], ["param","val2"]] into param=val1&param=val2
    this.paramsToString = (params) => {
        var kvPairs = params.map((kv) => kv[0].toString() + '=' + kv[1].toString());
        var url = kvPairs.length ? kvPairs.join('&') : '';
        return url.trim();
    }

    this.sendRequest = (baseUri, parameters, callback) => {
        var limit = Timeout(this.OSRM_TIMEOUT, { err: { statusCode: 408 } });

        var runRequest = (cb) => {
            var uriString = baseUri,
                params = this.paramsToString(parameters);

            if (params.length) uriString += '?' + params;

            var options = this.httpMethod === 'POST' ? {
                method: 'POST',
                body: params,
                url: uriString          // TODO is this right? or does it need w/o params?
            } : uriString;

            request(options, (err, res, body) => {
                if (err && err.code === 'ECONNREFUSED') {           // TODO is this the code? or sth else?
                    throw new Error('*** osrm-routed is not running.');
                } else if (err && err.statusCode === 408) {         // TODO i think this is timeout code -- verify and/or clarify
                    throw new Error();
                }

                return cb(err, res, body);
            });
        }
        // TODO reimplement timeout
        runRequest(callback);

        // runRequest(limit((err, res, body) => {
        //     if (err) {
        //         if (err.statusCode === 408)
        //             return callback(this.RoutedError('*** osrm-routed did not respond'));
        //         else if (err.code === 'ECONNREFUSED')       // TODO is this right?
        //             return callback(this.RoutedError('*** osrm-routed is not running'));
        //     }
        //     return callback(err, res, body);
        // }));
    }
}
