Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let graceful_fs = require("graceful-fs");
let tedb_utils = require("tedb-utils");
//#region src/utils/TruncateFile.ts
var TruncateFile = (fd, len) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.ftruncate)(fd, len, (err) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: TruncateFile Error. " + err.message));
			else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/OpenFile.ts
var OpenFile = (path, flags, mode = 438) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.open)(path, flags, mode, (err, fd) => {
			if (err) resolve(false);
			else resolve(fd);
		});
	});
};
//#endregion
//#region src/utils/MakeDir.ts
var MakeDir = (path, mode = 511) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.mkdir)(path, mode, (err) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: MakeDir Error." + err.message));
			else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/CopyFile.ts
/**
* Byte-exact copy via the kernel (no userland read/parse/write round trip).
*
* Two deliberate behavior changes vs the old implementation:
* - No JSON parseability gate. A backup must preserve the previous generation
*   verbatim — corrupted or not — so the recovery paths (GetItem/Keys/Iterate)
*   stay the only place that decides what "unusable" means.
* - Any IO failure (including a missing source, e.g. the base file vanished
*   between the caller's existence check and the copy) rejects, so callers
*   abort the write instead of silently skipping the backup and breaking the
*   "past is the previous generation of base" invariant.
*/
var CopyFile = (src, dest) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.copyFile)(src, dest, (err) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: CopyFile Error. " + (err.message || err)));
			resolve(null);
		});
	});
};
//#endregion
//#region src/utils/AppendFile.ts
var AppendFile = (file, data, options) => {
	return new Promise((resolve, reject) => {
		const Options = {};
		if (!options) {
			Options.encoding = "utf8";
			Options.mode = 438;
			Options.flag = "a";
		} else {
			Options.encoding = options.encoding || "utf8";
			Options.mode = options.mode || 438;
			Options.flag = options.flag || "a";
		}
		(0, graceful_fs.appendFile)(file, data, Options, (err) => {
			if (err) reject(/* @__PURE__ */ new Error(":::Storage::: AppendFile Error. " + err.message));
			else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/CloseFile.ts
var CloseFile = (fd) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.close)(fd, (err) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: CloseFile Error. " + err.message));
			else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/FileStat.ts
var FileStat = (fd) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.fstat)(fd, (err, stats) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: FileStat Error. " + err.message));
			else resolve(stats);
		});
	});
};
//#endregion
//#region src/utils/FileSync.ts
var FileSync = (fd) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.fsync)(fd, (err) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: FileSync Error. " + err.message));
			else resolve(fd);
		});
	});
};
//#endregion
//#region src/utils/FlushStorage.ts
var FlushStorage = (options) => {
	return new Promise((resolve, reject) => {
		let filename;
		let flags;
		if (Object.prototype.toString.call(options) === "[object String]") {
			filename = options;
			flags = "r+";
		} else {
			options = options;
			filename = options.filename;
			flags = options.isDir ? "r" : "r+";
		}
		if (flags === "r" && process.platform === "win32") return resolve(null);
		let fileDesc;
		return OpenFile(filename, flags).then((fd) => {
			if (fd === false) return new Promise((res) => res(false));
			else {
				fileDesc = fd;
				return FileSync(fd);
			}
		}).then((res) => {
			if (res === false) return new Promise((r) => r(null));
			else return CloseFile(fileDesc);
		}).then(resolve).catch((err) => {
			reject(/* @__PURE__ */ new Error(":::Storage::: FlushStorage Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/WriteFile.ts
var WriteFile = (file, data, options) => {
	return new Promise((resolve, reject) => {
		const Options = {};
		if (!options) {
			Options.encoding = "utf8";
			Options.mode = 438;
			Options.flag = "w";
		} else {
			Options.encoding = options.encoding || "utf8";
			Options.mode = options.mode || 438;
			Options.flag = options.flag || "w";
		}
		(0, graceful_fs.writeFile)(file, data, Options, (err) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: WriteFile Error. " + err.message));
			else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/KeyedQueue.ts
/**
* Serializes asynchronous operations per key.
*
* Operations queued with the same key run strictly in submission order,
* operations with different keys run in parallel. The internal chain tail
* never rejects, so one failed operation does not block the operations
* queued behind it, while the promise returned to the caller still
* propagates that operation's own result or failure.
*/
var KeyedQueue = class {
	constructor() {
		this.chains = /* @__PURE__ */ new Map();
	}
	enqueue(key, operation) {
		const run = (this.chains.get(key) || Promise.resolve(null)).then(operation, operation);
		const swallowed = run.then(() => null, () => null);
		this.chains.set(key, swallowed);
		swallowed.then(() => {
			if (this.chains.get(key) === swallowed) this.chains.delete(key);
		});
		return run;
	}
	/**
	* Resolves once every operation that was queued at call time has settled.
	* Used as a barrier before whole-collection actions such as clear().
	*/
	pending() {
		return Promise.all(Array.from(this.chains.values())).then(() => null);
	}
};
//#endregion
//#region src/utils/SafeWrite.ts
var path$15 = require("path");
var tempCounter = 0;
/**
* Serializes writes per target path. Concurrent renames over the same file
* fail outright with EPERM on Windows, so writers targeting one file line up
* here instead of racing; writers to different files stay fully parallel.
*/
var writeQueues = new KeyedQueue();
/**
* Windows (and antivirus software) can transiently report EPERM/EACCES/EBUSY
* when renaming over an existing file — for example while a scanner holds a
* freshly created file. Retry with exponential backoff (25ms..~800ms) before
* surfacing the error.
*/
var renameWithRetry = (from, to, attempts = 6, delay = 25) => {
	return RenameFile(from, to).catch((err) => {
		if (err && (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY") && attempts > 1) return new Promise((res) => setTimeout(res, delay)).then(() => renameWithRetry(from, to, attempts - 1, delay * 2));
		throw err;
	});
};
var atomicWrite = async (filename, data, durability) => {
	const tempFile = `${filename}.tmp.${process.pid}.${tempCounter++}`;
	let fd = null;
	try {
		const handle = await graceful_fs.promises.open(tempFile, "w", 438);
		fd = handle.fd;
		if (typeof data === "string") await handle.write(data);
		else await handle.write(data);
		if (durability === "strict") await handle.sync();
		await handle.close();
		fd = null;
		await renameWithRetry(tempFile, filename);
		if (durability === "relaxed") return null;
		return await FlushStorage({
			filename: path$15.dirname(filename),
			isDir: true
		});
	} catch (err) {
		if (fd !== null) await new Promise((res) => (0, graceful_fs.close)(fd, () => res()));
		await new Promise((res) => (0, graceful_fs.unlink)(tempFile, () => res()));
		throw new Error(":::Storage::: SafeWrite Error. " + (err.message || err));
	}
};
/**
* Crash-safe file write: the data is written to a uniquely named sibling temp
* file, flushed to disk, then atomically renamed over the target. A crash or
* power loss mid-write can only leave behind a stale temp file — readers never
* observe a truncated or empty data file, which is what the old truncate-and-
* write approach could produce. Temp file names never end in ".db" so
* collection scans ignore any leftovers.
*
* `durability: 'relaxed'` skips the fsyncs (file + directory) while keeping
* the atomic rename: writes stay tear-free but a power loss may drop the most
* recent ones.
*/
var SafeWrite = (filename, data, durability = "strict") => {
	return writeQueues.enqueue(filename, () => atomicWrite(filename, data, durability));
};
//#endregion
//#region src/utils/safeReadFile.ts
/**
* Read a file, resolving `false` only when the file does not exist.
* Any other error (EACCES, EISDIR, ...) is rejected so callers can
* distinguish "missing" from "unreadable" — the old implementation
* silently reported every error on non-darwin platforms as "missing".
*/
var safeReadFile = (path, options) => {
	return new Promise((resolve, reject) => {
		const Options = {};
		if (!options) {
			Options.encoding = "utf8";
			Options.flag = "r";
		} else {
			Options.encoding = options.encoding || "utf8";
			Options.flag = options.flag || "r";
		}
		(0, graceful_fs.readFile)(path, Options, (err, data) => {
			if (err) {
				if (err.code === "ENOENT") resolve(false);
				else return reject(/* @__PURE__ */ new Error(":::Storage::: safeReadFile Error. " + err.message));
			} else resolve(data);
		});
	});
};
//#endregion
//#region src/utils/parseJSON.ts
var parseJSON = (data) => {
	return new Promise((resolve, reject) => {
		try {
			if (Object.prototype.toString.call(data) === "[object Object]") resolve(data);
			else if (Object.prototype.toString.call(data) === "[object Array]") resolve(data);
			else resolve(JSON.parse(data));
		} catch (e) {
			return reject(/* @__PURE__ */ new Error(":::Storage::: parseJSON Error. " + e));
		}
	});
};
//#endregion
//#region src/utils/stringifyJSON.ts
var stringifyJSON = (data) => {
	return new Promise((resolve, reject) => {
		try {
			if (Object.prototype.toString.call(data) === "[object String]") resolve(data);
			else resolve(JSON.stringify(data));
		} catch (e) {
			return reject(/* @__PURE__ */ new Error(":::Storage::: stringifyJSON Error. " + e.message));
		}
	});
};
//#endregion
//#region src/utils/EnsureDataFile.ts
var simpleWrite = (filename) => {
	return new Promise((resolve, reject) => {
		return WriteFile(filename, "").then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: simpleWrite Error. " + err.message));
		});
	});
};
var EnsureDataFile = (filename) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(filename).then((dataBool) => {
			if (dataBool === false) return simpleWrite(filename);
			else return new Promise((res) => res(null));
		}).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: EnsureDataFile Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/UnlinkFile.ts
/**
* Delete a file, tolerating a missing file (ENOENT) so "delete if exists"
* call sites stay simple. Every other error rejects — the old implementation
* resolved unconditionally, hiding real failures such as EPERM on Windows.
*/
var UnlinkFile = (path) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.unlink)(path, (err) => {
			if (err && err.code !== "ENOENT") return reject(/* @__PURE__ */ new Error(":::Storage::: UnlinkFile Error. " + err.message));
			resolve(null);
		});
	});
};
//#endregion
//#region src/utils/ReadDir.ts
var ReadDir = (path) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.readdir)(path, { encoding: "utf8" }, (err, files) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: ReadDir Error. " + err.message));
			else resolve(files);
		});
	});
};
//#endregion
//#region src/utils/RmDir.ts
var RmDir = (path) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.rmdir)(path, (err) => {
			if (err) {
				if (err.code === "ENOENT") resolve(null);
				else return reject(/* @__PURE__ */ new Error(":::Storage::: RmDir Error. " + err.message));
			} else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/LStat.ts
var LStat = (path) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.lstat)(path, (err, stats) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: LStat Error. " + err.message));
			resolve(stats);
		});
	});
};
//#endregion
//#region src/utils/ClearDirectory.ts
var path$14 = require("path");
var deleteFile = (dir, file) => {
	return new Promise((resolve, reject) => {
		const filePath = path$14.join(dir, file);
		LStat(filePath).then((stats) => {
			if (stats.isDirectory()) resolve(ClearDirectory(filePath));
			else resolve(UnlinkFile(filePath));
		}).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: deleteFile Error. " + err.message));
		});
	});
};
var ClearDirectory = (directory) => {
	return new Promise((resolve, reject) => {
		return ReadDir(directory).then((files) => {
			return mapPool(files, 128, (file) => deleteFile(directory, file));
		}).then(() => {
			return RmDir(directory);
		}).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: ClearDirectory Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/CopyAndWrite.ts
/**
* Used to copy a file and then write to the src new data.
* @param {string} dest
* @param {string} src
* @param data
* @param {TDurability} durability
* @returns {Promise<any>}
* @constructor
*/
var CopyAndWrite = (src, dest, data, durability = "strict") => {
	return new Promise((resolve, reject) => {
		return CopyFile(src, dest).then(() => SafeWrite(src, data, durability)).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: CopyAndWrite Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/WriteNewPastandBase.ts
var path$13 = require("path");
/**
* Main method
* Write data to past and current location
* @param {string} fileLocation
* @param {any} returnMany
* @param {string} baseLocation
* @param data
* @param {TDurability} durability
* @returns {Promise<any>}
* @constructor
*/
var WriteNewPastandBase = (fileLocation, returnMany, baseLocation, data, durability = "strict") => {
	return new Promise((resolve, reject) => {
		return SafeWrite(path$13.join(fileLocation, "past"), data, durability).then(() => SafeWrite(baseLocation, data, durability)).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: WriteNewPastandBase Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/MakeVersionDirPast.ts
/**
* Main Method
* Since the past directory does not exist a need to create the directory before writing is needed
* @param {string} fileLocation
* @param returnMany
* @param {string} data
* @returns {Promise<any>}
* @constructor
*/
var MakeVersionDirPast = (fileLocation, returnMany, data) => {
	return new Promise((resolve, reject) => {
		return MakeDir(fileLocation).then(() => returnMany(data)).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: MakeVersionDirPast Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/safeParse.ts
var safeParse = (data) => {
	return new Promise((resolve, reject) => {
		try {
			let json = JSON.parse(data);
			if (json.hasOwnProperty("type")) {
				if (json.type === "Buffer") {
					const buff = Buffer.from(JSON.parse(data).data);
					json = JSON.stringify(buff);
					json = JSON.parse(json);
				}
			}
			resolve(json);
		} catch (e) {
			resolve(false);
		}
	});
};
//#endregion
//#region src/utils/removeBackup.ts
var path$12 = require("path");
var unlinkAndRmDir = (file, dir) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(file).then(() => RmDir(dir)).then(resolve).catch(reject);
	});
};
/**
* Main method
* Should remove the backup directory and the backup file
* @param {string} dirLocation
* @returns {Promise<any>}
*/
var removeBackup = (dirLocation) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(dirLocation).then((bool) => {
			if (bool === false) return new Promise((res) => res(null));
			return unlinkAndRmDir(path$12.join(dirLocation, "past"), dirLocation);
		}).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: removeBackup Error. " + err.message));
		});
	});
};
//#endregion
//#region src/utils/ReadFile.ts
var ReadFile = (path, stats, options) => {
	return new Promise((resolve, reject) => {
		const Options = {};
		if (!options) {
			Options.encoding = "utf8";
			Options.flag = "r";
		} else {
			Options.encoding = options.encoding || "utf8";
			Options.flag = options.flag || "r";
		}
		(0, graceful_fs.readFile)(path, Options, (err, data) => {
			if (err) return reject(/* @__PURE__ */ new Error(":::Storage::: ReadFile Error. " + err.message));
			else {
				data = data;
				resolve(data);
			}
		});
	});
};
//#endregion
//#region src/utils/safeStat.ts
var safeStat = (path) => {
	return new Promise((resolve, reject) => {
		try {
			(0, graceful_fs.stat)(path, (err, stats) => {
				if (err) {
					if (err.code === "ENOENT") resolve(false);
					else return reject(err);
				} else resolve(stats);
			});
		} catch (e) {
			return reject(e);
		}
	});
};
//#endregion
//#region src/utils/safeDirExists.ts
var safeDirExists = (path) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.stat)(path, (err, stats) => {
			if (err) resolve(false);
			else resolve(stats.isDirectory());
		});
	});
};
//#endregion
//#region src/utils/safeRmDir.ts
var safeRmDir = (fileLocation) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(fileLocation).then((bool) => {
			if (bool === false) return new Promise((res) => res(void 0));
			else return RmDir(fileLocation);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/utils/RenameFile.ts
var RenameFile = (oldPath, newPath) => {
	return new Promise((resolve, reject) => {
		(0, graceful_fs.rename)(oldPath, newPath, (err) => {
			if (err) return reject(err);
			else resolve(null);
		});
	});
};
//#endregion
//#region src/utils/pool.ts
/**
* Upper bound on how many file descriptors a single collection-wide scan
* (keys/iterate/sanitize/clear) may hold open at once. Without a bound,
* scanning a large collection fires one read per file simultaneously and
* can exhaust the process fd limit long before graceful-fs kicks in.
* 128 keeps a 100k-file scan fd-safe while hiding per-open latency.
*/
var IO_LIMIT = 128;
/**
* Array.map with a concurrency cap: at most `limit` invocations of `fn` are
* in flight at any time, results keep their original positions, and the
* returned promise rejects with the first failure.
*/
var mapPool = async (items, limit, fn) => {
	const results = new Array(items.length);
	let next = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	const worker = async () => {
		while (true) {
			const index = next++;
			if (index >= items.length) return;
			results[index] = await fn(items[index], index);
		}
	};
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
};
//#endregion
//#region src/StorageDriver/GetItem.ts
var path$11 = require("path");
/**
* Remove the backup file and the backup directory - remove key from db
* base current file does not exist if this is called
* @param {string} fileLocation
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
*/
var deleteBackupFileAndDir$1 = (fileLocation, key, Storage) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$11.join(fileLocation, "past")).then(() => safeRmDir(fileLocation)).then(() => {
			Storage.untrackKey(key);
			resolve(void 0);
		}).catch(reject);
	});
};
/**
* The backup exists -> copy and move it over to the current location and resolve data
* @param {string} key
* @param {string} base
* @param {string} backup
* @param data
* @returns {Promise<any>}
*/
var copyAndReturn$1 = (key, base, backup, data) => {
	return new Promise((resolve, reject) => {
		return CopyFile(path$11.join(backup, "past"), path$11.join(base, `${key}.db`)).then(() => resolve(data)).catch(reject);
	});
};
var testBackupParse$1 = (rawData, baseLocation, fileLocation, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeParse(rawData).then((dataBool) => {
			if (dataBool === false) return deleteBackupFileAndDir$1(fileLocation, key, Storage);
			else return copyAndReturn$1(key, baseLocation, fileLocation, dataBool);
		}).then(resolve).catch(reject);
	});
};
/**
* Test if the backup file exists
* if So -> Test if readable and - parse - if parsable copy over to base else remove
* if Not -> Remove directory and remove key resolve nothing
* @param {string} baseLocation - current data
* @param {string} fileLocation - past data
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
*/
var testBackup$1 = (baseLocation, fileLocation, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$11.join(fileLocation, "past")).then((databool) => {
			if (databool === false) return unlinkeAndDir(baseLocation, fileLocation, key, Storage);
			else return testBackupParse$1(databool, baseLocation, fileLocation, key, Storage);
		}).then(resolve).catch(reject);
	});
};
var unlinkStorage = (base, key, Storage) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$11.join(base, `${key}.db`)).then(() => {
			Storage.untrackKey(key);
			resolve(void 0);
		}).catch(reject);
	});
};
var unlinkAll = (base, backup, key, Storage) => {
	return new Promise((resolve, reject) => {
		return deleteBackupFileAndDir$1(backup, key, Storage).then(() => UnlinkFile(path$11.join(base, `${key}.db`))).then(resolve).catch(reject);
	});
};
var unlinkeAndDir = (base, backup, key, Storage) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$11.join(base, `${key}.db`)).then(() => safeRmDir(backup)).then(() => {
			Storage.untrackKey(key);
			resolve(void 0);
		}).catch(reject);
	});
};
var readBackupFilesTestPARSE = (rawData, base, backup, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeParse(rawData).then((dataBool) => {
			if (dataBool === false) return unlinkAll(base, backup, key, Storage);
			else return copyAndReturn$1(key, base, backup, dataBool);
		}).then(resolve).catch(reject);
	});
};
var readBackupFileTest = (backup, base, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$11.join(backup, "past")).then((databool) => {
			if (databool === false) return unlinkeAndDir(base, backup, key, Storage);
			else return readBackupFilesTestPARSE(databool, base, backup, key, Storage);
		}).then(resolve).catch(reject);
	});
};
/**
* Checking backup data because current data file is unparsable
* Test if backup directory exists
* if So -> check if backup file exists
*      if So ->
*          readFile - parseData - is Readable?
*          if So -> Copy contents to current and resolve data
*          if Not -> Remove base file - remove backup file - remove dir - remove key
*      if Not -> remove backup dir - remove current data file - remove key
* if Not -> Remove base current file and remove key from db
* @param {string} base
* @param {string} backup
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
*/
var checkBackupAndReplace$1 = (base, backup, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(backup).then((bool) => {
			if (bool === false) return unlinkStorage(base, key, Storage);
			else return readBackupFileTest(backup, base, key, Storage);
		}).then(resolve).catch(reject);
	});
};
var testLocationAndReturnParse$1 = (rawData, base, backup, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeParse(rawData).then((dataBool) => {
			if (dataBool === false) return checkBackupAndReplace$1(base, backup, key, Storage);
			else return new Promise((res) => res(dataBool));
		}).then(resolve).catch(reject);
	});
};
var testFileLocation = (fileLocation, baseLocation, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(fileLocation).then((bool) => {
			if (bool === false) {
				Storage.untrackKey(key);
				return new Promise((res) => res(void 0));
			} else return testBackup$1(baseLocation, fileLocation, key, Storage);
		}).then(resolve).catch(reject);
	});
};
/**
* Base method
* Test if the base file IE the current file exists
* if So -> test if the location is readable
* if Not -> does the backup dir exist?
*  if So -> test backup if readable
*  if Not -> resolve nothing
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
* @constructor
*/
var GetItem = (key, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const fileLocation = path$11.join(baseLocation, Storage.version, "states", key);
		return safeReadFile(path$11.join(baseLocation, `${key}.db`)).then((databool) => {
			if (databool === false) return testFileLocation(fileLocation, baseLocation, key, Storage);
			else return testLocationAndReturnParse$1(databool, baseLocation, fileLocation, key, Storage);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/SetItem.ts
var path$10 = require("path");
/**
* Check backup file location and see if data is readable there.
* @param {string} fileLocation
* @param {string} baseLocation
* @param {string} data
* @param returnMany
* @param {boolean} lazyBackup
* @param {TDurability} durability
* @returns {Promise<any>}
*/
var checkNext$1 = (fileLocation, baseLocation, data, returnMany, lazyBackup, durability) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(fileLocation).then((bool) => {
			if (bool === false) {
				if (lazyBackup) return SafeWrite(baseLocation, data, durability);
				return MakeVersionDirPast(fileLocation, returnMany, data);
			}
			return WriteNewPastandBase(fileLocation, returnMany, baseLocation, data, durability);
		}).then(resolve).catch(reject);
	});
};
var makeDirCopy = (base, dir, data, durability = "strict") => {
	return new Promise((resolve, reject) => {
		return MakeDir(dir).then(() => CopyAndWrite(base, path$10.join(dir, "past"), data, durability)).then(resolve).catch(reject);
	});
};
var backupDirWrite = (base, dir, data, durability = "strict") => {
	return new Promise((resolve, reject) => {
		return safeDirExists(dir).then((bool) => {
			if (bool === false) return makeDirCopy(base, dir, data, durability);
			else return CopyAndWrite(base, path$10.join(dir, "past"), data, durability);
		}).then(resolve).catch(reject);
	});
};
/**
* Main method
* When setting an item it will check to see that the data can be converted back and forth
* from string to an object before trying to write. It will also move current file
* to the past location if the current file already exists. If not the current and past
* will be written with the current data. This should only happen once unless both files
* are removed.
* @param {string} key
* @param value
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
* @constructor
*/
var SetItem = (key, value, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const fileLocation = path$10.join(Storage.collectionPath, Storage.version, "states", key);
		/**
		* This is the method used when both files are missing -> write data to both files
		* @param {string} StringifiedJSON
		* @returns {Promise<any[]>}
		*/
		const returnMany = (StringifiedJSON) => {
			const allLocations = [path$10.join(baseLocation, `${key}.db`), path$10.join(fileLocation, "past")];
			return Promise.all(allLocations.map((writePath) => SafeWrite(writePath, StringifiedJSON, Storage.durability)));
		};
		let stringValue;
		return stringifyJSON(value).then((data) => {
			stringValue = data;
			return safeStat(path$10.join(baseLocation, `${key}.db`));
		}).then((statResult) => {
			if (statResult === false) return checkNext$1(fileLocation, path$10.join(baseLocation, `${key}.db`), stringValue, returnMany, Storage.lazyBackup, Storage.durability);
			else return backupDirWrite(path$10.join(baseLocation, `${key}.db`), fileLocation, stringValue, Storage.durability);
		}).then(() => {
			Storage.trackKey(key);
			return value;
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/Clear.ts
var Clear = (Storage) => {
	return ClearDirectory(Storage.collectionPath);
};
//#endregion
//#region src/StorageDriver/StoreIndex.ts
var path$9 = require("path");
/**
* Remove the base current file and write empty to backup location
* @param {string} base
* @param {string} backupDir
* @param {string} data
* @param {TDurability} durability
* @returns {Promise<null>}
*/
var removeBaseWriteBackup = (base, backupDir, data, durability) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(backupDir).then((bool) => {
			if (bool === false) return MakeDir(backupDir);
			else return new Promise((res) => res(null));
		}).then(() => UnlinkFile(base)).then(() => SafeWrite(path$9.join(backupDir, "past"), data, durability)).then(resolve).catch(reject);
	});
};
/**
* An empty index (the placeholder entry tedb keeps for an index with no keys)
* should not persist a base file. Detected by parsing instead of comparing
* serialized literals, which the old implementation did — it broke as soon as
* whitespace or key order differed.
* @param {string} index
* @returns {boolean}
*/
var indexCheck = (index) => {
	try {
		const parsed = JSON.parse(index);
		if (!Array.isArray(parsed) || parsed.length !== 1) return false;
		const entry = parsed[0];
		return entry !== null && typeof entry === "object" && entry.key === null && Array.isArray(entry.value) && entry.value.every((v) => v === null || v === void 0);
	} catch (e) {
		return false;
	}
};
var StoreIndex = (key, index, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const baseFile = path$9.join(baseLocation, `index_${key}.db`);
		const fileLocation = path$9.join(baseLocation, Storage.version, "states", `index_${key}`);
		/**
		* This is the method used when both are missing -> write data to both files
		* @param {string} StringifiedJSON
		* @returns {Promise<any[]>}
		*/
		const returnMany = (StringifiedJSON) => {
			const allLocations = [baseFile, path$9.join(fileLocation, "past")];
			return Promise.all(allLocations.map((writePath) => SafeWrite(writePath, StringifiedJSON, Storage.durability)));
		};
		let stringIndex;
		return stringifyJSON(index).then((data) => {
			stringIndex = data;
			return safeStat(baseFile);
		}).then((statResult) => {
			if (statResult !== false) {
				if (indexCheck(stringIndex)) return removeBaseWriteBackup(baseFile, fileLocation, stringIndex, Storage.durability);
				return backupDirWrite(baseFile, fileLocation, stringIndex, Storage.durability);
			}
			return safeDirExists(fileLocation).then((dirBool) => {
				if (dirBool === false) {
					if (indexCheck(stringIndex)) return removeBaseWriteBackup(baseFile, fileLocation, stringIndex, Storage.durability);
					if (Storage.lazyBackup) return SafeWrite(baseFile, stringIndex, Storage.durability);
					return MakeVersionDirPast(fileLocation, returnMany, stringIndex);
				}
				if (indexCheck(stringIndex)) return SafeWrite(path$9.join(fileLocation, "past"), stringIndex, Storage.durability);
				return WriteNewPastandBase(fileLocation, returnMany, baseFile, stringIndex, Storage.durability);
			});
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/FetchIndex.ts
var path$8 = require("path");
/**
* Remove the backup file and the backup directory
* base current file does not exist if this is called
* @param {string} dir
* @returns {Promise<any>}
*/
var deleteBackupFileAndDir = (dir) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$8.join(dir, "past")).then(() => safeRmDir(dir)).then(resolve).catch(reject);
	});
};
/**
* The backup exists -> copy and move it over to the current location and resolve data
* @param {string} key
* @param {string} base
* @param {string} dir
* @param data
* @returns {Promise<any>}
*/
var copyAndReturn = (key, base, dir, data) => {
	return new Promise((resolve, reject) => {
		return CopyFile(path$8.join(dir, "past"), path$8.join(base, `index_${key}.db`)).then(() => resolve(data)).catch(reject);
	});
};
var isBackupNull = (key, base, dir, data) => {
	return new Promise((resolve, reject) => {
		return stringifyJSON(data).then((stringData) => {
			if (indexCheck(stringData)) return deleteBackupFileAndDir(dir);
			else return copyAndReturn(key, base, dir, data);
		}).then(resolve).catch(reject);
	});
};
var isBackupNullBase = (key, base, dir, data) => {
	return new Promise((resolve, reject) => {
		return stringifyJSON(data).then((stringData) => {
			if (indexCheck(stringData)) return RemoveAll(base, dir, key);
			else return copyAndReturn(key, base, dir, data);
		}).then(resolve).catch(reject);
	});
};
var testBackupParse = (data, dir, key, base) => {
	return new Promise((resolve, reject) => {
		return safeParse(data).then((databool) => {
			if (databool === false) return deleteBackupFileAndDir(dir);
			else return isBackupNull(key, base, dir, databool);
		}).then(resolve).catch(reject);
	});
};
/**
* Test if the backup file exists
* if So -> Test if readable and - parse - if parsable copy over to base else remove
* if Not -> Remove directory and remove key resolve nothing
* @param {string} base
* @param {string} dir
* @param {string} key
* @returns {Promise<any>}
*/
var testBackup = (base, dir, key) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$8.join(dir, "past")).then((databool) => {
			if (databool === false) return safeRmDir(dir);
			else return testBackupParse(databool, dir, key, base);
		}).then(resolve).catch(reject);
	});
};
/**
* broken out remove all method
* @param {string} base
* @param {string} dir
* @param {string} key
* @returns {Promise<any>}
* @constructor
*/
var RemoveAll = (base, dir, key) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$8.join(base, `index_${key}.db`)).then(() => deleteBackupFileAndDir(dir)).then(resolve).catch(reject);
	});
};
var rmdirAndBase = (base, key, dir) => {
	return new Promise((resolve, reject) => {
		return safeRmDir(dir).then(() => UnlinkFile(path$8.join(base, `index_${key}.db`))).then(resolve).catch(reject);
	});
};
var nextFileCheckParse = (data, dir, base, key) => {
	return new Promise((resolve, reject) => {
		return safeParse(data).then((databool) => {
			if (databool === false) return RemoveAll(base, dir, key);
			else return isBackupNullBase(key, base, dir, databool);
		}).then(resolve).catch(reject);
	});
};
var nextFileCheck = (dir, base, key) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$8.join(dir, "past")).then((databool) => {
			if (databool === false) return rmdirAndBase(base, key, dir);
			else return nextFileCheckParse(databool, dir, base, key);
		}).then(resolve).catch(reject);
	});
};
/**
* Checking backup data because current data file is unparsable
* Test if backup directory exists
* if So -> check if backup file exists
*      if So ->
*          Readfile - parsedata - is readable
*              if So -> copy contents to current and resolve data
*              if Not -> remove base file - remove backup file - remove dir
*      if Not -> remove backup dir - remove current file
* if Not -> remove base current file
* @param {string} base
* @param {string} dir
* @param {string} key
* @returns {Promise<any>}
*/
var checkBackupAndReplace = (base, dir, key) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(dir).then((databool) => {
			if (databool === false) return UnlinkFile(path$8.join(base, `index_${key}.db`));
			else return nextFileCheck(dir, base, key);
		}).then(resolve).catch(reject);
	});
};
var testLocationAndReturnParse = (data, base, dir, key) => {
	return new Promise((resolve, reject) => {
		return safeParse(data).then((dataBool) => {
			if (dataBool === false) return checkBackupAndReplace(base, dir, key);
			else return new Promise((res) => res(dataBool));
		}).then(resolve).catch(reject);
	});
};
var readNext = (dirLocation, baseLocation, key) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(dirLocation).then((databool) => {
			if (databool === false) return new Promise((rs) => rs(void 0));
			else return testBackup(baseLocation, dirLocation, key);
		}).then(resolve).catch(reject);
	});
};
/**
* Base method
* Test if the base file IE the current fie exists
* if So -> test if the location is readable
* if Not -> does the backup dir exist?
*      if So -> test backup if readable
*      if Not -> resolve nothing
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
* @constructor
*/
var FetchIndex = (key, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const dirLocation = path$8.join(baseLocation, Storage.version, "states", `index_${key}`);
		return safeReadFile(path$8.join(baseLocation, `index_${key}.db`)).then((databool) => {
			if (databool === false) return readNext(dirLocation, baseLocation, key);
			else return testLocationAndReturnParse(databool, baseLocation, dirLocation, key);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/Iterate.ts
var path$7 = require("path");
var removeAll$2 = (current, backup) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$7.join(backup, "past")).then(() => RmDir(backup)).then(() => UnlinkFile(current)).then(resolve).catch(reject);
	});
};
var iterateAndReplace = (current, backup, iterator, data) => {
	return new Promise((resolve, reject) => {
		return CopyFile(path$7.join(backup, "past"), current).then(() => {
			if (data.hasOwnProperty("_id")) return iterator(data, data._id);
		}).then(resolve).catch(reject);
	});
};
var readandReplaceParse = (rawData, currentFile, backup, iterator) => {
	return new Promise((resolve, reject) => {
		return safeParse(rawData).then((dataBool) => {
			if (dataBool === false) return removeAll$2(currentFile, backup);
			else return iterateAndReplace(currentFile, backup, iterator, dataBool);
		}).then(resolve).catch(reject);
	});
};
var readAndReplace = (currentFile, backup, iterator) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$7.join(backup, "past")).then((rawData) => {
			if (rawData === false) return new Promise((rs) => rs(void 0));
			else return readandReplaceParse(rawData, currentFile, backup, iterator);
		}).then(resolve).catch(reject);
	});
};
var rmBoth = (backup, currentFile) => {
	return new Promise((resolve, reject) => {
		return RmDir(backup).then(() => UnlinkFile(currentFile)).then(resolve).catch(reject);
	});
};
var checkNext = (backup, currentFile, iterator) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$7.join(backup, "past")).then((databool) => {
			if (databool === false) return rmBoth(backup, currentFile);
			else return readAndReplace(currentFile, backup, iterator);
		}).then(resolve).catch(reject);
	});
};
var checkBackup = (currentFile, key, Storage, iterator) => {
	return new Promise((resolve, reject) => {
		const backup = path$7.join(Storage.collectionPath, Storage.version, "states", key);
		return safeDirExists(backup).then((databool) => {
			if (databool === false) return UnlinkFile(currentFile);
			else return checkNext(backup, currentFile, iterator);
		}).then(resolve).catch(reject);
	});
};
var continueReadParse = (data, key, filename, iterator, Storage) => {
	return new Promise((resolve, reject) => {
		return safeParse(data).then((dataBool) => {
			if (dataBool === false) return Storage.operationQueue.enqueue(key, () => checkBackup(filename, key, Storage, iterator));
			else if (dataBool.hasOwnProperty("_id")) return iterator(dataBool, dataBool._id);
			else return new Promise((res) => res(void 0));
		}).then(resolve).catch(reject);
	});
};
var readParseIterate = (filename, iterator, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(filename).then((data) => {
			if (data === false) return new Promise((rs) => rs(void 0));
			else return continueReadParse(data, key, filename, iterator, Storage);
		}).then(resolve).catch(reject);
	});
};
/**
* Keep only real document files: skip index files, the version directory and
* atomic-write temp files.
*/
var isDocumentFile$2 = (file) => {
	const name = String(file);
	return !name.includes("index_") && !name.includes("`v") && name.endsWith(".db");
};
var actualRead = (baseLocation, iteratorCallback, Storage) => {
	return new Promise((resolve, reject) => {
		let broken = false;
		return ReadDir(baseLocation).then((files) => {
			return mapPool(files.filter(isDocumentFile$2), 128, (file) => {
				if (broken) return Promise.resolve(null);
				const stringedFile = String(file);
				return readParseIterate(path$7.join(baseLocation, stringedFile), iteratorCallback, stringedFile.substr(0, stringedFile.indexOf(".")), Storage).then((cbResult) => {
					if (cbResult) broken = true;
					return cbResult;
				});
			});
		}).then(resolve).catch(reject);
	});
};
var Iterate = (iteratorCallback, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		return safeDirExists(baseLocation).then((databool) => {
			if (databool === false) {
				console.log(`:::Storage::: No directory at ${baseLocation}`);
				return new Promise((res) => res(void 0));
			} else return actualRead(baseLocation, iteratorCallback, Storage);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/Keys.ts
var path$6 = require("path");
var removeAll$1 = (dirLocation, base, key) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$6.join(dirLocation, key, "past")).then(() => RmDir(path$6.join(dirLocation, key))).then(() => UnlinkFile(path$6.join(base, `${key}.db`))).then(() => resolve([])).catch(reject);
	});
};
var removeJustbase = (base, key) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$6.join(base, `${key}.db`)).then(() => resolve([])).catch(reject);
	});
};
var RemoveDirectoryAndFile = (base, dirLocation, key) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(path$6.join(dirLocation, key)).then((bool) => {
			if (bool === false) return removeJustbase(base, key);
			else return removeAll$1(dirLocation, base, key);
		}).then(resolve).catch(reject);
	});
};
/**
* Write backup file data to current file location
* This is possible since the backup was not corrupted and the _id was retrievable.
* Using the id as the key to locate the current file path write its data to it and
* return the _id.
* @param fileData
* @param {string} baseLocation
* @returns {Promise<string[]>}
* @constructor
*/
var WriteBackupToBaseReturn = (fileData, baseLocation) => {
	return new Promise((resolve, reject) => {
		return stringifyJSON(fileData).then((str) => SafeWrite(path$6.join(baseLocation, `${fileData._id}.db`), str)).then(() => resolve([fileData._id])).catch(reject);
	});
};
var comboFileReadFMethod = (baseLocation, key) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$6.join(baseLocation, `${key}.db`)).then((rawData) => {
			if (rawData === false) resolve({
				key,
				rawData: "",
				read: false
			});
			else resolve({
				key,
				rawData,
				read: true
			});
		}).catch(reject);
	});
};
var comboFileReadMethod = (dirLocation, key) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path$6.join(dirLocation, key, "past")).then((rawData) => {
			if (rawData === false) resolve({
				key,
				rawData: "",
				read: false
			});
			else resolve({
				key,
				rawData,
				read: true
			});
		}).catch(reject);
	});
};
var comboFileParseMethod = (obj) => {
	return new Promise((resolve, reject) => {
		if (typeof obj.rawData === "string") obj.rawData = obj.rawData;
		else obj.rawData = "";
		return safeParse(obj.rawData).then((fileData) => resolve({
			key: obj.key,
			parsedData: fileData,
			read: obj.read
		})).catch(reject);
	});
};
var checkBackupFile$1 = (dirLocation, baseLocation, key) => {
	return new Promise((resolve, reject) => {
		return comboFileReadMethod(dirLocation, key).then((obj) => {
			if (obj.read === false) return new Promise((rs) => rs({
				key: obj.key,
				parsedData: obj.rawData,
				read: obj.read
			}));
			else return comboFileParseMethod(obj);
		}).then((fileData) => {
			if (fileData.parsedData === false) return RemoveDirectoryAndFile(baseLocation, dirLocation, fileData.key);
			else return WriteBackupToBaseReturn(fileData.parsedData, baseLocation);
		}).then((res) => resolve([res])).catch(reject);
	});
};
var checkBackupDir = (dirLocation, baseLocation, key) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(path$6.join(dirLocation, key)).then((bool) => {
			if (bool === false) return removeBaseButreturnDoubleArr(baseLocation, key);
			else return checkBackupFile$1(dirLocation, baseLocation, key);
		}).then(resolve).catch(reject);
	});
};
var removeBaseButreturnDoubleArr = (base, key) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path$6.join(base, `${key}.db`)).then(() => resolve([[]])).catch(reject);
	});
};
/**
* Read the backup file to see if it is parsable
* if So -> return the key and write data to current location
* if Not -> delete backup. Can not delete current without reference
* @param {string} dirLocation
* @param {string} baseLocation
* @param {IcomboParse} obj
* @returns {Promise<string[][]>}
*/
var readBackupLocation = (dirLocation, baseLocation, obj) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(dirLocation).then((bool) => {
			if (bool === false) return removeBaseButreturnDoubleArr(baseLocation, obj.key);
			else return checkBackupDir(dirLocation, baseLocation, obj.key);
		}).then(resolve).catch(reject);
	});
};
/**
* Keep only real document files: skip index files, the version directory and
* atomic-write temp files (their names never end in ".db").
*/
var isDocumentFile$1 = (file) => {
	const name = String(file);
	return !name.includes("index_") && !name.includes("`v") && name.endsWith(".db");
};
var keyFromFilename = (file) => {
	const name = String(file);
	return name.substr(0, name.indexOf("."));
};
var readAllDir = (baseLocation, dirLocation, Storage) => {
	return new Promise((resolve, reject) => {
		return ReadDir(baseLocation).then((files) => {
			return mapPool(files.filter(isDocumentFile$1), 128, (dbFile) => {
				return comboFileReadFMethod(baseLocation, keyFromFilename(dbFile));
			});
		}).then((filesRawData) => {
			return mapPool(filesRawData, 128, (obj) => {
				if (obj.read === false) return new Promise((rs) => rs({
					key: obj.key,
					parsedData: obj.rawData,
					read: obj.read
				}));
				else return comboFileParseMethod(obj);
			});
		}).then((filesData) => {
			return mapPool(filesData, 128, (fd) => {
				if (fd.parsedData === false) return Storage.operationQueue.enqueue(fd.key, () => readBackupLocation(dirLocation, baseLocation, fd));
				else return new Promise((res) => res([[fd.parsedData._id]]));
			});
		}).then((keys) => {
			const incomingKeys = (0, tedb_utils.flattenArr)(keys);
			resolve((0, tedb_utils.rmArrDups)([...Storage.allKeys, ...incomingKeys]));
		}).catch(reject);
	});
};
/**
* Search for keys. If a key is found test to see if it is parsable. If not search
* backup location and test if that file is parsable. If not then return null.
* If so then copy backup to baseLocation then return the backup.
* @param {string} baseLocation
* @param {string} dirLocation
* @param {IStorageDriverExtended} Storage
* @returns {Promise<string[]>}
*/
var readKeysSafety = (baseLocation, dirLocation, Storage) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(baseLocation).then((bool) => {
			if (bool === false) return new Promise((res) => res([]));
			else return readAllDir(baseLocation, dirLocation, Storage);
		}).then((keys) => {
			keys = keys.filter((k) => k !== void 0);
			resolve(keys);
		}).catch(reject);
	});
};
var readAllLocations = (base, dir, Storage) => {
	return new Promise((resolve, reject) => {
		return ReadDir(base).then((files) => {
			const diskKeys = files.filter(isDocumentFile$1).map(keyFromFilename);
			const cacheSet = new Set(Storage.allKeys);
			const diskSet = new Set(diskKeys);
			let matchesCache = diskSet.size === cacheSet.size;
			if (matchesCache) {
				for (const k of diskSet) if (!cacheSet.has(k)) {
					matchesCache = false;
					break;
				}
			}
			if (matchesCache) return new Promise((res) => res(Storage.allKeys));
			else return readKeysSafety(base, dir, Storage);
		}).then(resolve).catch(reject);
	});
};
var checkKeysLocations = (base, dir, Storage) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(base).then((bool) => {
			if (bool === false) return new Promise((res) => res([]));
			else return readAllLocations(base, dir, Storage);
		}).then((keys) => {
			resolve(keys.filter((k) => k !== void 0));
		}).catch(reject);
	});
};
/**
* Main method
* Keys is a method that should return all the file keys
* The storage Driver does hold the keys in memory but many occurrences
* may remove a file from the file system and not remove the key from the
* Storage driver
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
* @constructor
*/
var Keys = (Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const dirLocation = path$6.join(baseLocation, Storage.version, "states");
		if (Storage.allKeys.length === 0) return readKeysSafety(baseLocation, dirLocation, Storage).then(resolve).catch(reject);
		else return checkKeysLocations(baseLocation, dirLocation, Storage).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/RemoveItem.ts
var path$5 = require("path");
/**
* remove the key from all keys on the Storage driver class
* and remove the backup file
* @param {string} key
* @param {string} fileLocation
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
*/
var doesNotExist = (key, fileLocation, Storage) => {
	return new Promise((resolve, reject) => {
		Storage.untrackKey(key);
		return removeBackup(fileLocation).then(resolve).catch(reject);
	});
};
/**
* Remove both backup and current file then the key off the storage driver class
* @param {string} key
* @param {string} baseLocation
* @param {string} fileLocation
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
*/
var doesExist$1 = (key, baseLocation, fileLocation, Storage) => {
	return new Promise((resolve, reject) => {
		return removeBackup(fileLocation).then(() => UnlinkFile(path$5.join(baseLocation, `${key}.db`))).then(() => {
			Storage.untrackKey(key);
			resolve(void 0);
		}).catch(reject);
	});
};
/**
* Main method
* removing an item should also remove the backup.
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
* @constructor
*/
var RemoveItem = (key, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const fileLocation = path$5.join(baseLocation, Storage.version, "states", key);
		return safeStat(path$5.join(baseLocation, `${key}.db`)).then((statResult) => {
			if (statResult === false) return doesNotExist(key, fileLocation, Storage);
			else return doesExist$1(key, baseLocation, fileLocation, Storage);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/RemoveIndex.ts
var path$4 = require("path");
/**
* Since the file does exist remove backup directory and file + the current file
* @param {string} fileLocation
* @param {string} baseLocation
* @param {string} key
* @returns {Promise<any>}
*/
var doesExist = (fileLocation, baseLocation, key) => {
	return new Promise((resolve, reject) => {
		return removeBackup(fileLocation).then(() => UnlinkFile(path$4.join(baseLocation, `index_${key}.db`))).then(resolve).catch(reject);
	});
};
/**
* Main method
* removing an index should also remove its backup
* @param {string} key
* @param {IStorageDriverExtended} Storage
* @returns {Promise<any>}
* @constructor
*/
var RemoveIndex = (key, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const fileLocation = path$4.join(baseLocation, Storage.version, "states", `index_${key}`);
		return safeStat(path$4.join(baseLocation, `index_${key}.db`)).then((statResult) => {
			if (statResult === false) return removeBackup(fileLocation);
			else return doesExist(fileLocation, baseLocation, key);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/AppDirectory/index.ts
var os = require("os");
var path$3 = require("path");
var AppDirectory = class {
	constructor(colName, dir) {
		this.col = colName;
		this.platform = os.platform();
		this.dir = dir;
	}
	userData() {
		let dataPath;
		if (this.dir != "" && this.dir != null && this.dir.length > 0) return path$3.join(`${this.dir}`, `${this.col}`);
		if (this.platform === "darwin") dataPath = path$3.join(os.homedir(), "Library", "Application Support", `${this.col}`);
		else if (this.platform === "win32") dataPath = path$3.join(os.homedir(), "AppData", "Local", `${this.col}`);
		else if (this.platform === "linux") dataPath = path$3.join(os.homedir(), ".local", "share", `${this.col}`);
		else dataPath = "";
		return dataPath;
	}
};
//#endregion
//#region src/StorageDriver/Driver.ts
var path$2 = require("path");
var ElectronStorage = class {
	/**
	* @param {string} db - database name (top level directory under the data dir)
	* @param {string} collection - collection name (sub directory of db)
	* @param {string} [dir] - optional custom data directory; defaults to the
	*        OS user-data location (e.g. ~/AppData/Local/<db> on Windows)
	* @param {IElectronStorageOptions} [options] - `durability: 'strict'` (default)
	*        fsyncs every write; `'relaxed'` skips fsyncs but keeps atomic
	*        renames — tear-free, faster, may lose the last writes on power loss.
	*        `lazyBackup` (default true) creates the past backup on a key's first
	*        update instead of its first write; `false` restores the legacy
	*        first-write-duplicates behavior
	*/
	constructor(db, collection, dir, options) {
		this.dbName = db;
		this.collection = collection;
		this.appDirectory = new AppDirectory(db, dir == null ? null : dir);
		this.operationQueue = new KeyedQueue();
		this.durability = options?.durability ?? "strict";
		this.lazyBackup = options?.lazyBackup ?? true;
		this.allKeys = [];
		this.allKeysSet = /* @__PURE__ */ new Set();
		this.collectionPath = "";
		this.version = "";
		this.ensureDirs();
	}
	/**
	* Record a persisted key. O(1) via the Set mirror; the array is kept for
	* order-stable public access to allKeys.
	*/
	trackKey(key) {
		if (!this.allKeysSet.has(key)) {
			this.allKeysSet.add(key);
			this.allKeys.push(key);
		}
	}
	/**
	* Drop a key after its files are gone. The Set guard makes repeats and
	* never-tracked keys no-ops without rescanning the array.
	*/
	untrackKey(key) {
		if (this.allKeysSet.delete(key)) {
			const i = this.allKeys.indexOf(key);
			if (i !== -1) this.allKeys.splice(i, 1);
		}
	}
	/**
	* Create the on-disk skeleton for this collection. Safe to call again
	* after clear() wiped the directory. `version` keeps its leading backtick
	* on purpose: it is the on-disk layout marker that collection scans
	* (Keys/Iterate/CollectionSanitize) filter on.
	*/
	ensureDirs() {
		const userData = this.appDirectory.userData();
		(0, graceful_fs.mkdirSync)(userData, { recursive: true });
		this.collectionPath = path$2.join(userData, "db", this.collection);
		this.version = "`v0.0.1";
		(0, graceful_fs.mkdirSync)(path$2.join(this.collectionPath, this.version, "states"), { recursive: true });
	}
	setItem(key, value) {
		return this.operationQueue.enqueue(key, () => SetItem(key, value, this));
	}
	getItem(key) {
		return this.operationQueue.enqueue(key, () => GetItem(key, this));
	}
	removeItem(key) {
		return this.operationQueue.enqueue(key, () => RemoveItem(key, this));
	}
	storeIndex(key, index) {
		return this.operationQueue.enqueue(`index_${key}`, () => StoreIndex(key, index, this));
	}
	fetchIndex(key) {
		return this.operationQueue.enqueue(`index_${key}`, () => FetchIndex(key, this));
	}
	removeIndex(key) {
		return this.operationQueue.enqueue(`index_${key}`, () => RemoveIndex(key, this));
	}
	iterate(iteratorCallback) {
		return Iterate(iteratorCallback, this);
	}
	keys() {
		return Keys(this);
	}
	exists(obj, index, fieldName) {
		return this.operationQueue.enqueue(String(obj.value), () => Exists(obj, index, fieldName, this));
	}
	collectionSanitize(keys) {
		return CollectionSanitize(keys, this);
	}
	clear() {
		return this.operationQueue.pending().then(() => Clear(this)).then(() => {
			this.allKeys = [];
			this.allKeysSet = /* @__PURE__ */ new Set();
			this.ensureDirs();
			return null;
		});
	}
};
//#endregion
//#region src/StorageDriver/CollectionSanitize.ts
var path$1 = require("path");
var removeAll = (dirLocation, base, key, Storage) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(path$1.join(dirLocation, key)).then((bool) => {
			if (bool === false) return UnlinkFile(path$1.join(base, `${key}.db`));
			else return UnlinkFile(path$1.join(dirLocation, key, "past")).then(() => RmDir(path$1.join(dirLocation, key))).then(() => UnlinkFile(path$1.join(base, `${key}.db`)));
		}).then(() => {
			Storage.untrackKey(key);
			resolve(null);
		}).catch(reject);
	});
};
/**
* Keep only real document files: skip index files, the version directory and
* atomic-write temp files.
*/
var isDocumentFile = (file) => {
	const name = String(file);
	return !name.includes("index_") && !name.includes("`v") && name.endsWith(".db");
};
var checkDir = (keys, base, dir, Storage) => {
	return new Promise((resolve, reject) => {
		return ReadDir(base).then((files) => {
			return mapPool(files.filter(isDocumentFile).map((file) => {
				return String(file).substr(0, String(file).indexOf("."));
			}).filter((key) => keys.indexOf(key) === -1), 128, (key) => {
				return Storage.operationQueue.enqueue(key, () => removeAll(dir, base, key, Storage));
			});
		}).then(() => resolve(null)).catch(reject);
	});
};
var CollectionSanitize = (keys, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const dirLocation = path$1.join(baseLocation, Storage.version, "states");
		return safeDirExists(baseLocation).then((bool) => {
			if (bool === false) return new Promise((res) => res(null));
			else return checkDir(keys, baseLocation, dirLocation, Storage);
		}).then(resolve).catch(reject);
	});
};
//#endregion
//#region src/StorageDriver/Exists.ts
var path = require("path");
var removeBackupDirAndFalse = (obj, dir, index, fieldName) => {
	return new Promise((resolve, reject) => {
		return RmDir(dir).then(() => resolve({
			key: obj.key,
			value: obj.value,
			doesExist: false,
			index,
			fieldName
		})).catch(reject);
	});
};
var backUpFileAndDir = (obj, dir, index, fieldName) => {
	return new Promise((resolve, reject) => {
		return UnlinkFile(path.join(dir, "past")).then(() => removeBackupDirAndFalse(obj, dir, index, fieldName)).then(resolve).catch(reject);
	});
};
var readParsable = (obj, data, dir, base, index, fieldName) => {
	return new Promise((resolve, reject) => {
		return safeParse(data).then((databool) => {
			if (databool === false) return backUpFileAndDir(obj, dir, index, fieldName);
			else return new Promise((res) => res({
				key: obj.key,
				value: obj.value,
				doesExist: true,
				index,
				fieldName
			}));
		}).then(resolve).catch(reject);
	});
};
var checkBackupFile = (obj, dir, base, index, fieldName) => {
	return new Promise((resolve, reject) => {
		return safeReadFile(path.join(dir, "past")).then((booldata) => {
			if (booldata === false) return removeBackupDirAndFalse(obj, dir, index, fieldName);
			else return readParsable(obj, booldata, dir, base, index, fieldName);
		}).then(resolve).catch(reject);
	});
};
var readBackupRemoveParse = (obj, dir, base, index, fieldName) => {
	return new Promise((resolve, reject) => {
		return safeDirExists(dir).then((bool) => {
			if (bool === false) return new Promise((res) => res({
				key: obj.key,
				value: obj.value,
				doesExist: false,
				index,
				fieldName
			}));
			else return checkBackupFile(obj, dir, base, index, fieldName);
		}).then(resolve).catch(reject);
	});
};
var readAndRemoveParse = (rawData, obj, index, fieldName) => {
	return new Promise((resolve, reject) => {
		return safeParse(rawData).then((dataBool) => {
			if (dataBool === false) return new Promise((res) => res({
				key: obj.key,
				value: obj.value,
				doesExist: false,
				index,
				fieldName
			}));
			else return new Promise((res) => res({
				key: obj.key,
				value: obj.value,
				doesExist: true,
				index,
				fieldName
			}));
		}).then(resolve).catch(reject);
	});
};
/**
* Should act as a find where if an item does not exist check the backup file
* If the backup exists replace if parsable. If unparsable remove backup
* and send back that the file does not exist.
*
* Should only remove files if intended to send back false
* @param {Isanitize} obj
* @param index
* @param {string} fieldName
* @param {IStorageDriverExtended} Storage
* @returns {Promise<Iexist>}
* @constructor
*/
var Exists = (obj, index, fieldName, Storage) => {
	return new Promise((resolve, reject) => {
		const baseLocation = Storage.collectionPath;
		const basePath = path.join(baseLocation, `${obj.value}.db`);
		const dirLoaction = path.join(baseLocation, Storage.version, "states", `${obj.value}`);
		return safeReadFile(basePath).then((databool) => {
			if (databool === false) return readBackupRemoveParse(obj, dirLoaction, baseLocation, index, fieldName);
			else return readAndRemoveParse(databool, obj, index, fieldName);
		}).then(resolve).catch((err) => {
			return reject(/* @__PURE__ */ new Error(":::Storage::: Exists Error. " + err.message));
		});
	});
};
//#endregion
exports.AppDirectory = AppDirectory;
exports.AppendFile = AppendFile;
exports.Clear = Clear;
exports.ClearDirectory = ClearDirectory;
exports.CloseFile = CloseFile;
exports.CopyAndWrite = CopyAndWrite;
exports.CopyFile = CopyFile;
exports.ElectronStorage = ElectronStorage;
exports.EnsureDataFile = EnsureDataFile;
exports.FetchIndex = FetchIndex;
exports.FileStat = FileStat;
exports.FileSync = FileSync;
exports.FlushStorage = FlushStorage;
exports.GetItem = GetItem;
exports.IO_LIMIT = IO_LIMIT;
exports.Iterate = Iterate;
exports.KeyedQueue = KeyedQueue;
exports.Keys = Keys;
exports.LStat = LStat;
exports.MakeDir = MakeDir;
exports.MakeVersionDirPast = MakeVersionDirPast;
exports.OpenFile = OpenFile;
exports.ReadDir = ReadDir;
exports.ReadFile = ReadFile;
exports.RemoveIndex = RemoveIndex;
exports.RemoveItem = RemoveItem;
exports.RenameFile = RenameFile;
exports.RmDir = RmDir;
exports.SafeWrite = SafeWrite;
exports.SetItem = SetItem;
exports.StoreIndex = StoreIndex;
exports.TruncateFile = TruncateFile;
exports.UnlinkFile = UnlinkFile;
exports.WriteFile = WriteFile;
exports.WriteNewPastandBase = WriteNewPastandBase;
exports.indexCheck = indexCheck;
exports.mapPool = mapPool;
exports.parseJSON = parseJSON;
exports.removeBackup = removeBackup;
exports.safeDirExists = safeDirExists;
exports.safeParse = safeParse;
exports.safeReadFile = safeReadFile;
exports.safeRmDir = safeRmDir;
exports.safeStat = safeStat;
exports.stringifyJSON = stringifyJSON;

//# sourceMappingURL=index.js.map