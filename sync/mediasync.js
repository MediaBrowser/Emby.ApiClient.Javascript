function processDownloadStatus(apiClient, serverInfo, options) {

    console.log('[mediasync] Begin processDownloadStatus');

    return localassetmanager.resyncTransfers().then(() => localassetmanager.getServerItems(serverInfo.Id).then(items => {

        console.log('[mediasync] Begin processDownloadStatus getServerItems completed');

        let p = Promise.resolve();
        let cnt = 0;

        // Debugging only
        //items.forEach(function (item) {
        //    p = p.then(function () {
        //        return localassetmanager.removeLocalItem(item);
        //    });
        //});

        //return Promise.resolve();

        const progressItems = items.filter(item => item.SyncStatus === 'transferring' || item.SyncStatus === 'queued');

        progressItems.forEach(item => {
            p = p.then(() => reportTransfer(apiClient, item));
            cnt++;
        });

        return p.then(() => {
            console.log(`[mediasync] Exit processDownloadStatus. Items reported: ${cnt.toString()}`);
            return Promise.resolve();
        });
    }));
}

function reportTransfer(apiClient, item) {

    return localassetmanager.getItemFileSize(item.LocalPath).then(size => {
        // The background transfer service on Windows leaves the file empty (size = 0) until it 
        // has been downloaded completely
        if (size > 0) {
            return apiClient.reportSyncJobItemTransferred(item.SyncJobItemId).then(() => {
                item.SyncStatus = 'synced';
                return localassetmanager.addOrUpdateLocalItem(item);
            }, error => {
                console.error('[mediasync] Mediasync error on reportSyncJobItemTransferred', error);
                item.SyncStatus = 'error';
                return localassetmanager.addOrUpdateLocalItem(item);
            });
        } else {
            return localassetmanager.isDownloadFileInQueue(item.LocalPath).then(result => {
                if (result) {
                    // just wait for completion
                    return Promise.resolve();
                }

                console.log('[mediasync] reportTransfer: Size is 0 and download no longer in queue. Deleting item.');
                return localassetmanager.removeLocalItem(item).then(() => {
                    console.log('[mediasync] reportTransfer: Item deleted.');
                    return Promise.resolve();
                }, err2 => {
                    console.log('[mediasync] reportTransfer: Failed to delete item.', err2);
                    return Promise.resolve();
                });
            });
        }

    }, error => {

        console.error('[mediasync] reportTransfer: error on getItemFileSize. Deleting item.', error);
        return localassetmanager.removeLocalItem(item).then(() => {
            console.log('[mediasync] reportTransfer: Item deleted.');
            return Promise.resolve();
        }, err2 => {
            console.log('[mediasync] reportTransfer: Failed to delete item.', err2);
            return Promise.resolve();
        });
    });
}

function reportOfflineActions(apiClient, serverInfo) {

    console.log('[mediasync] Begin reportOfflineActions');

    return localassetmanager.getUserActions(serverInfo.Id).then(actions => {

        if (!actions.length) {
            console.log('[mediasync] Exit reportOfflineActions (no actions)');
            return Promise.resolve();
        }

        return apiClient.reportOfflineActions(actions).then(() => localassetmanager.deleteUserActions(actions).then(() => {
            console.log('[mediasync] Exit reportOfflineActions (actions reported and deleted.)');
            return Promise.resolve();
        }), err => {

            // delete those actions even on failure, because if the error is caused by 
            // the action data itself, this could otherwise lead to a situation that 
            // never gets resolved
            console.error(`[mediasync] error on apiClient.reportOfflineActions: ${err.toString()}`);
            return localassetmanager.deleteUserActions(actions);
        });
    });
}

