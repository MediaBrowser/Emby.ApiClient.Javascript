function processDownloadStatus(apiClient, localassetmanager, serverInfo, options) {
    console.log('[mediasync] Begin processDownloadStatus');

    return localassetmanager.resyncTransfers().then(() => localassetmanager
        .getServerItems(serverInfo.Id)
        .then(items => {
            console.log(
                '[mediasync] Begin processDownloadStatus getServerItems completed'
            );

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
                p = p.then(() => reportTransfer(apiClient, localassetmanager, item));
                cnt++;
            });

            return p.then(() => {
                console.log(
                    `[mediasync] Exit processDownloadStatus. Items reported: ${cnt.toString()}`
                );
                return Promise.resolve();
            });
        }));
}

function reportTransfer(apiClient, localassetmanager, item) {
    return localassetmanager.getItemFileSize(item.LocalPath).then(
        size => {
            // The background transfer service on Windows leaves the file empty (size = 0) until it
            // has been downloaded completely
            if (size > 0) {
                return apiClient.reportSyncJobItemTransferred(item.SyncJobItemId).then(
                    () => {
                        item.SyncStatus = 'synced';
                        return localassetmanager.addOrUpdateLocalItem(item);
                    },
                    error => {
                        console.error(
                            '[mediasync] Mediasync error on reportSyncJobItemTransferred',
                            error
                        );
                        item.SyncStatus = 'error';
                        return localassetmanager.addOrUpdateLocalItem(item);
                    }
                );
            } else {
                return localassetmanager
                    .isDownloadFileInQueue(item.LocalPath)
                    .then(result => {
                        if (result) {
                            // just wait for completion
                            return Promise.resolve();
                        }

                        console.log(
                            '[mediasync] reportTransfer: Size is 0 and download no longer in queue. Deleting item.'
                        );
                        return localassetmanager.removeLocalItem(item).then(
                            () => {
                                console.log('[mediasync] reportTransfer: Item deleted.');
                                return Promise.resolve();
                            },
                            err2 => {
                                console.log(
                                    '[mediasync] reportTransfer: Failed to delete item.',
                                    err2
                                );
                                return Promise.resolve();
                            }
                        );
                    });
            }
        },
        error => {
            console.error(
                '[mediasync] reportTransfer: error on getItemFileSize. Deleting item.',
                error
            );
            return localassetmanager.removeLocalItem(item).then(
                () => {
                    console.log('[mediasync] reportTransfer: Item deleted.');
                    return Promise.resolve();
                },
                err2 => {
                    console.log(
                        '[mediasync] reportTransfer: Failed to delete item.',
                        error
                    );
                    return Promise.resolve();
                }
            );
        }
    );
}

function reportOfflineActions(apiClient, localassetmanager, serverInfo) {
    console.log('[mediasync] Begin reportOfflineActions');

    return localassetmanager
        .getUserActions(serverInfo.Id)
        .then(actions => {
            if (!actions.length) {
                console.log('[mediasync] Exit reportOfflineActions (no actions)');
                return Promise.resolve();
            }

            return apiClient.reportOfflineActions(actions).then(
                () => localassetmanager.deleteUserActions(actions).then(() => {
                    console.log(
                        '[mediasync] Exit reportOfflineActions (actions reported and deleted.)'
                    );
                    return Promise.resolve();
                }),
                err => {
                    // delete those actions even on failure, because if the error is caused by
                    // the action data itself, this could otherwise lead to a situation that
                    // never gets resolved
                    console.error(
                        `[mediasync] error on apiClient.reportOfflineActions: ${err.toString()}`
                    );
                    return localassetmanager.deleteUserActions(actions);
                }
            );
        });
}

function syncData(apiClient, localassetmanager, serverInfo, syncUserItemAccess) {
    console.log('[mediasync] Begin syncData');

    return localassetmanager.getServerItems(serverInfo.Id).then(items => {
        const completedItems = items.filter(item => item && (item.SyncStatus === 'synced' || item.SyncStatus === 'error'));

        const request = {
            TargetId: apiClient.deviceId(),
            LocalItemIds: completedItems.map(xitem => xitem.ItemId)
        };

        return apiClient.syncData(request).then(result => afterSyncData(
            apiClient,
            localassetmanager,
            serverInfo,
            syncUserItemAccess,
            result
        ).then(
            () => {
                console.log('[mediasync] Exit syncData');
                return Promise.resolve();
            },
            err => {
                console.error(`[mediasync] Error in syncData: ${err.toString()}`);
                return Promise.resolve();
            }
            ));
    });
}

