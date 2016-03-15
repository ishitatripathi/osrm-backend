var fs = require('fs');
var util = require('util');
var exec = require('child_process').exec;

module.exports = function () {
    this.runBin = (bin, options, callback) => {
        var opts = options.slice();

        if (opts.match('{osm_base}')) {
            if (!this.osmData.osmFile) throw new Error('*** {osm_base} is missing');
            opts = opts.replace('{osm_base}', this.osmData.osmFile);
        }

        if (opts.match('{extracted_base}')) {
            if (!this.osmData.extractedFile) throw new Error('*** {extracted_base} is missing');
            opts = opts.replace('{extracted_base}', this.osmData.extractedFile);
        }

        if (opts.match('{prepared_base}')) {
            if (!this.osmData.preparedFile) throw new Error('*** {prepared_base} is missing');
            opts = opts.replace('{prepared_base}', this.osmData.preparedFile);
        }

        if (opts.match('{profile}')) {
            opts = opts.replace('{profile}', [this.PROFILES_PATH, this.profile + '.lua'].join('/'));
        }

        process.chdir('./test');
        var cmd = util.format('%s%s%s/%s%s%s %s 2>%s', this.QQ, this.LOAD_LIBRARIES, this.BIN_PATH, bin, this.EXE, this.QQ, opts, this.ERROR_LOG_FILE);
        exec(cmd, (err, stdout, stderr) => {
            this.stdout = stdout.toString();
            fs.readFile(this.ERROR_LOG_FILE, (e, data) => {
                this.stderr = data ? data.toString() : '';
                this.exitCode = err && err.code || 0;
                callback(err, stdout, stderr);
                process.chdir('../');
            });
        });
    }
}
