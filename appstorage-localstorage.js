define([], function () {
    'use strict';

    function updateCache(instance) {

        var cache = instance.cache;

        if (cache) {
            cache.put('data', new Response(JSON.stringify(instance.localData)));
        }
    }

    function onCacheOpened(result) {
        this.cache = result;
        this.localData = {};
    }

    function MyStore() {

        try {

            if (self.caches) {

                caches.open('embydata').then(onCacheOpened.bind(this));
            }

        } catch (err) {
            console.log('Error opening cache: ' + err);
        }

    }

    MyStore.prototype.setItem = function (name, value) {
        localStorage.setItem(name, value);

        var localData = this.localData;

        if (localData) {
            var changed = localData[name] !== value;

            if (changed) {
                localData[name] = value;
                updateCache(this);
            }
        }
    };

    MyStore.prototype.getItem = function (name) {
        return localStorage.getItem(name);
    };

    MyStore.prototype.removeItem = function (name) {
        localStorage.removeItem(name);

        var localData = this.localData;

        if (localData) {
            localData[name] = null;
            delete localData[name];
            updateCache(this);
        }
    };

    return new MyStore();
});