function afterSyncData(
    apiClient,
    localassetmanager,
    serverInfo,
    enableSyncUserItemAccess,
    syncDataResult
) {
    console.log('[mediasync] Begin afterSyncData');

    let p = Promise.resolve();

    if (
        syncDataResult.ItemIdsToRemove &&
        syncDataResult.ItemIdsToRemove.length > 0
    ) {
        syncDataResult.ItemIdsToRemove.forEach(itemId => {
            p = p.then(() => removeLocalItem(localassetmanager, itemId, serverInfo.Id));
        });
    }

    if (enableSyncUserItemAccess) {
        p = p.then(() => syncUserItemAccess(syncDataResult, serverInfo.Id));
    }

    p = p.then(() => removeObsoleteContainerItems(localassetmanager, serverInfo.Id));

    return p.then(() => {
        console.log('[mediasync] Exit afterSyncData');
        return Promise.resolve();
    });
}

function removeObsoleteContainerItems(localassetmanager, serverId) {
    console.log('[mediasync] Begin removeObsoleteContainerItems');

    return localassetmanager.removeObsoleteContainerItems(serverId);
}

function removeLocalItem(localassetmanager, itemId, serverId) {
    console.log('[mediasync] Begin removeLocalItem');

    return localassetmanager.getLocalItem(serverId, itemId).then(item => {
        if (item) {
            return localassetmanager.removeLocalItem(item);
        }

        return Promise.resolve();
    });
}

function getNewMedia(apiClient, localassetmanager, serverInfo, options, downloadCount) {
    console.log('[mediasync] Begin getNewMedia');

    return apiClient
        .getReadySyncItems(apiClient.deviceId())
        .then(jobItems => {
            let p = Promise.resolve();

            const maxDownloads = 10;
            let currentCount = downloadCount;

            jobItems.forEach(jobItem => {
                if (currentCount++ <= maxDownloads) {
                    p = p.then(() => getNewItem(jobItem, apiClient, localassetmanager, serverInfo, options));
                }
            });

            return p.then(() => {
                console.log('[mediasync] Exit getNewMedia');
                return Promise.resolve();
            });
        });
}

