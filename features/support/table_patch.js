var DifferentError = require('./exception_classes').TableDiffError;

module.exports = function () {
    this.diffTables = (expected, actual, options, callback) => {
        options = Object.assign({}, {
            missingRow: true,
            surplusRow: true,
            missingCol: true,
            surplusCol: true,
            misplacedCol: true
        }, options);

        var error = new DifferentError(expected, actual);

        return callback(error.string);
    }
}
