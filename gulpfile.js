'use strict'

const path 					= require('path')
const del 					= require('del')
const gulp 					= require('gulp')
const sourcemaps 			= require('gulp-sourcemaps')
const browserSync 			= require('browser-sync').create()
const postcss 				= require('gulp-postcss')
const svgSprite 			= require('gulp-svg-sprite')
const gulpif 				= require('gulp-if')
const plumber 				= require('gulp-plumber')
const notify 				= require('gulp-notify')
const uglifyjs 				= require('gulp-uglifyjs')
const concat 				= require('gulp-concat')
const browserify 			= require('browserify')
const babelify 				= require('babelify')
const watchify 				= require('watchify')
const source 				= require('vinyl-source-stream')
const buffer 				= require('vinyl-buffer')
const cssnext 				= require('postcss-cssnext')
const cssnano				= require("gulp-cssnano")
const postcssNested 		= require("postcss-nested")
const postcssImport 		= require("postcss-import")
const newer 				= require('gulp-newer')
const remember 				= require('gulp-remember')
const cached 				= require('gulp-cached')
const imagemin 				= require('gulp-imagemin')
const pngquant 				= require('imagemin-pngquant')
const imageminSvgo 			= require('imagemin-svgo')
const es 					= require('event-stream')
const tinypng 				= require('gulp-tinypng')

var config = {
	env: 'dev',
	url: "gulp.dev", 
	root: "./", 
	src: "src", 
	dst: "dist", 
	images: {
		src: ['/images/**/*.{jpg,png,svg,gif}', '/images/favicons/**/*.*'],
		base: '/images', 
		watch: '/images/**/*.*', 
		dst: '/images/'
	}, 
	files: {
		src: ['/files/**/*.*'],
		base: '/files', 
		dst: '/files/'
	}, 
	templates: {
		src: ['/**/*.{php,html,tpl,json}', '**/.htaccess'],
		watch: '/**/*.{php,html,tpl,json}',
		dst: ''
	},
	js: {
		src: ['/js/scripts.js'], 
		dst: '/js/'
	}, 
	css: {
		src: ['/css/style.css'], 
		watch: '/css/**/*.css', 
		dst: '/css/'
	}, 
	sprites: {
		src: '/sprites/**/*.svg', 
		dst: '/images/'
	}
}

gulp.task('serve', function() {
	browserSync.init({
		open: false, 
		proxy: config.url, 
		notify: false
	})

	browserSync.watch([config.dst+'/**/*.*', '!'+config.dst+'/**/*.map']).on('change', browserSync.reload)
})

function handleErrors() {
	var args = Array.prototype.slice.call(arguments)
	notify.onError({
		title: "Compile Error",
		message: "<%= error.message %>"
	}).apply(this, args)
	this.emit('end') // Keep gulp from hanging on this task
}

gulp.task('scripts', done => {
	var plugins = []
	if (config.env === 'dev') {
		plugins = [watchify]
	}
	const tasks = config.js.src.map(entry => {
		const filePath = config.src+entry
		
		let fileDistName = entry.split('/')
		fileDistName = fileDistName[fileDistName.length - 1]

		const b = browserify({
			entries: filePath, 
			debug: (config.env == 'dev') ? true : false, 
			cache: {},
			packageCache: {},
			extensions: ['js', 'jsx'],
			plugin: plugins,
			fullPaths: true
		}).transform(babelify.configure({
			presets: ["es2015", "stage-0"], 
			plugins: ["transform-decorators-legacy"]
		}))

		const bundle = () => {
			return b.bundle()
				.on('error', handleErrors)
				.pipe(source(fileDistName))
				.pipe(buffer())
				.pipe(gulp.dest(config.dst+config.js.dst))
		}

		b.on('update', bundle)
		return bundle()
	})
	es.merge(tasks).on('end', done)
})

