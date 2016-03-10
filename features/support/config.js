var fs = require('fs');
var path = require('path');
var util = require('util');
var sha1 = require('sha1');
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

        // this.osmStr = new classes._osmStr(this.OSMDB);

        // this._fingerprintOSM = '';

        // this._osmHash = '';

        // this.osmFile = this.osmFile || path.resolve(this.DATA_FOLDER, this.fingerprintOSM());

        // this.extractedFile = this.extractedFile || path.resolve([this.osmFile, this.fingerprintExtract].join('_'));

        // this.preparedFile = this.preparedFile || path.resolve([this.osmFile, this.fingerprintExtract, this.fingerprintPrepare].join('_'));

        if (!this.luaLibHash) {
            fs.readdir(path.normalize(this.PROFILES_PATH, '/lib/'), (err, files) => {
                if (err) throw err;
                var luaFiles = files.filter(f => !!f.match(/\.lua$/)).map(f => path.resolve(this.PROFILES_PATH, '/lib/', f));
                this.luaLibHash = this.hashOfFiles(luaFiles);
            });
        }

        this.profileHash = this.hashProfile();

        this.binExtractHash = this.binExtractHash || this.hashOfFiles(util.format('%s/osrm-extract%s', this.BIN_PATH, this.EXE));

        this.binPrepareHash = this.binPrepareHash || this.hashOfFiles(util.format('%s/osrm-prepare%s', this.BIN_PATH, this.EXE));

        this.binRoutedHash = this.binRoutedHash || this.hashOfFiles(util.format('%s/osrm-routed%s', this.BIN_PATH, this.EXE));

        this.fingerprintExtract = this.fingerprintExtract || sha1([this.profileHash, this.luaLibHash, this.binExtractHash].join('-'));

        this.fingerprintPrepare = this.fingerprintPrepare || sha1(this.binPrepareHash);

        this.fingerprintRoute = this.fingerprintRoute || sha1(this.binRoutedHash);

        this.STRESS_TIMEOUT = 300;

        this.OSRMLoader = this._OSRMLoader();

        this.PREPROCESS_LOG_FILE = path.resolve(this.TEST_FOLDER, 'preprocessing.log');

        this.LOG_FILE = path.resolve(this.TEST_FOLDER, 'fail.log');

        this.HOST = 'http://127.0.0.1:' + this.OSRM_PORT;

        this.DESTINATION_REACHED = 15;              // OSRM instruction code

        this.shortcutsHash = this.shortcutsHash || {};

        callback();
    }



    this.resetProfile = () => {
        this.profile = null;
        this.setProfile(this.DEFAULT_SPEEDPROFILE);
    }

    this.setProfile = (profile) => {
        this.profile = profile;
    }

    this.setExtractArgs = (args) => {
        this.extractArgs = args;
    }
}
