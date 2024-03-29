// from http://justinjohnson.org/javascript/getting-started-with-gulp-and-browserify/#project-structure
/*
 * Configuration
 */

const JS_BASE_DIR = "./applications/client/";
const APPS_GLOB = JS_BASE_DIR + "/apps/**/*.js";
const APPS_DIST_DIR = "./public_html/javascript/apps/";
const TESTS_GLOB = "./tests/client/**/*.js";
 
const EXTERNAL_LIBS = {
    jquery: "./node_modules/jquery/dist/jquery.min.js",
    bootstrap: "./node_modules/bootstrap/dist/js/bootstrap.min.js"
};
const BROWSERIFY_TRANSFORMS = ["brfs"];
 
const LAST_DEPENDENCY_UPDATE_ID_FILE = ".npmDependenciesLastCommitId";
const AUTO_BUILD_FLAG_FILE = ".autobuild";
 
const SIZE_OPTS = {
    showFiles: true,
    gzip: true
};
const LINT_OPTS = {
    unused: true,
    eqnull: true,
    jquery: true
};
const ALLOW_NPM_MODULE_MANAGEMENT = true;

process.env.NODE_PATH = JS_BASE_DIR + ":" + (process.env.NODE_PATH || "");

/**
 * Externalize all site-wide libraries into one file.  Since these libraries are all sizable, it would be better for the
 * client to request it individually once and then retreive it from the cache than to include all of these files into
 * each and every browserified application. 
 */
gulp.task("build-common-lib", function() {
    var paths = [];
    
    // Get just the path to each externalizable lib.
    _.forEach(EXTERNAL_LIBS, function(path) {
        paths.push(path);
    });
    
    return gulp.src(paths)
        // Log each file that will be concatenated into the common.js file.
        .pipe(size(SIZE_OPTS))
        // Concatenate all files.
        .pipe(concat("common.min.js"))
        // Minify the result.
        .pipe(uglify())
        // Log the new file size.
        .pipe(size(SIZE_OPTS))
        // Save that file to the appropriate location.
        .pipe(gulp.dest(APPS_DIST_DIR + "../lib/"));
});

/**
 * Browserify and minify each individual application found with APPS_GLOB.  Each file therein represents a separate
 * application and should have its own resultant bundle.
 */
gulp.task("build", function() {
    var stream = gulp.src(APPS_GLOB)
        .pipe(forEach(function(stream, file) {
            return bundle(file, getBundler(file));
        }));
        
    // A normal build has completed, remove the flag file.
    shell.rm("-f", AUTO_BUILD_FLAG_FILE);
    
    return stream;
});

/**
 * Get a properly configured bundler for manual (browserify) and automatic (watchify) builds.
 * 
 * @param {object} file The file to bundle (a Vinyl file object).
 * @param {object|null} options Options passed to browserify.
 */
function getBundler(file, options) {
    options = _.extend(options || {}, {
        // Enable source maps.
        debug: true,
        // Configure transforms.
        transform: BROWSERIFY_TRANSFORMS
    });
    
    // Initialize browserify with the file and options provided.
    var bundler = browserify(file.path, options);
    
    // Exclude externalized libs (those from build-common-lib).
    Object.keys(EXTERNAL_LIBS).forEach(function(lib) {
        bundler.external(lib);
    });
 
    return bundler;
}

/**
 * Build a single application with browserify creating two differnt versions: one normal and one minified.
 * 
 * @param {object} file The file to bundle (a Vinyl file object).
 * @param {browserify|watchify} bundler  The bundler to use.  The "build" task will use browserify, the "autobuild" task will use watchify.
 */
function bundle(file, bundler) {
    // Remove file.base from file.path to create a relative path.  For example, if file looks like
    //   file.base === "/Users/johnsonj/dev/web/super-project/applications/client/<i>apps</i>/"
    //   file.path === "/Users/johnsonj/dev/web/super-project/applications/client/<i>apps</i>/login/reset-password/confirm.js"
    // then result is "login/reset-password/confirm.js"
    var relativeFilename = file.path.replace(file.base, "");
    
    return bundler
        // Log browserify errors
        .on("error", util.log.bind(util, "Browserify Error"))
        // Bundle the application
        .bundle()
        // Rename the bundled file to relativeFilename 
        .pipe(source(relativeFilename))
        // Convert stream to a buffer
        .pipe(buffer())
        // Save the source map for later (uglify will remove it since it is a comment)
        .pipe(sourcemaps.init({loadMaps: true}))
        // Save normal source (useful for debugging)
        .pipe(gulp.dest(APPS_DIST_DIR))
        // Minify source for production
        .pipe(uglify())
        // Restore the sourceMap
        .pipe(sourcemaps.write())
        // Add the .min suffix before the extension
        .pipe(rename({suffix: ".min"}))
        // Debuging output
        .pipe(size(SIZE_OPTS))
        // Write the minified file.
        .pipe(gulp.dest(APPS_DIST_DIR));
}

/**
 * Watch applications and their dependencies for changes and automatically rebuild them.  This will keep build times small since
 * we don't have to manually rebuild all applications everytime we make even the smallest/most isolated of changes. 
 */
gulp.task("autobuild", function() {
    return gulp.src(APPS_GLOB)
        .pipe(forEach(function(stream, file) {
            // Get our bundler just like in the "build" task, but wrap it with watchify and use the watchify default args (options).
            var bundler = watchify(getBundler(file, watchify.args));
            
            function rebundle() {
                // When an automatic build happens, create a flag file so that we can prevent committing these bundles because of
                // the full paths that they have to include.  A Git pre-commit hook will look for and block commits if this file exists.
                // A manual build is require before bundled assets can be committed as it will remove this flag file.
                shell.exec("touch " + AUTOBUILD_FLAG_FILE);
                
                return bundle(file, bundler);
            }
            
            // Whenever the application or its dependencies are modified, automatically rebundle the application.
            bundler.on("update", rebundle);
 
            // Rebundle this application now.           
            return rebundle();
        }));
});

/**
 * Run tests with tape and cleanup the output with faucet.
 */
gulp.task("test", function() {
    shell.exec("tape " + TESTS_GLOB + " | faucet");
});

/**
 * Automatically run tests anytime anything is changed (tests or test subjects).
 */
gulp.task("autotest", function() {
    gulp.watch(
        [JS_BASE_DIR + "**/*.js", TESTS_GLOB], 
        ["test"]
    );
});

/**
 * Linter for the most basic of quality assurance.
 */
gulp.task("lint", function() {
    return gulp.src(JS_BASE_DIR + "**/*.js")
        .pipe(jshint(LINT_OPTS))
        .pipe(jshint.reporter("default"));
});