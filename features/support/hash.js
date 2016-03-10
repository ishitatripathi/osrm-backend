var fs = require('fs');
var util = require('util');
var path = require('path');
var sha1 = require('sha1');

module.exports = function () {
    this.hashOfFiles = (paths) => {
        paths = Array.isArray(paths) ? paths : [paths];
        var buf = '';
        paths.forEach((path) => {
            fs.readFile(path, (err, data) => {
                buf += data;
            });
        });
        return sha1(buf);
    }

    this.hashProfile = () => {
        return this.hashOfFiles(path.resolve(this.PROFILES_PATH, this.profile + '.lua'));
    }

    return this;
}
