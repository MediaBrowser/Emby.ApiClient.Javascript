define(['events', 'appStorage'], function (events, appStorage) {
    'use strict';

    function ensure(instance, data) {

        if (!instance._credentials) {

            var json = appStorage.getItem(instance.key) || '{}';

            console.log('credentials initialized with: ' + json);
            instance._credentials = JSON.parse(json);
            instance._credentials.Servers = instance._credentials.Servers || [];
        }
    }

    function set(instance, data) {

        if (data) {
            instance._credentials = data;
            appStorage.setItem(instance.key, JSON.stringify(data));
        } else {
            instance.clear();
        }

        events.trigger(instance, 'credentialsupdated');
    }

    function Credentials(key) {

        this.key = key || 'servercredentials3';
    }

    Credentials.prototype.clear = function () {
        this._credentials = null;
        appStorage.removeItem(this.key);
    };

    Credentials.prototype.credentials = function (data) {

        if (data) {
            set(this, data);
        }

        ensure(this);
        return this._credentials;
    };

    Credentials.prototype.addOrUpdateServer = function (list, server) {

        if (!server.Id) {
            throw new Error('Server.Id cannot be null or empty');
        }

        var existing = list.filter(function (s) {
            return s.Id === server.Id;
        })[0];

        if (existing) {

            // Merge the data
            existing.DateLastAccessed = Math.max(existing.DateLastAccessed || 0, server.DateLastAccessed || 0);

            existing.UserLinkType = server.UserLinkType;

            if (server.AccessToken) {
                existing.AccessToken = server.AccessToken;
                existing.UserId = server.UserId;
            }
            if (server.ExchangeToken) {
                existing.ExchangeToken = server.ExchangeToken;
            }
            if (server.RemoteAddress) {
                existing.RemoteAddress = server.RemoteAddress;
            }
            if (server.ManualAddress) {
                existing.ManualAddress = server.ManualAddress;
            }
            if (server.LocalAddress) {
                existing.LocalAddress = server.LocalAddress;
            }
            if (server.Name) {
                existing.Name = server.Name;
            }
            if (server.WakeOnLanInfos && server.WakeOnLanInfos.length) {
                existing.WakeOnLanInfos = server.WakeOnLanInfos;
            }
            if (server.LastConnectionMode != null) {
                existing.LastConnectionMode = server.LastConnectionMode;
            }
            if (server.ConnectServerId) {
                existing.ConnectServerId = server.ConnectServerId;
            }

            return existing;
        }
        else {
            list.push(server);
            return server;
        }
    };

    Credentials.prototype.addOrUpdateUser = function (server, user) {

        server.Users = server.Users || [];

        var existing = server.Users.filter(function (s) {
            return s.Id === user.Id;
        })[0];

        if (existing) {

            // Merge the data
            existing.IsSignedInOffline = true;
        }
        else {
            server.Users.push(user);
        }
    };

    return Credentials;
});