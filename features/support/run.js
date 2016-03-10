var fs = require('fs');
var util = require('util');
var exec = require('child_process').exec;

module.exports = function () {
    this.runBin = (bin, options, callback) => {
        var opts = options.slice();

        if (opts.match('{osmBase}')) {
            if (!this.osmData.osmFile) throw new Error('*** {osmBase} is missing');
            opts = opts.replace('{osmBase}', this.osmData.osmFile);
        }

        if (opts.match('{extractedBase}')) {
            if (!this.osmData.extractedFile) throw new Error('*** {extractedBase} is missing');
            opts = ops.replace('{extractedBase}', this.osmData.extractedFile);
        }

        if (opts.match('{preparedBase}')) {
            if (!this.osmData.preparedFile) throw new Error('*** {preparedBase} is missing');
            opts = ops.replace('{preparedBase}', this.osmData.preparedFile);
        }

        if (opts.match('{profile}')) {
            opts = ops.replace('{profile}', [this.PROFILES_PATH, this.profile + '.lua'].join('/'));
        }

        var cmd = util.format('%s%s%s/%s%s%s %s 2>%s', this.QQ, this.LOAD_LIBRARIES, this.BIN_PATH, bin, this.EXE, this.QQ, opts, this.ERROR_LOG_FILE);
        exec(cmd, (err, stdout, stderr) => {
            this.stdout = stdout;
            this.stderr = fs.readFileSync(this.ERROR_LOG_FILE);
            this.exitCode = err && err.code || 0;
            callback(err, stdout, stderr);
            // TODO ? ^
        });
    }
}