function syncData(apiClient, serverInfo) {

    console.log('[mediasync] Begin syncData');

    return localassetmanager.getServerItems(serverInfo.Id).then(items => {

        const completedItems = items.filter(item => (item) && ((item.SyncStatus === 'synced') || (item.SyncStatus === 'error')));

        const request = {
            TargetId: apiClient.deviceId(),
            LocalItemIds: completedItems.map(xitem => xitem.ItemId)
        };

        return apiClient.syncData(request).then(result => afterSyncData(apiClient, serverInfo, result).then(() => {
            console.log('[mediasync] Exit syncData');
            return Promise.resolve();
        }, err => {
            console.error(`[mediasync] Error in syncData: ${err.toString()}`);
            return Promise.resolve();
        }));
    });
}

function afterSyncData(apiClient, serverInfo, syncDataResult) {

    console.log('[mediasync] Begin afterSyncData');

    let p = Promise.resolve();

    if (syncDataResult.ItemIdsToRemove && syncDataResult.ItemIdsToRemove.length > 0) {

        syncDataResult.ItemIdsToRemove.forEach(itemId => {
            p = p.then(() => removeLocalItem(itemId, serverInfo.Id));
        });
    }

    p = p.then(() => removeObsoleteContainerItems(serverInfo.Id));

    return p.then(() => {
        console.log('[mediasync] Exit afterSyncData');
        return Promise.resolve();
    });
}

function removeObsoleteContainerItems(serverId) {
    console.log('[mediasync] Begin removeObsoleteContainerItems');

    return localassetmanager.removeObsoleteContainerItems(serverId);
}

function removeLocalItem(itemId, serverId) {

    console.log('[mediasync] Begin removeLocalItem');

    return localassetmanager.getLocalItem(serverId, itemId).then(item => {

        if (item) {
            return localassetmanager.removeLocalItem(item);
        }

        return Promise.resolve();

    });
}

function getNewMedia(apiClient, downloadCount) {

    console.log('[mediasync] Begin getNewMedia');

    return apiClient.getReadySyncItems(apiClient.deviceId()).then(jobItems => {

        let p = Promise.resolve();

        const maxDownloads = 10;
        let currentCount = downloadCount;

        jobItems.forEach(jobItem => {
            if (currentCount++ <= maxDownloads) {
                p = p.then(() => getNewItem(jobItem, apiClient));
            }
        });

        return p.then(() => {
            console.log('[mediasync] Exit getNewMedia');
            return Promise.resolve();
        });
    });
}

function afterMediaDownloaded(apiClient, jobItem, localItem) {

    console.log('[mediasync] Begin afterMediaDownloaded');

    return getImages(apiClient, jobItem, localItem).then(() => {

        const libraryItem = jobItem.Item;

        return downloadParentItems(apiClient, jobItem, libraryItem).then(() => getSubtitles(apiClient, jobItem, localItem));
    });
}

function createLocalItem(libraryItem, jobItem) {

    console.log('[localassetmanager] Begin createLocalItem');

    const item = {

        Item: libraryItem,
        ItemId: libraryItem.Id,
        ServerId: libraryItem.ServerId,
        Id: libraryItem.Id
    };

    if (jobItem) {

        item.SyncJobItemId = jobItem.SyncJobItemId;
    }

    console.log('[localassetmanager] End createLocalItem');
    return item;
}

function getNewItem(jobItem, apiClient) {

    console.log('[mediasync] Begin getNewItem');

    const libraryItem = jobItem.Item;

    return localassetmanager.getLocalItem(libraryItem.ServerId, libraryItem.Id).then(existingItem => {

        if (existingItem) {
            if (existingItem.SyncStatus === 'queued' || existingItem.SyncStatus === 'transferring' || existingItem.SyncStatus === 'synced') {
                console.log('[mediasync] getNewItem: getLocalItem found existing item');

                if (localassetmanager.enableBackgroundCompletion()) {
                    return afterMediaDownloaded(apiClient, jobItem, existingItem);
                }
            }
        }

        libraryItem.CanDelete = false;
        libraryItem.CanDownload = false;
        libraryItem.SupportsSync = false;
        libraryItem.People = [];
        libraryItem.Chapters = [];
        libraryItem.Studios = [];
        libraryItem.SpecialFeatureCount = null;
        libraryItem.LocalTrailerCount = null;
        libraryItem.RemoteTrailers = [];

        const localItem = createLocalItem(libraryItem, jobItem);
        localItem.SyncStatus = 'queued';

        return downloadMedia(apiClient, jobItem, localItem);
    });
}

