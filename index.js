const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const agent = (_parsedURL) => _parsedURL.protocol == 'http:' ? httpAgent : httpsAgent;

const rawFetch = require("node-fetch");

const fetch = (...args) => {
	const options = args[1];
	if (typeof options !== 'object') args[1] = { agent }; else options.agent = agent;
	return rawFetch(...args);
};

if (!((typeof process !== 'undefined') && 
(process.release.name.search(/node|io.js/) !== -1))) throw new Error('better-replit-db is not running in Node.js');

class Client {
	/**
	 * Initiates Class.
	 * @param {String} url Custom database URL
	 */
	constructor(url) {
		if (url) this.url = url;
		else this.url = process.env.REPLIT_DB_URL;	

		this.dbCache = {};

		this.getAllNoCache().then((all) => this.dbCache = all);
	}

	/**
	 * Initiates another instance of the db Class.
	 * @param {String} url Custom database URL
	 */
	connect(url) {
		if (!url) throw new Error('You did no pass a URL string to connect()');
		return new this.constructor(url);
	}

	// Native Functions
	/**
	 * Gets a key
	 * @param {String} key Key
	 * @param {boolean} [options.raw=false] Makes it so that we return the raw string value. Default is false.
	 */
	async get(key, options) {
		let value = this.dbCache[key];

		if (!value) value = await this.getNoCache(key);
		
		if (options && options.raw) return JSON.stringify(value);

		return value;
	}

	/**
	 * Gets a key without the cache
	 * @param {String} key Key
	 * @param {boolean} [options.raw=false] Makes it so that we return the raw string value. Default is false.
	 */
	async getNoCache(key, options) {
		return await fetch(this.url + "/" + key)
		.then((e) => e.text())
		.then((strValue) => {
			if (options && options.raw) return strValue;

			if (!strValue) return null;

			let value = strValue;
			try {
				// Try to parse as JSON, if it fails, we throw
				value = JSON.parse(strValue);
			} catch (_err) {
				throw new SyntaxError(
					`Failed to parse value of ${key}, try passing a raw option to get the raw value`
				);
			}

			this.dbCache[key] = value;

			return value;
		});
	}

	/**
	 * Sets a key
	 * @param {String} key Key
	 * @param {any} value Value
	 * @param {boolean} [options.raw=false] Makes it so that we store the raw string value. Default is false.
	 */
	async set(key, value, options) {

		let strValue;

		if (options && options.raw) {
			strValue = value;
		} else {
			strValue = JSON.stringify(value);
		}

		this.dbCache[key] = value;

		fetch(this.url, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: encodeURIComponent(key) + "=" + encodeURIComponent(strValue),
		});

		return this;
	}

	/**
	 * Deletes a key
	 * @param {String} key Key
	 */
	async delete(key) {
		delete this.dbCache[key];
		await fetch(this.url + "/" + key, { method: "DELETE" });
		return this;
	}

	/**
	 * List key starting with a prefix or list all.
	 * @param {String} prefix Filter keys starting with prefix.
	 */
	async list(prefix = "") {
		let list = Object.keys(this.dbCache);

		return list.filter(key => key.startsWith(prefix));
	}

	/**
	 * List key starting with a prefix or list all without the cache.
	 * @param {String} prefix Filter keys starting with prefix.
	 */
	async listNoCache(prefix = "") {
		return await fetch(
		this.url + `?encode=true&prefix=${encodeURIComponent(prefix)}`
		)
		.then((r) => r.text())
		.then((t) => {
			if (t.length === 0) {
				return [];
			}
			return t.split("\n").map(decodeURIComponent);
		});
	}

	// Dynamic Functions
	/**
	 * Clears the database.
	 */
	async empty() {
		const promises = [];
		for (const key of await this.list()) {
			promises.push(this.delete(key));
		}

		await Promise.all(promises);

		return this;
	}

	/**
	 * Get all key/value pairs and return as an object
	 */
	async getAll() {
		let output = {};
		for (const key of await this.list()) {
			let value = await this.get(key);
			output[key] = value;
		}
		return output;
	}

	/**
	 * Get all key/value pairs and return as an object without the cache
	 */
	async getAllNoCache() {
		let output = {};
		for (const key of await this.listNoCache()) {
			let value = await this.getNoCache(key);
			output[key] = value;
		}
		return output;
	}

	/**
	 * Sets the entire database through an object.
	 * @param {Object} obj The object.
	 */
	async setAll(obj) {
		for (const key in obj) {
			let val = obj[key];
			await this.set(key, val);
		}
		return this;
	}

	/**
	 * Delete multiple entries by keys
	 * @param {Array<string>} args Keys
	 */
	async deleteMultiple(...args) {
		const promises = [];

		for (const arg of args) {
			promises.push(this.delete(arg));
		}

		await Promise.all(promises);

		return this;
	}
}

module.exports = new Client();
