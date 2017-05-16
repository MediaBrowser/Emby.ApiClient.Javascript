define(['events'], function (events) {
    'use strict';

    function redetectBitrate(instance) {
        stopBitrateDetection(instance);

        if (instance.accessToken() && instance.enableAutomaticBitrateDetection !== false) {
            setTimeout(redetectBitrateInternal.bind(instance), 6000);
        }
    }

    function redetectBitrateInternal() {
        if (this.accessToken()) {
            this.detectBitrate();
        }
    }

    function stopBitrateDetection(instance) {
        if (instance.detectTimeout) {
            clearTimeout(instance.detectTimeout);
        }
    }

    function replaceAll(originalString, strReplace, strWith) {
        var reg = new RegExp(strReplace, 'ig');
        return originalString.replace(reg, strWith);
    }

    function onFetchFail(instance, url, response) {

        events.trigger(instance, 'requestfail', [
        {
            url: url,
            status: response.status,
            errorCode: response.headers ? response.headers.get('X-Application-Error-Code') : null
        }]);
    }

    function paramsToString(params) {

        var values = [];

        for (var key in params) {

            var value = params[key];

            if (value !== null && value !== undefined && value !== '') {
                values.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
            }
        }
        return values.join('&');
    }

    function fetchWithTimeout(url, options, timeoutMs) {

        return new Promise(function (resolve, reject) {

            var timeout = setTimeout(reject, timeoutMs);

            options = options || {};
            options.credentials = 'same-origin';

            fetch(url, options).then(function (response) {
                clearTimeout(timeout);
                resolve(response);
            }, function (error) {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    function getFetchPromise(request) {

        var headers = request.headers || {};

        if (request.dataType === 'json') {
            headers.accept = 'application/json';
        }

        var fetchRequest = {
            headers: headers,
            method: request.type,
            credentials: 'same-origin'
        };

        var contentType = request.contentType;

        if (request.data) {

            if (typeof request.data === 'string') {
                fetchRequest.body = request.data;
            } else {
                fetchRequest.body = paramsToString(request.data);

                contentType = contentType || 'application/x-www-form-urlencoded; charset=UTF-8';
            }
        }

        if (contentType) {

            headers['Content-Type'] = contentType;
        }

        if (!request.timeout) {
            return fetch(request.url, fetchRequest);
        }

        return fetchWithTimeout(request.url, fetchRequest, request.timeout);
    }

    /**
     * Creates a new api client instance
     * @param {String} serverAddress
     * @param {String} appName
     * @param {String} appVersion 
     */
    function ApiClient(serverAddress, appName, appVersion, deviceName, deviceId, devicePixelRatio) {

        if (!serverAddress) {
            throw new Error("Must supply a serverAddress");
        }

        console.log('ApiClient serverAddress: ' + serverAddress);
        console.log('ApiClient appName: ' + appName);
        console.log('ApiClient appVersion: ' + appVersion);
        console.log('ApiClient deviceName: ' + deviceName);
        console.log('ApiClient deviceId: ' + deviceId);

        this._serverInfo = {};
        this._serverAddress = serverAddress;
        this._deviceId = deviceId;
        this._deviceName = deviceName;
        this._appName = appName;
        this._appVersion = appVersion;
        this._devicePixelRatio = devicePixelRatio;
    }

    ApiClient.prototype.appName = function () {
        return this._appName;
    };

    ApiClient.prototype.setRequestHeaders = function (headers) {

        var currentServerInfo = this.serverInfo();
        var appName = this._appName;
        var accessToken = currentServerInfo.AccessToken;

        var values = [];

        if (appName) {
            values.push('Client="' + appName + '"');
        }

        if (this._deviceName) {
            values.push('Device="' + this._deviceName + '"');
        }

        if (this._deviceId) {
            values.push('DeviceId="' + this._deviceId + '"');
        }

        if (this._appVersion) {
            values.push('Version="' + this._appVersion + '"');
        }

        if (accessToken) {
            values.push('Token="' + accessToken + '"');
        }

        if (values.length) {
            
            var auth = 'MediaBrowser ' + values.join(', ');
            //headers.Authorization = auth;
            headers['X-Emby-Authorization'] = auth;
        }
    };

    ApiClient.prototype.appVersion = function () {
        return this._appVersion;
    };

    ApiClient.prototype.deviceName = function () {
        return this._deviceName;
    };

    ApiClient.prototype.deviceId = function () {
        return this._deviceId;
    };

    /**
     * Gets the server address.
     */
    ApiClient.prototype.serverAddress = function (val) {

        if (val != null) {

            if (val.toLowerCase().indexOf('http') !== 0) {
                throw new Error('Invalid url: ' + val);
            }

            var changed = val !== this._serverAddress;

            this._serverAddress = val;

            this.lastDetectedBitrate = 0;
            this.lastDetectedBitrateTime = 0;

            if (changed) {
                events.trigger(this, 'serveraddresschanged');
            }

            redetectBitrate(this);
        }

        return this._serverAddress;
    };

    /**
     * Creates an api url based on a handler name and query string parameters
     * @param {String} name
     * @param {Object} params
     */
    ApiClient.prototype.getUrl = function (name, params) {

        if (!name) {
            throw new Error("Url name cannot be empty");
        }

        var url = this._serverAddress;

        if (!url) {
            throw new Error("serverAddress is yet not set");
        }
        var lowered = url.toLowerCase();
        if (lowered.indexOf('/emby') === -1 && lowered.indexOf('/mediabrowser') === -1) {
            url += '/emby';
        }

        if (name.charAt(0) !== '/') {
            url += '/';
        }

        url += name;

        if (params) {
            params = paramsToString(params);
            if (params) {
                url += "?" + params;
            }
        }

        return url;
    };

    ApiClient.prototype.fetchWithFailover = function (request, enableReconnection) {

        console.log("Requesting " + request.url);

        request.timeout = 30000;
        var instance = this;

        return getFetchPromise(request).then(function (response) {

            if (response.status < 400) {

                if (request.dataType === 'json' || request.headers.accept === 'application/json') {
                    return response.json();
                } else if (request.dataType === 'text' || (response.headers.get('Content-Type') || '').toLowerCase().indexOf('text/') === 0) {
                    return response.text();
                } else {
                    return response;
                }
            } else {
                onFetchFail(instance, request.url, response);
                return Promise.reject(response);
            }

        }, function (error) {

            if (error) {
                console.log("Request failed to " + request.url + ' ' + error.toString());
            } else {
                console.log("Request timed out to " + request.url);
            }

            // http://api.jquery.com/jQuery.ajax/		     
            if (!error && enableReconnection) {
                console.log("Attempting reconnection");

                var previousServerAddress = instance.serverAddress();

                return tryReconnect(instance).then(function () {

                    console.log("Reconnect succeesed");
                    request.url = request.url.replace(previousServerAddress, instance.serverAddress());

                    return instance.fetchWithFailover(request, false);

                }, function (innerError) {

                    console.log("Reconnect failed");
                    onFetchFail(instance, request.url, {});
                    throw innerError;
                });

            } else {

                console.log("Reporting request failure");

                onFetchFail(instance, request.url, {});
                throw error;
            }
        });
    };

    /**
     * Wraps around jQuery ajax methods to add additional info to the request.
     */
    ApiClient.prototype.fetch = function (request, includeAuthorization) {

        if (!request) {
            throw new Error("Request cannot be null");
        }

        request.headers = request.headers || {};

        if (includeAuthorization !== false) {

            this.setRequestHeaders(request.headers);
        }

        if (this.enableAutomaticNetworking === false || request.type !== "GET") {
            console.log('Requesting url without automatic networking: ' + request.url);

            var instance = this;
            return getFetchPromise(request).then(function (response) {

                if (response.status < 400) {

                    if (request.dataType === 'json' || request.headers.accept === 'application/json') {
                        return response.json();
                    } else if (request.dataType === 'text' || (response.headers.get('Content-Type') || '').toLowerCase().indexOf('text/') === 0) {
                        return response.text();
                    } else {
                        return response;
                    }
                } else {
                    onFetchFail(instance, request.url, response);
                    return Promise.reject(response);
                }

            }, function (error) {
                onFetchFail(instance, request.url, {});
                throw error;
            });
        }

        return this.fetchWithFailover(request, true);
    };

    function switchConnectionMode(instance, connectionMode) {

        var currentServerInfo = instance.serverInfo();
        var newConnectionMode = connectionMode;

        newConnectionMode--;
        if (newConnectionMode < 0) {
            newConnectionMode = MediaBrowser.ConnectionMode.Manual;
        }

        if (MediaBrowser.ServerInfo.getServerAddress(currentServerInfo, newConnectionMode)) {
            return newConnectionMode;
        }

        newConnectionMode--;
        if (newConnectionMode < 0) {
            newConnectionMode = MediaBrowser.ConnectionMode.Manual;
        }

        if (MediaBrowser.ServerInfo.getServerAddress(currentServerInfo, newConnectionMode)) {
            return newConnectionMode;
        }

        return connectionMode;
    }

    function tryReconnectInternal(instance, resolve, reject, connectionMode, currentRetryCount) {

        connectionMode = switchConnectionMode(instance, connectionMode);
        var url = MediaBrowser.ServerInfo.getServerAddress(instance.serverInfo(), connectionMode);

        console.log("Attempting reconnection to " + url);

        var timeout = connectionMode === MediaBrowser.ConnectionMode.Local ? 7000 : 15000;

        fetchWithTimeout(url + "/system/info/public", {

            method: 'GET',
            accept: 'application/json'

            // Commenting this out since the fetch api doesn't have a timeout option yet
            //timeout: timeout

        }, timeout).then(function () {

            console.log("Reconnect succeeded to " + url);

            instance.serverInfo().LastConnectionMode = connectionMode;
            instance.serverAddress(url);

            resolve();

        }, function () {

            console.log("Reconnect attempt failed to " + url);

            if (currentRetryCount < 5) {

                var newConnectionMode = switchConnectionMode(instance, connectionMode);

                setTimeout(function () {
                    tryReconnectInternal(instance, resolve, reject, newConnectionMode, currentRetryCount + 1);
                }, 300);

            } else {
                reject();
            }
        });
    }

    function tryReconnect(instance) {

        return new Promise(function (resolve, reject) {

            setTimeout(function () {
                tryReconnectInternal(instance, resolve, reject, instance.serverInfo().LastConnectionMode, 0);
            }, 300);
        });
    }

    ApiClient.prototype.setAuthenticationInfo = function (accessKey, userId) {
        this._currentUser = null;

        this._serverInfo.AccessToken = accessKey;
        this._serverInfo.UserId = userId;
        redetectBitrate(this);
    };

    ApiClient.prototype.serverInfo = function (info) {

        if (info) {
            this._serverInfo = info;
        }

        return this._serverInfo;
    };

    /**
     * Gets or sets the current user id.
     */
    ApiClient.prototype.getCurrentUserId = function () {

        return this._serverInfo.UserId;
    };

    ApiClient.prototype.accessToken = function () {
        return this._serverInfo.AccessToken;
    };

    ApiClient.prototype.serverId = function () {
        return this.serverInfo().Id;
    };

    ApiClient.prototype.serverName = function () {
        return this.serverInfo().Name;
    };

    /**
     * Wraps around jQuery ajax methods to add additional info to the request.
     */
    ApiClient.prototype.ajax = function (request, includeAuthorization) {

        if (!request) {
            throw new Error("Request cannot be null");
        }

        return this.fetch(request, includeAuthorization);
    };

    /**
     * Gets or sets the current user id.
     */
    ApiClient.prototype.getCurrentUser = function () {

        if (this._currentUser) {
            return Promise.resolve(this._currentUser);
        }

        var userId = this.getCurrentUserId();

        if (!userId) {
            return Promise.reject();
        }

        var instance = this;
        return this.getUser(userId).then(function (user) {
            instance._currentUser = user;
            return user;
        });
    };

    ApiClient.prototype.isLoggedIn = function () {

        var info = this.serverInfo();
        if (info) {
            if (info.UserId && info.AccessToken) {
                return true;
            }
        }

        return false;
    };

    ApiClient.prototype.logout = function () {

        stopBitrateDetection(this);
        this.closeWebSocket();

        var done = function () {
            this.setAuthenticationInfo(null, null);
        }.bind(this);

        if (this.accessToken()) {
            var url = this.getUrl("Sessions/Logout");

            return this.ajax({
                type: "POST",
                url: url

            }).then(done, done);
        }

        done();
        return Promise.resolve();
    };

    /**
     * Authenticates a user
     * @param {String} name
     * @param {String} password
     */
    ApiClient.prototype.authenticateUserByName = function (name, password) {

        if (!name) {
            return Promise.reject();
        }

        var url = this.getUrl("Users/authenticatebyname");
        var instance = this;

        return new Promise(function (resolve, reject) {

            require(["cryptojs-sha1", "cryptojs-md5"], function () {
                var postData = {
                    Password: CryptoJS.SHA1(password || "").toString(),
                    PasswordMd5: CryptoJS.MD5(password || "").toString(),
                    Username: name
                };

                instance.ajax({
                    type: "POST",
                    url: url,
                    data: JSON.stringify(postData),
                    dataType: "json",
                    contentType: "application/json"

                }).then(function (result) {

                    if (instance.onAuthenticated) {
                        instance.onAuthenticated(instance, result);
                    }

                    redetectBitrate(instance);

                    resolve(result);

                }, reject);
            });
        });
    };

    ApiClient.prototype.ensureWebSocket = function () {
        if (this.isWebSocketOpenOrConnecting() || !this.isWebSocketSupported()) {
            return;
        }

        try {
            this.openWebSocket();
        } catch (err) {
            console.log("Error opening web socket: " + err);
        }
    };

    ApiClient.prototype.openWebSocket = function () {

        var accessToken = this.accessToken();

        if (!accessToken) {
            throw new Error("Cannot open web socket without access token.");
        }

        var url = this.getUrl("socket");

        url = replaceAll(url, 'emby/socket', 'embywebsocket');
        url = replaceAll(url, 'https:', 'wss:');
        url = replaceAll(url, 'http:', 'ws:');

        url += "?api_key=" + accessToken;
        url += "&deviceId=" + this.deviceId();

        var webSocket = new WebSocket(url);

        var instance = this;

        webSocket.onmessage = function (msg) {

            msg = JSON.parse(msg.data);
            onWebSocketMessage(instance, msg);
        };

        webSocket.onopen = function () {

            console.log('web socket connection opened');
            setTimeout(function () {
                events.trigger(instance, 'websocketopen');
            }, 0);
        };
        webSocket.onerror = function () {
            events.trigger(instance, 'websocketerror');
        };
        webSocket.onclose = function () {
            setTimeout(function () {
                events.trigger(instance, 'websocketclose');
            }, 0);
        };

        this._webSocket = webSocket;
    };

    ApiClient.prototype.closeWebSocket = function () {
        if (this._webSocket && this._webSocket.readyState === WebSocket.OPEN) {
            this._webSocket.close();
        }
    };

    function onWebSocketMessage(instance, msg) {

        if (msg.MessageType === "UserDeleted") {
            instance._currentUser = null;
        }
        else if (msg.MessageType === "UserUpdated" || msg.MessageType === "UserConfigurationUpdated") {

            var user = msg.Data;
            if (user.Id === instance.getCurrentUserId()) {

                instance._currentUser = null;
            }
        }

        events.trigger(instance, 'websocketmessage', [msg]);
    }

    ApiClient.prototype.sendWebSocketMessage = function (name, data) {

        console.log('Sending web socket message: ' + name);

        var msg = { MessageType: name };

        if (data) {
            msg.Data = data;
        }

        msg = JSON.stringify(msg);

        this._webSocket.send(msg);
    };

    ApiClient.prototype.isWebSocketOpen = function () {
        return this._webSocket && this._webSocket.readyState === WebSocket.OPEN;
    };

    ApiClient.prototype.isWebSocketOpenOrConnecting = function () {
        return this._webSocket && (this._webSocket.readyState === WebSocket.OPEN || this._webSocket.readyState === WebSocket.CONNECTING);
    };

    ApiClient.prototype.get = function (url) {

        return this.ajax({
            type: "GET",
            url: url
        });
    };

    ApiClient.prototype.getJSON = function (url, includeAuthorization) {

        return this.fetch({

            url: url,
            type: 'GET',
            dataType: 'json',
            headers: {
                accept: 'application/json'
            }

        }, includeAuthorization);
    };

    ApiClient.prototype.updateServerInfo = function (server, connectionMode) {

        if (server == null) {
            throw new Error('server cannot be null');
        }

        if (connectionMode == null) {
            throw new Error('connectionMode cannot be null');
        }

        console.log('Begin updateServerInfo. connectionMode: ' + connectionMode);

        this.serverInfo(server);

        var serverUrl = MediaBrowser.ServerInfo.getServerAddress(server, connectionMode);

        if (!serverUrl) {
            throw new Error('serverUrl cannot be null. serverInfo: ' + JSON.stringify(server));
        }
        console.log('Setting server address to ' + serverUrl);
        this.serverAddress(serverUrl);
    };

    ApiClient.prototype.isWebSocketSupported = function () {
        try {
            return WebSocket != null;
        }
        catch (err) {
            return false;
        }
    };

    ApiClient.prototype.clearAuthenticationInfo = function () {
        this.setAuthenticationInfo(null, null);
    };

    ApiClient.prototype.encodeName = function (name) {

        name = name.split('/').join('-');
        name = name.split('&').join('-');
        name = name.split('?').join('-');

        var val = paramsToString({ name: name });
        return val.substring(val.indexOf('=') + 1).replace("'", '%27');
    };

    ApiClient.prototype.getProductNews = function (options) {

        options = options || {};

        var url = this.getUrl("News/Product", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getDownloadSpeed = function (byteSize) {

        var url = this.getUrl('Playback/BitrateTest', {

            Size: byteSize
        });

        var now = new Date().getTime();

        return this.ajax({

            type: "GET",
            url: url,
            timeout: 5000

        }).then(function () {

            var responseTimeSeconds = (new Date().getTime() - now) / 1000;
            var bytesPerSecond = byteSize / responseTimeSeconds;
            var bitrate = Math.round(bytesPerSecond * 8);

            return bitrate;
        });
    };

    function normalizeReturnBitrate(instance, bitrate) {

        if (!bitrate) {

            if (instance.lastDetectedBitrate) {
                return instance.lastDetectedBitrate;
            }

            return Promise.reject();
        }

        var result = Math.round(bitrate * 0.8);

        instance.lastDetectedBitrate = result;
        instance.lastDetectedBitrateTime = new Date().getTime();

        return result;
    }

    function detectBitrateInternal(instance, tests, index, currentBitrate) {

        if (index >= tests.length) {

            return normalizeReturnBitrate(instance, currentBitrate);
        }

        var test = tests[index];

        return instance.getDownloadSpeed(test.bytes).then(function (bitrate) {

            if (bitrate < test.threshold) {

                return normalizeReturnBitrate(instance, bitrate);
            } else {
                return detectBitrateInternal(instance, tests, index + 1, bitrate);
            }

        }, function () {
            return normalizeReturnBitrateinstance, (currentBitrate);
        });
    }

    ApiClient.prototype.detectBitrate = function (force) {

        if (!force && this.lastDetectedBitrate && (new Date().getTime() - (this.lastDetectedBitrateTime || 0)) <= 3600000) {
            return Promise.resolve(this.lastDetectedBitrate);
        }

        var instance = this;
        return this.getEndpointInfo().then(function (info) {

            if (info.IsInNetwork) {

                var result = 140000000;
                instance.lastDetectedBitrate = result;
                instance.lastDetectedBitrateTime = new Date().getTime();
                return result;
            }

            return detectBitrateInternal(instance, [
            {
                bytes: 500000,
                threshold: 500000
            },
            {
                bytes: 1000000,
                threshold: 20000000
            },
            {
                bytes: 3000000,
                threshold: 50000000
            }], 0);
        });
    };

    /**
     * Gets an item from the server
     * Omit itemId to get the root folder.
     */
    ApiClient.prototype.getItem = function (userId, itemId) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = userId ?
            this.getUrl("Users/" + userId + "/Items/" + itemId) :
            this.getUrl("Items/" + itemId);

        return this.getJSON(url);
    };

    /**
     * Gets the root folder from the server
     */
    ApiClient.prototype.getRootFolder = function (userId) {

        if (!userId) {
            throw new Error("null userId");
        }

        var url = this.getUrl("Users/" + userId + "/Items/Root");

        return this.getJSON(url);
    };

    ApiClient.prototype.getNotificationSummary = function (userId) {

        if (!userId) {
            throw new Error("null userId");
        }

        var url = this.getUrl("Notifications/" + userId + "/Summary");

        return this.getJSON(url);
    };

    ApiClient.prototype.getNotifications = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        var url = this.getUrl("Notifications/" + userId, options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.markNotificationsRead = function (userId, idList, isRead) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!idList) {
            throw new Error("null idList");
        }

        var suffix = isRead ? "Read" : "Unread";

        var params = {
            UserId: userId,
            Ids: idList.join(',')
        };

        var url = this.getUrl("Notifications/" + userId + "/" + suffix, params);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    function getRemoteImagePrefix(instance, options) {

        var urlPrefix;

        if (options.artist) {
            urlPrefix = "Artists/" + instance.encodeName(options.artist);
            delete options.artist;
        } else if (options.person) {
            urlPrefix = "Persons/" + instance.encodeName(options.person);
            delete options.person;
        } else if (options.genre) {
            urlPrefix = "Genres/" + instance.encodeName(options.genre);
            delete options.genre;
        } else if (options.musicGenre) {
            urlPrefix = "MusicGenres/" + instance.encodeName(options.musicGenre);
            delete options.musicGenre;
        } else if (options.gameGenre) {
            urlPrefix = "GameGenres/" + instance.encodeName(options.gameGenre);
            delete options.gameGenre;
        } else if (options.studio) {
            urlPrefix = "Studios/" + instance.encodeName(options.studio);
            delete options.studio;
        } else {
            urlPrefix = "Items/" + options.itemId;
            delete options.itemId;
        }

        return urlPrefix;
    }

    ApiClient.prototype.getRemoteImageProviders = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        var urlPrefix = getRemoteImagePrefix(this, options);

        var url = this.getUrl(urlPrefix + "/RemoteImages/Providers", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getAvailableRemoteImages = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        var urlPrefix = getRemoteImagePrefix(this, options);

        var url = this.getUrl(urlPrefix + "/RemoteImages", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.downloadRemoteImage = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        var urlPrefix = getRemoteImagePrefix(this, options);

        var url = this.getUrl(urlPrefix + "/RemoteImages/Download", options);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.getLiveTvInfo = function (options) {

        var url = this.getUrl("LiveTv/Info", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvGuideInfo = function (options) {

        var url = this.getUrl("LiveTv/GuideInfo", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvChannel = function (id, userId) {

        if (!id) {
            throw new Error("null id");
        }

        var options = {

        };

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("LiveTv/Channels/" + id, options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvChannels = function (options) {

        var url = this.getUrl("LiveTv/Channels", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvPrograms = function (options) {

        options = options || {};

        if (options.channelIds && options.channelIds.length > 1800) {

            return this.ajax({
                type: "POST",
                url: this.getUrl("LiveTv/Programs"),
                data: JSON.stringify(options),
                contentType: "application/json",
                dataType: "json"
            });

        } else {

            return this.ajax({
                type: "GET",
                url: this.getUrl("LiveTv/Programs", options),
                dataType: "json"
            });
        }
    };

    ApiClient.prototype.getLiveTvRecommendedPrograms = function (options) {

        options = options || {};

        return this.ajax({
            type: "GET",
            url: this.getUrl("LiveTv/Programs/Recommended", options),
            dataType: "json"
        });
    };

    ApiClient.prototype.getLiveTvRecordings = function (options) {

        var url = this.getUrl("LiveTv/Recordings", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvRecordingSeries = function (options) {

        var url = this.getUrl("LiveTv/Recordings/Series", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvRecordingGroups = function (options) {

        var url = this.getUrl("LiveTv/Recordings/Groups", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvRecordingGroup = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/Recordings/Groups/" + id);

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvRecording = function (id, userId) {

        if (!id) {
            throw new Error("null id");
        }

        var options = {

        };

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("LiveTv/Recordings/" + id, options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvProgram = function (id, userId) {

        if (!id) {
            throw new Error("null id");
        }

        var options = {

        };

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("LiveTv/Programs/" + id, options);

        return this.getJSON(url);
    };

    ApiClient.prototype.deleteLiveTvRecording = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/Recordings/" + id);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.cancelLiveTvTimer = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/Timers/" + id);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.getLiveTvTimers = function (options) {

        var url = this.getUrl("LiveTv/Timers", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getLiveTvTimer = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/Timers/" + id);

        return this.getJSON(url);
    };

    ApiClient.prototype.getNewLiveTvTimerDefaults = function (options) {

        options = options || {};

        var url = this.getUrl("LiveTv/Timers/Defaults", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.createLiveTvTimer = function (item) {

        if (!item) {
            throw new Error("null item");
        }

        var url = this.getUrl("LiveTv/Timers");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(item),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateLiveTvTimer = function (item) {

        if (!item) {
            throw new Error("null item");
        }

        var url = this.getUrl("LiveTv/Timers/" + item.Id);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(item),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.resetLiveTvTuner = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/Tuners/" + id + "/Reset");

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.getLiveTvSeriesTimers = function (options) {

        var url = this.getUrl("LiveTv/SeriesTimers", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.getFileOrganizationResults = function (options) {

        var url = this.getUrl("Library/FileOrganization", options || {});

        return this.getJSON(url);
    };

    ApiClient.prototype.deleteOriginalFileFromOrganizationResult = function (id) {

        var url = this.getUrl("Library/FileOrganizations/" + id + "/File");

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.clearOrganizationLog = function () {

        var url = this.getUrl("Library/FileOrganizations");

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.performOrganization = function (id) {

        var url = this.getUrl("Library/FileOrganizations/" + id + "/Organize");

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.performEpisodeOrganization = function (id, options) {

        var url = this.getUrl("Library/FileOrganizations/" + id + "/Episode/Organize");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(options),
            contentType: 'application/json'
        });
    };

    ApiClient.prototype.getLiveTvSeriesTimer = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/SeriesTimers/" + id);

        return this.getJSON(url);
    };

    ApiClient.prototype.cancelLiveTvSeriesTimer = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("LiveTv/SeriesTimers/" + id);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.createLiveTvSeriesTimer = function (item) {

        if (!item) {
            throw new Error("null item");
        }

        var url = this.getUrl("LiveTv/SeriesTimers");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(item),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateLiveTvSeriesTimer = function (item) {

        if (!item) {
            throw new Error("null item");
        }

        var url = this.getUrl("LiveTv/SeriesTimers/" + item.Id);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(item),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.getRegistrationInfo = function (feature) {

        var url = this.getUrl("Registrations/" + feature);

        return this.getJSON(url);
    };

    /**
     * Gets the current server status
     */
    ApiClient.prototype.getSystemInfo = function () {

        var url = this.getUrl("System/Info");

        return this.getJSON(url);
    };

    /**
     * Gets the current server status
     */
    ApiClient.prototype.getPublicSystemInfo = function () {

        var url = this.getUrl("System/Info/Public");

        return this.getJSON(url, false);
    };

    ApiClient.prototype.getInstantMixFromItem = function (itemId, options) {

        var url = this.getUrl("Items/" + itemId + "/InstantMix", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getEpisodes = function (itemId, options) {

        var url = this.getUrl("Shows/" + itemId + "/Episodes", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getDisplayPreferences = function (id, userId, app) {

        var url = this.getUrl("DisplayPreferences/" + id, {
            userId: userId,
            client: app
        });

        return this.getJSON(url);
    };

    ApiClient.prototype.updateDisplayPreferences = function (id, obj, userId, app) {

        var url = this.getUrl("DisplayPreferences/" + id, {
            userId: userId,
            client: app
        });

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(obj),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.getSeasons = function (itemId, options) {

        var url = this.getUrl("Shows/" + itemId + "/Seasons", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getSimilarItems = function (itemId, options) {

        var url = this.getUrl("Items/" + itemId + "/Similar", options);

        return this.getJSON(url);
    };

    /**
     * Gets all cultures known to the server
     */
    ApiClient.prototype.getCultures = function () {

        var url = this.getUrl("Localization/cultures");

        return this.getJSON(url);
    };

    /**
     * Gets all countries known to the server
     */
    ApiClient.prototype.getCountries = function () {

        var url = this.getUrl("Localization/countries");

        return this.getJSON(url);
    };

    /**
     * Gets plugin security info
     */
    ApiClient.prototype.getPluginSecurityInfo = function () {

        var url = this.getUrl("Plugins/SecurityInfo");

        return this.getJSON(url);
    };

    ApiClient.prototype.getPlaybackInfo = function (itemId, options, deviceProfile) {

        var postData = {
            DeviceProfile: deviceProfile
        };

        return this.ajax({
            url: this.getUrl('Items/' + itemId + '/PlaybackInfo', options),
            type: 'POST',
            data: JSON.stringify(postData),
            contentType: "application/json",
            dataType: "json"
        });
    };

    ApiClient.prototype.getIntros = function (itemId) {

        return this.getJSON(this.getUrl('Users/' + this.getCurrentUserId() + '/Items/' + itemId + '/Intros'));
    };

    /**
     * Gets the directory contents of a path on the server
     */
    ApiClient.prototype.getDirectoryContents = function (path, options) {

        if (!path) {
            throw new Error("null path");
        }
        if (typeof (path) !== 'string') {
            throw new Error('invalid path');
        }

        options = options || {};

        options.path = path;

        var url = this.getUrl("Environment/DirectoryContents", options);

        return this.getJSON(url);
    };

    /**
     * Gets shares from a network device
     */
    ApiClient.prototype.getNetworkShares = function (path) {

        if (!path) {
            throw new Error("null path");
        }

        var options = {};
        options.path = path;

        var url = this.getUrl("Environment/NetworkShares", options);

        return this.getJSON(url);
    };

    /**
     * Gets the parent of a given path
     */
    ApiClient.prototype.getParentPath = function (path) {

        if (!path) {
            throw new Error("null path");
        }

        var options = {};
        options.path = path;

        var url = this.getUrl("Environment/ParentPath", options);

        return this.ajax({
            type: "GET",
            url: url,
            dataType: 'text'
        });
    };

    /**
     * Gets a list of physical drives from the server
     */
    ApiClient.prototype.getDrives = function () {

        var url = this.getUrl("Environment/Drives");

        return this.getJSON(url);
    };

    /**
     * Gets a list of network devices from the server
     */
    ApiClient.prototype.getNetworkDevices = function () {

        var url = this.getUrl("Environment/NetworkDevices");

        return this.getJSON(url);
    };

    /**
     * Cancels a package installation
     */
    ApiClient.prototype.cancelPackageInstallation = function (installationId) {

        if (!installationId) {
            throw new Error("null installationId");
        }

        var url = this.getUrl("Packages/Installing/" + installationId);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
     * Refreshes metadata for an item
     */
    ApiClient.prototype.refreshItem = function (itemId, options) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Items/" + itemId + "/Refresh", options || {});

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    /**
     * Installs or updates a new plugin
     */
    ApiClient.prototype.installPlugin = function (name, guid, updateClass, version) {

        if (!name) {
            throw new Error("null name");
        }

        if (!updateClass) {
            throw new Error("null updateClass");
        }

        var options = {
            updateClass: updateClass,
            AssemblyGuid: guid
        };

        if (version) {
            options.version = version;
        }

        var url = this.getUrl("Packages/Installed/" + name, options);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    /**
     * Instructs the server to perform a restart.
     */
    ApiClient.prototype.restartServer = function () {

        var url = this.getUrl("System/Restart");

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    /**
     * Instructs the server to perform a shutdown.
     */
    ApiClient.prototype.shutdownServer = function () {

        var url = this.getUrl("System/Shutdown");

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    /**
     * Gets information about an installable package
     */
    ApiClient.prototype.getPackageInfo = function (name, guid) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {
            AssemblyGuid: guid
        };

        var url = this.getUrl("Packages/" + name, options);

        return this.getJSON(url);
    };

    /**
     * Gets the latest available application update (if any)
     */
    ApiClient.prototype.getAvailableApplicationUpdate = function () {

        var url = this.getUrl("Packages/Updates", { PackageType: "System" });

        return this.getJSON(url);
    };

    /**
     * Gets the latest available plugin updates (if any)
     */
    ApiClient.prototype.getAvailablePluginUpdates = function () {

        var url = this.getUrl("Packages/Updates", { PackageType: "UserInstalled" });

        return this.getJSON(url);
    };

    /**
     * Gets the virtual folder list
     */
    ApiClient.prototype.getVirtualFolders = function () {

        var url = "Library/VirtualFolders";

        url = this.getUrl(url);

        return this.getJSON(url);
    };

    /**
     * Gets all the paths of the locations in the physical root.
     */
    ApiClient.prototype.getPhysicalPaths = function () {

        var url = this.getUrl("Library/PhysicalPaths");

        return this.getJSON(url);
    };

    /**
     * Gets the current server configuration
     */
    ApiClient.prototype.getServerConfiguration = function () {

        var url = this.getUrl("System/Configuration");

        return this.getJSON(url);
    };

    /**
     * Gets the current server configuration
     */
    ApiClient.prototype.getDevicesOptions = function () {

        var url = this.getUrl("System/Configuration/devices");

        return this.getJSON(url);
    };

    /**
     * Gets the current server configuration
     */
    ApiClient.prototype.getContentUploadHistory = function () {

        var url = this.getUrl("Devices/CameraUploads", {
            DeviceId: this.deviceId()
        });

        return this.getJSON(url);
    };

    ApiClient.prototype.getNamedConfiguration = function (name) {

        var url = this.getUrl("System/Configuration/" + name);

        return this.getJSON(url);
    };

    /**
     * Gets the server's scheduled tasks
     */
    ApiClient.prototype.getScheduledTasks = function (options) {

        options = options || {};

        var url = this.getUrl("ScheduledTasks", options);

        return this.getJSON(url);
    };

    /**
    * Starts a scheduled task
    */
    ApiClient.prototype.startScheduledTask = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("ScheduledTasks/Running/" + id);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    /**
    * Gets a scheduled task
    */
    ApiClient.prototype.getScheduledTask = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("ScheduledTasks/" + id);

        return this.getJSON(url);
    };

    ApiClient.prototype.getNextUpEpisodes = function (options) {

        var url = this.getUrl("Shows/NextUp", options);

        return this.getJSON(url);
    };

    /**
    * Stops a scheduled task
    */
    ApiClient.prototype.stopScheduledTask = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("ScheduledTasks/Running/" + id);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
     * Gets the configuration of a plugin
     * @param {String} Id
     */
    ApiClient.prototype.getPluginConfiguration = function (id) {

        if (!id) {
            throw new Error("null Id");
        }

        var url = this.getUrl("Plugins/" + id + "/Configuration");

        return this.getJSON(url);
    };

    /**
     * Gets a list of plugins that are available to be installed
     */
    ApiClient.prototype.getAvailablePlugins = function (options) {

        options = options || {};
        options.PackageType = "UserInstalled";

        var url = this.getUrl("Packages", options);

        return this.getJSON(url);
    };

    /**
     * Uninstalls a plugin
     * @param {String} Id
     */
    ApiClient.prototype.uninstallPlugin = function (id) {

        if (!id) {
            throw new Error("null Id");
        }

        var url = this.getUrl("Plugins/" + id);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
    * Removes a virtual folder
    * @param {String} name
    */
    ApiClient.prototype.removeVirtualFolder = function (name, refreshLibrary) {

        if (!name) {
            throw new Error("null name");
        }

        var url = "Library/VirtualFolders";

        url = this.getUrl(url, {
            refreshLibrary: refreshLibrary ? true : false,
            name: name
        });

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
   * Adds a virtual folder
   * @param {String} name
   */
    ApiClient.prototype.addVirtualFolder = function (name, type, refreshLibrary, libraryOptions) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (type) {
            options.collectionType = type;
        }

        options.refreshLibrary = refreshLibrary ? true : false;
        options.name = name;

        var url = "Library/VirtualFolders";

        url = this.getUrl(url, options);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify({
                LibraryOptions: libraryOptions
            }),
            contentType: 'application/json'
        });
    };

    ApiClient.prototype.updateVirtualFolderOptions = function (id, libraryOptions) {

        if (!id) {
            throw new Error("null name");
        }

        var url = "Library/VirtualFolders/LibraryOptions";

        url = this.getUrl(url);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify({
                Id: id,
                LibraryOptions: libraryOptions
            }),
            contentType: 'application/json'
        });
    };

    /**
   * Renames a virtual folder
   * @param {String} name
   */
    ApiClient.prototype.renameVirtualFolder = function (name, newName, refreshLibrary) {

        if (!name) {
            throw new Error("null name");
        }

        var url = "Library/VirtualFolders/Name";

        url = this.getUrl(url, {
            refreshLibrary: refreshLibrary ? true : false,
            newName: newName,
            name: name
        });

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    /**
    * Adds an additional mediaPath to an existing virtual folder
    * @param {String} name
    */
    ApiClient.prototype.addMediaPath = function (virtualFolderName, mediaPath, networkSharePath, refreshLibrary) {

        if (!virtualFolderName) {
            throw new Error("null virtualFolderName");
        }

        if (!mediaPath) {
            throw new Error("null mediaPath");
        }

        var url = "Library/VirtualFolders/Paths";

        var pathInfo = {
            Path: mediaPath
        };
        if (networkSharePath) {
            pathInfo.NetworkPath = networkSharePath;
        }

        url = this.getUrl(url, {
            refreshLibrary: refreshLibrary ? true : false
        });

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify({
                Name: virtualFolderName,
                PathInfo: pathInfo
            }),
            contentType: 'application/json'
        });
    };

    ApiClient.prototype.updateMediaPath = function (virtualFolderName, pathInfo) {

        if (!virtualFolderName) {
            throw new Error("null virtualFolderName");
        }

        if (!pathInfo) {
            throw new Error("null pathInfo");
        }

        var url = "Library/VirtualFolders/Paths/Update";

        url = this.getUrl(url);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify({
                Name: virtualFolderName,
                PathInfo: pathInfo
            }),
            contentType: 'application/json'
        });
    };

    /**
    * Removes a media path from a virtual folder
    * @param {String} name
    */
    ApiClient.prototype.removeMediaPath = function (virtualFolderName, mediaPath, refreshLibrary) {

        if (!virtualFolderName) {
            throw new Error("null virtualFolderName");
        }

        if (!mediaPath) {
            throw new Error("null mediaPath");
        }

        var url = "Library/VirtualFolders/Paths";

        url = this.getUrl(url, {
            refreshLibrary: refreshLibrary ? true : false,
            path: mediaPath,
            name: virtualFolderName
        });

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
     * Deletes a user
     * @param {String} id
     */
    ApiClient.prototype.deleteUser = function (id) {

        if (!id) {
            throw new Error("null id");
        }

        var url = this.getUrl("Users/" + id);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
     * Deletes a user image
     * @param {String} userId
     * @param {String} imageType The type of image to delete, based on the server-side ImageType enum.
     */
    ApiClient.prototype.deleteUserImage = function (userId, imageType, imageIndex) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!imageType) {
            throw new Error("null imageType");
        }

        var url = this.getUrl("Users/" + userId + "/Images/" + imageType);

        if (imageIndex != null) {
            url += "/" + imageIndex;
        }

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.deleteItemImage = function (itemId, imageType, imageIndex) {

        if (!imageType) {
            throw new Error("null imageType");
        }

        var url = this.getUrl("Items/" + itemId + "/Images");

        url += "/" + imageType;

        if (imageIndex != null) {
            url += "/" + imageIndex;
        }

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.deleteItem = function (itemId) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Items/" + itemId);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.stopActiveEncodings = function (playSessionId) {

        var options = {
            deviceId: this.deviceId()
        };

        if (playSessionId) {
            options.PlaySessionId = playSessionId;
        }

        var url = this.getUrl("Videos/ActiveEncodings", options);

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    ApiClient.prototype.reportCapabilities = function (options) {

        var url = this.getUrl("Sessions/Capabilities/Full");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(options),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateItemImageIndex = function (itemId, imageType, imageIndex, newIndex) {

        if (!imageType) {
            throw new Error("null imageType");
        }

        var options = { newIndex: newIndex };

        var url = this.getUrl("Items/" + itemId + "/Images/" + imageType + "/" + imageIndex + "/Index", options);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.getItemImageInfos = function (itemId) {

        var url = this.getUrl("Items/" + itemId + "/Images");

        return this.getJSON(url);
    };

    ApiClient.prototype.getCriticReviews = function (itemId, options) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Items/" + itemId + "/CriticReviews", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getItemDownloadUrl = function (itemId) {

        if (!itemId) {
            throw new Error("itemId cannot be empty");
        }

        var url = "Items/" + itemId + "/Download";

        return this.getUrl(url, {
            api_key: this.accessToken()
        });
    };

    ApiClient.prototype.getSessions = function (options) {

        var url = this.getUrl("Sessions", options);

        return this.getJSON(url);
    };

    /**
     * Uploads a user image
     * @param {String} userId
     * @param {String} imageType The type of image to delete, based on the server-side ImageType enum.
     * @param {Object} file The file from the input element
     */
    ApiClient.prototype.uploadUserImage = function (userId, imageType, file) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!imageType) {
            throw new Error("null imageType");
        }

        if (!file) {
            throw new Error("File must be an image.");
        }

        if (file.type !== "image/png" && file.type !== "image/jpeg" && file.type !== "image/jpeg") {
            throw new Error("File must be an image.");
        }

        var instance = this;

        return new Promise(function (resolve, reject) {

            var reader = new FileReader();

            reader.onerror = function () {
                reject();
            };

            reader.onabort = function () {
                reject();
            };

            // Closure to capture the file information.
            reader.onload = function (e) {

                // Split by a comma to remove the url: prefix
                var data = e.target.result.split(',')[1];

                var url = instance.getUrl("Users/" + userId + "/Images/" + imageType);

                instance.ajax({
                    type: "POST",
                    url: url,
                    data: data,
                    contentType: "image/" + file.name.substring(file.name.lastIndexOf('.') + 1)
                }).then(resolve, reject);
            };

            // Read in the image file as a data URL.
            reader.readAsDataURL(file);
        });
    };

    ApiClient.prototype.uploadItemImage = function (itemId, imageType, file) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        if (!imageType) {
            throw new Error("null imageType");
        }

        if (!file) {
            throw new Error("File must be an image.");
        }

        if (file.type !== "image/png" && file.type !== "image/jpeg" && file.type !== "image/jpeg") {
            throw new Error("File must be an image.");
        }

        var url = this.getUrl("Items/" + itemId + "/Images");

        url += "/" + imageType;
        var instance = this;

        return new Promise(function (resolve, reject) {

            var reader = new FileReader();

            reader.onerror = function () {
                reject();
            };

            reader.onabort = function () {
                reject();
            };

            // Closure to capture the file information.
            reader.onload = function (e) {

                // Split by a comma to remove the url: prefix
                var data = e.target.result.split(',')[1];

                instance.ajax({
                    type: "POST",
                    url: url,
                    data: data,
                    contentType: "image/" + file.name.substring(file.name.lastIndexOf('.') + 1)
                }).then(resolve, reject);
            };

            // Read in the image file as a data URL.
            reader.readAsDataURL(file);
        });
    };

    /**
     * Gets the list of installed plugins on the server
     */
    ApiClient.prototype.getInstalledPlugins = function () {

        var options = {};

        var url = this.getUrl("Plugins", options);

        return this.getJSON(url);
    };

    /**
     * Gets a user by id
     * @param {String} id
     */
    ApiClient.prototype.getUser = function (id) {

        if (!id) {
            throw new Error("Must supply a userId");
        }

        var url = this.getUrl("Users/" + id);

        return this.getJSON(url);
    };

    /**
     * Gets a studio
     */
    ApiClient.prototype.getStudio = function (name, userId) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Studios/" + this.encodeName(name), options);

        return this.getJSON(url);
    };

    /**
     * Gets a genre
     */
    ApiClient.prototype.getGenre = function (name, userId) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Genres/" + this.encodeName(name), options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getMusicGenre = function (name, userId) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("MusicGenres/" + this.encodeName(name), options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getGameGenre = function (name, userId) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("GameGenres/" + this.encodeName(name), options);

        return this.getJSON(url);
    };

    /**
     * Gets an artist
     */
    ApiClient.prototype.getArtist = function (name, userId) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Artists/" + this.encodeName(name), options);

        return this.getJSON(url);
    };

    /**
     * Gets a Person
     */
    ApiClient.prototype.getPerson = function (name, userId) {

        if (!name) {
            throw new Error("null name");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Persons/" + this.encodeName(name), options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getPublicUsers = function () {

        var url = this.getUrl("users/public");

        return this.ajax({
            type: "GET",
            url: url,
            dataType: "json"

        }, false);
    };

    /**
     * Gets all users from the server
     */
    ApiClient.prototype.getUsers = function (options) {

        var url = this.getUrl("users", options || {});

        return this.getJSON(url);
    };

    /**
     * Gets all available parental ratings from the server
     */
    ApiClient.prototype.getParentalRatings = function () {

        var url = this.getUrl("Localization/ParentalRatings");

        return this.getJSON(url);
    };

    ApiClient.prototype.getDefaultImageQuality = function (imageType) {
        return imageType.toLowerCase() === 'backdrop' ? 80 : 90;
    };

    function normalizeImageOptions(instance, options) {

        var ratio = instance._devicePixelRatio || 1;

        if (ratio) {

            if (options.minScale) {
                ratio = Math.max(options.minScale, ratio);
            }

            if (options.width) {
                options.width = Math.round(options.width * ratio);
            }
            if (options.height) {
                options.height = Math.round(options.height * ratio);
            }
            if (options.maxWidth) {
                options.maxWidth = Math.round(options.maxWidth * ratio);
            }
            if (options.maxHeight) {
                options.maxHeight = Math.round(options.maxHeight * ratio);
            }
        }

        options.quality = options.quality || instance.getDefaultImageQuality(options.type);

        if (instance.normalizeImageOptions) {
            instance.normalizeImageOptions(options);
        }
    }

    /**
     * Constructs a url for a user image
     * @param {String} userId
     * @param {Object} options
     * Options supports the following properties:
     * width - download the image at a fixed width
     * height - download the image at a fixed height
     * maxWidth - download the image at a maxWidth
     * maxHeight - download the image at a maxHeight
     * quality - A scale of 0-100. This should almost always be omitted as the default will suffice.
     * For best results do not specify both width and height together, as aspect ratio might be altered.
     */
    ApiClient.prototype.getUserImageUrl = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};

        var url = "Users/" + userId + "/Images/" + options.type;

        if (options.index != null) {
            url += "/" + options.index;
        }

        normalizeImageOptions(this, options);

        // Don't put these on the query string
        delete options.type;
        delete options.index;

        return this.getUrl(url, options);
    };

    /**
     * Constructs a url for an item image
     * @param {String} itemId
     * @param {Object} options
     * Options supports the following properties:
     * type - Primary, logo, backdrop, etc. See the server-side enum ImageType
     * index - When downloading a backdrop, use this to specify which one (omitting is equivalent to zero)
     * width - download the image at a fixed width
     * height - download the image at a fixed height
     * maxWidth - download the image at a maxWidth
     * maxHeight - download the image at a maxHeight
     * quality - A scale of 0-100. This should almost always be omitted as the default will suffice.
     * For best results do not specify both width and height together, as aspect ratio might be altered.
     */
    ApiClient.prototype.getImageUrl = function (itemId, options) {

        if (!itemId) {
            throw new Error("itemId cannot be empty");
        }

        options = options || {};

        var url = "Items/" + itemId + "/Images/" + options.type;

        if (options.index != null) {
            url += "/" + options.index;
        }

        options.quality = options.quality || this.getDefaultImageQuality(options.type);

        if (this.normalizeImageOptions) {
            this.normalizeImageOptions(options);
        }

        // Don't put these on the query string
        delete options.type;
        delete options.index;

        return this.getUrl(url, options);
    };

    ApiClient.prototype.getScaledImageUrl = function (itemId, options) {

        if (!itemId) {
            throw new Error("itemId cannot be empty");
        }

        options = options || {};

        var url = "Items/" + itemId + "/Images/" + options.type;

        if (options.index != null) {
            url += "/" + options.index;
        }

        normalizeImageOptions(this, options);

        // Don't put these on the query string
        delete options.type;
        delete options.index;
        delete options.minScale;

        return this.getUrl(url, options);
    };

    ApiClient.prototype.getThumbImageUrl = function (item, options) {

        if (!item) {
            throw new Error("null item");
        }

        options = options || {

        };

        options.imageType = "thumb";

        if (item.ImageTags && item.ImageTags.Thumb) {

            options.tag = item.ImageTags.Thumb;
            return this.getImageUrl(item.Id, options);
        }
        else if (item.ParentThumbItemId) {

            options.tag = item.ImageTags.ParentThumbImageTag;
            return this.getImageUrl(item.ParentThumbItemId, options);

        } else {
            return null;
        }
    };

    /**
     * Updates a user's password
     * @param {String} userId
     * @param {String} currentPassword
     * @param {String} newPassword
     */
    ApiClient.prototype.updateUserPassword = function (userId, currentPassword, newPassword) {

        if (!userId) {
            return Promise.reject();
        }

        var url = this.getUrl("Users/" + userId + "/Password");

        var instance = this;

        return new Promise(function (resolve, reject) {

            require(["cryptojs-sha1"], function () {

                instance.ajax({
                    type: "POST",
                    url: url,
                    data: {
                        currentPassword: CryptoJS.SHA1(currentPassword).toString(),
                        newPassword: CryptoJS.SHA1(newPassword).toString()
                    }
                }).then(resolve, reject);
            });
        });
    };

    /**
     * Updates a user's easy password
     * @param {String} userId
     * @param {String} newPassword
     */
    ApiClient.prototype.updateEasyPassword = function (userId, newPassword) {

        var instance = this;

        return new Promise(function (resolve, reject) {

            if (!userId) {
                reject();
                return;
            }

            var url = this.getUrl("Users/" + userId + "/EasyPassword");

            require(["cryptojs-sha1"], function () {

                instance.ajax({
                    type: "POST",
                    url: url,
                    data: {
                        newPassword: CryptoJS.SHA1(newPassword).toString()
                    }
                }).then(resolve, reject);
            });
        });
    };

    /**
    * Resets a user's password
    * @param {String} userId
    */
    ApiClient.prototype.resetUserPassword = function (userId) {

        if (!userId) {
            throw new Error("null userId");
        }

        var url = this.getUrl("Users/" + userId + "/Password");

        var postData = {

        };

        postData.resetPassword = true;

        return this.ajax({
            type: "POST",
            url: url,
            data: postData
        });
    };

    ApiClient.prototype.resetEasyPassword = function (userId) {

        if (!userId) {
            throw new Error("null userId");
        }

        var url = this.getUrl("Users/" + userId + "/EasyPassword");

        var postData = {

        };

        postData.resetPassword = true;

        return this.ajax({
            type: "POST",
            url: url,
            data: postData
        });
    };

    /**
     * Updates the server's configuration
     * @param {Object} configuration
     */
    ApiClient.prototype.updateServerConfiguration = function (configuration) {

        if (!configuration) {
            throw new Error("null configuration");
        }

        var url = this.getUrl("System/Configuration");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(configuration),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateNamedConfiguration = function (name, configuration) {

        if (!configuration) {
            throw new Error("null configuration");
        }

        var url = this.getUrl("System/Configuration/" + name);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(configuration),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateItem = function (item) {

        if (!item) {
            throw new Error("null item");
        }

        var url = this.getUrl("Items/" + item.Id);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(item),
            contentType: "application/json"
        });
    };

    /**
     * Updates plugin security info
     */
    ApiClient.prototype.updatePluginSecurityInfo = function (info) {

        var url = this.getUrl("Plugins/SecurityInfo");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(info),
            contentType: "application/json"
        });
    };

    /**
     * Creates a user
     * @param {Object} user
     */
    ApiClient.prototype.createUser = function (name) {

        var url = this.getUrl("Users/New");

        return this.ajax({
            type: "POST",
            url: url,
            data: {
                Name: name
            },
            dataType: "json"
        });
    };

    /**
     * Updates a user
     * @param {Object} user
     */
    ApiClient.prototype.updateUser = function (user) {

        if (!user) {
            throw new Error("null user");
        }

        var url = this.getUrl("Users/" + user.Id);

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(user),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateUserPolicy = function (userId, policy) {

        if (!userId) {
            throw new Error("null userId");
        }
        if (!policy) {
            throw new Error("null policy");
        }

        var url = this.getUrl("Users/" + userId + "/Policy");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(policy),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.updateUserConfiguration = function (userId, configuration) {

        if (!userId) {
            throw new Error("null userId");
        }
        if (!configuration) {
            throw new Error("null configuration");
        }

        var url = this.getUrl("Users/" + userId + "/Configuration");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(configuration),
            contentType: "application/json"
        });
    };

    /**
     * Updates the Triggers for a ScheduledTask
     * @param {String} id
     * @param {Object} triggers
     */
    ApiClient.prototype.updateScheduledTaskTriggers = function (id, triggers) {

        if (!id) {
            throw new Error("null id");
        }

        if (!triggers) {
            throw new Error("null triggers");
        }

        var url = this.getUrl("ScheduledTasks/" + id + "/Triggers");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(triggers),
            contentType: "application/json"
        });
    };

    /**
     * Updates a plugin's configuration
     * @param {String} Id
     * @param {Object} configuration
     */
    ApiClient.prototype.updatePluginConfiguration = function (id, configuration) {

        if (!id) {
            throw new Error("null Id");
        }

        if (!configuration) {
            throw new Error("null configuration");
        }

        var url = this.getUrl("Plugins/" + id + "/Configuration");

        return this.ajax({
            type: "POST",
            url: url,
            data: JSON.stringify(configuration),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.getAncestorItems = function (itemId, userId) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Items/" + itemId + "/Ancestors", options);

        return this.getJSON(url);
    };

    /**
     * Gets items based on a query, typically for children of a folder
     * @param {String} userId
     * @param {Object} options
     * Options accepts the following properties:
     * itemId - Localize the search to a specific folder (root if omitted)
     * startIndex - Use for paging
     * limit - Use to limit results to a certain number of items
     * filter - Specify one or more ItemFilters, comma delimeted (see server-side enum)
     * sortBy - Specify an ItemSortBy (comma-delimeted list see server-side enum)
     * sortOrder - ascending/descending
     * fields - additional fields to include aside from basic info. This is a comma delimited list. See server-side enum ItemFields.
     * index - the name of the dynamic, localized index function
     * dynamicSortBy - the name of the dynamic localized sort function
     * recursive - Whether or not the query should be recursive
     * searchTerm - search term to use as a filter
     */
    ApiClient.prototype.getItems = function (userId, options) {

        var url;

        if ((typeof userId).toString().toLowerCase() === 'string') {
            url = this.getUrl("Users/" + userId + "/Items", options);
        } else {

            url = this.getUrl("Items", options);
        }

        return this.getJSON(url);
    };

    ApiClient.prototype.getMovieRecommendations = function (options) {

        return this.getJSON(this.getUrl('Movies/Recommendations', options));
    };

    ApiClient.prototype.getUpcomingEpisodes = function (options) {

        return this.getJSON(this.getUrl('Shows/Upcoming', options));
    };

    ApiClient.prototype.getChannels = function (query) {

        return this.getJSON(this.getUrl("Channels", query || {}));
    };

    ApiClient.prototype.getLatestChannelItems = function (query) {

        return this.getJSON(this.getUrl("Channels/Items/Latest", query));
    };

    ApiClient.prototype.getUserViews = function (options, userId) {

        options = options || {};

        var url = this.getUrl("Users/" + (userId || this.getCurrentUserId()) + "/Views", options);

        return this.getJSON(url);
    };

    /**
        Gets artists from an item
    */
    ApiClient.prototype.getArtists = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("Artists", options);

        return this.getJSON(url);
    };

    /**
        Gets artists from an item
    */
    ApiClient.prototype.getAlbumArtists = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("Artists/AlbumArtists", options);

        return this.getJSON(url);
    };

    /**
        Gets genres from an item
    */
    ApiClient.prototype.getGenres = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("Genres", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getMusicGenres = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("MusicGenres", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getGameGenres = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("GameGenres", options);

        return this.getJSON(url);
    };

    /**
        Gets people from an item
    */
    ApiClient.prototype.getPeople = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("Persons", options);

        return this.getJSON(url);
    };

    /**
        Gets studios from an item
    */
    ApiClient.prototype.getStudios = function (userId, options) {

        if (!userId) {
            throw new Error("null userId");
        }

        options = options || {};
        options.userId = userId;

        var url = this.getUrl("Studios", options);

        return this.getJSON(url);
    };

    /**
     * Gets local trailers for an item
     */
    ApiClient.prototype.getLocalTrailers = function (userId, itemId) {

        if (!userId) {
            throw new Error("null userId");
        }
        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Users/" + userId + "/Items/" + itemId + "/LocalTrailers");

        return this.getJSON(url);
    };

    ApiClient.prototype.getGameSystems = function () {

        var options = {};

        var userId = this.getCurrentUserId();
        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Games/SystemSummaries", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getAdditionalVideoParts = function (userId, itemId) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Videos/" + itemId + "/AdditionalParts", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getThemeMedia = function (userId, itemId, inherit) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        options.InheritFromParent = inherit || false;

        var url = this.getUrl("Items/" + itemId + "/ThemeMedia", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getSearchHints = function (options) {

        var url = this.getUrl("Search/Hints", options);
        var serverId = this.serverId();

        return this.getJSON(url).then(function (result) {
            result.SearchHints.forEach(function (i) {
                i.ServerId = serverId;
            });
            return result;
        });
    };

    /**
     * Gets special features for an item
     */
    ApiClient.prototype.getSpecialFeatures = function (userId, itemId) {

        if (!userId) {
            throw new Error("null userId");
        }
        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Users/" + userId + "/Items/" + itemId + "/SpecialFeatures");

        return this.getJSON(url);
    };

    ApiClient.prototype.getDateParamValue = function (date) {

        function formatDigit(i) {
            return i < 10 ? "0" + i : i;
        }

        var d = date;

        return "" + d.getFullYear() + formatDigit(d.getMonth() + 1) + formatDigit(d.getDate()) + formatDigit(d.getHours()) + formatDigit(d.getMinutes()) + formatDigit(d.getSeconds());
    };

    ApiClient.prototype.markPlayed = function (userId, itemId, date) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!itemId) {
            throw new Error("null itemId");
        }

        var options = {};

        if (date) {
            options.DatePlayed = this.getDateParamValue(date);
        }

        var url = this.getUrl("Users/" + userId + "/PlayedItems/" + itemId, options);

        return this.ajax({
            type: "POST",
            url: url,
            dataType: "json"
        });
    };

    ApiClient.prototype.markUnplayed = function (userId, itemId) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Users/" + userId + "/PlayedItems/" + itemId);

        return this.ajax({
            type: "DELETE",
            url: url,
            dataType: "json"
        });
    };

    /**
     * Updates a user's favorite status for an item.
     * @param {String} userId
     * @param {String} itemId
     * @param {Boolean} isFavorite
     */
    ApiClient.prototype.updateFavoriteStatus = function (userId, itemId, isFavorite) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Users/" + userId + "/FavoriteItems/" + itemId);

        var method = isFavorite ? "POST" : "DELETE";

        return this.ajax({
            type: method,
            url: url,
            dataType: "json"
        });
    };

    /**
     * Updates a user's personal rating for an item
     * @param {String} userId
     * @param {String} itemId
     * @param {Boolean} likes
     */
    ApiClient.prototype.updateUserItemRating = function (userId, itemId, likes) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Users/" + userId + "/Items/" + itemId + "/Rating", {
            likes: likes
        });

        return this.ajax({
            type: "POST",
            url: url,
            dataType: "json"
        });
    };

    ApiClient.prototype.getItemCounts = function (userId) {

        var options = {};

        if (userId) {
            options.userId = userId;
        }

        var url = this.getUrl("Items/Counts", options);

        return this.getJSON(url);
    };

    /**
     * Clears a user's personal rating for an item
     * @param {String} userId
     * @param {String} itemId
     */
    ApiClient.prototype.clearUserItemRating = function (userId, itemId) {

        if (!userId) {
            throw new Error("null userId");
        }

        if (!itemId) {
            throw new Error("null itemId");
        }

        var url = this.getUrl("Users/" + userId + "/Items/" + itemId + "/Rating");

        return this.ajax({
            type: "DELETE",
            url: url,
            dataType: "json"
        });
    };

    /**
     * Reports the user has started playing something
     * @param {String} userId
     * @param {String} itemId
     */
    ApiClient.prototype.reportPlaybackStart = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        this.lastPlaybackProgressReport = 0;
        stopBitrateDetection(this);

        var url = this.getUrl("Sessions/Playing");

        return this.ajax({
            type: "POST",
            data: JSON.stringify(options),
            contentType: "application/json",
            url: url
        });
    };

    /**
     * Reports progress viewing an item
     * @param {String} userId
     * @param {String} itemId
     */
    ApiClient.prototype.reportPlaybackProgress = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        if ((options.EventName || 'timeupdate') === 'timeupdate') {

            var now = new Date().getTime();
            if ((now - (this.lastPlaybackProgressReport || 0)) <= 10000) {
                return;
            }

            this.lastPlaybackProgressReport = now;

        } else {

            // allow the next timeupdate
            this.lastPlaybackProgressReport = 0;
        }

        var url = this.getUrl("Sessions/Playing/Progress");

        return this.ajax({
            type: "POST",
            data: JSON.stringify(options),
            contentType: "application/json",
            url: url
        });
    };

    ApiClient.prototype.reportOfflineActions = function (actions) {

        if (!actions) {
            throw new Error("null actions");
        }

        var url = this.getUrl("Sync/OfflineActions");

        return this.ajax({
            type: "POST",
            data: JSON.stringify(actions),
            contentType: "application/json",
            url: url
        });
    };

    ApiClient.prototype.syncData = function (data) {

        if (!data) {
            throw new Error("null data");
        }

        var url = this.getUrl("Sync/Data");

        return this.ajax({
            type: "POST",
            data: JSON.stringify(data),
            contentType: "application/json",
            url: url,
            dataType: "json"
        });
    };

    ApiClient.prototype.getReadySyncItems = function (deviceId) {

        if (!deviceId) {
            throw new Error("null deviceId");
        }

        var url = this.getUrl("Sync/Items/Ready", {
            TargetId: deviceId
        });

        return this.getJSON(url);
    };

    ApiClient.prototype.reportSyncJobItemTransferred = function (syncJobItemId) {

        if (!syncJobItemId) {
            throw new Error("null syncJobItemId");
        }

        var url = this.getUrl("Sync/JobItems/" + syncJobItemId + "/Transferred");

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.cancelSyncItems = function (itemIds, targetId) {

        if (!itemIds) {
            throw new Error("null itemIds");
        }

        var url = this.getUrl("Sync/" + (targetId || this.deviceId()) + "/Items", {
            ItemIds: itemIds.join(',')
        });

        return this.ajax({
            type: "DELETE",
            url: url
        });
    };

    /**
     * Reports a user has stopped playing an item
     * @param {String} userId
     * @param {String} itemId
     */
    ApiClient.prototype.reportPlaybackStopped = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        this.lastPlaybackProgressReport = 0;
        redetectBitrate(this);

        var url = this.getUrl("Sessions/Playing/Stopped");

        return this.ajax({
            type: "POST",
            data: JSON.stringify(options),
            contentType: "application/json",
            url: url
        });
    };

    ApiClient.prototype.sendPlayCommand = function (sessionId, options) {

        if (!sessionId) {
            throw new Error("null sessionId");
        }

        if (!options) {
            throw new Error("null options");
        }

        var url = this.getUrl("Sessions/" + sessionId + "/Playing", options);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.sendCommand = function (sessionId, command) {

        if (!sessionId) {
            throw new Error("null sessionId");
        }

        if (!command) {
            throw new Error("null command");
        }

        var url = this.getUrl("Sessions/" + sessionId + "/Command");

        var ajaxOptions = {
            type: "POST",
            url: url
        };

        ajaxOptions.data = JSON.stringify(command);
        ajaxOptions.contentType = "application/json";

        return this.ajax(ajaxOptions);
    };

    ApiClient.prototype.sendMessageCommand = function (sessionId, options) {

        if (!sessionId) {
            throw new Error("null sessionId");
        }

        if (!options) {
            throw new Error("null options");
        }

        var url = this.getUrl("Sessions/" + sessionId + "/Message", options);

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.sendPlayStateCommand = function (sessionId, command, options) {

        if (!sessionId) {
            throw new Error("null sessionId");
        }

        if (!command) {
            throw new Error("null command");
        }

        var url = this.getUrl("Sessions/" + sessionId + "/Playing/" + command, options || {});

        return this.ajax({
            type: "POST",
            url: url
        });
    };

    ApiClient.prototype.createPackageReview = function (review) {

        var url = this.getUrl("Packages/Reviews/" + review.id, review);

        return this.ajax({
            type: "POST",
            url: url,
        });
    };

    ApiClient.prototype.getPackageReviews = function (packageId, minRating, maxRating, limit) {

        if (!packageId) {
            throw new Error("null packageId");
        }

        var options = {};

        if (minRating) {
            options.MinRating = minRating;
        }
        if (maxRating) {
            options.MaxRating = maxRating;
        }
        if (limit) {
            options.Limit = limit;
        }

        var url = this.getUrl("Packages/" + packageId + "/Reviews", options);

        return this.getJSON(url);
    };

    ApiClient.prototype.getSmartMatchInfos = function (options) {

        options = options || {};

        var url = this.getUrl("Library/FileOrganizations/SmartMatches", options);

        return this.ajax({
            type: "GET",
            url: url,
            dataType: "json"
        });
    };

    ApiClient.prototype.deleteSmartMatchEntries = function (entries) {

        var url = this.getUrl("Library/FileOrganizations/SmartMatches/Delete");

        var postData = {
            Entries: entries
        };

        return this.ajax({

            type: "POST",
            url: url,
            data: JSON.stringify(postData),
            contentType: "application/json"
        });
    };

    ApiClient.prototype.getEndpointInfo = function () {

        return this.getJSON(this.getUrl('System/Endpoint'));
    };

    ApiClient.prototype.getLatestItems = function (options) {

        options = options || {};
        return this.getJSON(this.getUrl('Users/' + this.getCurrentUserId() + '/Items/Latest', options));
    };

    return ApiClient;
});