const fs = require('fs');
const path = require('path');
const common = require('./common');
const expect = common.expect;

class Storable {
    constructor(store, reset=true) {
        this.store = store;

        if (reset)
            this.reset();
    }

    // override this if you want a different naming scheme
    static docName(key) {
        return key + '.json';
    }

    // override this to validate your data on load
    static isValid(data=null) {
        return (data !== null && typeof data === 'object');
    }

    // override this to change unique Id generation
    _genUniqueId() {
        var id;

        do {
            id = common.genRandomToken(32);
        } while(this.store.get(id));

        return id;
    }

    reset(id=false, update=false, data={}) {
        this._id = id;
        this.data = data;
        this.needsUpdate = update;
    }

    get id() {
        return this._id;
    }

    get(key) {
        return this.data[key] || null;
    }

    set(key=null, val=null) {
        if (key === null || key === '')
            return;

        this.data[key] = val;
        this.needsUpdate = true;
    }

    // if obj is not given or null, this will fallback to this.data
    async save(obj=null) {
        if (this.store === false)
            throw new Error(this.constructor.name + ": store not defined");

        if (!this.needsUpdate) {
            console.log(this.constructor.name + ": update skipped"); // eslint-disable-line
            return true;
        }

        if (!await this.store.update(this._id, obj || this.data))
            return false;

        this.needsUpdate=false;
        return true;
    }

    async destroy() {
        if (!this.id)
            return false;

        if (!this.store.destroy(this.id)) {
            console.log(this.constructor.name + 
                        ": Warning: Couldn't delete data for: " + this.id); // eslint-disable-line
            return false;
        }

        this._id = null;
        this.data = null;
        this.needsUpdate = null;
        
        return true;
    }
}

class JSONStore {
    constructor(classRef, docPath=false, purgeInvalid=false) {
        //this.name = classRef.name;
        this.classRef = classRef;
        this.store = {};

        this.path = docPath;
        this.saveToDisk = (this.path !== false);
        this.deleteInvalidDocs = purgeInvalid;
        
        if (this.saveToDisk)
            this._reload();
    }

    // override this if you want a different naming scheme
    docName(key) {
        return path.join(this.path, this.classRef.docName(key));
    }

    get(key) {
        return this.store[key] || false;
    }

/*    
    Notes: Do not update any data if the data itself isn't set
           Update acts like an SQL REPLACE or REPLACE INTO command. i.e. if the data doesn't exist
           a new record is created. If it does exist, it's updated.

           Expected to return true on successful update only
*/
    async update(key, data) {
        if (typeof data !== 'object')
            return false;

        this.store[key] = data;
        return this._checkPoint(key, data);
    }

    async _checkPoint(key, data) {
        if (!this.saveToDisk || !this.path)
            return true;

        //console.log("::    " + this.classRef.name + ": CHECKPOINT RUN"); // eslint-disable-line
        return common.writeJSON(this.docName(key), data, 'utf8');
    }

    async destroy(key) {
        if (expect(this.store[key], false))
            return false;

        if (!await common.unlink(this.docName(key)))
            return false;

        this.store[key]=null;
        return true;
    }

    // override this to restore a document to the correct key
    async _restore(fname) {
        var data, 
            key = path.basename(fname, '.json');

        if (!key || key.length < 1) {
            console.log("::    " +  // eslint-disable-line
                        this.classRef.name + " Store Error: Invalid document key: ", key);
            return false;
        }

        console.log(":: " + this.classRef.name + ": Loading doc: ", key);
        data = await common.readJSON(fname);
        if (!data) {
            console.log("::    " +  // eslint-disable-line
                        this.classRef.name + " Store Error: Couldn't read document " + key + " from disk: ", fname);
            return false;
        }

        if (!this.classRef.isValid(data)) {
            console.log("::    " +  // eslint-disable-line
                        this.classRef.name + " Store Error: Invalid doc: ", key);
            if (this.deleteInvalidDocs)
                await common.unlink(fname);

            return false;
        }

        this.store[key] = data;
        return true;
    }

    async _reload() {
        var list = common.filterDir(this.path, '.json'), 
            count=0,
            i, max;

        console.log(this.classRef.name, ": Reloading..."); // eslint-disable-line

        // load documents in parallel
        for (i=0, max=list.length; i < max; i++) {
            list[i] = this._restore(list[i]);
        }

        // check all results
        for (i=0, max=list.length; i < max; i++) {
            if (await list[i])
                count++;
        }

        console.log("::    ", this.classRef.name, ": Restored: ", count); // eslint-disable-line
    }
}

exports = module.exports = {
    JSONStore: JSONStore,
    Storable: Storable
};
