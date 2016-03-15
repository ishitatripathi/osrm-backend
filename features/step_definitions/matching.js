var util = require('util');

module.exports = function () {
    this.When(/^I match I should get$/, (table, callback) => {
        var actual = [],
            response,
            got;

        this.reprocessAndLoadData(() => {
            var testRow = (row, ri, cb) => {
                if (row.request) {
                    got = {};
                    got.request = row.request;
                    response = this.requestUrl(row.request);
                } else {
                    var params = this.queryParams;
                    got = {};
                    for (var k in row) {
                        var match = k.match(/param:(.*)/);
                        if (match) {
                            if (row[k] === '(nil)') {
                                params[match[1]] = null;
                            } else if (row[k]) {
                                params[match[1]] = [row[k]];
                            }
                            got[k] = row[k];
                        }
                    }

                    var trace = [],
                        timestamps = [];

                    if (row.trace) {
                        for (var i=0; i<row.trace.length; i++) {
                            // TODO without trimming row.trace, am I including whitespace? may error here. the rb trims each indiv char but ??
                            var n = row.trace[i],
                                node = this.findNodeByName(n);
                            if (!node) throw new Error(util.format('*** unknown waypoint node "%s"'), n);
                            trace.push(node);
                        }
                        if (row.timestamps) {
                            // do i need to trim() here?
                            timestamps = row.timestamps.split(' ').filter(s => !!s).map(t => parseInt(t));
                        }
                        got.trace = row.trace;
                        response = requestMatching(trace, timestamps, params);
                    } else {
                        throw new Error('*** no trace');
                    }
                }

                var json;

                if (response.body.length) {
                    json = JSON.parse(response.body);
                }

                if (table.headers.status) {
                    got.status = json.status.toString();
                }

                if (table.headers.message) {
                    got.message = json.status_message;
                }

                if (table.headers['#']) {
                    // comment column
                    got['#'] = row['#'];
                }

                var subMatchings = [],
                    turns = '',
                    route = '',
                    duration = '';

                if (response.code === '200') {
                    if (table.headers.matchings) {
                        subMatchings = json.matchings.filter(m => !!m).map(sub => sub.matched_points);
                    }

                    if (table.headers.turns) {
                        if (json.matchings.size != 1) throw new Error('*** Checking turns only supported for matchings with one subtrace');
                        turns = turnList(json.matchings[0].instructions);
                    }

                    if (table.headers.route) {
                        if (json.matchings.size != 1) throw new Error('*** Checking route only supported for matchings with one subtrace');
                        route = wayList(json.matchings[0].instructions);
                    }

                    if (table.headers.duration) {
                        if (json.matchings.size != 1) throw new Error('*** Checking duration only supported for matchings with one subtrace');
                        duration = json.matchings[0].route_summary.total_time;
                    }
                }

                if (table.headers.turns) {
                    got.turns = turns;
                }

                if (table.headers.route) {
                    got.route = route;
                }

                if (table.headers.duration) {
                    got.duration = duration.toString();
                }

                ok = true;
                var encodedResult = '',
                    extendedTarget = '';

                row.matchings.split(',').forEach((sub, si) => {
                    if (si >= subMatchings.length) {
                        // ok = false;
                        cb(true);
                    } else {
                        var sq = d3.queue();

                        var testSubMatching = (ni, scb) => {
                            var node = this.findNodeByName(sub[ni]),
                                outNode = subMatchings[si][ni];

                            if (this.FuzzyMatch.matchLocation(outNode, node)) {
                                encodedResult += sub[ni];
                                extendedTarget += sub[ni];
                            } else {
                                encodedResult += util.format('? [%s,%s]', outNode[0], outNode[1]);
                                extendedTarget += util.format('%s [%d,%d]');            // TODO these may also be strings (%s) ? idk
                                ok = false;
                            }
                            scb(!ok);
                        }

                        sq.awaitAll((err) => {
                            if (ok) {
                                if (table.headers.matchings) {
                                    got.matchings = row.matchings;
                                }

                                if (table.headers.timestamps) {
                                    got.timestamps = row.timestamps;
                                }
                            } else {
                                got.matchings = encodedResult;
                                row.matchings = extendedTarget;
                                this.logFail(row, got, { matching: { query: query, response: response } });
                            }

                            cb(null, got);
                        });
                    }
                });
            };

            this.processRowsAndDiff(table, testRow, callback);
        });
    });
}
