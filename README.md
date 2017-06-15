
# mastodon-streaming-listener


This is a server to provide relay the notification from Mastodon's Streaming API to registered callback URL.

![slide1](https://cloud.githubusercontent.com/assets/333944/26376504/af071c76-4047-11e7-9308-2cd538be0439.jpg)

### Different things from Tusky-api.
- Separate streaming listener server and application server.
- Streaming listener server does not have application specific information. There is a possibility that it can correspond to multiple applications.
- Possible to replace the Streaming API URL to inside the LAN
- (It focus to make Streaming listener server by instance-owner)
- Since the application server does not handle WebSocket, it becomes easy to scale.
- Both the streaming listener server and the application server can be configured behaviors for each instance.
- Support only for a specific instance


## API

### POST /register 

(parameters)
- instance_url : URL of Mastodon instance you want to listen. ex) https://mastodon.juggler.jp . max length is 255 byte.
- tag : any String that can be used for management in your app. this is also used for a part of unique key of registrations. max length is 255 byte.
- app_id: ID of the your app. max length is 255 byte.
- app_secret : Secret of the your app.
- access_token : The access token you get from Mastodon's oAuth API.
- callback_url : The URL that will be called when new notification is arrived.
- endpoint : (optional)Type of streaming endpoint. One of 'user', 'user:notification'
(notice)
Your app needs to call /register repeatly within 3 days to keep listening.

### POST /unregister

(parameters)
- instance_url : same of specified in /register.
- tag : same of specified in /register.
- app_id : same of specified in /register.
- app_secret : secret of the your app.

(notice)
The unique key of listener registration is : instanceUrl + appId + tag.
If you want to certainly unregister registration, You have to make same these parameters.

### Callback
Callback is called with POST method.
Request body is Content-Type 'application/json' and it has following data.

- instanceUrl : same of specified in /register.
- tag : same of specified in /register.
- appId : same of specified in /register.
- payload : see document of Mastodon's Streaming API.


## installation (using docker-compose)

### prepare database 
Please make a database for this app. and memo the parameters that required to connect from app to database.

```
# type of db. One of mysql, postgres, mssql. (Don't use sqlite)
DB_DIALECT=postgres

# host name or IP addres of database server
DB_HOST=172.17.0.1

# port number of database server
DB_PORT=4003

# name of database
DB_NAME=streaming_listener

# login information
DB_USER=streaming_listener
DB_PASS=***
```

### edit configuration files

after git clone , you have to change some file.

```
# copy sample configuration files
cp config/app_map.hjson.sample config/app_map.hjson
cp config/instance_map.hjson.sample config/instance_map.hjson

(edit these .hjson files to configure for client app and instances)

cp .env.production.sample .env.production

(edit this .env file to configure database connection.)
```

### build and start 

```
docker-compose build

docker-compose up
```

### configure nginx

This app listens on port 4002 at default.
You can configure exposed port in docker-compose.yml.
You should use Web frontend (nginx) to wrap with HTTPS.

# Tweak 

### create index

`create unique index stream_listener_registrations_iat on stream_listener_registrations ( "instanceUrl","appId","tag" );`
