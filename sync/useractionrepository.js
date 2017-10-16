define([], function () {
    'use strict';

    // In the following line, you should include the prefixes of implementations you want to test.
    var indexedDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB;
    // DON'T use "var indexedDB = ..." if you're not in a function.
    // Moreover, you may need references to some window.IDB* objects:
    var IDBTransaction = self.IDBTransaction || self.webkitIDBTransaction || self.msIDBTransaction || { READ_WRITE: "readwrite" }; // This line should only be needed if it is needed to support the object's constants for older browsers
    var IDBKeyRange = self.IDBKeyRange || self.webkitIDBKeyRange || self.msIDBKeyRange;
    // (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

    // Database name
    var dbName = "useractions";

    // Database version
    var dbVersion = 1;

    var databaseInstance;

    function getDb(callback) {

        var db = databaseInstance;
        if (db) {
            callback(db);
            return;
        }

        var request = indexedDB.open(dbName, dbVersion);

        request.onerror = function (event) {
            // Handle errors.
        };

        request.onupgradeneeded = function (event) {
            var db = event.target.result;

            // Create an objectStore to hold information about our customers. We're
            // going to use "ssn" as our key path because it's guaranteed to be
            // unique - or at least that's what I was told during the kickoff meeting.
            var objectStore = db.createObjectStore(dbName);

            // Use transaction oncomplete to make sure the objectStore creation is 
            // finished before adding data into it.
            objectStore.transaction.oncomplete = function (event) {
                callback(db);
            };
        };

        request.onsuccess = function (event) {
            var db = event.target.result;
            callback(db);
        };
    }

    function getByServerId(serverId) {

        return getAll().then(function (items) {
            return items.filter(function (item) {
                return item.ServerId === serverId;
            });
        });
    }

    function getAll() {

        return new Promise(function (resolve, reject) {
            getDb(function (db) {

                var storeName = dbName;

                var transaction = db.transaction([storeName], 'readonly');
                var objectStore = transaction.objectStore(storeName);
                var request;

                if ('getAll' in objectStore) {

                    // IDBObjectStore.getAll() will return the full set of items in our store.
                    request = objectStore.getAll(null, 10000);

                    request.onsuccess = function (event) {
                        resolve(event.target.result);
                    };

                } else {

                    // Fallback to the traditional cursor approach if getAll isn't supported.
                    var results = [];
                    request = objectStore.openCursor();

                    request.onsuccess = function (event) {
                        var cursor = event.target.result;
                        if (cursor) {
                            results.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(results);
                        }
                    };
                }

                request.onerror = reject;
            });
        });
    }

    function get(key) {

        return new Promise(function (resolve, reject) {
            getDb(function (db) {

                var storeName = dbName;

                var transaction = db.transaction([storeName], 'readonly');
                var objectStore = transaction.objectStore(storeName);
                var request = objectStore.get(key);

                request.onerror = reject;

                request.onsuccess = function (event) {
                    // Do something with the request.result!
                    resolve(request.result);
                };
            });
        });
    }

    function set(key, val) {

        return new Promise(function (resolve, reject) {
            getDb(function (db) {

                var storeName = dbName;

                var transaction = db.transaction([storeName], 'readwrite');
                var objectStore = transaction.objectStore(storeName);
                var request = objectStore.put(val, key);

                request.onerror = reject;
                request.onsuccess = resolve;
            });
        });
    }

    function remove(key) {
        return new Promise(function (resolve, reject) {
            getDb(function (db) {

                var storeName = dbName;

                var transaction = db.transaction([storeName], 'readwrite');
                var objectStore = transaction.objectStore(storeName);
                var request = objectStore.delete(key);

                request.onerror = reject;
                request.onsuccess = resolve;
            });
        });
    }

    function clear() {
        return new Promise(function (resolve, reject) {
            getDb(function (db) {

                var storeName = dbName;

                var transaction = db.transaction([storeName], 'readwrite');
                var objectStore = transaction.objectStore(storeName);
                var request = objectStore.clear();

                request.onerror = reject;
                request.onsuccess = resolve;
            });
        });
    }

    return {
        get: get,
        set: set,
        remove: remove,
        clear: clear,
        getAll: getAll,
        getByServerId: getByServerId
    };
});