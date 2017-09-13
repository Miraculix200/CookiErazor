"use strict";

/* ################################################################################################## */
/* ################################################################################################## */
/* ################################################################################################## */
/* 

CookiErazor by gab.ai/miraculix

*/
/* ################################################################################################## */
/* ################################################################################################## */
/* ################################################################################################## */

const DEBUG = false;

var gDeleteCookiesAllStores = true;
var gDisableUntilRestart = false;
var gDeleteTabCookiesStrict = false;
var gDisplayNotifications = true;

/* ################################################################################################## */

var gDisplayNotificationSwitch = false;
var gActiveTab = null;

/* ################################################################################################## */

const VERSION = browser.runtime.getManifest().version;
const DEFAULT_COOKIE_STORE = "firefox-default";

const COOKIE_ACCEPT_PERMANENT = 10;
const COOKIE_ACCEPT_SESSION = 11;
const COOKIE_ACCEPT_TAB = 12;

const LOG_DELETE_REASON_NEW_SESSION = 10;
const LOG_DELETE_REASON_MANUAL = 11;
const LOG_DELETE_REASON_TAB_CLOSED = 12;

const ICON_TAB = "icons/CM-reject.png";
const ICON_SESSION = "icons/CM-session.png";
const ICON_PERMANENT = "icons/CM-allow.png";
const ICON_DEFAULT = "icons/cr.fw.png";

const ICON_TITLE_DEFAULT = "CookiErazor v" + VERSION;
const ICON_TITLE_TAB = "CookiErazor v" + VERSION + "\nCookies for this site will be deleted when closing tab";
const ICON_TITLE_SESSION = "CookiErazor v" + VERSION + "\nCookies for this site will be deleted when restarting the browser";
const ICON_TITLE_PERMANENT = "CookiErazor v" + VERSION + "\nCookies for this site will be kept permanently";

/* ################################################################################################## */
/* ################################################################################################## */
/* ################################################################################################## */

var debugLog = DEBUG ? console.log : () => { return null; };

/* ################################################################################################## */
/* ################################################################################################## */

// keep compatibility with older browsers
window.requestIdleCallback = window.requestIdleCallback || function(handler) {
  let startTime = Date.now();
  return setTimeout(function() {
    handler({
      didTimeout: false,
      timeRemaining: function() {
        return Math.max(0, 50.0 - (Date.now() - startTime));
      }
    });
  }, 1);
}

window.cancelIdleCallback = window.cancelIdleCallback || function(id) {
  clearTimeout(id);
}

/* ################################################################################################## */
/* ################################################################################################## */

