var util = require('util');

module.exports = function () {
    this.When(/^I request a travel time matrix I should get$/, (table, callback) => {
        var NO_ROUTE = 2147483647    // MAX_INT

        if (table.headers[0] !== '') throw new Error('*** Top-left cell of matrix table must be empty');

        var waypoints = [],
            columnHeaders = [],
            rowHeaders = table.rows.map((h) => h[0]),
            symmetric = Set(columnHeaders) == Set(rowHeaders);

        if (symmetric) {
            columnHeaders.forEach((nodeName) => {
                var node = this.findNodeByName(nodeName);
                if (!node) throw new Error(util.format('*** unknown node "%s"'), nodeName);
                waypoints.push({ coord: node, type: 'loc' });
            });
        } else {
            columnHeaders.forEach((nodeName) => {
                var node = this.findNodeByName(nodeName);
                if (!node) throw new Error(util.format('*** unknown node "%s"'), nodeName);
                waypoints.push({ coord: node, type: 'dst' });
            });
            rowHeaders.forEach((nodeName) => {
                var node = this.findNodeByName(nodeName);
                if (!node) throw new Error(util.format('*** unknown node "%s"'), nodeName);
                waypoints.push({ coord: node, type: 'src' });
            });
        }

        var actual = [];
        actual.push(table.headers);

        this.reprocessAndLoadData(() => {
            // compute matrix
            var params = this.queryParams;

            this.requestTable(waypoints, params, (err, response, body) => {
                if (err) cb(err);
                if (!response.body.length) throw Error("TODO WTF");

                var jsonResult = JSON.parse(response.body),
                    result = jsonResult['distance_table'];

                var testRow = (row, ri, vb) => {
                    // fuzzy match
                    var ok = true;

                    // TODO is this going to race?
                    for (var i=0; i<=result[ri].length-1; i++) {
                        if (this.FuzzyMatch.match(result[ri][i], row[i+1])) {
                            result[ri][i] = row[i+1];
                        } else if (row[i+1] === '' && result[ri][i] === NO_ROUTE) {
                            result[ri][i] = '';
                        } else {
                            result[ri][i] = result[ri][i].toString();
                            ok = false;
                        }
                    }

                    if (!ok) {
                        // TODO i don't think i have this.query
                        var failed = { attempt: 'distance_matrix', query: this.query, response: response };
                        this.logFail(row, result[ri], [failed]);
                    }

                    r = [].concat.apply([], row[0], result[ri]);
                    cb(null, r);
                };

                this.processRowsAndDiff(table, testRow, callback);
            });
        });
    });
}
