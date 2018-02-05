'use strict';
var gutil = require('gulp-util');
var es = require('event-stream');
var SendGrid = require('./lib/sendgrid');
var cheerio = require('cheerio');
var dateFormat = require('dateformat');
var kebabCase = require('lodash.kebabcase');
var startCase = require('lodash.startcase');
var toLower = require('lodash.tolower');
var path = require('path');

function sendSendGrid(options){

    if (!options) {
        throw new gutil.PluginError('gulp-sendgrid', 'options required');
    }

    var now = new Date();
    var date = dateFormat(now, 'yyyy-mm-dd');
    var sendgrid, html, $, title, plainText, finalHtml, templateName, versionName, versionPrefix;

    sendgrid = new SendGrid(options);


    return es.map(function (file, cb) {
        if (file.isNull()) {
            this.push(file);
            return cb();
        }

        if (file.isStream()) {
            this.emit('error', new gutil.PluginError('gulp-sendgrid', 'Streaming not supported'));
            return cb();
        }

        if (file.isBuffer()) {
            sendgrid.getTemplates()
            .then(function() {
                var templateName = file.path.replace(file.cwd, '').substring(1).split('/');
                html = file.contents;
                $ = cheerio.load(html);
                title = $('.title').text().trim();
                plainText = $('body').text().trim();
                templateName.shift();
                templateName.push(file.stem);
                templateName = startCase(toLower(templateName.join(' ')));
                versionPrefix = options.versionPrefix || '';
                versionName = kebabCase(versionPrefix + ' ' + templateName.substring(0, templateName.length - 5));

                if (title.length === 0) {
                    title = date;
                }

                // Send SendGrid template
				cb(sendgrid.run(html, plainText, templateName, versionName, title), file);
            }).catch( function(e) {
				cb(e, file);
			});
        } else {
			cb(null, file);
		}
    });

}

module.exports = sendSendGrid;
