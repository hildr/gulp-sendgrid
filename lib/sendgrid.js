var mail = require('nodemailer').mail,
    cheerio = require('cheerio'),
    builder = require('xmlbuilder'),
    Table = require('cli-table'),
    SendGridAPI = require('sendgrid'),
    chalk = require('chalk');

function SendGrid(options) {
    this.options = options;
    this.initVars();
}

// Initialize variables
SendGrid.prototype.initVars = function () {
    this.sg = new SendGridAPI(this.options.apiKey);
};

/**
 * GET request to SendGrid to retrieve available templates
 * @return {Promise}
 */
SendGrid.prototype.getTemplates = function () {
    var that = this;
    var promise = new Promise(function (res, rej) {
        if (Array.isArray(that.templates)) {
            return res();
        }

        // Get the templates
        var request = that.sg.emptyRequest();
        request.method = 'GET';
        request.path = '/v3/templates';

        return that.sg.API(request)
            .then(function (response) {
                that.templates = response.body ? response.body.templates || [] : [];
            })
            .catch(function (e) {
                that.logErr('gulp-sendgrid1: ' + e);
                rej(e);
            })
            .then(res);
    });

    return promise;
};

/**
 * Promise method to set this.template from this.templates or from one newly created
 * @return {Promise}
 */
SendGrid.prototype.getTemplate = function (res, rej) {
    var that = this;
    var matchingTemplates = this.templates.filter(function (tpl) {
        return tpl.name === that.templateName;
    });

    if (matchingTemplates.length) {
        that.template = matchingTemplates[0];
        res();
    } else {
        // Make a template
        var request = that.sg.emptyRequest();
        request.body = {
            name: that.templateName
        };
        request.method = "POST";
        request.path = "/v3/templates";

        that.sg.API(request)
            .then(function (response) {
                if (response.statusCode === 201) {
                    that.template = response.body;
                    res();
                }
            })
            .catch(function (e) {
                that.logErr('gulp-sendgrid-2: ' + e);
                rej(e);
            });
    }
};

/**
 * Promise method to create or update SendGrid version with latest html and properties
 * @return {Promise}
 */
SendGrid.prototype.createVersion = function (rs, rj) {
    if (this.template && this.template.id) {
        var that = this;

        // Setup request for creating a new version
        var request = this.sg.emptyRequest();
        request.body = {
            active: 1,
            html_content: this.html.toString(),
            name: this.versionName,
            plain_content: this.plainText,
            subject: this.title,
            template_id: this.template.id
        };
        request.method = 'POST';
        request.path = '/v3/templates/' + this.template.id + '/versions';

        // Update version if it already exists
        function cleanVersions(request2, versions, indx, cb) {
            if (indx > versions.length - 1) return cb();
            request2.method = 'DELETE';
            request2.path = '/v3/templates/' + that.template.id + '/versions/' + version.id;
            that.sg.API(request2)
                .catch(function (e) {
                    that.logErr('gulp-sendgrid-3: ' + e);
                    rj(e);
                }).then(function () {
                cleanVersions(request2, versions, indx + 1, cb);
            });
        }
        var vn = that.versionName;
        if (that.template.versions && (that.template.versions.length > 0)) {
            var matchingVersions = that.template.versions.filter(function (version) {
                return version.name === that.versionName;
            });
            if (matchingVersions.length) {
                var version = matchingVersions[0];
                request.method = 'PATCH';
                request.path = '/v3/templates/' + that.template.id + '/versions/' + version.id;
            }

            if (that.template.versions.length > 1) {
                var request2 = Object.assign({}, request), request3 = Object.assign({}, request);
                cleanVersions(request2, that.template.versions, 1, function () {
                    that.sg.API(request3).then(rs)
                        .catch(function (e) {
                            that.logErr('gulp-sendgrid-4: ' + vn + ' (' + e + ');');

                            rj(e);
                        });
                });
            } else {
                that.sg.API(request).then(rs)
                    .catch(function (e) {
                        that.logErr('gulp-sendgrid-5: ' + e);
                        rj(e);
                    });
            }
        } else {
            that.sg.API(request).then(rs)
                .catch(function (e) {
                    that.logErr('gulp-sendgrid-6: ' + vn + ' (' + e + ');');
                    rj(e);
                });
        }
    } else {
        return rj('No template created for "' + this.templateName + '"');
    }
};

/**
 * Initial method to create/update a version for the html submitted
 * @param  {File.contents} html
 * @param  {String} plainText     Plain text for html email
 * @param  {String} templateName
 * @param  {String} versionName
 * @param  {String} title         Used for version's subject line
 * @return {Promise}              Eventually returns the html
 */
SendGrid.prototype.run = function (html, plainText, templateName, versionName, title) {
    var that = this;
    this.html = html;
    this.plainText = plainText;
    this.templateName = templateName;
    this.versionName = versionName;
    this.title = title;
    var promise = new Promise(function (res, rej) {
        return new Promise(that.getTemplate.bind(that))
            .then(new Promise(that.createVersion.bind(that)).catch(function (e) {
                that.logErr('gulp-sendgrid-8: ' + that.versionName + ' (' + e + ');');
                rej(e);
            }))
            .then(function () {
                res(versionName);
            })
            .catch(function (e) {
                that.logErr('gulp-sendgrid-9: ' + that.versionName + ' (' + e + ');');
                rej(e);
            })
    });
    return promise;
};


// LOGGING HELPERS

SendGrid.prototype.log = function (str) {
    return console.log(chalk.cyan(str));
};


SendGrid.prototype.logSuccess = function (str) {
    return console.log(chalk.green(str));
};


SendGrid.prototype.logWarn = function (str) {
    return console.log(chalk.yellow(str));
};

SendGrid.prototype.logErr = function (str) {
    return console.log(chalk.red(str));
};

module.exports = SendGrid;
