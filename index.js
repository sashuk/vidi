/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2018 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

var path = require('path');
require('dotenv').config({path: path.join(__dirname, ".env")});

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var cors = require('cors');
var config = require('./config/config.js');

var app = express();
app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json({
        limit: '50mb'
    })
);
// to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true,
    limit: '50mb'
}));

app.use(cookieParser());

app.set('trust proxy', 1); // trust first proxy

app.use(session({
    store: new FileStore({
        ttl: 86400,
        logFn: function () {},
        path: "/tmp/sessions"
    }),
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    name: "connect.gc2",
    cookie: {secure: false}
}));

app.use('/app/:db/:schema?', express.static(path.join(__dirname, 'public'), {maxage: '60s'}));

if (config.staticRoutes) {
    for (var key in config.staticRoutes) {
        if (config.staticRoutes.hasOwnProperty(key)) {
            console.log(key + " -> " + config.staticRoutes[key]);
            app.use('/app/:db/:schema/' + key, express.static(path.join(__dirname, config.staticRoutes[key]), {maxage: '60s'}));
        }
    }
}

app.use('/', express.static(path.join(__dirname, 'public'), {maxage: '1h'}));

app.use(require('./controllers'));

app.use(require('./extensions'));

app.enable('trust proxy');

const port = process.env.PORT ? process.env.PORT : 3000;
var server = app.listen(port, function () {
    console.log(`Listening on port ${port}...`);
});

global.io = require('socket.io')(server);
io.on('connection', function (socket) {
    console.log(socket.id);
});