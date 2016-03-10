var util = require('util');

module.exports = function () {
    this.When(/^I request a travel time matrix I should get$/, (table) => {
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
                var node = findNodeByName(nodeName);
                if (!node) throw new Error(util.format('*** unknown node "%s"'), nodeName);
                waypoints.push({ coord: node, type: 'dst' });
            });
            rowHeaders.forEach((nodeName) => {
                var node = findNodeByName(nodeName);
                if (!node) throw new Error(util.format('*** unknown node "%s"'), nodeName);
                waypoints.push({ coord: node, type: 'src' });
            });
        }

        var actual = [];
        actual.push(table.headers);

        this.reprocessAndLoadData(() => {
            // compute matrix
            var params = this.queryParams,
                response = this.requestTable(waypoints, params);
            if (response.body.length) {
                var jsonResult = JSON.parse(response.body),
                    result = jsonResult['distance_table'];
            }

            // compare actual and expected results, one row at a time
            table.rows.forEach((row, ri) => {
                // fuzzy match
                var ok = true;

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

                r = [].concat.apply([], row[0], result[ri]);
                actual.push(r);
            });
        });
        // TODO IDK ABOUT THIS -- rb =
        // table.diff! actual
        table.diff(actual);
    });
}