function getNewItem(jobItem, apiClient, localassetmanager, serverInfo, options) {
    console.log('[mediasync] Begin getNewItem');

    const libraryItem = jobItem.Item;

    return localassetmanager
        .getLocalItem(serverInfo.Id, libraryItem.Id)
        .then(existingItem => {
            const onDownloadParentItemsDone = localItem => downloadMedia(apiClient, localassetmanager, jobItem, localItem, options).then(
                () => getImages(apiClient, localassetmanager, jobItem, localItem).then(() => getSubtitles(apiClient, localassetmanager, jobItem, localItem))
            );

            if (existingItem) {
                if (
                    existingItem.SyncStatus === 'queued' ||
                    existingItem.SyncStatus === 'transferring' ||
                    existingItem.SyncStatus === 'synced'
                ) {
                    console.log(
                        '[mediasync] getNewItem: getLocalItem found existing item'
                    );

                    if (localassetmanager.enableRepeatDownloading()) {
                        return onDownloadParentItemsDone(existingItem);
                    }

                    return Promise.resolve();
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

            return localassetmanager
                .createLocalItem(libraryItem, serverInfo, jobItem)
                .then(localItem => {
                    console.log('[mediasync] getNewItem: createLocalItem completed');

                    localItem.SyncStatus = 'queued';

                    return downloadParentItems(
                        apiClient,
                        localassetmanager,
                        jobItem,
                        localItem,
                        serverInfo,
                        options
                    ).then(() => onDownloadParentItemsDone(localItem));
                });
        });
}

function downloadParentItems(
    apiClient,
    localassetmanager,
    jobItem,
    localItem,
    serverInfo,
    options
) {
    let p = Promise.resolve();

    const libraryItem = localItem.Item;

    const itemType = (libraryItem.Type || '').toLowerCase();

    if (libraryItem.SeriesId) {
        p = p.then(() => downloadItem(
            apiClient,
            localassetmanager,
            libraryItem,
            libraryItem.SeriesId,
            serverInfo
        ));
    }
    if (libraryItem.SeasonId) {
        p = p.then(() => downloadItem(
            apiClient,
            localassetmanager,
            libraryItem,
            libraryItem.SeasonId,
            serverInfo
        ).then(seasonItem => {
            libraryItem.SeasonPrimaryImageTag = (
                seasonItem.Item.ImageTags || {}
            ).Primary;
            return Promise.resolve();
        }));
    }
    if (libraryItem.AlbumId) {
        p = p.then(() => downloadItem(
            apiClient,
            localassetmanager,
            libraryItem,
            libraryItem.AlbumId,
            serverInfo
        ));
    }

    return p;
}

function downloadItem(apiClient, localassetmanager, libraryItem, itemId, serverInfo) {
    return apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(
        downloadedItem => {
            downloadedItem.CanDelete = false;
            downloadedItem.CanDownload = false;
            downloadedItem.SupportsSync = false;
            downloadedItem.People = [];
            downloadedItem.SpecialFeatureCount = null;
            downloadedItem.BackdropImageTags = null;
            downloadedItem.ParentBackdropImageTags = null;
            downloadedItem.ParentArtImageTag = null;
            downloadedItem.ParentLogoImageTag = null;

            return localassetmanager
                .createLocalItem(downloadedItem, serverInfo, null)
                .then(localItem => localassetmanager
                    .addOrUpdateLocalItem(localItem)
                    .then(() => Promise.resolve(localItem)));
        },
        err => {
            console.error(`[mediasync] downloadItem failed: ${err.toString()}`);
            return Promise.resolve(null);
        }
    );
}

function downloadMedia(apiClient, localassetmanager, jobItem, localItem, options) {
    const url = apiClient.getUrl(
        `Sync/JobItems/${jobItem.SyncJobItemId}/File`,
        {
            api_key: apiClient.accessToken()
        }
    );

    const localPath = localItem.LocalPath;

    console.log(
        `[mediasync] Downloading media. Url: ${url}. Local path: ${localPath}`
    );

    options = options || {};

    return localassetmanager.downloadFile(url, localItem).then(result => {
        // result.path
        // result.isComplete

        localItem.SyncStatus = result.isComplete ? 'synced' : 'transferring';

        return localassetmanager.addOrUpdateLocalItem(localItem);
    });
}

function getImages(apiClient, localassetmanager, jobItem, localItem) {
    console.log('[mediasync] Begin getImages');

    let p = Promise.resolve();

    const libraryItem = localItem.Item;

    const serverId = libraryItem.ServerId;

    // case 0
    const mainImageTag = (libraryItem.ImageTags || {}).Primary;

    if (libraryItem.Id && mainImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.Id,
            mainImageTag,
            'Primary'
        ));
    }

    // case 0a
    const logoImageTag = (libraryItem.ImageTags || {}).Logo;
    if (libraryItem.Id && logoImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.Id,
            logoImageTag,
            'Logo'
        ));
    }

    // case 0b
    const artImageTag = (libraryItem.ImageTags || {}).Art;
    if (libraryItem.Id && artImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.Id,
            artImageTag,
            'Art'
        ));
    }

    // case 0c
    const bannerImageTag = (libraryItem.ImageTags || {}).Banner;
    if (libraryItem.Id && bannerImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.Id,
            bannerImageTag,
            'Banner'
        ));
    }

    // case 0d
    const thumbImageTag = (libraryItem.ImageTags || {}).Thumb;
    if (libraryItem.Id && thumbImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.Id,
            thumbImageTag,
            'Thumb'
        ));
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
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.SeriesId,
            libraryItem.SeriesPrimaryImageTag,
            'Primary'
        ));
    }

    if (libraryItem.SeriesId && libraryItem.SeriesThumbImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.SeriesId,
            libraryItem.SeriesThumbImageTag,
            'Thumb'
        ));
    }

    if (libraryItem.SeasonId && libraryItem.SeasonPrimaryImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.SeasonId,
            libraryItem.SeasonPrimaryImageTag,
            'Primary'
        ));
    }

    // case 3:
    if (libraryItem.AlbumId && libraryItem.AlbumPrimaryImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.AlbumId,
            libraryItem.AlbumPrimaryImageTag,
            'Primary'
        ));
    }

    if (libraryItem.ParentThumbItemId && libraryItem.ParentThumbImageTag) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.ParentThumbItemId,
            libraryItem.ParentThumbImageTag,
            'Thumb'
        ));
    }

    if (
        libraryItem.ParentPrimaryImageItemId &&
        libraryItem.ParentPrimaryImageTag
    ) {
        p = p.then(() => downloadImage(
            localItem,
            apiClient,
            localassetmanager,
            serverId,
            libraryItem.ParentPrimaryImageItemId,
            libraryItem.ParentPrimaryImageTag,
            'Primary'
        ));
    }

    return p.then(
        () => {
            console.log('[mediasync] Finished getImages');
            return localassetmanager.addOrUpdateLocalItem(localItem);
        },
        err => {
            console.log(`[mediasync] Error getImages: ${err.toString()}`);
            return Promise.resolve();
        }
    );
}

