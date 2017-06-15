import WebSocket from 'ws'
import express from 'express'
import axios from 'axios'
import bodyParser from 'body-parser'
import npmlog from 'npmlog'
import morgan from 'morgan'
import Sequelize from 'sequelize'
import Hjson from 'hjson'
import fs from 'fs'
import util from 'util'
import dotenv from 'dotenv'

dotenv.config({
    path: '.env.production'
});

const app = express()
const port = process.env.PORT || 4002

process.on('unhandledRejection', console.dir);

/////////////////////////////////////////////////////////////////////////
// DB connection

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS, {
        dialect: process.env.DB_DIALECT,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        logging: npmlog.verbose
    }
)

// Model definition 

const Registration = sequelize.define('stream_listener_registration', {

    lastUpdate: {
        type: Sequelize.BIGINT,
        defaultValue: 0
    },

    instanceUrl: {
        type: Sequelize.STRING
    },

    accessToken: {
        type: Sequelize.STRING
    },

    appId: {
        type: Sequelize.STRING
    },

    appSecret: {
        type: Sequelize.STRING
    },

    callbackUrl: {
        type: Sequelize.STRING
    },

    tag: {
        type: Sequelize.STRING
    },

    endpoint: {
        type: Sequelize.STRING
    }
}, {
    indexes: [
        {
            name: 'iat',
            unique: true,
            fields: ['instanceUrl', 'appId', 'tag']
        }
    ]

})

///////////////////////////////////////////////////////////////////////
// configuration file

var appMap;
var instanceMap;

const loadSetting = () => {
    //
    var file = 'config/app_map.hjson';
    try {
        appMap = Hjson.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        npmlog.log('error', file, e)
        throw e
    }
    //
    file = 'config/instance_map.hjson';
    try {
        instanceMap = Hjson.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        npmlog.log('error', file, e)
        throw e
    }
}

try {
    loadSetting();
} catch (e) {
    npmlog.log('error', 'loadSetting', e.stack)
    process.exit();
}

// SIGHUPで設定を読み直す
process.on('SIGHUP', function () {
    console.log('SIGHUP received. loading setting..');
    try {
        loadSetting();
    } catch (e) {
        npmlog.log('error', 'loadSetting', e.stack)
    }
});

///////////////////////////////////////////////////////////////////////
// version string comparator

const reVersionStringToken = /\d+|\.|[^\d.]+/g
const reDigits = /\d+/

const tokenizeVersionString = (src) => {
    var array = src.toString().match(reVersionStringToken);
    if (array) {
        return array
    }
    return []
}

const compareVersionString = (src_a, src_b) => {

    // null はそれ以外の文字列より小さい
    // jslintが警告を出すが、null or undefined のチェックを行いたいので == を使う
    if (src_a == null) {
        return src_b == null ? 0 : -1
    } else if (src_b == null) {
        return 1
    }

    var array_a = tokenizeVersionString(src_a)
    var array_b = tokenizeVersionString(src_b)
    for (;;) {
        var a = array_a.shift();
        var b = array_b.shift();

        // 終端チェック
        if (a === undefined) {
            return b === undefined ? 0 : -1
        } else if (b === undefined) {
            return 1; // a is defined, b is not defined
        }

        // 同じ値なら次のトークンを比較
        if (a == b) {
            continue;
        }

        // . は数字よりもその他の文字列よりも大きい
        if (a === '.') {
            return 1;
        }
        if (b === '.') {
            return -1;
        }

        var isNum_a = reDigits.test(a)
        var isNum_b = reDigits.test(b)

        // 数字同士なら数値を比較
        if (isNum_a && isNum_b) {
            var i = parseInt(a, 10) - parseInt(b, 10)
            return i < 0 ? -1 : 1 // 同じ値になることはない
        }

        // 数値とその他の文字列なら、数値の方が小さい
        if (isNum_a) {
            return -1;
        }
        if (isNum_b) {
            return 1;
        }

        // その他の文字列はUnicode順比較
        return (a < b)
    }
}

///////////////////////////////////////////////////////////////////////

const checkAppId = (appId, appSecret) => {
    if (!appId) {
        return 'missing app_id';
    }
    var appEntry = appMap[appId];
    if (!appEntry) {
        return 'missing app configuration for app: ' + appId
    }

    if (appEntry.secret !== appSecret) {
        return 'app_secret not match. app: ' + appId + ', secret:' + appSecret;
    }

    return null;
}

