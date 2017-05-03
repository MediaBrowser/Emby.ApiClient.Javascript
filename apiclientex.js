define(['apiclientcore', 'localassetmanager', 'appStorage'], function (ApiClient, localassetmanager, appStorage) {
    'use strict';

    var localPrefix = 'local:';
    var localViewPrefix = 'localview:';

    function isLocalId(str) {
        return startsWith(str, localPrefix);
    }

    function isLocalViewId(str) {
        return startsWith(str, localViewPrefix);
    }

    function stripLocalPrefix(str) {
        var res = stripStart(str, localPrefix);
        res = stripStart(res, localViewPrefix);

        return res;
    }

    function startsWith(str, find) {

        if (str && find && str.length > find.length) {
            if (str.indexOf(find) === 0) {
                return true;
            }
        }

        return false;
    }

    function stripStart(str, find) {
        if (startsWith(str, find)) {
            return str.substr(find.length);
        }

        return str;
    }

    function createEmptyList() {
        var result = {
            Items: [],
            TotalRecordCount: 0
        };

        return result;
    }

    function convertGuidToLocal(guid) {

        if (!guid) {
            return null;
        }

        if (isLocalId(guid)) {
            return guid;
        }

        return 'local:' + guid;
    }

    function adjustGuidProperties(downloadedItem) {

        downloadedItem.Id = convertGuidToLocal(downloadedItem.Id);
        downloadedItem.SeriesId = convertGuidToLocal(downloadedItem.SeriesId);
        downloadedItem.SeasonId = convertGuidToLocal(downloadedItem.SeasonId);

        downloadedItem.AlbumId = convertGuidToLocal(downloadedItem.AlbumId);
        downloadedItem.ParentId = convertGuidToLocal(downloadedItem.ParentId);
        downloadedItem.ParentThumbItemId = convertGuidToLocal(downloadedItem.ParentThumbItemId);
        downloadedItem.ParentPrimaryImageItemId = convertGuidToLocal(downloadedItem.ParentPrimaryImageItemId);
        downloadedItem.PrimaryImageItemId = convertGuidToLocal(downloadedItem.PrimaryImageItemId);
        downloadedItem.ParentLogoItemId = convertGuidToLocal(downloadedItem.ParentLogoItemId);
        downloadedItem.ParentBackdropItemID = convertGuidToLocal(downloadedItem.ParentBackdropItemID);

        downloadedItem.ParentBackdropImageTags = null;
    }

    function getLocalView(instance, serverId, userId) {

        return instance.getLocalFolders(serverId, userId).then(function (views) {

            var localView = null;

            if (views.length > 0) {

                localView = {
                    Name: instance.downloadsTitleText || 'Downloads',
                    ServerId: serverId,
                    Id: 'localview',
                    Type: 'localview'
                };
            }

            return Promise.resolve(localView);
        });
    }

    /**
     * Creates a new api client instance
     * @param {String} serverAddress
     * @param {String} clientName s
     * @param {String} applicationVersion 
     */
    function ApiClientEx(serverAddress, clientName, applicationVersion, deviceName, deviceId, devicePixelRatio) {

        ApiClient.call(this, serverAddress, clientName, applicationVersion, deviceName, deviceId, devicePixelRatio);
    }

    Object.assign(ApiClientEx.prototype, ApiClient.prototype);

    ApiClientEx.prototype.getPlaybackInfo = function (itemId, options, deviceProfile) {

        if (isLocalId(itemId)) {
            return localassetmanager.getLocalItem(this.serverId(), stripLocalPrefix(itemId)).then(function (item) {

                // TODO: This was already done during the sync process, right? If so, remove it
                var mediaSources = item.Item.MediaSources.map(function (m) {
                    m.SupportsDirectPlay = true;
                    m.SupportsDirectStream = false;
                    m.SupportsTranscoding = false;
                    m.IsLocal = true;
                    return m;
                });

                return {
                    MediaSources: mediaSources
                };
            });
        }

        var instance = this;
        return localassetmanager.getLocalItem(this.serverId(), itemId).then(function (item) {

            if (item) {

                var mediaSources = item.Item.MediaSources.map(function (m) {
                    m.SupportsDirectPlay = true;
                    m.SupportsDirectStream = false;
                    m.SupportsTranscoding = false;
                    m.IsLocal = true;
                    return m;
                });

                return localassetmanager.fileExists(item.LocalPath).then(function (exists) {

                    if (exists) {

                        var res = {
                            MediaSources: mediaSources
                        };

                        return Promise.resolve(res);
                    }

                    return ApiClient.prototype.getPlaybackInfo.call(instance, itemId, options, deviceProfile);
                });
            }

            return ApiClient.prototype.getPlaybackInfo.call(instance, itemId, options, deviceProfile);
        });
    };

    ApiClientEx.prototype.getItems = function (userId, options) {

        var serverInfo = this.serverInfo();
        var i;

        if (serverInfo && options.ParentId === 'localview') {

            return this.getLocalFolders(serverInfo.Id, userId).then(function (items) {
                var result = {
                    Items: items,
                    TotalRecordCount: items.length
                };

                return Promise.resolve(result);
            });

        } else if (serverInfo && options && (isLocalId(options.ParentId) || isLocalViewId(options.ParentId))) {

            return localassetmanager.getViewItems(serverInfo.Id, userId, options).then(function (items) {

                items.forEach(function (item) {
                    adjustGuidProperties(item);
                });

                items.sort(function (a, b) { return a.SortName.toLowerCase().localeCompare(b.SortName.toLowerCase()); });

                var result = {
                    Items: items,
                    TotalRecordCount: items.length
                };

                return Promise.resolve(result);
            });
        } else if (options && options.ExcludeItemIds && options.ExcludeItemIds.length) {

            var exItems = options.ExcludeItemIds.split(',');

            for (i = 0; i < exItems.length; i++) {
                if (isLocalId(exItems[i])) {
                    return Promise.resolve(createEmptyList());
                }
            }
        } else if (options && options.Ids && options.Ids.length) {

            var ids = options.Ids.split(',');
            var hasLocal = false;

            for (i = 0; i < ids.length; i++) {
                if (isLocalId(ids[i])) {
                    hasLocal = true;
                }
            }

            if (hasLocal) {
                return localassetmanager.getItemsFromIds(serverInfo.Id, ids).then(function (items) {

                    items.forEach(function (item) {
                        adjustGuidProperties(item);
                    });

                    var result = {
                        Items: items,
                        TotalRecordCount: items.length
                    };

                    return Promise.resolve(result);
                });
            }
        }

        return ApiClient.prototype.getItems.call(this, userId, options);
    };

    ApiClientEx.prototype.getUserViews = function (options, userId) {

        var instance = this;

        return ApiClient.prototype.getUserViews.call(instance, options, userId).then(function (result) {

            var serverInfo = instance.serverInfo();
            if (serverInfo) {

                return getLocalView(instance, serverInfo.Id, userId).then(function (localView) {

                    if (localView) {

                        result.Items.push(localView);
                        result.TotalRecordCount++;
                    }

                    return Promise.resolve(result);
                });
            }

            return Promise.resolve(result);
        });
    };

    ApiClientEx.prototype.getItem = function (userId, itemId) {

        if (!itemId) {
            throw new Error("null itemId");
        }

        if (itemId) {
            itemId = itemId.toString();
        }

        var serverInfo;

        if (isLocalViewId(itemId)) {

            serverInfo = this.serverInfo();

            if (serverInfo) {
                return this.getLocalFolders(serverInfo.Id, userId).then(function (items) {

                    var views = items.filter(function (item) {
                        return item.Id === itemId;
                    });

                    if (views.length > 0) {
                        return Promise.resolve(views[0]);
                    }

                    // TODO: Test consequence of this
                    return Promise.reject();
                });
            }
        }

        if (isLocalId(itemId)) {

            serverInfo = this.serverInfo();

            if (serverInfo) {
                return localassetmanager.getLocalItem(serverInfo.Id, stripLocalPrefix(itemId)).then(function (item) {

                    adjustGuidProperties(item.Item);

                    return Promise.resolve(item.Item);
                });
            }
        }

        return ApiClient.prototype.getItem.call(this, userId, itemId);
    };

    ApiClientEx.prototype.getLocalFolders = function (userId) {

        var serverInfo = this.serverInfo();
        userId = userId || serverInfo.UserId;

        return localassetmanager.getViews(serverInfo.Id, userId);
    };

    ApiClientEx.prototype.getCurrentUser = function () {

        var instance = this;

        return ApiClient.prototype.getCurrentUser.call(this).then(function (user) {

            appStorage.setItem('user-' + user.Id, JSON.stringify(user));
            return user;

        }, function (error) {

            var userId = instance.getCurrentUserId();

            if (userId && instance.accessToken()) {
                var json = appStorage.getItem('user-' + userId);

                if (json) {
                    return Promise.resolve(JSON.parse(json));
                }
            }

            return Promise.reject(error);
        });
    };

    ApiClientEx.prototype.getNextUpEpisodes = function (options) {

        if (options.SeriesId) {
            if (isLocalId(options.SeriesId)) {
                return Promise.resolve(createEmptyList());
            }
        }

        return ApiClient.prototype.getNextUpEpisodes.call(this, options);
    };

    ApiClientEx.prototype.getSeasons = function (itemId, options) {

        if (isLocalId(itemId)) {
            options.ParentId = itemId;
            return this.getItems(this.getCurrentUserId(), options);
        }

        return ApiClient.prototype.getSeasons.call(this, itemId, options);
    };

    ApiClientEx.prototype.getEpisodes = function (itemId, options) {

        if (isLocalId(options.SeasonId)) {
            options.ParentId = options.SeasonId;
            return this.getItems(this.getCurrentUserId(), options);
        }

        if (isLocalId(options.seasonId)) {
            options.ParentId = options.seasonId;
            return this.getItems(this.getCurrentUserId(), options);
        }

        // get episodes by recursion
        if (isLocalId(itemId)) {
            options.ParentId = itemId;
            options.Recursive = true;
            return this.getItems(this.getCurrentUserId(), options).then(function (items) {
                var items2 = items.Items.filter(function (item) {

                    return item.Type.toLowerCase() === 'episode';
                });

                var result = {
                    Items: items2,
                    TotalRecordCount: items2.length
                };

                return Promise.resolve(result);
            });
        }

        return ApiClient.prototype.getEpisodes.call(this, itemId, options);
    };

    ApiClientEx.prototype.getLatestOfflineItems = function (options) {

        // Supported options
        // MediaType - Audio/Video/Photo/Book/Game
        // Limit
        // Filters: 'IsNotFolder' or 'IsFolder'

        options.SortBy = 'DateCreated';
        options.SortOrder = 'Descending';

        var serverInfo = this.serverInfo();

        if (serverInfo) {

            return localassetmanager.getViewItems(serverInfo.Id, null, options).then(function (items) {

                items.forEach(function (item) {
                    adjustGuidProperties(item);
                });

                return Promise.resolve(items);
            });
        }

        return Promise.resolve([]);
    };

    ApiClientEx.prototype.getThemeMedia = function (userId, itemId, inherit) {

        if (isLocalViewId(itemId) || isLocalId(itemId)) {
            return Promise.reject();
        }

        return ApiClient.prototype.getThemeMedia.call(this, userId, itemId, inherit);
    };

    ApiClientEx.prototype.getSimilarItems = function (itemId, options) {

        if (isLocalId(itemId)) {
            return Promise.resolve(createEmptyList());
        }

        return ApiClient.prototype.getSimilarItems.call(this, itemId, options);
    };

    ApiClientEx.prototype.updateFavoriteStatus = function (userId, itemId, isFavorite) {

        if (isLocalId(itemId)) {
            return Promise.resolve();
        }

        return ApiClient.prototype.updateFavoriteStatus.call(this, userId, itemId, isFavorite);
    };

    ApiClientEx.prototype.getScaledImageUrl = function (itemId, options) {

        if (isLocalId(itemId) || (options && options.itemid && isLocalId(options.itemid))) {

            var serverInfo = this.serverInfo();
            var id = stripLocalPrefix(itemId);

            return localassetmanager.getImageUrl(serverInfo.Id, id, options.type, 0);
        }

        return ApiClient.prototype.getScaledImageUrl.call(this, itemId, options);
    };

    ApiClientEx.prototype.reportPlaybackStart = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        if (isLocalId(options.ItemId)) {
            return Promise.resolve();
        }

        return ApiClient.prototype.reportPlaybackStart.call(this, options);
    };

    ApiClientEx.prototype.reportPlaybackProgress = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        if (isLocalId(options.ItemId)) {
            return Promise.resolve();
        }

        return ApiClient.prototype.reportPlaybackProgress.call(this, options);
    };

    ApiClientEx.prototype.reportPlaybackStopped = function (options) {

        if (!options) {
            throw new Error("null options");
        }

        if (isLocalId(options.ItemId)) {

            var serverInfo = this.serverInfo();

            var action =
            {
                Date: new Date().getTime(),
                ItemId: stripLocalPrefix(options.ItemId),
                PositionTicks: options.PositionTicks,
                ServerId: serverInfo.Id,
                Type: 0, // UserActionType.PlayedItem
                UserId: this.getCurrentUserId()
            };

            return localassetmanager.recordUserAction(action);
        }

        return ApiClient.prototype.reportPlaybackStopped.call(this, options);
    };

    ApiClientEx.prototype.getIntros = function (itemId) {

        if (isLocalId(itemId)) {
            return Promise.resolve({
                Items: [],
                TotalRecordCount: 0
            });
        }

        return ApiClient.prototype.getIntros.call(this, itemId);
    };

    ApiClientEx.prototype.getInstantMixFromItem = function (itemId, options) {

        if (isLocalId(itemId)) {
            return Promise.resolve({
                Items: [],
                TotalRecordCount: 0
            });
        }

        return ApiClient.prototype.getInstantMixFromItem.call(this, itemId, options);
    };

    ApiClientEx.prototype.getItemDownloadUrl = function (itemId) {

        if (isLocalId(itemId)) {

            var serverInfo = this.serverInfo();

            if (serverInfo) {

                return localassetmanager.getLocalItem(serverInfo.Id, stripLocalPrefix(itemId)).then(function (item) {

                    return Promise.resolve(item.LocalPath);
                });
            }
        }

        return ApiClient.prototype.getItemDownloadUrl.call(this, itemId);
    };

    return ApiClientEx;

});