function downloadParentItems(apiClient, jobItem, libraryItem) {

    let p = Promise.resolve();

    if (libraryItem.SeriesId) {
        p = p.then(() => downloadItem(apiClient, libraryItem.SeriesId));
    }
    if (libraryItem.SeasonId) {
        p = p.then(() => downloadItem(apiClient, libraryItem.SeasonId).then(seasonItem => {
            libraryItem.SeasonPrimaryImageTag = (seasonItem.Item.ImageTags || {}).Primary;
            return Promise.resolve();
        }));
    }
    if (libraryItem.AlbumId) {
        p = p.then(() => downloadItem(apiClient, libraryItem.AlbumId));
    }

    return p;
}

function downloadItem(apiClient, itemId) {

    return apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(downloadedItem => {

        downloadedItem.CanDelete = false;
        downloadedItem.CanDownload = false;
        downloadedItem.SupportsSync = false;
        downloadedItem.People = [];
        downloadedItem.SpecialFeatureCount = null;
        downloadedItem.BackdropImageTags = null;
        downloadedItem.ParentBackdropImageTags = null;
        downloadedItem.ParentArtImageTag = null;
        downloadedItem.ParentLogoImageTag = null;

        const localItem = createLocalItem(downloadedItem, null);

        return localassetmanager.addOrUpdateLocalItem(localItem).then(() => Promise.resolve(localItem), err => {
            console.error(`[mediasync] downloadItem failed: ${err.toString()}`);
            return Promise.resolve(null);
        });
    });
}

function ensureLocalPathParts(localItem, jobItem) {

    if (localItem.LocalPathParts) {
        return;
    }

    const libraryItem = localItem.Item;

    const parts = localassetmanager.getDirectoryPath(libraryItem);

    parts.push(localassetmanager.getLocalFileName(libraryItem, jobItem.OriginalFileName));

    localItem.LocalPathParts = parts;
}

function downloadMedia(apiClient, jobItem, localItem) {

    const url = apiClient.getUrl(`Sync/JobItems/${jobItem.SyncJobItemId}/File`, {
        api_key: apiClient.accessToken()
    });

    ensureLocalPathParts(localItem, jobItem);

    return localassetmanager.downloadFile(url, localItem).then(result => {

        console.log('[mediasync] downloadMedia: localassetmanager.downloadFile returned.');

        // result.path
        // result.isComplete

        const localPath = result.path;
        const libraryItem = localItem.Item;

        if (localPath) {
            if (libraryItem.MediaSources) {
                for (const mediaSource of libraryItem.MediaSources) {
                    mediaSource.Path = localPath;
                    mediaSource.Protocol = 'File';
                }
            }
        }

        localItem.LocalPath = localPath;

        return afterMediaDownloaded(apiClient, jobItem, localItem).then(() => {

            if (result.isComplete) {
                localItem.SyncStatus = 'synced';
                return reportTransfer(apiClient, localItem);
            }

            localItem.SyncStatus = 'transferring';
            return localassetmanager.addOrUpdateLocalItem(localItem);
        }, err => {
            console.log(`[mediasync] downloadMedia: afterMediaDownloaded failed: ${err}`);
            // TODO: Bubble up error
            return Promise.resolve();
        });

    }, err => {
        console.log(`[mediasync] downloadMedia: localassetmanager.downloadFile failed: ${err}`);
        // TODO: Bubble up error
        return Promise.resolve();
    });
}

