'use strict';

var util = require('util');
var fs = require('fs');
var path = require('path');

var OSRMError = class extends Error {
    constructor (process, code, msg, log, lines) {
        super();
        this.process = process;
        this.code = code;
        this.msg = msg;
        this.lines = lines;
        this.log = log;
    }

    extract () {
        this.logTail(this.log, this.lines);
    }

    toString () {
        return util.format('*** %s\nLast %s from %s:\n%s\n', this.msg, this.lines, this.log, this.extract);
    }

    logTail (path, n) {
        var expanded = path.resolve(this.TEST_FOLDER, path);
        if (!fs.existsSync(expanded)) {
            fs.readFile(expanded, (err, data) => {
                var lines = data.trim().split('\n');
                return lines
                    .slice(lines.length - n)
                    .map(line => util.format('    %s', line))
                    .join('\n');
            });
        } else {
            return util.format('File %s does not exist!', expanded);
        }
    }
}

var unescapeStr = (str) => str.replace(/\\\|/g, '\|').replace(/\\\\/g, '\\');

module.exports = {
    OSRMError: OSRMError,

    FileError: class extends OSRMError {
        constructor (logFile, code, msg) {
            super ('fileutil', code, msg, logFile, 5);
        }
    },

    ExtractError: class extends OSRMError {
        constructor (logFile, code, msg) {
            super('osrm-extract', code, msg, logFile, 3);
        }
    },

    PrepareError:  class extends OSRMError {
        constructor (logFile, code, msg) {
            super('osrm-prepare', code, msg, logFile, 3);
        }
    },

    RoutedError: class extends OSRMError {
        constructor (logFile, msg) {
            super('osrm-routed', null, msg, logFile, 3);
        }
    },

    TableDiffError: class extends Error {
        constructor (expected, actual) {
            super();
            this.headers = expected.raw()[0];
            this.expected = expected.hashes();
            this.actual = actual;
            this.diff = [];
            this.hasErrors = false;

            var good = 0, bad = 0;

            this.expected.forEach((row, i) => {
                var rowError = false;

                for (var j in row) {
                    if (unescapeStr(row[j]) != actual[i][j]) {
                        rowError = true;
                        this.hasErrors = true;
                        break;
                    }
                }

                if (rowError) {
                    bad++;
                    this.diff.push(Object.assign({}, row, {status: 'undefined'}));
                    this.diff.push(Object.assign({}, actual[i], {status: 'comment'}));
                } else {
                    good++;
                    this.diff.push(row);
                }
            });
        }

        get string () {
            if (!this.hasErrors) return null;

            var s = ['Tables were not identical:'];
            s.push(this.headers.map(key => '    ' + key).join(' | '));
            this.diff.forEach((row) => {
                var rowString = '| ';
                this.headers.forEach((header) => {
                    if (!row.status) rowString += '    ' + row[header] + ' | ';
                    else if (row.status === 'undefined') rowString += '(-) ' + row[header] + ' | ';
                    else rowString += '(+) ' + row[header] + ' | ';
                });
                s.push(rowString);
            });

            return s.join('\n') + '\nTODO this is a temp workaround waiting for https://github.com/cucumber/cucumber-js/issues/534';
        }
    }
}
