var fs = require('fs');
var path = require('path');
var util = require('util');
var sha1 = require('sha1');
var d3 = require('d3-queue');
var OSM = require('./build_osm');
var classes = require('./data_classes');

module.exports = function () {
    this.initializeOptions = (callback) => {
        this.profile = this.profile || this.DEFAULT_SPEEDPROFILE;

        this.OSMDB = this.OSMDB || new OSM.DB();

        this.nameNodeHash = this.nameNodeHash || {};

        this.locationHash = this.locationHash || {};

        this.nameWayHash = this.nameWayHash || {};

        this.osmData = new classes.osmData(this);

        this.STRESS_TIMEOUT = 300;

        this.OSRMLoader = this._OSRMLoader();

        this.PREPROCESS_LOG_FILE = path.resolve(this.TEST_FOLDER, 'preprocessing.log');

        this.LOG_FILE = path.resolve(this.TEST_FOLDER, 'fail.log');

        this.HOST = 'http://127.0.0.1:' + this.OSRM_PORT;

        this.DESTINATION_REACHED = 15;  // OSRM instruction code

        this.shortcutsHash = this.shortcutsHash || {};

        var hashLuaLib = (cb) => {
            fs.readdir(path.normalize(this.PROFILES_PATH + '/lib/'), (err, files) => {
                if (err) cb(err);
                var luaFiles = files.filter(f => !!f.match(/\.lua$/)).map(f => path.normalize(this.PROFILES_PATH + '/lib/' + f));
                this.hashOfFiles(luaFiles, hash => {
                    this.luaLibHash = hash;
                    cb();
                })
            });
        }

        var hashProfile = (cb) => {
            this.hashProfile((hash) => {
                this.profileHash = hash;
                cb();
            });
        }

        var hashExtract = (cb) => {
            this.hashOfFiles(util.format('%s/osrm-extract%s', this.BIN_PATH, this.EXE), (hash) => {
                this.binExtractHash = hash;
                cb();
            });
        }

        var hashPrepare = (cb) => {
            this.hashOfFiles(util.format('%s/osrm-prepare%s', this.BIN_PATH, this.EXE), (hash) => {
                this.binPrepareHash = hash;
                this.fingerprintPrepare = sha1(this.binPrepareHash);
                cb();
            });
        }

        var hashRouted = (cb) => {
            this.hashOfFiles(util.format('%s/osrm-routed%s', this.BIN_PATH, this.EXE), (hash) => {
                this.binRoutedHash = hash;
                this.fingerprintRoute = sha1(this.binRoutedHash);
                cb();
            });
        }

        var q = d3.queue()
            .defer(hashLuaLib)
            .defer(hashProfile)
            .defer(hashExtract)
            .defer(hashPrepare)
            .defer(hashRouted)
            .awaitAll(() => {
                this.fingerprintExtract = sha1([this.profileHash, this.luaLibHash, this.binExtractHash].join('-'));
                callback();
            });
    }

    this.setProfileBasedHashes = () => {
        this.fingerprintExtract = sha1([this.profileHash, this.luaLibHash, this.binExtractHash].join('-'));
        this.fingerprintPrepare = sha1(this.binPrepareHash);
    }

    this.setProfile = (profile, cb) => {
        var lastProfile = this.profile;
        if (profile !== lastProfile) {
            this.profile = profile;
            this.hashProfile((hash) => {
                this.profileHash = hash;
                this.setProfileBasedHashes();
                cb();
            });
        } else cb();
    }

    this.setExtractArgs = (args) => {
        this.extractArgs = args;
    }
}
