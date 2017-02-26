define(['idb'], function () {
    'use strict';

    // Database version
    var dbVersion = 1;

    var promisesMap = new Map();

    function getDbName(serverId) {

        return "items_" + serverId;
    }

    function getPromise(dbName) {

        if (!promisesMap.has(dbName)) {
            return idb.open(dbName, dbVersion, upgradeDbFunc).then(function (dbPromise) {
                promisesMap.set(dbName, dbPromise);
                return Promise.resolve(dbPromise);
            });
        }

        var dbPromise = promisesMap.get(dbName);
        return Promise.resolve(dbPromise);
    }

    function getTransaction(serverId, access) {

        var dbName = getDbName(serverId);

        if (!access) {
            access = 'readonly';
        }

        return getPromise(dbName).then(function (db) {

            return db.transaction(dbName, access);
        });
    }

    function getObjectStore(serverId, access) {

        var dbName = getDbName(serverId);

        return getTransaction(serverId, access).then(function (tx) {

            return tx.objectStore(dbName);
        });
    }

    function upgradeDbFunc(upgradeDB) {

        // Note: we don't use 'break' in this switch statement,
        // the fall-through behaviour is what we want.
        switch (upgradeDB.oldVersion) {
            case 0:
                upgradeDB.createObjectStore(upgradeDB.name);
                //case 1:
                //    upgradeDB.createObjectStore('stuff', { keyPath: '' });
        }
    }



    function getServerItemTypes(serverId, userId) {

        return getObjectStore(serverId).then(function (store) {

            return store.getAll(null, 10000).then(function (all) {
                return all.filter(function (item) {
                    return true; // item.ServerId === serverId && (item.UserIdsWithAccess == null || item.UserIdsWithAccess.contains(userId));
                }).map(function (item2) {
                    return (item2.Item.Type || '').toLowerCase();
                }).filter(filterDistinct);
            });
        });
    }

    function getAll(serverId) {

        return getObjectStore(serverId).then(function (store) {
            return store.getAll(null, 10000);
        });
    }

    function get(serverId, key) {
        return getObjectStore(serverId).then(function (store) {
            return store.get(key);
        });
    }

    function set(serverId, key, val) {
        return getTransaction(serverId, 'readwrite').then(function (tx) {
            tx.objectStore(getDbName(serverId)).put(val, key);
            return tx.complete;
        });
    }

    function remove(serverId, key) {
        return getTransaction(serverId, 'readwrite').then(function (tx) {
            tx.objectStore(getDbName(serverId)).delete(key);
            return tx.complete;
        });
    }

    function clear(serverId) {
        return getTransaction(serverId, 'readwrite').then(function (tx) {
            tx.objectStore(getDbName(serverId)).clear();
            return tx.complete;
        });
    }

    function filterDistinct(value, index, self) {
        return self.indexOf(value) === index;
    }

    return {
        get: get,
        set: set,
        remove: remove,
        clear: clear,
        getAll: getAll,
        getServerItemTypes: getServerItemTypes
    };
});