function updateCache(instance) {
    instance.cache.put('data', new Response(JSON.stringify(instance.localData)));
}

export default class MyStore {
    init() {

        const instance = this;
        return caches.open('embydata').then(result => {
            instance.cache = result;
            instance.localData = {};
        });
    }

    setItem(name, value) {
        if (this.localData) {
            const changed = this.localData[name] !== value;

            if (changed) {
                this.localData[name] = value;
                updateCache(this);
            }
        }
    }

    getItem(name) {
        if (this.localData) {
            return this.localData[name];
        }
    }

    removeItem(name) {
        if (this.localData) {
            this.localData[name] = null;
            delete this.localData[name];
            updateCache(this);
        }
    }
}