const checkInstanceUrl = (instanceUrl, appId) => {

    if (!instanceUrl) {
        return 'missing instance_url';
    }

    var instanceEntry = instanceMap[instanceUrl];
    if (!instanceEntry) {
        instanceEntry = instanceMap['*'];

        if (!instanceEntry) {
            return 'missing instance configuration for instance: ' + instanceUrl;
        }
    }

    const appIdAllowed = instanceEntry.appIdAllowed;
    if (appIdAllowed) {
        var bOK = false;
        if (appId === appIdAllowed) {
            bOK = true
        } else if (Array.isArray(appIdAllowed)) {
            appIdAllowed.forEach((v, i, a) => {
                if (appId === v) {
                    bOK = true;
                }
            })
        } else {
            return 'bad data type of appIdAllowed. it must be string or array of string. in instance: ' + instanceUrl;
        }
        if (!bOK) {
            return "appIdAllowed not contains your app_id :" + appId;
        }
    }

    return null;
}

const ENDPOINT_USER = 'user'
const ENDPOINT_USER_NOTIFICATION = 'user:notification'
const ENDPOINT_LIST = [
    ENDPOINT_USER,
    ENDPOINT_USER_NOTIFICATION
]

const reWss = /^wss\b/

const checkEndpoint = (endpoint) => {
    if (!endpoint) return null;
    for (var i = 0, ie = ENDPOINT_LIST.length; i < ie; ++i) {
        if (ENDPOINT_LIST[i] == endpoint) return null;
    }
    return "bad endpoint parameter. allowed value is " + ENDPOINT_LIST.join(', ') + "."
}

const getReplaceUrl = (instanceUrl,information_urls) => {

    if (instanceUrl) {
        var instanceEntry = instanceMap[instanceUrl];
        if (instanceEntry) {
            const replaceUrl = instanceEntry.replaceUrl;
            if (replaceUrl) return replaceUrl;
        }
    }
    
    if( information_urls ){
        const streaming_api = information_urls.streaming_api
        if( streaming_api ){
            return streaming_api.replace(reWss,"https")
        }
    }
    
    return instanceUrl;
}

const getReplaceUrlWeb = (instanceUrl) => {

    if (instanceUrl) {
        var instanceEntry = instanceMap[instanceUrl];
        if (instanceEntry) {
            const replaceUrlWeb = instanceEntry.replaceUrlWeb;
            if (replaceUrlWeb) return replaceUrlWeb;
        }
    }
    return instanceUrl;
}

const getEndpoint = (instanceUrl, version, client_endpoint) => {

    if (client_endpoint && client_endpoint.length > 0) {
        // クライアントからのストリーム種別指定があればそれを優先する
        return client_endpoint
    }

    if (instanceUrl) {
        var instanceEntry = instanceMap[instanceUrl];
        if (instanceEntry) {
            const endpoint = instanceEntry.endpoint;
            // インスタンス設定にストリーム種別があればそれを使う
            if (endpoint) return endpoint;
        }
    }

    if (compareVersionString(version, '1.4.2') >= 0) {
        // バージョン1.4.2以降ならデフォルト値は通知ストリーム
        return ENDPOINT_USER_NOTIFICATION
    }

    return ENDPOINT_USER
}

const checkAccessToken = (accessToken) => {
    if (!accessToken) {
        return 'missing access_token';
    }
    if (accessToken.match(/[?&=/]/)) {
        return 'access_token contains invalid character';
    }

    return null;
}

/////////////////////////////////////////////////////////////////////////
// connection keeper
// - disposable. if once it is disposed, it is not reused and it is not affect to outside of its object.

