export default class MyStore {
    constructor() {

        this.localData = {};
    }

    setItem(name, value) {
        this.localData[name] = value;
    }

    getItem(name) {
        return this.localData[name];
    }

    removeItem(name) {
        this.localData[name] = null;
    }
}