const razorCookies = {

	_tabCookieHeaders: [],
	_tabCookies: [],
	_tabStores: [],
	_javascriptCookies: [],
	_counterDeletedCookies: 0,
	_idResetCounterDeletedCookies: null,
	_idIdleCbHandleChangedCookies: null, // mess
	_idTimeoutIdleCb: null, // mess
	_tasksHandleChangedCookies: [],// mess
	_loggedDeletedCookies: [],
	_maxLogSize: 200,

	getLog: () => {
		return razorCookies._loggedDeletedCookies;
	},

	trimCookies: async (manual) => { // optimize me

		let testfound = false;
		let cookie_stores = [DEFAULT_COOKIE_STORE];
		let reason = manual ? LOG_DELETE_REASON_MANUAL : LOG_DELETE_REASON_NEW_SESSION;

		if (gDeleteCookiesAllStores)
		{
			cookie_stores = [];
			let stores = await browser.cookies.getAllCookieStores();
			for(let store of stores) cookie_stores.push(store.id);
			if (browser.contextualIdentities)
			{
				let contexts = await browser.contextualIdentities.query({});
			 	for (let context of contexts) cookie_stores.push(context.cookieStoreId);
			}
		}
		
		let settings = await domainPerms.getSettingsAsync();
		for (let store_id of cookie_stores)
		{
			let cookies = await  browser.cookies.getAll({storeId: store_id});
			for (let cookie of cookies) 
			{
				testfound = false;
				for (let setting of settings.perms)
				{

					if (cookie.domain.indexOf(setting.hst) != -1)
					{
						if (domainConversion.stripDot(cookie.domain) != setting.hst) // deal with false positives
						{				
							if (domainConversion.hostnameToSld(cookie.domain) != setting.hst) {
								continue; // false positive detected
							}
						} 

						if (setting.prm == COOKIE_ACCEPT_PERMANENT)
						{
							//debugLog("found " + cookie.domain);
							testfound = true;
						} else {
							gDisplayNotificationSwitch = true;
							razorCookies.deleteStoreCookie(store_id, cookie.domain, cookie.path, cookie.name, cookie.secure, reason);
						}
						break;
					} 
				}
				// cookie domain not found in permissions 
				if (!testfound) {
					gDisplayNotificationSwitch = true;
					razorCookies.deleteStoreCookie(store_id, cookie.domain, cookie.path, cookie.name, cookie.secure, reason);
				}
			}
		}
	},

	showDeletedCookieCount: () => {

		if (razorCookies._idResetCounterDeletedCookies != null)
		{
			window.clearTimeout(razorCookies._idResetCounterDeletedCookies);
		}

		window.setTimeout(() => {
			if (razorCookies._counterDeletedCookies == 0) return;
			debugLog("Deleted " + razorCookies._counterDeletedCookies + " cookies");

			if (gDisplayNotificationSwitch) {
				razorNotification.display("Deleted " + razorCookies._counterDeletedCookies + " cookies", 5555);
				gDisplayNotificationSwitch = false;
			}

			razorCookies._counterDeletedCookies = 0;
			razorCookies._idResetCounterDeletedCookies = null;
		}, 1000);
	},

	deleteStoreCookie: (store_id, domain, path, name, secure, reason) => {
		let proto = secure ? "https://" : "http://";
		razorCookies.deleteCookie(store_id, proto + domain + path, name, reason);
	},

	deleteCookie: (store_id, url, name, reason) => {

		let removing = browser.cookies.remove({
		    url: url,
		    storeId: store_id,
		    name: name
	 	});

	 	removing.then((c) => {
	 		if (c == null) {
		 		console.warn("FAILED to delete cookie: " + url + " name: " + name + " from " + store_id + " (probably already deleted)");
	 		} else {
		 		razorCookies._counterDeletedCookies++;
		 		debugLog("deleted: " + url + " name: " + name + " from " + store_id + " (" +
		 			razorCookies._counterDeletedCookies + ")");
		 		razorCookies._loggedDeletedCookies.push({
		 			name: c.name,
		 			url: c.url,
		 			storeId: c.storeId,
		 			time: Date.now(),
		 			reason: reason || "unknown"
		 		});

		 		if (razorCookies._loggedDeletedCookies.length > razorCookies._maxLogSize) 
		 			razorCookies._loggedDeletedCookies.splice(0,1);

		 		razorCookies.showDeletedCookieCount();
	 		}
	 	}, null );
	},
	deleteAllCookiesForSld: async (sld, store_id, reason) => {
		let cookies = await browser.cookies.getAll({ domain: sld, storeId: store_id });
		for (let cookie of cookies)
		{
			razorCookies.deleteStoreCookie(store_id, cookie.domain, cookie.path, cookie.name, cookie.secure, reason);
		}
	},

	deleteUnknownTabCookies: () => {
		let get_tabs = browser.tabs.query({}).then( (tabs) => {
			let ids = [];
			for (let tab of tabs) {
				ids.push(tab.id);
			}

			let keys = Object.keys(razorCookies._javascriptCookies);

			for (let k of keys)
			{

				let cookie = razorCookies._javascriptCookies[k];

				for (let id of cookie.tabs)
				{
					if (!ids.includes(id))
					{						
						cookie.tabs.splice(cookie.tabs.indexOf(id));
					}
				}

				if (gDeleteTabCookiesStrict || cookie.tabs.length < 1) { // all tabs which were open when cookie was created are removed

					debugLog("fix me: only delete cookie for appropriate store\ndelete javascript/unk tab " + cookie.name);

					for (let store of cookie.stores)
					{
						razorCookies.deleteStoreCookie(
							store,
							cookie.domain, 
							cookie.path, 
							cookie.name, 
							cookie.secure,
							LOG_DELETE_REASON_TAB_CLOSED
						);
					}
					razorCookies._javascriptCookies[k] = null;
					delete razorCookies._javascriptCookies[k];
				}
			}

			if (Object.keys(razorCookies._javascriptCookies).length == 0) {
				debugLog("re-intializing array razorCookies._javascriptCookies");
				razorCookies._javascriptCookies = [];
			}
		});
	},

	deleteTabCookies: async (tabId) => {

		if (gDisableUntilRestart) return;

		let keys = Object.keys(razorCookies._tabCookies);
		for (let key of keys)
		{
			let tmp_array = [];
			for (let cookie of razorCookies._tabCookies[key])
			{
				if (cookie.tabids.includes(tabId))
				{
					debugLog("found cookies @ tabid: " + tabId);
					cookie.tabids.splice(cookie.tabids.indexOf(tabId));
					if (cookie.tabids.length === 0)
					{
						for (let store of cookie.cstores)
						{
							razorCookies.deleteStoreCookie(store, cookie.domain, cookie.path, cookie.name, cookie.secure, LOG_DELETE_REASON_TAB_CLOSED);
						}
					} else {
						tmp_array.push(cookie);
					}
				} else tmp_array.push(cookie);
			}

			razorCookies._tabCookies[key] = tmp_array.slice();

			if (razorCookies._tabCookies[key].length < 1) {
				debugLog("delete key " + key);
				delete razorCookies._tabCookies[key];
			}
		}

		keys = Object.keys(razorCookies._tabCookies);

		if (keys.length == 0)
		{
			razorCookies._tabCookies = []; // 4 garbage collection? 
		}
	},

	headerLineToCookie: (header_line, url) => {
		let secure = false;
		let params = header_line.split(";");
		let name = "";
		let path = "";
		let domain = "";

		for (let i=0; i<params.length; i++)
		{
			if (i == 0) {
				let idx = params[i].indexOf("=");
				name = params[i].substring(0, idx);
			} else
			if (params[i].toLowerCase().trim() == "secure") secure = true;
			else {
				let kvp = params[i].split("=");
				let k = kvp[0].toLowerCase().trim();
				if (k == "path") path = kvp[1].trim(); // trim probably useless
				else if (k == "domain") domain = kvp[1].trim();// trim probably useless
			}
		}

		if (domain == "") domain = domainConversion.urlStringToHostname(url);
		return {name: name, secure: secure, domain: domain, path: path};
	},

	headerToCookies: (header, url) => {

		let cookies = [];
		let lines = header.split("\n");
		for (let line of lines) cookies.push(razorCookies.headerLineToCookie(line, url));
		return cookies;
	},

	getCookieStore: async (tab_id) => {
		// todo: handle cookiestore change in tab, if possible to change cookiestore
		if (razorCookies._tabStores["id" + tab_id] != undefined) {
			return razorCookies._tabStores["id" + tab_id];
		}
		let info = await browser.tabs.get(tab_id);
		razorCookies._tabStores["id" + tab_id] = info.cookieStoreId;
		return info.cookieStoreId;
	},

	getTrackedCookies: async (tracked_cookies) => {
		debugLog("deleting _tabCookieHeaders");
		let tmp_headers = razorCookies._tabCookieHeaders.slice(); // failed to find bug fix
		razorCookies._tabCookieHeaders = [];
		let settings = await domainPerms.getSettingsAsync();
		for (let tab_header of tmp_headers)
		{
			let header_cookies = razorCookies.headerToCookies(tab_header.header, tab_header.url);
			for (let cookie of header_cookies)
			{
				let domain = domainConversion.stripDot(cookie.domain);
				if (domainPerms.hasPerms(settings, domainConversion.hostnameToSld(domain)) != null) continue;
				debugLog("tracking cookie " + domain);
				let cstore = await razorCookies.getCookieStore(tab_header.id);
				cookie.tabids = [tab_header.id];
				cookie.cstores = [cstore];
				if (tracked_cookies[cookie.domain] == undefined) {
					tracked_cookies[cookie.domain] = [cookie];
				} else {
					let already_tracked = false;
					for (let domain_cookie of tracked_cookies[cookie.domain])
					{
						if (cookie.name == domain_cookie.name) {
							if (!domain_cookie.tabids.includes(tab_header.id)) domain_cookie.tabids.push(tab_header.id);
							if (!domain_cookie.cstores.includes(cstore)) domain_cookie.cstores.push(cstore);
							already_tracked = true;
							break;
						}
					}
					if (!already_tracked) {
						tracked_cookies[cookie.domain].push(cookie);
					} else debugLog("already tracked");
				}
			}
		}
		return tracked_cookies;
	},

	handleChangedCookies: (info) => {
		if (gDisableUntilRestart) return;
		if (info.removed) return; // waste of CPU cycles to deal with removed cookies
		razorCookies._tasksHandleChangedCookies.push(info);

		const handle = async (info) => {
			// optimize me
			let name = info.cookie.name;
			let store_id = info.cookie.storeId;
			let keys = Object.keys(razorCookies._tabCookies);
			let testfound = false;
			for (let k of keys)
			{
				if (k == info.cookie.domain)
				{
					for (let cookie of razorCookies._tabCookies[k])
					{
						if (cookie.name == name) {
							testfound = true;
							break;
						}
					}
				}
				if (testfound) break;
			}
			if (!testfound) {
 				let settings = await domainPerms.getSettingsAsync();
				let perms = domainPerms.hasPerms(settings, 
					domainConversion.hostnameToSld(	domainConversion.stripDot(info.cookie.domain) ) 
				);

			 	if (perms == null) {
					 debugLog("IMPROVE ME: Didn't find changed cookie:\n" + 
						"name: " + name + " domain: " + info.cookie.domain + " sid: " + store_id);

			 		const addJsTabCookie = async (cookie) => { // lazy dealing with unknown tab (javascript) cookies
			 			let tabs = await browser.tabs.query({}); // cookies will be deleted when all current tabids removed

			 			let name_domain = name + cookie.domain;

			 			if (razorCookies._javascriptCookies[name_domain] == undefined)
			 			{
			 				razorCookies._javascriptCookies[name_domain] = cookie;
			 				razorCookies._javascriptCookies[name_domain]["tabs"] = [];
			 				razorCookies._javascriptCookies[name_domain]["stores"] = [];
			 			}

			 			for (let tab of tabs)
			 			{
			 				if (!razorCookies._javascriptCookies[name_domain].stores.includes(tab.cookieStoreId))
			 				{
			 					razorCookies._javascriptCookies[name_domain].stores.push(tab.cookieStoreId);
			 				}

			 				if (!razorCookies._javascriptCookies[name_domain].tabs.includes(tab.id))
			 				{
			 					razorCookies._javascriptCookies[name_domain].tabs.push(tab.id);
			 				}
			 			}
			 		}
			 		requestIdleCallback( () => {
			 			addJsTabCookie(info.cookie); 
			 		}, { timeout: 10000 });
			 	}
			}
		}

		const idle_cb = () => {
			if (razorCookies._idIdleCbHandleChangedCookies != null) window.cancelIdleCallback(razorCookies._idIdleCbHandleChangedCookies);
			razorCookies._idIdleCbHandleChangedCookies = requestIdleCallback(async () => { 
				razorCookies._tabCookies = await razorCookies.getTrackedCookies(razorCookies._tabCookies);
				for (let c of razorCookies._tasksHandleChangedCookies) handle(c);
				razorCookies._idIdleCbHandleChangedCookies = null;
				razorCookies._tasksHandleChangedCookies = [];
			}, { timeout: 10000 });
		}

		if (razorCookies._idTimeoutIdleCb != null) window.clearTimeout(razorCookies._idTimeoutIdleCb);
		razorCookies._idTimeoutIdleCb = window.setTimeout(() => {
			razorCookies._idTimeoutIdleCb = null;
			idle_cb();
		}, 500);
	},

 	handleRemoved: (tabId, removeInfo) => {
 		if (gDisableUntilRestart) return;
 		requestIdleCallback(() => { 
			debugLog("handle removed");
		  	razorCookies.deleteTabCookies(tabId); 
		  	razorCookies.deleteUnknownTabCookies(); 
		  	if (razorCookies._tabStores["id" + tabId] != undefined) delete razorCookies._tabStores["id" + tabId];
		}, { timeout: 10000 });
	},

	checkHeaders: (e) => {
		if (gDisableUntilRestart) return;
		for (let hdr of e.responseHeaders)
		{
			if (hdr.name.toLowerCase() == "set-cookie")
			{
				if (e.tabId == -1) debugLog("cookie set on tab -1");
				razorCookies._tabCookieHeaders.push({id: e.tabId, header: hdr.value, url: e.url });
			}
		}
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const domainConversion = {

	_publicSuffixes: [],

	stripDot: (domain) => {
		return (domain.indexOf(".") === 0) ? domain.substring(1) : domain;
	},

	readTextFileAsync: async (path) => {
		let response = await fetch(path, {mode:'same-origin'});
		let txt = await response.text();
		return txt;
	},

	readPublicSuffixesAsync: async () => {
		let txt = await domainConversion.readTextFileAsync(browser.extension.getURL("public_suffixes.txt"));
		domainConversion._publicSuffixes = [];
		let lines = txt.split("\n");
		for(let line of lines)
		{
			if (line.indexOf("//") != -1 || line.trim() == "") continue;
			let domain = line;
			if (line.indexOf("*") != -1) {
				// fix me
				let idx = line.indexOf("*.");
				domain = line.substring(idx + 2);
			} else
			if (line.indexOf("!") != -1) {
				continue;
			} 
			domainConversion._publicSuffixes.push(domain);
		}
	},

	stringInArray: (arr, search) => {
		return arr.find((str) => { return str.indexOf(search) === 0; });
	},

	hostnameToSld: (hostname) => {
		// return ip address
		let re = /\d*\.\d*\.\d*\.\d*$/;
		let matches = hostname.match(re);
		if (matches != undefined && matches[0] != undefined) return matches[0];
		// todo punycode
		// return 2nd level domain if it's not a public suffix
		re = /[a-z0-9-]*\.[a-z0-9-]{2,}$/;
		matches = hostname.match(re);
		if (matches != undefined && matches[0] != undefined) {
			if (!domainConversion.stringInArray(domainConversion._publicSuffixes, matches[0])) return matches[0];
		}
		// return hostname without www.
		if (hostname.indexOf("www.") === 0) return hostname.substring(4);
		// return full hostname
		return hostname;
	},

	urlStringToHostname: (url) => {
	  if (url.indexOf("http://") !== 0 && url.indexOf("https://") !== 0) return "none";
	  let a = document.createElement('a');
	  a.href = url;
	  return a.hostname;
	},

	urlStringToSld: (url) => {
		return domainConversion.hostnameToSld(domainConversion.urlStringToHostname(url));
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const domainPerms = {

	_settings: null,
	_permsChanged: false,

	updatePerms: async (perms, host) => {
		let settings = await domainPerms.getSettingsAsync();
		let tmp_array = [];
		let host_found = false;

		for (let setting of settings.perms)
		{
			if (host == setting.hst)
			{
				if (perms != COOKIE_ACCEPT_TAB) {
					setting.prm = perms;
					host_found = true;
					tmp_array.push(setting);
					debugLog("updating host " + host);
				}
			} else tmp_array.push(setting);
		}

		if (!host_found) {
			if (perms != COOKIE_ACCEPT_TAB)
			{
				debugLog("adding new host " + host);
				tmp_array.push({hst: host, prm: perms});
			}
		}
		domainPerms.savePerms(tmp_array);
	},

	initStorage: async () => {

		let settings = await domainPerms.getSettingsAsync();
		if (settings.perms == undefined) 
		{
			console.log("Running for the first time. Initializing cookie permissions");
			let cookies = await browser.cookies.getAll({});
			let added_hosts = [];
			let cookie_perms = [];
			for (let cookie of cookies) {
				let domain = domainConversion.stripDot(cookie.domain);
				domain = domainConversion.hostnameToSld(domain);
	  			if (added_hosts.indexOf(domain) == -1) {
	  				added_hosts.push(domain);
	  				cookie_perms.push({hst: domain, prm: COOKIE_ACCEPT_PERMANENT});
	  			}
			}
			if (added_hosts.length > 0) domainPerms.savePerms(cookie_perms);
		} 
	},

	hasPerms: (settings, host) => {
		if (host.indexOf(".") === 0) host = host.substring(1);
		let domain = domainConversion.hostnameToSld(host);
		for (let setting of settings.perms) if (setting.hst.indexOf(domain) != -1) return setting.prm;
		return null;
	},

	getSettingsAsync: async () => {
		if (domainPerms._settings == null || domainPerms._permsChanged) domainPerms._settings = await browser.storage.local.get(["perms"]);
		domainPerms._permsChanged = false;
		return domainPerms._settings;
	},

	permsChanged: () => {
		domainPerms._permsChanged = true;
	},

	savePerms: async (perms_array) => {
		await browser.storage.local.set({perms: perms_array});
		domainPerms.permsChanged();
	},

	import: async (text) => {
		let settings = await domainPerms.getSettingsAsync();
		let hosts = [];
		let re = /\d*\.\d*\.\d*\.\d*$|[a-z0-9-]*\.[a-z0-9-]{2,}$/
		let lines = text.split("\n");
		for (let setting of settings.perms) hosts.push(setting.hst);
		for (let line of lines)
		{
			if (line.trim() == "") continue;
			let setting = line.split(",");
			let domain = setting[0];
			let perm = setting[1];
			let matches = domain.match(re);

			if (matches != null) {
				if (perm != COOKIE_ACCEPT_PERMANENT && perm != COOKIE_ACCEPT_SESSION)
				{
					console.error("Error: Unknown permission: " + line);
				} else {
					if (hosts.indexOf(domain) != -1)
					{		
						settings.perms[hosts.indexOf(domain)].prm = perm;
						debugLog("already got host " + domain);
					} else {
						debugLog("adding host " + domain);
						settings.perms.push({hst: domain, prm: perm});
					}
				}
			} else console.error("Error: Could not parse line " + line);
		}
		await domainPerms.savePerms(settings.perms);
		browser.runtime.sendMessage({ reload: "perms" });
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const razorIcon = {

	_idleCallbackId: null,
	_timeoutId: null,

	handleUpdated: (tabId, changeInfo, tabInfo) => {
		if (changeInfo.status != undefined && changeInfo.status == "complete") razorIcon.setIcon(tabInfo);
	},

	setIcon: (tabinfo) => {
		const idle_cb = () => {
			if (razorIcon._idleCallbackId != null) window.cancelIdleCallback(razorIcon._idleCallbackId);
			razorIcon._idleCallbackId = requestIdleCallback(async () => {
				let sld = domainConversion.urlStringToSld(tabinfo.url);
				let icon = ICON_TAB;
				let icon_title = ICON_TITLE_TAB;
				let cookies = await browser.cookies.getAll({ domain: sld });
				if (cookies.length === 0)
				{
					icon = ICON_DEFAULT;
					icon_title = ICON_TITLE_DEFAULT;
				} else {
					let settings = await domainPerms.getSettingsAsync();
					let perms = domainPerms.hasPerms(settings, sld);
					if (perms == COOKIE_ACCEPT_SESSION) {
						icon = ICON_SESSION;
						icon_title = ICON_TITLE_SESSION;
					} else 
					if (perms == COOKIE_ACCEPT_PERMANENT) {
						icon = ICON_PERMANENT;
						icon_title = ICON_TITLE_PERMANENT;
					} else if (tabinfo.url.indexOf("http") == -1) {
						icon = ICON_DEFAULT;
						icon_title = ICON_TITLE_DEFAULT;
					} 
				}

				browser.browserAction.setIcon({path: icon});
				browser.browserAction.setTitle({title: icon_title});
				razorIcon._idleCallbackId = null;

			},  { timeout: 5000 });

		}
		if (razorIcon._timeoutId != null) window.clearTimeout(razorIcon._timeoutId);
		razorIcon._timeoutId = window.setTimeout(() => { idle_cb();	}, 500);
	},

	handleActivated: (active_info) => { 
		gActiveTab = active_info.tabId;
		requestIdleCallback(async () => {
			let tabinfo = await browser.tabs.get(active_info.tabId);
			razorIcon.setIcon(tabinfo);
		},  { timeout: 5000 });
	},

	updateIcon: (tab_id) => {
		requestIdleCallback(async () => {
		    let tabinfo = await browser.tabs.get(tab_id);
  			razorIcon.setIcon(tabinfo);
		},  { timeout: 5000 });

	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const razorNotification = {
	_notificationIcon: browser.extension.getURL(ICON_DEFAULT),
	_notificationId: "razor",

	init: () => {

		browser.notifications.onClicked.addListener( (notification_id) => {
			if (notification_id == razorNotification._notificationId) 
				browser.tabs.create({ url: browser.extension.getURL("html/log.html") });
		});
	},

	display: (text, millis) => {

		if (!gDisplayNotifications) return;

		browser.notifications.create(razorNotification._notificationId, {
			"type": "basic",
			"iconUrl": razorNotification._notificationIcon,
			"title": "CookiErazor v" + VERSION,
			"message": text
		});

		window.setTimeout(() => {
			browser.notifications.clear(razorNotification._notificationId);
		}, millis);
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const optionsHandler = {

	saveOptions: () => {
		debugLog("saving options");
		browser.storage.local.set({
			strict: gDeleteTabCookiesStrict,
			notifications: gDisplayNotifications,
			allstores: gDeleteCookiesAllStores
		});
	}, 

	loadOptions: async () => {
		debugLog("loading options");
		let settings = await browser.storage.local.get([
			'strict',
			'notifications',
			'allstores'
		]);
		if (settings.allstores != undefined) gDeleteCookiesAllStores = settings.allstores;
		if (settings.strict != undefined) gDeleteTabCookiesStrict = settings.strict; 
		if (settings.notifications != undefined) gDisplayNotifications = settings.notifications; 
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const handleMessage = (request, sender, sendResponse) => {

	if (request.permschanged != null)
	{
		domainPerms.permsChanged();
	} else
	if (request.need != null)
	{
		browser.tabs.get(gActiveTab).then(async (tabinfo) => {
			let settings = await domainPerms.getSettingsAsync();
			let host = domainConversion.urlStringToSld(tabinfo.url);
			browser.runtime.sendMessage({
				tabid: gActiveTab, 
				permissions: domainPerms.hasPerms(settings, host),
				disabled: gDisableUntilRestart,
				hostname: host
			});
		});
	} else
	if (request.accept != null)
	{
		domainPerms.updatePerms(request.accept, request.host);
		razorIcon.updateIcon(gActiveTab);
	} else
	if (request.trim != null)
	{
		gDisplayNotificationSwitch = true;
		razorCookies.trimCookies(true);
	} else
	if (request.deletestorecookie != null)
	{
		razorCookies.deleteStoreCookie(
			request.deletestorecookie, 
			request.domain, 
			request.path, 
			request.name, 
			request.secure,
			LOG_DELETE_REASON_MANUAL
		);

	} else
	if (request.deletedomaincookies != null)
	{
		razorCookies.deleteAllCookiesForSld(request.deletedomaincookies, request.store, LOG_DELETE_REASON_MANUAL);
	} else
	if (request.logdata != null)
	{
	    browser.runtime.sendMessage({
	      deletedlog: razorCookies.getLog()
	    });
	} else
	if (request.debug != null)
	{
		if (request.showtabstores != null)
		{
			//
		}
	} else
	if (request.getopts != null)
	{
		    let opts = {

		      options: true,
		      strict: gDeleteTabCookiesStrict,
		      allstores: gDeleteCookiesAllStores,
		      disable: gDisableUntilRestart,
		      notifications: gDisplayNotifications

		    };

    		browser.runtime.sendMessage(opts);

	} else
	if (request.options != null)
	{
		gDeleteTabCookiesStrict = request.strict;
		gDeleteCookiesAllStores = request.allstores;
		gDisableUntilRestart = request.disable;
		gDisplayNotifications = request.notifications;
		optionsHandler.saveOptions();
	} else
	if (request.import != null)
	{
		domainPerms.import(request.import);
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const init = async () => {
	await optionsHandler.loadOptions();
	await domainConversion.readPublicSuffixesAsync();
	domainPerms.initStorage();
	browser.tabs.onUpdated.addListener(razorIcon.handleUpdated);
	browser.tabs.onActivated.addListener(razorIcon.handleActivated);
	browser.tabs.onRemoved.addListener(razorCookies.handleRemoved);
	browser.runtime.onMessage.addListener(handleMessage);
	browser.cookies.onChanged.addListener(razorCookies.handleChangedCookies);
	browser.webRequest.onHeadersReceived.addListener(
	  razorCookies.checkHeaders,
	  {urls: ["<all_urls>"]},
	  ["responseHeaders"]
	);
	razorCookies.trimCookies(false);
	razorNotification.init();
	//razorNotification.display("test", 11333);
}

/* ################################################################################################## */
/* ################################################################################################## */
/* ################################################################################################## */

requestIdleCallback(() => { init(); }, { timeout: 10000 });

/* ################################################################################################## */
/* ################################################################################################## */
/* ################################################################################################## */