const listenerConnectionMap = {}
const ListenerConnection = function (log, ws_key, registration) {

    const self = this;

    self.log = log;
    self.heartbeat = null;
    self.reconnect_timer = null;
    self.webSocket = null;

    let last_check = 0
    let last_stream_url
    let location_url

    const onMessage = data => {
        if (self.isDisposed) return;
        
        const json = JSON.parse(data)

        if (json.event !== 'notification') {
            return
        }

        log('info', "notification received.")

        // send to callback

        const message = {
            instanceUrl: registration.instanceUrl,
            tag: registration.tag,
            appId: registration.appId,
            payload: json.payload
        }

        axios.post(
            registration.callbackUrl,
            JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        ).then(response => {
            log('info', `Sent to Callback, status ${response.status}: ${JSON.stringify(response.data)}`)
        }).catch(error => {
            log('error', `Error sending to FCM, status: ${error.response.status}: ${JSON.stringify(error.response.data)}`)
        })
    }

    const scheduleReconnect = () => {

        self.clearTimers()

        if (!self.isDisposed) {
            this.reconnect_timer = setTimeout(() => reconnect(), location_url ? 1000 : 5000)
        }
    }

    const onUnexpectedResponse = (req, res) => {
        if (self.isDisposed) return;
        
        log('info', `onUnexpectedResponse. statusCode=${res.statusCode}. url=${last_stream_url}`);

        if ("401" == res.statusCode) {
            // access_token seems revoked.
            disconnectForUser(registration);
            return
        }

        location_url = null
        if ("301" == res.statusCode && res.headers.location) {
            location_url = res.headers.location
        }

        scheduleReconnect()
    }

    const onError = error => {
        if (self.isDisposed) return;
        
        log('error', `onError. date=${new Date().toLocaleString()}, url=${last_stream_url}, error=` + util.inspect(error));

        scheduleReconnect()
    }

    const onClose = code => {
        if (self.isDisposed) return;
        
        if (code === 1000) {
            log('info', 'onClose : Remote server closed connection')
            disconnectForUser(registration);
            return
        }

        log('error', `onClose: date=${new Date().toLocaleString()}, code=${code}, url=${last_stream_url}`)
        scheduleReconnect()
    }

    const reconnect = () => {

        self.clearTimers()

        if (self.isDisposed) return;

        // アクセストークンが変更されているかもしれないのでリロード
        Registration.findOne({
            where: {
                instanceUrl: registration.instanceUrl,
                appId: registration.appId,
                tag: registration.tag
            }
        }).then((r) => {

            // DBクエリしてる間にこの接続オブジェクトは破棄されていた
            if (self.isDisposed) return;

            if (!r) {
                // いつのまにか登録が解除されていた
                log('error', 'Error reloading registration: record not found.')
                return;
            }

            // リロードした設定を反映する
            registration = r

            // /api/v1/instance の取得
            var replaceUrlWeb = getReplaceUrlWeb(registration.instanceUrl);
            var informationUrl = `${replaceUrlWeb}/api/v1/instance`;
            axios.get(
                informationUrl
            ).then(response => {
                if (self.isDisposed) return;

                log('info', `instance information, status ${response.status}, version=${response.data.version}`);
                reconnect_sub(response.data)
            }).catch(error => {
                log('error', `instance information request failed, status: ${error.response.status}: ${JSON.stringify(error.response.data)}`)
                scheduleReconnect()
            })
        }).catch((err) => {
            log('error', `Error reloading registration: ${err}.`)
            return;
        })
    }

    // reconnect 
    const reconnect_sub = (information) => {
        try {
            
            // 接続先URLの決定
            if (location_url) {
                // 301レスポンスで知らされたURLがあれば優先的に使う
                last_stream_url = location_url;
                // 時間経過でアクセストークンが変化する場合があるので、このURLは使い捨てで次回再接続するときは通常のURLから始める
                location_url = null;
            } else {
                const url = getReplaceUrl(registration.instanceUrl,information.urls);
                const endpoint = getEndpoint(registration.instanceUrl, information.version, registration.endpoint);
                last_stream_url = `${url}/api/v1/streaming/?access_token=${registration.accessToken}&stream=${endpoint}`;
            }
            
            log('info',`streaming: ${last_stream_url}`)

            const ws = self.webSocket = new WebSocket(last_stream_url)

            ws.on('open', () => {

                if (ws.readyState != 1) {
                    // Connected 以外の状態
                    log('error', `Client state is: ${ws.readyState}`)
                    return
                }

                if (self.isDisposed) {
                    // この接続は破棄されていた
                    ws.close();
                    return
                }

                log('info', 'Connected')
                self.heartbeat = setInterval(() => {

                    ws.ping();

                    const now = (new Date()).getTime();

                    if (now - last_check >= 86400000) {
                        last_check = now;
                        Registration.findOne({
                            where: {
                                instanceUrl: registration.instanceUrl,
                                appId: registration.appId,
                                tag: registration.tag
                            }
                        }).then((r) => {
                            if (r && now - r.lastUpdate >= 86400000 * 3) {
                                log('error', 'registration expired.')
                                disconnectForUser(registration);
                                return;
                            }
                        })
                    }
                }, 10000)
            })

            ws.on('message', onMessage)
            ws.on('error', onError)
            ws.on('close', onClose)
            ws.on('unexpected-response', onUnexpectedResponse)

        } catch (err) {
            log('error', `Error reloading registration: ${err}.`)
        }

    }

    reconnect()
}

ListenerConnection.prototype.clearTimers = function () {
    const self = this;

    if (self.heartbeat) {
        clearInterval(self.heartbeat)
        self.heartbeat = null

    }

    if (self.reconnect_timer) {
        clearTimeout(self.reconnect_timer)
        self.reconnect_timer = null
    }
}