function downloadImage(localItem, apiClient, localassetmanager, serverId, itemId, imageTag, imageType, index = 0) {
    return localassetmanager.hasImage(serverId, itemId, imageType, index).then(
        hasImage => {
            if (hasImage) {
                console.log(
                    `[mediasync] downloadImage - skip existing: ${itemId} ${imageType}_${index.toString()}`
                );
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

            console.log(
                `[mediasync] downloadImage ${itemId} ${imageType}_${index.toString()}`
            );

            return localassetmanager
                .downloadImage(localItem, imageUrl, serverId, itemId, imageType, index)
                .then(
                result => Promise.resolve(),
                err => {
                    console.log(`[mediasync] Error downloadImage: ${err.toString()}`);
                    return Promise.resolve();
                }
                );
        },
        err => {
            console.log(`[mediasync] Error downloadImage: ${err.toString()}`);
            return Promise.resolve();
        }
    );
}

function getSubtitles(apiClient, localassetmanager, jobItem, localItem) {
    console.log('[mediasync] Begin getSubtitles');

    if (!jobItem.Item.MediaSources.length) {
        console.log(
            '[mediasync] Cannot download subtitles because video has no media source info.'
        );
        return Promise.resolve();
    }

    const files = jobItem.AdditionalFiles.filter(f => f.Type === 'Subtitles');

    const mediaSource = jobItem.Item.MediaSources[0];

    let p = Promise.resolve();

    files.forEach(file => {
        p = p.then(() => getItemSubtitle(file, apiClient, localassetmanager, jobItem, localItem, mediaSource));
    });

    return p.then(() => {
        console.log('[mediasync] Exit getSubtitles');
        return Promise.resolve();
    });
}

function getItemSubtitle(file, apiClient, localassetmanager, jobItem, localItem, mediaSource) {
    console.log('[mediasync] Begin getItemSubtitle');

    const subtitleStream = mediaSource.MediaStreams.filter(m => m.Type === 'Subtitle' && m.Index === file.Index)[0];

    if (!subtitleStream) {
        // We shouldn't get in here, but let's just be safe anyway
        console.log(
            '[mediasync] Cannot download subtitles because matching stream info was not found.'
        );
        return Promise.resolve();
    }

    const url = apiClient.getUrl(
        `Sync/JobItems/${jobItem.SyncJobItemId}/AdditionalFiles`,
        {
            Name: file.Name,
            api_key: apiClient.accessToken()
        }
    );

    const fileName = localassetmanager.getSubtitleSaveFileName(
        localItem,
        jobItem.OriginalFileName,
        subtitleStream.Language,
        subtitleStream.IsForced,
        subtitleStream.Codec
    );

    return localassetmanager
        .downloadSubtitles(url, fileName)
        .then(subtitlePath => {
            if (localItem.AdditionalFiles) {
                localItem.AdditionalFiles.forEach(item => {
                    if (item.Name === file.Name) {
                        item.Path = subtitlePath;
                    }
                });
            }

            subtitleStream.Path = subtitlePath;
            subtitleStream.DeliveryMethod = 'External';
            return localassetmanager.addOrUpdateLocalItem(localItem);
        });
}

function checkLocalFileExistence(apiClient, localassetmanager, serverInfo, options) {
    if (options.checkFileExistence) {
        console.log('[mediasync] Begin checkLocalFileExistence');

        return localassetmanager
            .getServerItems(serverInfo.Id)
            .then(items => {
                const completedItems = items.filter(item => item &&
                    (item.SyncStatus === 'synced' || item.SyncStatus === 'error'));

                let p = Promise.resolve();

                completedItems.forEach(completedItem => {
                    p = p.then(() => localassetmanager
                        .fileExists(completedItem.LocalPath)
                        .then(exists => {
                            if (!exists) {
                                return localassetmanager.removeLocalItem(localassetmanager, completedItem).then(
                                    () => Promise.resolve(),
                                    () => Promise.resolve()
                                );
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
                                    serverInfo,
                                    options,
                                    downloadCount
                                ).then(() => // Do the second data sync
                                    syncData(apiClient, localassetmanager, serverInfo, false).then(() => {
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