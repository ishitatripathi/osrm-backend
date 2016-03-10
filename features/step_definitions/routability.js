var util = require('util');
var d3 = require('d3-queue');
var classes = require('../support/data_classes');

module.exports = function () {
    this.Then(/^routability should be$/, (table, callback) => {
        this.buildWaysFromTable(table, () => {
            var directions = ['forw','backw','bothw'];

            if (!directions.some(k => !!table.hashes()[0].hasOwnProperty(k))) {
               throw new Error('*** routability table must contain either "forw", "backw" or "bothw" column');
            }
            this.reprocessAndLoadData(() => {
                var testRow = (row, i, cb) => {
                    var outputRow = row,
                        attempts = [];

                    testRoutabilityRow(i, (result) => {
                        directions.filter(d => !!table.hashes()[0][d]).forEach((direction) => {
                            var want = this.shortcutsHash[row[direction]] || row[direction];

                            switch (true) {
                                case '' === want:
                                case 'x' === want:
                                    outputRow[direction] = result[direction].status ?
                                        result[direction].status.toString() : '';
                                    break;
                                case /^\d+s/.test(want):
                                    break;
                                case /^\d+ km\/h/.test(want):
                                    break;
                                default:
                                    throw new Error(util.format('*** Unknown expectation format: %s', want));
                            }

                            if (this.FuzzyMatch.match(outputRow[direction], want)) {
                                outputRow[direction] = row[direction];
                            }
                        });

                        if (outputRow != row) {  // TODO i'm not sure this inequality is going to work?
                            this.logFail(row, outputRow, result);
                        }

                        cb(null, outputRow);
                    }, row);
                }

                this.processRowsAndDiff(table, testRow, callback);
            });
        });
    });

    var testRoutabilityRow = (i, cb, row) => {
        var result = {};

        var testDirection = (dir, callback) => {
            var a = new classes.Location(this.origin[0] + (1+this.WAY_SPACING*i) * this.zoom, this.origin[1]),
                b = new classes.Location(this.origin[0] + (3+this.WAY_SPACING*i) * this.zoom, this.origin[1]),
                r = {};

            r.which = dir;

            this.requestRoute((dir === 'forw' ? [a, b] : [b, a]), [], this.queryParams, (err, res, body) => {
                // TODO err handling

                // r.query = this.query;
                r.json = JSON.parse(body);
                // TODO it seems this is unnecessary? refactor/remove this.routeStatus
                r.status = this.routeStatus(res) === 200 ? 'x' : null;
                if (r.status) {
                    r.route = this.wayList(r.json.route_instructions);

                    if (r.route === util.format('w%d', i)) {
                        r.time = r.json.route_summary.total_time;
                        r.distance = r.json.route_summary.total_distance;
                        r.speed = r.time > 0 ? parseInt(3.6 * r.distance / r.time) : null;
                    } else {
                        // if we hit the wrong one way segment, we assume
                        // it's becaues the one we tested was not unroutable
                        // TODO this comment tho ...?
                        r.status = null;
                    }
                }

                callback(null, r);
            });
        }

        d3.queue()
            .defer(testDirection, 'forw')
            .defer(testDirection, 'backw')
            .awaitAll((err, res) => {
                // check if forw and backw returned the same values
                res.forEach((dirRes) => {
                    var which = dirRes.which;
                    delete dirRes.which;
                    result[which] = dirRes;
                });

                result.bothw = {};
                ['status', 'time', 'distance', 'speed'].forEach((key) => {
                    if (result.forw[key] === result.backw[key]) {
                        result.bothw[key] = result.forw[key];
                    } else {
                        result.bothw[key] = 'diff';
                    }
                });

                cb(result);
            });
    }
}
