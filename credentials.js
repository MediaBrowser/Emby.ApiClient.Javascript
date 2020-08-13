﻿/* jshint module: true */

import events from './events.js';

function ensure(instance, data) {
    if (!instance._credentials) {
        const json = instance.appStorage.getItem(instance.key) || '{}';

        console.log(`credentials initialized with: ${json}`);
        instance._credentials = JSON.parse(json);
        instance._credentials.Servers = instance._credentials.Servers || [];
    }
}

function set(instance, data) {
    instance._credentials = data;
    const json = JSON.stringify(data);
    instance.appStorage.setItem(instance.key, json);

    events.trigger(instance, 'credentialsupdated', [{
        credentials: data,
        credentialsJson: json
    }]);
}

export default class Credentials {
    constructor(appStorage, key) {
        this.key = key || 'servercredentials3';
        this.appStorage = appStorage;
    }

    clear() {
        this._credentials = null;
        this.appStorage.removeItem(this.key);
    }

    credentials(data) {
        if (data) {
            set(this, data);
        }

        ensure(this);
        return this._credentials;
    }

    addOrUpdateServer(list, server) {
        if (!server.Id) {
            throw new Error('Server.Id cannot be null or empty');
        }

        const existing = list.filter(({ Id }) => Id === server.Id)[0];

        if (existing) {
            // Merge the data
            existing.DateLastAccessed = Math.max(
                existing.DateLastAccessed || 0,
                server.DateLastAccessed || 0
            );

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
        } else {
            list.push(server);
            return server;
        }
    }
}