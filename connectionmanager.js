/* jshint module: true */

import events from './events.js';

const defaultTimeout = 20000;

const ConnectionMode = {
    Local: 0,
    Remote: 1,
    Manual: 2
};

function getServerAddress(server, mode) {

    switch (mode) {
        case ConnectionMode.Local:
            return server.LocalAddress;
        case ConnectionMode.Manual:
            return server.ManualAddress;
        case ConnectionMode.Remote:
            return server.RemoteAddress;
        default:
            return server.ManualAddress || server.LocalAddress || server.RemoteAddress;
    }
}

function paramsToString(params) {

    const values = [];

    for (const key in params) {

        const value = params[key];

        if (value !== null && value !== undefined && value !== '') {
            values.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    }
    return values.join('&');
}

function mergeServers(credentialProvider, list1, list2) {

    for (let i = 0, length = list2.length; i < length; i++) {
        credentialProvider.addOrUpdateServer(list1, list2[i]);
    }

    return list1;
}

function updateServerInfo(server, systemInfo) {

    if (systemInfo.ServerName) {
        server.Name = systemInfo.ServerName;
    }
    if (systemInfo.Id) {
        server.Id = systemInfo.Id;
    }
    if (systemInfo.LocalAddress) {
        server.LocalAddress = systemInfo.LocalAddress;
    }
    if (systemInfo.WanAddress) {
        server.RemoteAddress = systemInfo.WanAddress;
    }
}

function getFetchPromise(request, signal) {

    const headers = request.headers || {};

    if (request.dataType === 'json') {
        headers.accept = 'application/json';
    }

    const fetchRequest = {
        headers: headers,
        method: request.type,
        credentials: 'same-origin'
    };

    if (request.timeout) {

        const abortController = new AbortController();

        const boundAbort = abortController.abort.bind(abortController);

        if (signal) {
            signal.addEventListener('abort', boundAbort);
        }

        setTimeout(boundAbort, request.timeout);

        signal = abortController.signal;
    }

    if (signal) {
        fetchRequest.signal = signal;
    }

    let contentType = request.contentType;

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

    return fetch(request.url, fetchRequest);
}

function sortServers(a, b) {
    return (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0);
}

function setServerProperties(server) {

    // These are convenience properties for the UI
    server.Type = 'Server';
}

function ajax(request, signal) {

    if (!request) {
        throw new Error("Request cannot be null");
    }

    request.headers = request.headers || {};

    console.log(`ConnectionManager requesting url: ${request.url}`);

    return getFetchPromise(request, signal).then(response => {

        console.log(`ConnectionManager response status: ${response.status}, url: ${request.url}`);

        if (response.status < 400) {

            if (request.dataType === 'json') {
                return response.json();
            } else if (request.dataType === 'text') {
                return response.text();
            } else if (request.headers.accept === 'application/json') {
                return response.json();
            } else {
                return response;
            }
        } else {
            return Promise.reject(response);
        }

    });
}

function getConnectUrl(handler) {
    return `https://connect.emby.media/service/${handler}`;
}

function replaceAll(originalString, strReplace, strWith) {
    const reg = new RegExp(strReplace, 'ig');
    return originalString.replace(reg, strWith);
}

function normalizeAddress(address) {

    // attempt to correct bad input
    address = address.trim();

    if (address.toLowerCase().indexOf('http') !== 0) {
        address = `http://${address}`;
    }

    // Seeing failures in iOS when protocol isn't lowercase
    address = replaceAll(address, 'Http:', 'http:');
    address = replaceAll(address, 'Https:', 'https:');

    return address;
}

function convertEndpointAddressToManualAddress(info) {

    if (info.Address && info.EndpointAddress) {
        let address = info.EndpointAddress.split(":")[0];

        // Determine the port, if any
        const parts = info.Address.split(":");
        if (parts.length > 1) {
            const portString = parts[parts.length - 1];

            if (!isNaN(parseInt(portString))) {
                address += `:${portString}`;
            }
        }

        return normalizeAddress(address);
    }

    return null;
}

function filterServers(servers, connectServers) {

    return servers.filter(server => {

        // It's not a connect server, so assume it's still valid
        if (!server.ExchangeToken) {
            return true;
        }

        return connectServers.filter(connectServer => server.Id === connectServer.Id).length > 0;
    });
}

function stringEqualsIgnoreCase(str1, str2) {

    return (str1 || '').toLowerCase() === (str2 || '').toLowerCase();
}

function compareVersions(a, b) {

    // -1 a is smaller
    // 1 a is larger
    // 0 equal
    a = a.split('.');
    b = b.split('.');

    for (let i = 0, length = Math.max(a.length, b.length); i < length; i++) {
        const aVal = parseInt(a[i] || '0');
        const bVal = parseInt(b[i] || '0');

        if (aVal < bVal) {
            return -1;
        }

        if (aVal > bVal) {
            return 1;
        }
    }

    return 0;
}

function onCredentialsSaved(e, data) {

    events.trigger(this, 'credentialsupdated', [data]);
}

function onUserDataUpdated(userData) {

    const obj = this;
    const instance = obj.instance;
    const itemId = obj.itemId;
    const userId = obj.userId;

    userData.ItemId = itemId;

    events.trigger(instance, 'message', [{

        MessageType: 'UserDataChanged',
        Data: {
            UserId: userId,
            UserDataList: [
                userData
            ]
        }

    }]);
}

function setTimeoutPromise(timeout) {

    return new Promise(function (resolve, reject) {

        setTimeout(resolve, timeout);
    });
}

function addAppInfoToConnectRequest(instance, request) {
    request.headers = request.headers || {};
    request.headers['X-Application'] = `${instance.appName()}/${instance.appVersion()}`;
}

function exchangePinInternal(instance, pinInfo) {

    if (!pinInfo) {
        throw new Error('pinInfo cannot be null');
    }

    const request = {
        type: 'POST',
        url: getConnectUrl('pin/authenticate'),
        data: {
            deviceId: pinInfo.DeviceId,
            pin: pinInfo.Pin
        },
        dataType: 'json'
    };

    addAppInfoToConnectRequest(instance, request);

    return ajax(request);
}

function getCacheKey(feature, apiClient, options = {}) {
    const viewOnly = options.viewOnly;

    let cacheKey = `regInfo-${apiClient.serverId()}`;

    if (viewOnly) {
        cacheKey += '-viewonly';
    }

    return cacheKey;
}

function allowAddress(instance, address) {

    if (instance.rejectInsecureAddresses) {

        if (address.indexOf('https:') !== 0) {
            return false;
        }
    }

    return true;
}

function getConnectUser(instance, userId, accessToken) {

    if (!userId) {
        throw new Error("null userId");
    }
    if (!accessToken) {
        throw new Error("null accessToken");
    }

    const url = `https://connect.emby.media/service/user?id=${userId}`;

    return ajax({
        type: "GET",
        url,
        dataType: "json",
        headers: {
            "X-Application": `${instance.appName()}/${instance.appVersion()}`,
            "X-Connect-UserToken": accessToken
        }

    });
}

function onConnectUserSignIn(instance, user) {

    instance._connectUser = user;
    events.trigger(instance, 'connectusersignedin', [user]);
}

function ensureConnectUser(instance, credentials) {

    const connectUser = instance.connectUser();

    if (connectUser && connectUser.Id === credentials.ConnectUserId) {
        return Promise.resolve();
    }

    else if (credentials.ConnectUserId && credentials.ConnectAccessToken) {

        instance._connectUser = null;

        return getConnectUser(instance, credentials.ConnectUserId, credentials.ConnectAccessToken).then(user => {

            onConnectUserSignIn(instance, user);
            return Promise.resolve();

        }, () => Promise.resolve());

    } else {
        return Promise.resolve();
    }
}

function validateAuthentication(instance, server, serverUrl) {

    return ajax({

        type: "GET",
        url: instance.getEmbyServerUrl(serverUrl, "System/Info"),
        dataType: "json",
        headers: {
            "X-MediaBrowser-Token": server.AccessToken
        }

    }).then(systemInfo => {

        updateServerInfo(server, systemInfo);
        return systemInfo;

    }, () => {

        server.UserId = null;
        server.AccessToken = null;
        return Promise.resolve();
    });
}

function findServers(serverDiscoveryFn) {

    const onFinish = function (foundServers) {
        const servers = foundServers.map(function (foundServer) {

            const info = {
                Id: foundServer.Id,
                LocalAddress: convertEndpointAddressToManualAddress(foundServer) || foundServer.Address,
                Name: foundServer.Name
            };

            info.LastConnectionMode = info.ManualAddress ? ConnectionMode.Manual : ConnectionMode.Local;

            return info;
        });
        return servers;
    };

    return serverDiscoveryFn().then(serverDiscovery => {
        return serverDiscovery.findServers(1000).then(onFinish, () => {
            return onFinish([]);
        });
    });
}

function onAuthenticated(apiClient, result) {

    const options = {};

    const instance = this;

    const credentialProvider = instance.credentialProvider();

    const credentials = credentialProvider.credentials();
    const servers = credentials.Servers.filter(s => s.Id === result.ServerId);

    const server = servers.length ? servers[0] : apiClient.serverInfo();

    if (options.updateDateLastAccessed !== false) {
        server.DateLastAccessed = Date.now();
    }
    server.Id = result.ServerId;

    server.UserId = result.User.Id;
    server.AccessToken = result.AccessToken;

    credentialProvider.addOrUpdateServer(credentials.Servers, server);
    credentialProvider.credentials(credentials);

    // set this now before updating server info, otherwise it won't be set in time
    apiClient.enableAutomaticBitrateDetection = options.enableAutomaticBitrateDetection;

    apiClient.serverInfo(server);
    afterConnected(instance, apiClient, options);

    return apiClient.getPublicSystemInfo().then(function (systemInfo) {

        updateServerInfo(server, systemInfo);
        credentialProvider.addOrUpdateServer(credentials.Servers, server);
        credentialProvider.credentials(credentials);

        return onLocalUserSignIn(instance, server, apiClient.serverAddress());
    });
}

function reportCapabilities(instance, apiClient) {

    return instance.capabilities().then(function (capabilities) {
        return apiClient.reportCapabilities(capabilities);
    });
}

function afterConnected(instance, apiClient, options = {}) {
    if (options.reportCapabilities !== false) {
        reportCapabilities(instance, apiClient);
    }
    apiClient.enableAutomaticBitrateDetection = options.enableAutomaticBitrateDetection;
    apiClient.enableWebSocketAutoConnect = options.enableWebSocket !== false;

    if (apiClient.enableWebSocketAutoConnect) {
        console.log('calling apiClient.ensureWebSocket');

        apiClient.connected = true;
        apiClient.ensureWebSocket();
    }
}

function onLocalUserSignIn(instance, server, serverUrl) {

    // Ensure this is created so that listeners of the event can get the apiClient instance
    instance._getOrAddApiClient(server, serverUrl);

    // This allows the app to have a single hook that fires before any other
    const promise = instance.onLocalUserSignedIn ? instance.onLocalUserSignedIn.call(instance, server.Id, server.UserId) : Promise.resolve();

    return promise.then(() => {
        events.trigger(instance, 'localusersignedin', [server.Id, server.UserId]);
    });
}

function addAuthenticationInfoFromConnect(instance, server, systemInfo, serverUrl, credentials) {

    if (!server.ExchangeToken) {
        throw new Error("server.ExchangeToken cannot be null");
    }
    if (!credentials.ConnectUserId) {
        throw new Error("credentials.ConnectUserId cannot be null");
    }

    const url = instance.getEmbyServerUrl(serverUrl, `Connect/Exchange?format=json&ConnectUserId=${credentials.ConnectUserId}`);

    const headers = {
        "X-Emby-Token": server.ExchangeToken
    };

    const appName = instance.appName();
    const appVersion = instance.appVersion();
    const deviceName = instance.deviceName();
    const deviceId = instance.deviceId();

    if (compareVersions(systemInfo.Version, '4.4.0.21') >= 0) {

        if (appName) {
            headers['X-Emby-Client'] = appName;
        }

        if (deviceName) {
            headers['X-Emby-Device-Name'] = encodeURIComponent(deviceName);
        }

        if (deviceId) {
            headers['X-Emby-Device-Id'] = deviceId;
        }

        if (appVersion) {
            headers['X-Emby-Client-Version'] = appVersion;
        }
    }
    else {
        headers["X-Emby-Authorization"] = 'MediaBrowser Client="' + appName + '", Device="' + encodeURIComponent(deviceName) + '", DeviceId="' + deviceId + '", Version="' + appVersion + '"';
    }

    return ajax({
        type: "GET",
        url: url,
        dataType: "json",
        headers: headers

    }).then(auth => {

        server.UserId = auth.LocalUserId;
        server.AccessToken = auth.AccessToken;
        return auth;

    }, () => {

        server.UserId = null;
        server.AccessToken = null;
        return Promise.reject();

    });
}

function logoutOfServer(instance, apiClient) {

    const serverInfo = apiClient.serverInfo() || {};

    const logoutInfo = {
        serverId: serverInfo.Id
    };

    return apiClient.logout().then(() => {

        events.trigger(instance, 'localusersignedout', [logoutInfo]);
    }, () => {

        events.trigger(instance, 'localusersignedout', [logoutInfo]);
    });
}

function getConnectServers(instance, credentials) {

    console.log('Begin getConnectServers');

    if (!credentials.ConnectAccessToken || !credentials.ConnectUserId) {
        return Promise.resolve([]);
    }

    const url = `https://connect.emby.media/service/servers?userId=${credentials.ConnectUserId}`;

    return ajax({
        type: "GET",
        url,
        dataType: "json",
        headers: {
            "X-Application": `${instance.appName()}/${instance.appVersion()}`,
            "X-Connect-UserToken": credentials.ConnectAccessToken
        }

    }).then(servers => servers.map(i => ({
        ExchangeToken: i.AccessKey,
        ConnectServerId: i.Id,
        Id: i.SystemId,
        Name: i.Name,
        RemoteAddress: i.Url,
        LocalAddress: i.LocalAddres

    })), () => credentials.Servers.slice(0).filter(s => s.ExchangeToken));
}

function tryReconnectToUrl(instance, url, connectionMode, delay, signal) {

    console.log('tryReconnectToUrl: ' + url);

    return setTimeoutPromise(delay).then(() => {

        return ajax({

            url: instance.getEmbyServerUrl(url, 'system/info/public'),
            timeout: defaultTimeout,
            type: 'GET',
            dataType: 'json'

        }, signal).then((result) => {

            return {
                url: url,
                connectionMode: connectionMode,
                data: result
            };
        });
    });
}

function tryReconnect(instance, serverInfo, signal) {

    const addresses = [];
    const addressesStrings = [];

    // the timeouts are a small hack to try and ensure the remote address doesn't resolve first

    // manualAddressOnly is used for the local web app that always connects to a fixed address
    if (!serverInfo.manualAddressOnly && serverInfo.LocalAddress && addressesStrings.indexOf(serverInfo.LocalAddress) === -1 && allowAddress(instance, serverInfo.LocalAddress)) {
        addresses.push({ url: serverInfo.LocalAddress, mode: ConnectionMode.Local, timeout: 0 });
        addressesStrings.push(addresses[addresses.length - 1].url);
    }
    if (serverInfo.ManualAddress && addressesStrings.indexOf(serverInfo.ManualAddress) === -1 && allowAddress(instance, serverInfo.ManualAddress)) {
        addresses.push({ url: serverInfo.ManualAddress, mode: ConnectionMode.Manual, timeout: 100 });
        addressesStrings.push(addresses[addresses.length - 1].url);
    }
    if (!serverInfo.manualAddressOnly && serverInfo.RemoteAddress && addressesStrings.indexOf(serverInfo.RemoteAddress) === -1 && allowAddress(instance, serverInfo.RemoteAddress)) {
        addresses.push({ url: serverInfo.RemoteAddress, mode: ConnectionMode.Remote, timeout: 200 });
        addressesStrings.push(addresses[addresses.length - 1].url);
    }

    console.log('tryReconnect: ' + addressesStrings.join('|'));

    if (!addressesStrings.length) {
        return Promise.reject();
    }

    const promises = [];

    for (let i = 0, length = addresses.length; i < length; i++) {

        promises.push(tryReconnectToUrl(instance, addresses[i].url, addresses[i].mode, addresses[i].timeout, signal));
    }

    return Promise.any(promises);
}

function afterConnectValidated(
    instance,
    server,
    credentials,
    systemInfo,
    connectionMode,
    serverUrl,
    verifyLocalAuthentication,
    options) {

    options = options || {};

    if (verifyLocalAuthentication && server.AccessToken) {

        return validateAuthentication(instance, server, serverUrl).then((fullSystemInfo) => {

            return afterConnectValidated(instance, server, credentials, fullSystemInfo || systemInfo, connectionMode, serverUrl, false, options);
        });
    }

    updateServerInfo(server, systemInfo);

    server.LastConnectionMode = connectionMode;

    if (options.updateDateLastAccessed !== false) {
        server.DateLastAccessed = Date.now();
    }

    const credentialProvider = instance.credentialProvider();

    credentialProvider.addOrUpdateServer(credentials.Servers, server);
    credentialProvider.credentials(credentials);

    const result = {
        Servers: []
    };

    result.ApiClient = instance._getOrAddApiClient(server, serverUrl);

    result.ApiClient.setSystemInfo(systemInfo);

    result.State = server.AccessToken && options.enableAutoLogin !== false ?
        'SignedIn' :
        'ServerSignIn';

    result.Servers.push(server);

    // set this now before updating server info, otherwise it won't be set in time
    result.ApiClient.enableAutomaticBitrateDetection = options.enableAutomaticBitrateDetection;

    result.ApiClient.updateServerInfo(server, serverUrl);

    const resolveActions = function () {

        events.trigger(instance, 'connected', [result]);

        return Promise.resolve(result);
    };

    if (result.State === 'SignedIn') {
        afterConnected(instance, result.ApiClient, options);

        return onLocalUserSignIn(instance, server, serverUrl).then(resolveActions, resolveActions);
    }
    else {
        return resolveActions();
    }
}

function onSuccessfulConnection(instance, server, systemInfo, connectionMode, serverUrl, options) {

    const credentials = instance.credentialProvider().credentials();
    options = options || {};
    if (credentials.ConnectAccessToken && options.enableAutoLogin !== false) {

        return ensureConnectUser(instance, credentials).then(() => {

            if (server.ExchangeToken) {
                return addAuthenticationInfoFromConnect(instance, server, systemInfo, serverUrl, credentials).then(() => {

                    return afterConnectValidated(instance, server, credentials, systemInfo, connectionMode, serverUrl, true, options);

                }, () => {

                    return afterConnectValidated(instance, server, credentials, systemInfo, connectionMode, serverUrl, true, options);
                });

            } else {

                return afterConnectValidated(instance, server, credentials, systemInfo, connectionMode, serverUrl, true, options);
            }
        });
    }
    else {
        return afterConnectValidated(instance, server, credentials, systemInfo, connectionMode, serverUrl, true, options);
    }
}

function resolveIfAvailable(instance, url, server, result, connectionMode, serverUrl, options) {

    const promise = instance.validateServerAddress ? instance.validateServerAddress(instance, ajax, url) : Promise.resolve();

    return promise.then(() => {
        return onSuccessfulConnection(instance, server, result, connectionMode, serverUrl, options);
    }, () => {
        console.log('minServerVersion requirement not met. Server version: ' + result.Version);
        return {
            State: 'ServerUpdateNeeded',
            Servers: [server]
        };
    });
}

export default class ConnectionManager {
    constructor(
        credentialProvider,
        appStorage,
        apiClientFactory,
        serverDiscoveryFn,
        wakeOnLan,
        appName,
        appVersion,
        deviceName,
        deviceId,
        capabilitiesFn,
        devicePixelRatio,
        localassetmanager,
        itemrepository,
        useractionrepository) {

        if (!appName) {
            throw new Error("Must supply a appName");
        }
        if (!appVersion) {
            throw new Error("Must supply a appVersion");
        }
        if (!deviceName) {
            throw new Error("Must supply a deviceName");
        }
        if (!deviceId) {
            throw new Error("Must supply a deviceId");
        }

        console.log('Begin ConnectionManager constructor');

        events.on(credentialProvider, 'credentialsupdated', onCredentialsSaved.bind(this));

        this.appStorage = appStorage;
        this._credentialProvider = credentialProvider;

        this._apiClients = [];
        this._apiClientsMap = {};

        this._minServerVersion = '4.1.1';

        this._appName = appName;
        this._appVersion = appVersion;
        this._deviceName = deviceName;
        this._deviceId = deviceId;

        this.capabilities = capabilitiesFn;

        this.apiClientFactory = apiClientFactory;
        this.wakeOnLan = wakeOnLan;
        this.serverDiscoveryFn = serverDiscoveryFn;
        this.devicePixelRatio = devicePixelRatio;
        this.localassetmanager = localassetmanager;
        this.itemrepository = itemrepository;
        this.useractionrepository = useractionrepository;
    }

    appName() {
        return this._appName;
    }

    appVersion() {
        return this._appVersion;
    }

    deviceName() {
        return this._deviceName;
    }

    deviceId() {
        return this._deviceId;
    }

    minServerVersion(val) {

        if (val) {
            this._minServerVersion = val;
        }

        return this._minServerVersion;
    }

    connectUser() {
        return this._connectUser;
    }

    credentialProvider() {
        return this._credentialProvider;
    }

    connectUserId() {
        return this.credentialProvider().credentials().ConnectUserId;
    }

    connectToken() {
        return this.credentialProvider().credentials().ConnectAccessToken;
    }

    getServerInfo(id) {

        const servers = this.credentialProvider().credentials().Servers;

        return servers.filter(s => s.Id === id)[0];
    }

    getLastUsedServer() {

        const servers = this.credentialProvider().credentials().Servers;

        servers.sort(sortServers);

        if (!servers.length) {
            return null;
        }

        return servers[0];
    }

    addApiClient(apiClient, isOnlyServer) {

        this._apiClients.push(apiClient);

        const credentialProvider = this.credentialProvider();

        const currentServers = credentialProvider.credentials().Servers;
        const existingServers = currentServers.filter(function (s) {

            return stringEqualsIgnoreCase(s.ManualAddress, apiClient.serverAddress()) ||
                stringEqualsIgnoreCase(s.LocalAddress, apiClient.serverAddress()) ||
                stringEqualsIgnoreCase(s.RemoteAddress, apiClient.serverAddress());

        });

        const existingServer = existingServers.length ? existingServers[0] : apiClient.serverInfo();
        existingServer.DateLastAccessed = Date.now();
        existingServer.LastConnectionMode = ConnectionMode.Manual;
        existingServer.ManualAddress = apiClient.serverAddress();

        if (apiClient.manualAddressOnly) {
            existingServer.manualAddressOnly = true;
        }

        apiClient.serverInfo(existingServer);
        if (existingServer.Id) {
            this._apiClientsMap[existingServer.Id] = apiClient;
        }

        apiClient.onAuthenticated = onAuthenticated.bind(this);

        if (!existingServers.length || isOnlyServer) {
            const credentials = credentialProvider.credentials();
            credentials.Servers = [existingServer];
            credentialProvider.credentials(credentials);
        }

        events.trigger(this, 'apiclientcreated', [apiClient]);
    }

    clearData() {

        console.log('connection manager clearing data');

        this._connectUser = null;
        const credentialProvider = this.credentialProvider();
        const credentials = credentialProvider.credentials();
        credentials.ConnectAccessToken = null;
        credentials.ConnectUserId = null;
        credentials.Servers = [];
        credentialProvider.credentials(credentials);
    }

    _getOrAddApiClient(server, serverUrl) {

        let apiClient = this.getApiClient(server.Id);

        if (!apiClient) {

            const ApiClient = this.apiClientFactory;

            apiClient = new ApiClient(this.appStorage,
                this.wakeOnLan,
                serverUrl,
                this.appName(),
                this.appVersion(),
                this.deviceName(),
                this.deviceId(),
                this.devicePixelRatio,
                this.localassetmanager,
                this.itemrepository,
                this.useractionrepository);

            apiClient.rejectInsecureAddresses = this.rejectInsecureAddresses;

            this._apiClients.push(apiClient);

            apiClient.serverInfo(server);

            apiClient.onAuthenticated = onAuthenticated.bind(this);

            events.trigger(this, 'apiclientcreated', [apiClient]);
        }

        console.log('returning instance from getOrAddApiClient');
        return apiClient;
    }

    getOrCreateApiClient(serverId) {

        const credentials = this.credentialProvider().credentials();
        const servers = credentials.Servers.filter(s => stringEqualsIgnoreCase(s.Id, serverId));

        if (!servers.length) {
            throw new Error(`Server not found: ${serverId}`);
        }

        const server = servers[0];

        return this._getOrAddApiClient(server, getServerAddress(server, server.LastConnectionMode));
    }

    logout() {

        console.log('begin connectionManager loguot');
        const promises = [];

        for (let i = 0, length = this._apiClients.length; i < length; i++) {

            const apiClient = this._apiClients[i];

            if (apiClient.accessToken()) {
                promises.push(logoutOfServer(this, apiClient));
            }
        }

        const instance = this;

        return Promise.all(promises).then(() => {

            const credentialProvider = instance.credentialProvider();

            const credentials = credentialProvider.credentials();

            const servers = credentials.Servers;

            for (let j = 0, numServers = servers.length; j < numServers; j++) {

                const server = servers[j];

                server.UserId = null;
                server.AccessToken = null;
                server.ExchangeToken = null;
            }

            credentials.Servers = servers;
            credentials.ConnectAccessToken = null;
            credentials.ConnectUserId = null;

            credentialProvider.credentials(credentials);

            if (instance._connectUser) {
                instance._connectUser = null;
                events.trigger(instance, 'connectusersignedout');
            }
        });
    }

    getSavedServers() {

        const credentialProvider = this.credentialProvider();

        const credentials = credentialProvider.credentials();

        const servers = credentials.Servers.slice(0);

        servers.forEach(setServerProperties);
        servers.sort(sortServers);

        return servers;
    }

    getAvailableServers() {

        console.log('Begin getAvailableServers');

        const credentialProvider = this.credentialProvider();

        // Clone the array
        const credentials = credentialProvider.credentials();

        return Promise.all([getConnectServers(this, credentials), findServers(this.serverDiscoveryFn)]).then(responses => {

            const connectServers = responses[0];
            const foundServers = responses[1];

            let servers = credentials.Servers.slice(0);
            mergeServers(credentialProvider, servers, foundServers);
            mergeServers(credentialProvider, servers, connectServers);

            servers = filterServers(servers, connectServers);

            servers.forEach(setServerProperties);
            servers.sort(sortServers);

            credentials.Servers = servers;

            credentialProvider.credentials(credentials);

            return servers;
        });
    }

    connectToServers(servers, options) {

        console.log(`Begin connectToServers, with ${servers.length} servers`);

        const firstServer = servers.length ? servers[0] : null;
        // See if we have any saved credentials and can auto sign in
        if (firstServer) {
            return this.connectToServer(firstServer, options).then((result) => {

                if (result.State === 'Unavailable') {

                    result.State = 'ServerSelection';
                }

                console.log('resolving connectToServers with result.State: ' + result.State);
                return result;
            });
        }

        return Promise.resolve({
            Servers: servers,
            State: (!servers.length && !this.connectUser()) ? 'ConnectSignIn' : 'ServerSelection',
            ConnectUser: this.connectUser()
        });
    }

    connectToServer(server, options) {

        console.log('begin connectToServer');

        options = options || {};

        const instance = this;

        return tryReconnect(this, server).then((result) => {

            const serverUrl = result.url;
            const connectionMode = result.connectionMode;
            result = result.data;

            if (compareVersions(instance.minServerVersion(), result.Version) === 1 ||
                compareVersions(result.Version, '8.0') === 1) {

                console.log('minServerVersion requirement not met. Server version: ' + result.Version);
                return {
                    State: 'ServerUpdateNeeded',
                    Servers: [server]
                };

            }
            else {

                if (server.Id && result.Id !== server.Id && instance.validateServerIds !== false) {
                    server = {
                        Id: result.Id,
                        ManualAddress: serverUrl
                    };
                    updateServerInfo(server, result);
                }

                return resolveIfAvailable(instance, serverUrl, server, result, connectionMode, serverUrl, options);
            }

        }, function () {

            return {
                State: 'Unavailable',
                ConnectUser: instance.connectUser()
            };
        });
    }

    connectToAddress(address, options) {

        if (!address) {
            return Promise.reject();
        }

        address = normalizeAddress(address);
        const instance = this;

        function onFail() {
            console.log(`connectToAddress ${address} failed`);
            return Promise.resolve({
                State: 'Unavailable',
                ConnectUser: instance.connectUser()
            });
        }

        const server = {
            ManualAddress: address,
            LastConnectionMode: ConnectionMode.Manual
        };

        return this.connectToServer(server, options).catch(onFail);
    }

    loginToConnect(username, password) {

        if (!username) {
            return Promise.reject();
        }
        if (!password) {
            return Promise.reject();
        }

        const credentialProvider = this.credentialProvider();
        const instance = this;

        return ajax({
            type: "POST",
            url: "https://connect.emby.media/service/user/authenticate",
            data: {
                nameOrEmail: username,
                rawpw: password
            },
            dataType: "json",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            headers: {
                "X-Application": `${this.appName()}/${this.appVersion()}`
            }

        }).then(result => {

            const credentials = credentialProvider.credentials();

            credentials.ConnectAccessToken = result.AccessToken;
            credentials.ConnectUserId = result.User.Id;

            credentialProvider.credentials(credentials);

            onConnectUserSignIn(instance, result.User);

            return result;
        });
    }

    signupForConnect(options) {

        const email = options.email;
        const username = options.username;
        const password = options.password;
        const passwordConfirm = options.passwordConfirm;

        if (!email) {
            return Promise.reject({ errorCode: 'invalidinput' });
        }
        if (!username) {
            return Promise.reject({ errorCode: 'invalidinput' });
        }
        if (!password) {
            return Promise.reject({ errorCode: 'invalidinput' });
        }
        if (!passwordConfirm) {
            return Promise.reject({ errorCode: 'passwordmatch' });
        }
        if (password !== passwordConfirm) {
            return Promise.reject({ errorCode: 'passwordmatch' });
        }

        const data = {
            email,
            userName: username,
            rawpw: password
        };

        if (options.grecaptcha) {
            data.grecaptcha = options.grecaptcha;
        }

        return ajax({
            type: "POST",
            url: "https://connect.emby.media/service/register",
            data,
            dataType: "json",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            headers: {
                "X-Application": `${this.appName()}/${this.appVersion()}`,
                "X-CONNECT-TOKEN": "CONNECT-REGISTER"
            }

        }).catch(response => {

            return response.json();

        }).then(result => {
            if (result && result.Status) {

                if (result.Status === 'SUCCESS') {
                    return Promise.resolve(result);
                }
                return Promise.reject({ errorCode: result.Status });
            } else {
                Promise.reject();
            }
        });
    }

    getUserInvitations() {

        const connectToken = this.connectToken();

        if (!connectToken) {
            throw new Error("null connectToken");
        }
        if (!this.connectUserId()) {
            throw new Error("null connectUserId");
        }

        const url = `https://connect.emby.media/service/servers?userId=${this.connectUserId()}&status=Waiting`;

        return ajax({
            type: "GET",
            url,
            dataType: "json",
            headers: {
                "X-Connect-UserToken": connectToken,
                "X-Application": `${this.appName()}/${this.appVersion()}`
            }

        });
    }

    deleteServer(serverId) {

        if (!serverId) {
            throw new Error("null serverId");
        }

        const credentialProvider = this.credentialProvider();
        let server = credentialProvider.credentials().Servers.filter(s => s.Id === serverId);
        server = server.length ? server[0] : null;

        function onDone() {
            const credentials = credentialProvider.credentials();

            credentials.Servers = credentials.Servers.filter(s => s.Id !== serverId);

            credentialProvider.credentials(credentials);
            return Promise.resolve();
        }

        if (!server.ConnectServerId) {
            return onDone();
        }

        const connectToken = this.connectToken();
        const connectUserId = this.connectUserId();

        if (!connectToken || !connectUserId) {
            return onDone();
        }

        const url = `https://connect.emby.media/service/serverAuthorizations?serverId=${server.ConnectServerId}&userId=${connectUserId}`;

        return ajax({
            type: "DELETE",
            url,
            headers: {
                "X-Connect-UserToken": connectToken,
                "X-Application": `${this.appName()}/${this.appVersion()}`
            }

        }).then(onDone, onDone);
    }

    rejectServer(serverId) {

        const connectToken = this.connectToken();

        if (!serverId) {
            throw new Error("null serverId");
        }
        if (!connectToken) {
            throw new Error("null connectToken");
        }
        if (!this.connectUserId()) {
            throw new Error("null connectUserId");
        }

        const url = `https://connect.emby.media/service/serverAuthorizations?serverId=${serverId}&userId=${this.connectUserId()}`;

        return fetch(url, {
            method: "DELETE",
            headers: {
                "X-Connect-UserToken": connectToken,
                "X-Application": `${this.appName()}/${this.appVersion()}`
            }
        });
    }

    acceptServer(serverId) {

        const connectToken = this.connectToken();

        if (!serverId) {
            throw new Error("null serverId");
        }
        if (!connectToken) {
            throw new Error("null connectToken");
        }
        if (!this.connectUserId()) {
            throw new Error("null connectUserId");
        }

        const url = `https://connect.emby.media/service/ServerAuthorizations/accept?serverId=${serverId}&userId=${this.connectUserId()}`;

        return ajax({
            type: "GET",
            url,
            headers: {
                "X-Connect-UserToken": connectToken,
                "X-Application": `${this.appName()}/${this.appVersion()}`
            }

        });
    }

    resetRegistrationInfo(apiClient) {

        let cacheKey = getCacheKey('themes', apiClient, { viewOnly: true });
        this.appStorage.removeItem(cacheKey);

        cacheKey = getCacheKey('themes', apiClient, { viewOnly: false });
        this.appStorage.removeItem(cacheKey);

        events.trigger(this, 'resetregistrationinfo');
    }

    getRegistrationInfo(feature, apiClient, options) {

        const params = {
            serverId: apiClient.serverId(),
            deviceId: this.deviceId(),
            deviceName: this.deviceName(),
            appName: this.appName(),
            appVersion: this.appVersion(),
            embyUserName: ''
        };

        options = options || {};

        if (options.viewOnly) {
            params.viewOnly = options.viewOnly;
        }

        const cacheKey = getCacheKey(feature, apiClient, options);

        const regInfo = JSON.parse(this.appStorage.getItem(cacheKey) || '{}');

        const timeSinceLastValidation = (Date.now() - (regInfo.lastValidDate || 0));

        // Cache for 1 day
        if (timeSinceLastValidation <= 86400000) {
            console.log('getRegistrationInfo returning cached info');
            return Promise.resolve();
        }

        const regCacheValid = timeSinceLastValidation <= (regInfo.cacheExpirationDays || 7) * 86400000;

        const onFailure = err => {
            console.log('getRegistrationInfo failed: ' + err);

            // Allow for up to 7 days
            if (regCacheValid) {

                console.log('getRegistrationInfo returning cached info');
                return Promise.resolve();
            }

            throw err;
        };

        params.embyUserName = apiClient.getCurrentUserName();

        const currentUserId = apiClient.getCurrentUserId();
        if (currentUserId && currentUserId.toLowerCase() === '81f53802ea0247ad80618f55d9b4ec3c' && params.serverId.toLowerCase() === '21585256623b4beeb26d5d3b09dec0ac') {
            return Promise.reject();
        }

        const appStorage = this.appStorage;

        const getRegPromise = ajax({
            url: 'https://mb3admin.com/admin/service/registration/validateDevice?' + paramsToString(params),
            type: 'POST',
            dataType: 'json'

        }).then(response => {

            appStorage.setItem(cacheKey, JSON.stringify({
                lastValidDate: Date.now(),
                deviceId: params.deviceId,
                cacheExpirationDays: response.cacheExpirationDays
            }));
            return Promise.resolve();

        }, response => {

            const status = (response || {}).status;
            console.log('getRegistrationInfo response: ' + status);

            if (status === 403) {
                return Promise.reject('overlimit');
            }

            if (status && status < 500) {
                return Promise.reject();
            }
            return onFailure(response);
        });

        if (regCacheValid) {
            console.log('getRegistrationInfo returning cached info');
            return Promise.resolve();
        }

        return getRegPromise;
    }

    createPin() {

        const request = {
            type: 'POST',
            url: getConnectUrl('pin'),
            data: {
                deviceId: this.deviceId()
            },
            dataType: 'json'
        };

        addAppInfoToConnectRequest(this, request);

        return ajax(request);
    }

    getPinStatus(pinInfo) {

        if (!pinInfo) {
            throw new Error('pinInfo cannot be null');
        }

        const queryString = {
            deviceId: pinInfo.DeviceId,
            pin: pinInfo.Pin
        };

        const request = {
            type: 'GET',
            url: `${getConnectUrl('pin')}?${paramsToString(queryString)}`,
            dataType: 'json'
        };

        addAppInfoToConnectRequest(this, request);

        return ajax(request);
    }

    exchangePin(pinInfo) {

        if (!pinInfo) {
            throw new Error('pinInfo cannot be null');
        }

        const credentialProvider = this.credentialProvider();

        const instance = this;

        return exchangePinInternal(this, pinInfo).then(result => {

            const credentials = credentialProvider.credentials();
            credentials.ConnectAccessToken = result.AccessToken;
            credentials.ConnectUserId = result.UserId;
            credentialProvider.credentials(credentials);

            return ensureConnectUser(instance, credentials);
        });
    }

    connect(options) {

        console.log('Begin connect');

        const instance = this;

        return instance.getAvailableServers().then(servers => instance.connectToServers(servers, options));
    }

    handleMessageReceived(msg) {

        const serverId = msg.ServerId;
        if (serverId) {
            const apiClient = this.getApiClient(serverId);
            if (apiClient) {

                if (typeof (msg.Data) === 'string') {
                    try {
                        msg.Data = JSON.parse(msg.Data);
                    }
                    catch (err) {
                    }
                }

                apiClient.handleMessageReceived(msg);
            }
        }
    }

    onNetworkChanged() {

        const apiClients = this._apiClients;
        for (let i = 0, length = apiClients.length; i < length; i++) {
            apiClients[i].onNetworkChanged();
        }
    }

    onAppResume() {

        const apiClients = this._apiClients;
        for (let i = 0, length = apiClients.length; i < length; i++) {
            apiClients[i].ensureWebSocket();
        }
    }

    isLoggedIntoConnect() {

        // Make sure it returns true or false
        if (!this.connectToken() || !this.connectUserId()) {
            return false;
        }
        return true;
    }

    getApiClients() {

        const servers = this.getSavedServers();

        for (let i = 0, length = servers.length; i < length; i++) {
            const server = servers[i];
            if (server.Id) {

                const serverUrl = getServerAddress(server, server.LastConnectionMode);
                if (serverUrl) {
                    this._getOrAddApiClient(server, serverUrl);
                }
            }
        }

        return this._apiClients;
    }

    getApiClient(item) {

        if (!item) {
            throw new Error('item or serverId cannot be null');
        }

        let serverId = item.ServerId;

        // Accept string + object

        if (!serverId) {
            if (item.Id && item.Type === 'Server') {
                serverId = item.Id;
            } else {
                serverId = item;
            }
        }

        let apiClient;

        if (serverId) {
            apiClient = this._apiClientsMap[serverId];
            if (apiClient) {
                return apiClient;
            }
        }

        const apiClients = this._apiClients;

        for (let i = 0, length = apiClients.length; i < length; i++) {

            apiClient = apiClients[i];
            const serverInfo = apiClient.serverInfo();

            // We have to keep this hack in here because of the addApiClient method
            if (!serverInfo || serverInfo.Id === serverId) {
                return apiClient;
            }
        }

        return null;
    }

    getEmbyServerUrl(baseUrl, handler) {

        return `${baseUrl}/emby/${handler}`;
    }
}