function getImages(apiClient, jobItem, localItem) {

    console.log('[mediasync] Begin getImages');

    let p = Promise.resolve();

    const libraryItem = localItem.Item;

    const serverId = libraryItem.ServerId;

    // case 0
    const mainImageTag = (libraryItem.ImageTags || {}).Primary;

    if (libraryItem.Id && mainImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.Id, mainImageTag, 'Primary'));
    }

    // case 0a
    const logoImageTag = (libraryItem.ImageTags || {}).Logo;
    if (libraryItem.Id && logoImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.Id, logoImageTag, 'Logo'));
    }

    // case 0b
    const artImageTag = (libraryItem.ImageTags || {}).Art;
    if (libraryItem.Id && artImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.Id, artImageTag, 'Art'));
    }

    // case 0c
    const bannerImageTag = (libraryItem.ImageTags || {}).Banner;
    if (libraryItem.Id && bannerImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.Id, bannerImageTag, 'Banner'));
    }

    // case 0d
    const thumbImageTag = (libraryItem.ImageTags || {}).Thumb;
    if (libraryItem.Id && thumbImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.Id, thumbImageTag, 'Thumb'));
    }

    // Backdrops
    if (libraryItem.Id && libraryItem.BackdropImageTags) {
        for (let i = 0; i < libraryItem.BackdropImageTags.length; i++) {

            //var backdropImageTag = libraryItem.BackdropImageTags[i];

            //// use self-invoking function to simulate block-level variable scope
            //(function (index, tag) {
            //    p = p.then(function () {
            //        return downloadImage(localItem, apiClient, serverId, libraryItem.Id, tag, 'backdrop', index);
            //    });
            //})(i, backdropImageTag);
        }
    }

    // case 1/2:
    if (libraryItem.SeriesId && libraryItem.SeriesPrimaryImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.SeriesId, libraryItem.SeriesPrimaryImageTag, 'Primary'));
    }

    if (libraryItem.SeriesId && libraryItem.SeriesThumbImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.SeriesId, libraryItem.SeriesThumbImageTag, 'Thumb'));
    }

    if (libraryItem.SeasonId && libraryItem.SeasonPrimaryImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.SeasonId, libraryItem.SeasonPrimaryImageTag, 'Primary'));
    }

    // case 3:
    if (libraryItem.AlbumId && libraryItem.AlbumPrimaryImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.AlbumId, libraryItem.AlbumPrimaryImageTag, 'Primary'));
    }

    if (libraryItem.ParentThumbItemId && libraryItem.ParentThumbImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.ParentThumbItemId, libraryItem.ParentThumbImageTag, 'Thumb'));
    }

    if (libraryItem.ParentPrimaryImageItemId && libraryItem.ParentPrimaryImageTag) {
        p = p.then(() => downloadImage(localItem, apiClient, serverId, libraryItem.ParentPrimaryImageItemId, libraryItem.ParentPrimaryImageTag, 'Primary'));
    }

    return p.then(() => {
        console.log('[mediasync] Finished getImages');
        return localassetmanager.addOrUpdateLocalItem(localItem);
    }, err => {
        console.log(`[mediasync] Error getImages: ${err.toString()}`);
        return Promise.resolve();
    });
}

function downloadImage(localItem, apiClient, serverId, itemId, imageTag, imageType, index = 0) {
    return localassetmanager.hasImage(serverId, itemId, imageType, index).then(hasImage => {

        if (hasImage) {
            console.log(`[mediasync] downloadImage - skip existing: ${itemId} ${imageType}_${index.toString()}`);
            return Promise.resolve();
        }

        let maxWidth = 400;

        if (imageType === 'backdrop') {
            maxWidth = null;
        }

        const imageUrl = apiClient.getScaledImageUrl(itemId, {
            tag: imageTag,
            type: imageType,
            maxWidth,
            api_key: apiClient.accessToken()
        });

        console.log(`[mediasync] downloadImage ${itemId} ${imageType}_${index.toString()}`);

        return localassetmanager.downloadImage(localItem, imageUrl, serverId, itemId, imageType, index).then(result => Promise.resolve(result), err => {
            console.log(`[mediasync] Error downloadImage: ${err.toString()}`);
            return Promise.resolve();
        });
    }, err => {
        console.log(`[mediasync] Error downloadImage: ${err.toString()}`);
        return Promise.resolve();
    });
}

