var fs = require('fs');
var path = require('path');
var util = require('util');
var exec = require('child_process').exec;
var d3 = require('d3-queue');

var OSM = require('./build_osm');
var classes = require('./data_classes');

module.exports = function () {
    this.setGridSize = (meters) => {
        // the constant is calculated (with BigDecimal as: 1.0/(DEG_TO_RAD*EARTH_RADIUS_IN_METERS
        // see ApproximateDistance() in ExtractorStructs.h
        // it's only accurate when measuring along the equator, or going exactly north-south
        // TODO these comments are ported directly
        this.zoom = parseFloat(meters) * 0.8990679362704610899694577444566908445396483347536032203503E-5;
    }

    this.setOrigin = (origin) => {
        this.origin = origin;
    }

    this.buildWaysFromTable = (table, callback) => {
        // add one unconnected way for each row
        var buildRow = (row, ri, cb) => {
            // TODO comments ported directly
            // NOTE: currently osrm crashes when processing an isolated oneway with just 2 nodes, so we use 4 edges
            // this is related to the fact that a oneway dead-end street doesn't make a lot of sense

            // if we stack ways on different x coordinates, routability tests get messed up, because osrm might pick a neighboring way if the one test can't be used.
            // instead we place all lines as a string on the same y coordinate. this prevents using neighboring ways.

            // add some nodes

            var makeFakeNode = (namePrefix, offset) => {
                return new OSM.Node(this.makeOSMId(), this.OSM_USER, this.OSM_TIMESTAMP,
                    this.OSM_UID, this.origin[0]+(offset + this.WAY_SPACING * ri) * this.zoom,
                    this.origin[1], {name: util.format('%s%d', namePrefix, ri)});
            }

            var nodes = ['a','b','c','d','e'].map((l, i) => makeFakeNode(l, i));

            nodes.forEach(node => { this.OSMDB.addNode(node); });

            // ...with a way between them
            var way = new OSM.Way(this.makeOSMId(), this.OSM_USER, this.OSM_TIMESTAMP, this.OSM_UID);

            nodes.forEach(node => { way.addNode(node); });

            // remove tags that describe expected test result, reject empty tags
            var tags = {};
            for (var key in row) {
                if (!key.match(/^forw\b/) &&
                    !key.match(/^backw\b/) &&
                    !key.match(/^bothw\b/) &&
                    row[key].length)
                    tags[key] = row[key];
            }

            var wayTags = { highway: 'primary' },
                nodeTags = {};

            for (var key in tags) {
                var nodeMatch = key.match(/node\/(.*)/);
                if (nodeMatch) {
                    if (tags[key] === '(nil)') {
                        delete nodeTags[key];    // TODO this seems useless
                    } else {
                        nodeTags[nodeMatch[1]] = tags[key];
                    }
                } else {
                    if (tags[key] === '(nil)') {
                        delete wayTags[key];    // TODO this seems useless
                    } else {
                        wayTags[key] = tags[key];
                    }
                }
            }

            wayTags.name = util.format('w%d', ri);
            way.setTags(wayTags);
            this.OSMDB.addWay(way);

            for (var k in nodeTags) {
                nodes[2].addTag(k, nodeTags[k]);     // TODO i wonder why only node[2] (node3) ??
            }
            cb();
        };

        var q = d3.queue();
        table.hashes().forEach((row, ri) => {
            q.defer(buildRow, row, ri);
        });

        q.awaitAll(callback);
    }

    this.tableCoordToLonLat = (ci, ri) => {
        return [this.origin[0] + ci * this.zoom, this.origin[1] - ri * this.zoom];
    }

    this.addOSMNode = (name, lon, lat, id) => {
    // function Node(id, this.OSM_USER, this.OSM_TIMESTAMP, this.OSM_UID, lon, lat, tags) {
        id = id || this.makeOSMId();
        var node = new OSM.Node(id, this.OSM_USER, this.OSM_TIMESTAMP, this.OSM_UID, lon, lat, {name: name});
        this.OSMDB.addNode(node);
        this.nameNodeHash[name] = node;
    }

    this.addLocation = (name, lon, lat) => {
        this.locationHash[name] = new classes.Location(lon, lat);
    }

    this.findNodeByName = (s) => {
        if (s.length !== 1) throw new Error(util.format('*** invalid node name "%s", must be single characters', s));
        if (!s.match(/[a-z0-9]/)) throw new Error(util.format('*** invalid node name "%s", must be alphanumeric', s));

        var fromNode;
        if (s.match(/[a-z]/)) {
            fromNode = this.nameNodeHash[s.toString()];
        } else {
            fromNode = this.locationHash[s.toString()]
        }
        // TODO this return is right right?? didn't look like ruby did but
        return fromNode;
    }

    this.findWayByName = (s) => {
        return this.nameWayHash[s.toString()] || this.nameWayHash[s.toString().split('').reverse().join('')];
    }

    this.resetData = () => {
        // TODO these are commented out in rb...?
        // clearFiles(this.TEST_FOLDER, /\.log$/);
        // clearFiles(this.DATA_FOLDER, /$test\./);
        // this.resetProfile();
        this.resetOSM();
        // this._fingerprintOSM = '';
        // TODO also class-ify
        // this.fingerprintExtract = null;
        // this.fingerprintPrepare = null;
        // this.fingerprintRoute = null;
    }

    function clearFiles (dir, re) {
        fs.readdir(path.resolve(dir), (err, files) => {
            if (err) throw err;
            files.forEach(file => {
                if (file.match(re)) fs.unlinkSync(path.resolve(dir, file));
            });
        });
    }
    this.makeOSMId = () => {
        this.osmID = this.osmID + 1;
        return this.osmID;
    }

    this.resetOSM = () => {
        this.OSMDB.clear();
        this.osmData.reset();
        this.nameNodeHash = {};
        this.locationHash = {};
        this.nameWayHash = {};
        // this.osmStr.clear();
        // this.osmHash = null;
        this.osmID = 0;
    }

    this.writeOSM = (callback) => {
        // TODO un-syncify all of this
        if (!fs.existsSync(this.DATA_FOLDER)) fs.mkdirSync(this.DATA_FOLDER);
        var osmPath = path.resolve(this.DATA_FOLDER, util.format('%s.osm', this.osmData.osmFile));
        if (!fs.existsSync(osmPath)) {
            fs.writeFile(osmPath, this.osmData.str, callback);
        } else callback();
    }

    this.isExtracted = (callback) => {
        fs.exists(util.format('%s.osrm', this.osmData.extractedFile), (core) => {
            if (!core) return callback(false);
            fs.exists(util.format('%s.osrm.names', this.osmData.extractedFile), (names) => {
                if (!names) return callback(false);
                fs.exists(util.format('%s.osrm.restrictions', this.osmData.extractedFile), (restrictions) => {
                    return callback(restrictions);
                });
            });
        });
    }

    this.isPrepared = (callback) => {
        fs.exists(util.format('%s.osrm.hsgr', this.osmData.preparedFile), callback);
    }

    this.writeTimestamp = (callback) => {
        fs.writeFile(util.format('%s.osrm.timestamp', this.osmData.preparedFile), this.OSM_TIMESTAMP, callback);
    }

    this.writeInputData = (callback) => {
        this.writeOSM((err) => {
            if (err) return callback(err);
            this.writeTimestamp(callback)});
    }

    this.extractData = (callback) => {
        this.logPreprocessInfo();
        this.log(util.format('== Extracting %s.osm...', this.osmData.osmFile), 'preprocess');
        // TODO replace with lib?? or just w runBin cmd
        // TODOTODO tests sometimes race and hit /var/tmp/stxxl at the same time, and this doesn't fail loudly enough to stop an ENOENT error when trying to rename files that don't exist -- investigate
        process.chdir(this.TEST_FOLDER);
        exec(util.format('%s%s/osrm-extract %s.osm %s --profile %s/%s.lua >>%s 2>&1',
            this.LOAD_LIBRARIES, this.BIN_PATH, this.osmData.osmFile, this.extractArgs || '', this.PROFILES_PATH, this.profile, this.PREPROCESS_LOG_FILE), (err, stdout, stderr) => {
            if (err) {
                this.log(util.format('*** Exited with code %d', err.code), 'preprocess');
                return callback(this.ExtractError(err.code, util.format('osrm-extract exited with code %d', err.code)));
            }

            var q = d3.queue();

            var rename = (file, cb) => {
                this.log(util.format('Renaming %s.%s to %s.%s', this.osmData.osmFile, file, this.osmData.extractedFile, file), 'preprocess');
                fs.rename([this.osmData.osmFile, file].join('.'), [this.osmData.extractedFile, file].join('.'), (err) => {
                    if (err) return cb(this.FileError(null, 'failed to rename data file after extracting'));
                    cb();
                });
            }

            ['osrm','osrm.names','osrm.restrictions','osrm.ebg','osrm.enw','osrm.edges','osrm.fileIndex','osrm.geometry','osrm.nodes','osrm.ramIndex'].forEach((file) => {
                q.defer(rename, file);
            });

            q.awaitAll((err) => {
                this.log('Finished extracting ' + this.osmData.extractedFile, 'preprocess');
                process.chdir('../');
                callback(err);
            });
        });
    }

    this.prepareData = (callback) => {
        this.logPreprocessInfo();
        this.log(util.format('== Preparing %s.osm...', this.osmData.extractedFile), 'preprocess');
        process.chdir(this.TEST_FOLDER);
        exec(util.format('%s%s/osrm-prepare %s.osrm  --profile %s/%s.lua >>%s 2>&1',
            this.LOAD_LIBRARIES, this.BIN_PATH, this.osmData.extractedFile, this.PROFILES_PATH, this.profile, this.PREPROCESS_LOG_FILE), (err, stdout, stderr) => {
            if (err) {
                this.log(util.format('*** Exited with code %d', err.code), 'preprocess');
                return callback(this.PrepareError(err.code, util.format('osrm-prepare exited with code %d', err.code)));
            }

            var rename = (file, cb) => {
                this.log(util.format('Renaming %s.%s to %s.%s', this.osmData.extractedFile, file, this.osmData.preparedFile, file), 'preprocess');
                fs.rename([this.osmData.extractedFile, file].join('.'), [this.osmData.preparedFile, file].join('.'), (err) => {
                    if (err) return cb(this.FileError(null, 'failed to rename data file after preparing.'));
                    cb();
                });
            }

            var copy = (file, cb) => {
                this.log(util.format('Copying %s.%s to %s.%s', this.osmData.extractedFile, file, this.osmData.preparedFile, file), 'preprocess');
                fs.createReadStream([this.osmData.extractedFile, file].join('.'))
                    .pipe(fs.createWriteStream([this.osmData.preparedFile, file].join('.'))
                            .on('finish', cb)
                        )
                    .on('error', (err) => {
                        return cb(this.FileError(null, 'failed to copy data after preparing.'));
                    });
            }

            var q = d3.queue();

            ['osrm.hsgr','osrm.fileIndex','osrm.geometry','osrm.nodes','osrm.ramIndex','osrm.core','osrm.edges'].forEach((file) => {
                q.defer(rename, file);
            });

            ['osrm.names','osrm.restrictions','osrm'].forEach((file) => {
                q.defer(copy, file);
            });

            q.awaitAll((err) => {
                this.log('Finished preparing ' + this.osmData.preparedFile, 'preprocess');
                process.chdir('../');
                callback(err);
            });
        });
    }

    var noop = (cb) => cb();

    this.reprocess = (callback) => {
        this.writeAndExtract((e) => {
            if (e) return callback(e);
            this.isPrepared((isPrepared) => {
                var prepareFn = isPrepared ? noop : this.prepareData;
                if (isPrepared) this.log('Already extracted ' + this.osmData.preparedFile, 'preprocess');
                prepareFn((e) => {
                    if (e) return callback(e);
                    this.logPreprocessDone();
                    callback();
                });
            });
        })
    }

    this.writeAndExtract = (callback) => {
        this.osmData.populate(() => {
            this.writeInputData((e) => {
                if (e) return callback(e);
                this.isExtracted((isExtracted) => {
                    var extractFn = isExtracted ? noop : this.extractData;
                    if (isExtracted) this.log('Already extracted ' + this.osmData.extractedFile, 'preprocess');
                    extractFn((e) => {
                        callback(e);
                    });
                });
            });
        });
    }

    this.reprocessAndLoadData = (callback) => {
        this.reprocess(() => {
            this.OSRMLoader.load(util.format('%s.osrm', this.osmData.preparedFile), callback);
        });
    }

    this.processRowsAndDiff = (table, fn, callback) => {
        var q = d3.queue();

        table.hashes().forEach((row, i) => q.defer(fn, row, i));

        q.awaitAll((err, actual) => {
            if (err) return callback(err);
            this.diffTables(table, actual, {}, callback);
        });
    }
}