ListenerConnection.prototype.dispose = function () {
    const self = this;

    self.isDisposed = true;

    self.clearTimers();

    try {
        if (self.webSocket) {
            self.webSocket.close();
        }
    } catch (e) {
        self.log('error', "dispose: webSocket.close() failed. " + e)
    }
}

const connectForUser = (registration) => {

    const ws_key = `${registration.instanceUrl}:${registration.appId}:${registration.tag}`;
    const log = (level, message) => npmlog.log(level, ws_key, message)

    var error = checkAppId(registration.appId, registration.appSecret);
    if (error) {
        log('error', error);
        disconnectForUser(registration);
        return false;
    }

    error = checkInstanceUrl(registration.instanceUrl, registration.appId)
    if (error) {
        log('error', error);
        disconnectForUser(registration);
        return false;
    }

    if (listenerConnectionMap[ws_key]) {
        log('info', 'Already registered')
    } else {
        log('info', 'Making ListenerConnection')
        // reconnectの非同期処理の間に connectForUser が呼ばれた時に 'Already registered' を返せるように
        // この時点で listenerConnectionMap[ws_key] を初期化する
        listenerConnectionMap[ws_key] = new ListenerConnection(log, ws_key, registration);
    }

    return true;
}

const disconnectForUser = (registration) => {

    const ws_key = `${registration.instanceUrl}:${registration.appId}:${registration.tag}`;
    const log = (level, message) => npmlog.log(level, ws_key, message)

    const listenerConnection = listenerConnectionMap[ws_key]
    if (listenerConnection) {
        listenerConnection.dispose()
        delete listenerConnectionMap[ws_key]
        log('info', 'ListenerConnection disposed.');
    }

    registration.destroy();
    log('info', 'Registration destroyed.')
}

// DBに登録された項目のStreaming API 接続を復元する
Registration.sync()
    .then(() => Registration.findAll())
    .then(registrations => registrations.forEach(registration => {
        connectForUser(registration);
    }))


app.use(morgan('combined'));
app.use(bodyParser.urlencoded({
    extended: true
}))

app.get('/', (req, res) => {
    res.sendStatus(204)
})

app.post('/register', (req, res) => {

    const log = (level, message) => npmlog.log(level, "register", message)

    const now = (new Date()).getTime();

    var error;

    if (!req.body.instance_url) {
        log('info', util.inspect(req));
        res.status(400).send("missing instance_url");
        return;
    }

    const appId = req.body.app_id
    const appSecret = req.body.app_secret
    error = checkAppId(appId, appSecret)
    if (error) {
        log('error', error)
        res.status(400).send(error);
        return;
    }

    const instanceUrl = req.body.instance_url.toLowerCase();
    error = checkInstanceUrl(instanceUrl, appId)
    if (error) {
        log('error', error)
        res.status(400).send(error);
        return;
    }

    const accessToken = req.body.access_token
    error = checkAccessToken(accessToken)
    if (error) {
        log('error', error)
        res.status(400).send(error);
        return;
    }

    const endpoint = req.body.endpoint
    error = checkEndpoint(endpoint)
    if (error) {
        log('error', error)
        res.status(400).send(error);
        return;
    }

    const callbackUrl = req.body.callback_url
    const tag = req.body.tag


    /////////////////////////////////////
    // check instance url

    Registration.findOrCreate({
        where: {
            instanceUrl: instanceUrl,
            appId: appId,
            tag: tag
        }
    }).then((args) => {
        const model = args[0]
        // const created = args[1]
        if (model) {
            model.update({
                lastUpdate: now,
                accessToken: accessToken,
                callbackUrl: callbackUrl,
                appSecret: appSecret,
                endPoint: endpoint
            }).then((unused) => {
                connectForUser(model);
            })
        }
    }).catch(error => {
        log('error', error)
    })

    res.sendStatus(202)
})

app.post('/unregister', (req, res) => {

    const log = (level, message) => npmlog.log(level, "unregister", message)

    if (!req.body.instance_url) {
        log('info', util.inspect(req));
    }

    const instanceUrl = req.body.instance_url.toLowerCase();
    const tag = req.body.tag
    const appId = req.body.app_id
    const appSecret = req.body.app_secret
    var error = checkAppId(appId, appSecret)
    if (error) {
        res.status(400).send(error);
        return;
    }

    Registration.findOne({
        where: {
            instanceUrl: instanceUrl,
            appId: appId,
            tag: tag
        }
    }).then((registration) => {
        if (registration) {
            disconnectForUser(registration)
        }
    }).catch(error => {
        log('error', error)
    })

    res.sendStatus(202)
})

app.listen(port, () => {
    npmlog.log('info', `Listening on port ${port}`)
})