function getSubtitles(apiClient, jobItem, localItem) {

    console.log('[mediasync] Begin getSubtitles');

    if (!jobItem.Item.MediaSources.length) {
        console.log('[mediasync] Cannot download subtitles because video has no media source info.');
        return Promise.resolve();
    }

    const files = jobItem.AdditionalFiles.filter(f => f.Type === 'Subtitles');

    const mediaSource = jobItem.Item.MediaSources[0];

    let p = Promise.resolve();

    files.forEach(file => {
        p = p.then(() => getItemSubtitle(file, apiClient, jobItem, localItem, mediaSource));
    });

    return p.then(() => {
        console.log('[mediasync] Exit getSubtitles');
        return Promise.resolve();
    });
}

function getItemSubtitle(file, apiClient, jobItem, localItem, mediaSource) {

    console.log('[mediasync] Begin getItemSubtitle');

    const subtitleStream = mediaSource.MediaStreams.filter(m => m.Type === 'Subtitle' && m.Index === file.Index)[0];

    if (!subtitleStream) {

        // We shouldn't get in here, but let's just be safe anyway
        console.log('[mediasync] Cannot download subtitles because matching stream info was not found.');
        return Promise.resolve();
    }

    const url = apiClient.getUrl(`Sync/JobItems/${jobItem.SyncJobItemId}/AdditionalFiles`, {
        Name: file.Name,
        api_key: apiClient.accessToken()
    });

    const fileName = localassetmanager.getSubtitleSaveFileName(localItem, jobItem.OriginalFileName, subtitleStream.Language, subtitleStream.IsForced, subtitleStream.Codec);

    return localassetmanager.downloadSubtitles(url, fileName).then(subtitleResult => {

        if (localItem.AdditionalFiles) {
            localItem.AdditionalFiles.forEach(item => {
                if (item.Name === file.Name) {
                    item.Path = subtitleResult.path;
                }
            });
        }

        subtitleStream.Path = subtitleResult.path;
        subtitleStream.DeliveryMethod = 'External';
        return localassetmanager.addOrUpdateLocalItem(localItem);
    });
}

function checkLocalFileExistence(apiClient, serverInfo, options) {

    if (options.checkFileExistence) {

        console.log('[mediasync] Begin checkLocalFileExistence');

        return localassetmanager.getServerItems(serverInfo.Id).then(items => {

            const completedItems = items.filter(item => (item) && ((item.SyncStatus === 'synced') || (item.SyncStatus === 'error')));

            let p = Promise.resolve();

            completedItems.forEach(completedItem => {
                p = p.then(() => localassetmanager.fileExists(completedItem.LocalPath).then(exists => {
                    if (!exists) {
                        return localassetmanager.removeLocalItem(completedItem).then(() => Promise.resolve(), () => Promise.resolve());
                    }

                    return Promise.resolve();
                }));
            });

            return p;
        });
    }

    return Promise.resolve();
}

export default class MediaSync {

    sync(apiClient, localassetmanager, serverInfo, options) {
        console.log('[mediasync]************************************* Start sync');

        return checkLocalFileExistence(apiClient, localassetmanager, serverInfo, options).then(
            () => processDownloadStatus(apiClient, localassetmanager, serverInfo, options).then(
                () => localassetmanager
                    .getDownloadItemCount()
                    .then(downloadCount => {
                        if (
                            options.syncCheckProgressOnly === true &&
                            downloadCount > 2
                        ) {
                            return Promise.resolve();
                        }

                        return reportOfflineActions(apiClient, localassetmanager, serverInfo).then(
                            () => // Download new content
                                getNewMedia(
                                    apiClient,
                                    localassetmanager,
                                    options,
                                    downloadCount
                                ).then(() => // Do the second data sync
                                    syncData(apiClient, localassetmanager, serverInfo).then(() => {
                                        console.log(
                                            '[mediasync]************************************* Exit sync'
                                        );
                                        return Promise.resolve();
                                    }))
                        );
                    })
            ),
            err => {
                console.error(err.toString());
            }
        );
    }
}