gulp.task('styles', function(callback) {
	var processors = [
		postcssImport(), 
		postcssNested(), 
		cssnext({
			"browsers": "last 5 versions"
		})
	]

	const mappedFiles = {}
	config.css.src.map((path) => {
		let fileDistName = path.split('/')
		fileDistName = fileDistName[fileDistName.length - 1]

		mappedFiles[config.src+path] = fileDistName
	})

	Object.keys(mappedFiles).map((path) => {
		gulp.src(path)
			.pipe(gulpif(config.env === 'dev', sourcemaps.init()))
			.pipe(plumber({
					errorHandler: notify.onError(err => ({
					title: 'Styles',
					message: err.message
				}))
			}))
			.pipe(concat(mappedFiles[path]))
			.pipe(postcss(processors))
			.pipe(gulpif(config.env === 'prod', cssnano({
				core: true, 
				discardComments: {removeAllButFirst: true}
			})))
			.pipe(gulpif(config.env === 'dev', sourcemaps.write('')))
			.pipe(gulp.dest(config.dst+config.css.dst))
	})
	
	callback()
})

gulp.task('templates', function(callback) {
	const mappedFiles = config.templates.src.map((path) => {
		return config.src+path
	})
	return gulp.src(mappedFiles, {base: config.src+'/'})
		.pipe(plumber({
				errorHandler: notify.onError(err => ({
				title: 'Templates',
				message: err.message
			}))
		}))
		.pipe(newer(config.dst))
		.pipe(gulp.dest(config.dst))
})

gulp.task('images', function(callback) {
	const mappedFiles = {}
	config.files.src.map((path) => {
		mappedFiles[config.src+path] = {
			dst: config.dst+config.files.dst, 
			base: config.src+config.files.base
		}
	})
	config.images.src.map((path) => {
		mappedFiles[config.src+path] = {
			dst: config.dst+config.images.dst, 
			base: config.src+config.images.base
		}
	})

	Object.keys(mappedFiles).map((path) => {
		gulp.src(path, {base: mappedFiles[path].base})
			.pipe(plumber({
					errorHandler: notify.onError(err => ({
					title: 'Images',
					message: err.message
				}))
			}))
			.pipe(newer(mappedFiles[path].dst))
			.pipe(gulpif(
				(config.env === 'prod' && ['**/*.png','**/*.jpg']), 
				tinypng('4ZqKPaFVLzm22rdBdxXLt67utMzi7Zqu'), 
				imagemin({
					progressive: true,
					svgoPlugins: [
						{removeViewBox: false},
						{cleanupIDs: false}
					],
					use: [pngquant()]
				})
			))
			.pipe(gulp.dest(mappedFiles[path].dst))
	})

	callback()
})

gulp.task('sprites', function(callback) {
	gulp.src(config.src+config.sprites.src)
		.pipe(plumber({
				errorHandler: notify.onError(err => ({
				title: 'Sprites',
				message: err.message
			}))
		}))
		.pipe(cached('sprites'))
		.pipe(remember('sprites'))
		.pipe(imagemin([
			imageminSvgo({
				plugins: [
					{removeViewBox: false},
					{cleanupIDs: false},
					{removeTitle : true}, 
					{removeUselessStrokeAndFill : true}, 
					{removeAttrs: {attrs: ['fill', 'stroke']}}
				]
			})
		]))
		.pipe(svgSprite({
			mode: {
				symbol: {
					render: {
						css: false,
						scss: false
					},
					dest: '',
					prefix: '',
					sprite: 'icons.svg'
				}
			}
		}))
		.pipe(gulp.dest(config.dst+config.images.dst))

	callback()
})

gulp.task('clean', function() {
	return del(config.dst)
})

gulp.task('watch', function() {
	gulp.watch(config.src+config.css.watch, gulp.series('styles'))
	gulp.watch(config.src+config.sprites.src, gulp.series('sprites')).on('unlink', function(filepath) {
		remember.forget('sprites', path.resolve(filepath))
		delete cached.caches.sprites[path.resolve(filepath)]
	})
	gulp.watch(config.src+config.images.watch, gulp.series('images'))
	gulp.watch(config.src+config.templates.watch, gulp.series('templates'))
})

gulp.task('default', gulp.series(gulp.parallel(
	'templates', 
	'scripts', 
	'styles', 
	'images', 
	'sprites'
), gulp.parallel('watch', 'serve')))

gulp.task('setProd', function(callback) {
	config.env = "prod"
	callback()
})
gulp.task('build', gulp.series(
	'clean', 
	'setProd', 
	gulp.parallel(
		'templates', 
		'scripts', 
		'styles', 
		'images', 
		'sprites'
	))
)