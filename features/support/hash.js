var fs = require('fs');
var util = require('util');
var path = require('path');
var sha1 = require('sha1');
var d3 = require('d3-queue');

module.exports = function () {
    this.hashOfFiles = (paths, cb) => {
        paths = Array.isArray(paths) ? paths : [paths];
        var buf = '';

        var q = d3.queue(1);

        var addFile = (path, cb) => {
            fs.readFile(path, (err, data) => {
                buf += data;
                cb(err);
            });
        }

        paths.forEach(path => { q.defer(addFile, path); });

        q.awaitAll(err => {
            if (err) throw new Error('*** Error reading files:', err);
            cb(sha1(buf));
        });
    }

    this.hashProfile = (cb) => {
        this.hashOfFiles(path.resolve(this.PROFILES_PATH, this.profile + '.lua'), cb);
    }

    return this;
}
