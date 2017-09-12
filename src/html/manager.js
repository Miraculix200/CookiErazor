"use strict";

/* ################################################################################################## */
/* ################################################################################################## */

const COOKIE_ACCEPT_PERMANENT = 10;
const COOKIE_ACCEPT_SESSION = 11;
const COOKIE_ACCEPT_TAB = 12;

const CLASSNAME_ICON_PERMANENT = "icon perm-permanent";
const CLASSNAME_ICON_SESSION = "icon perm-session";

const ICON_PERMANENT = browser.extension.getURL("/icons/CM-allow.png");
const ICON_SESSION = browser.extension.getURL("/icons/CM-session.png");
const ICON_TAB = browser.extension.getURL("/icons/CM-reject.png");

/* ################################################################################################## */
/* ################################################################################################## */

const stringUtil = {

	dateToString: (seconds) => {

		if (seconds == undefined) return seconds;
		let a = new Date(seconds * 1000);
		let months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
		let year = a.getFullYear();
		let month = months[a.getMonth()];
		let date = a.getDate();
		let hour = a.getHours();
		let min = a.getMinutes();
		let sec = a.getSeconds();
		let time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec;
		return time;
	},
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

const permsTable = {
	_template: document.getElementById("perms-row-cloneme"),
	_body: document.getElementById("perms-table-body"),
	_imageElementPermanent: null,
	_imageElementSession: null,
	_imageElementTab: null,
	scrollIntoViewDomain: null,
	_fileButts: document.getElementById("file-buttons"),

	init:  () => {
		permsTable.toDataURL(ICON_PERMANENT, (dataUrl) => {
			permsTable._imageElementPermanent = permsTable.createImageElement(dataUrl);
			permsTable.toDataURL(ICON_SESSION, (dataUrl) => {
				permsTable._imageElementSession = permsTable.createImageElement(dataUrl);
				permsTable.toDataURL(ICON_TAB, async (dataUrl) => {
					permsTable._imageElementTab = permsTable.createImageElement(dataUrl);
					permsTable.addListeners();
					await permsTable.populate();
					if (permsTable.scrollIntoViewDomain != null)
					{
						permsTable.scrollDomainIntoView(permsTable.scrollIntoViewDomain);
					}
				});
			});
		});
	},

	scrollDomainIntoView: (domain) => {

		let elements = permsTable._body.getElementsByTagName("th");
		for (let element of elements)
		{
			if (element.textContent == domain) {
				element.parentNode.scrollIntoView(true);
				break;
			} 
		}
	},

	createImageElement: (base64) => {
		let img = document.createElement("img");
		img.src = base64;
		return img;
	},

	toDataURL: (url, callback) => {
		  var xhr = new XMLHttpRequest();
		  xhr.onload = function() {
		    var reader = new FileReader();
		    reader.onloadend = function() {
		      callback(reader.result);
		    }
		    reader.readAsDataURL(xhr.response);
		  };
		  xhr.open('GET', url);
		  xhr.responseType = 'blob';
		  xhr.send();
	},

	changeIconOrRemove: (element, perms) => {
		if (perms == COOKIE_ACCEPT_TAB)
		{
			element.parentNode.parentNode.removeChild(element.parentNode);
		} else {
			let e_permanent = element.parentNode.getElementsByClassName(CLASSNAME_ICON_PERMANENT)[0];
			let e_session = element.parentNode.getElementsByClassName(CLASSNAME_ICON_SESSION)[0];
			if (perms == COOKIE_ACCEPT_SESSION)
			{
				e_permanent.setAttribute("class", CLASSNAME_ICON_PERMANENT);
				e_session.setAttribute("class", CLASSNAME_ICON_SESSION + " selected");
			} else
			if (perms == COOKIE_ACCEPT_PERMANENT)
			{
				e_permanent.setAttribute("class", CLASSNAME_ICON_PERMANENT + " selected");
				e_session.setAttribute("class", CLASSNAME_ICON_SESSION);
			} 
		}
	},

	changeStoragePerms: (element, perms) => {
		let th = element.parentNode.getElementsByTagName("th")[0];
	    browser.runtime.sendMessage({
	      accept: perms,
	      host: th.textContent
	    });
	},

	changePerms: (element) => {
		switch(element.getAttribute("action")) {
			case "perm-permanent":
				permsTable.changeStoragePerms(element, COOKIE_ACCEPT_PERMANENT);
				permsTable.changeIconOrRemove(element, COOKIE_ACCEPT_PERMANENT);
				break;
			case "perm-session":
				permsTable.changeStoragePerms(element, COOKIE_ACCEPT_SESSION);
				permsTable.changeIconOrRemove(element, COOKIE_ACCEPT_SESSION);
				break;
			case "perm-tab":
				permsTable.changeStoragePerms(element, COOKIE_ACCEPT_TAB);
				permsTable.changeIconOrRemove(element, COOKIE_ACCEPT_TAB);
				break;
			default:
				console.warn("wtf? " + element.outerHTML);
		}
	},

	exportImport: (action) => {

		switch(action) {
			case "import":
				permsTable.importPerms();
				break;
			case "export":
				permsTable.exportPerms();
				break;
		}
	},

	importPerms: () => {
		var input = document.createElement('input');
		input.type = 'file';
		input.accept = '.txt,.crp'
		input.click();
		input.addEventListener("change", () => {
			let reader = new FileReader();
			reader.readAsText(input.files[0]);
			reader.onloadend = function(event){
			    browser.runtime.sendMessage({ import: event.target.result });
			}
		});
	},

	exportPerms: async () => {

		let textToSave = "";
		let settings = await browser.storage.local.get(["perms"]);
		settings.perms.sort((a,b) => { return a.hst > b.hst; });

		for (let setting of settings.perms)
		{
			textToSave += "\n" + setting.hst + "," + setting.prm;
		}
		
		let textToSaveAsBlob = new Blob([textToSave], {type:"text/plain"});
		let textToSaveAsURL = window.URL.createObjectURL(textToSaveAsBlob);
		let fileNameToSaveAs = "cookiErazor-perms.crp";

		let downloadLink = document.createElement("a");
		downloadLink.download = fileNameToSaveAs;
		downloadLink.innerHTML = "Download File";
		downloadLink.href = textToSaveAsURL;
		downloadLink.style.display = "none";
		document.body.appendChild(downloadLink);
		downloadLink.click();
		document.body.removeChild(downloadLink);
	},

	addListeners: () => {
		permsTable._body.addEventListener("click", (e) => {
			permsTable.changePerms(e.target);
		});

		permsTable._fileButts.addEventListener("click", (e) => {
			permsTable.exportImport(e.target.getAttribute("action"));
		});
	},

	createRow: (domain, permission) => {
		let clone = permsTable._template.cloneNode(true);
		clone.removeAttribute("id");
		clone.removeAttribute("style");

		let domain_field = clone.getElementsByTagName("th")[0];
		domain_field.textContent = domain;

		let element = clone.getElementsByClassName("perm-permanent")[0];
		if (permission != COOKIE_ACCEPT_PERMANENT) element =  clone.getElementsByClassName("perm-session")[0];
		element.setAttribute("class", element.getAttribute("class") + " selected");
		clone.getElementsByClassName("perm-permanent")[0].innerHTML = permsTable._imageElementPermanent.outerHTML;
		clone.getElementsByClassName("perm-session")[0].innerHTML = permsTable._imageElementSession.outerHTML;
		return clone;
	},

	populate: async () => {
		let settings = await browser.storage.local.get(["perms"]);
		settings.perms.sort((a,b) => { return a.hst > b.hst; });
		permsTable._body.innerHTML = "";
		
		let fragment = document.createDocumentFragment();
		for (let perm_item of settings.perms)
		{
			let clone = permsTable.createRow(perm_item.hst, perm_item.prm);
			fragment.appendChild(clone);
		}

		permsTable._body.appendChild(fragment);
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const cookieInfos = {

	_popupContainer: document.getElementById("popup-container"),
	_popupBackground: document.getElementById("popup-background"),
	_domainName: document.getElementById("domain-name"),
	_cookieTable: document.getElementById("popup-cookie-table"),
	_cookieValue: document.getElementById("cookie-value"),
	_cookieName: document.getElementById("cookie-name"),
	_cookieDomain: document.getElementById("cookie-domain"),
	_cookieHostOnly: document.getElementById("cookie-hostOnly"),
	_cookiePath: document.getElementById("cookie-path"),
	_cookieHttpOnly: document.getElementById("cookie-httpOnly"),
	_cookieSession: document.getElementById("cookie-session"),
	_cookieDate: document.getElementById("cookie-date"),
	_cookieSecure: document.getElementById("cookie-secure"),
	_currentCookiesData: null,

	init: () => {
		cookieInfos.addListeners();
	},

	highlightCookie: (target) => {
		let cookies = cookieInfos._cookieTable.getElementsByTagName("td");
		for (let ele of cookies)
		{
			ele.removeAttribute("class");
		}
		target.setAttribute("class", "selected");
	},

	addListeners: () => {
		cookieInfos._popupBackground.addEventListener("click", (e) => {
			cookieInfos._popupContainer.style.display = "none";
		});

		cookieInfos._cookieTable.addEventListener("click", (e) => {
			let name = e.target.getAttribute("data-name");
			let domain = e.target.getAttribute("data-domain");
			cookieInfos.showInfos( cookieTable.getCookieForDomain(domain, name) );
			cookieInfos.highlightCookie(e.target);
		});

		document.getElementById("delete-selected-cookie").addEventListener("click",  (e) => {
			browser.runtime.sendMessage({ 
				deletestorecookie: cookieTable.getStoreName(),
				domain: cookieInfos._cookieDomain.textContent,
				path: cookieInfos._cookiePath.textContent,
				name: cookieInfos._cookieName.textContent,
				secure: cookieInfos._cookieSecure.textContent
			 });

			for (let c of cookieInfos._currentCookiesData)
			{
				if (c.name == cookieInfos._cookieName.textContent && 
					c.domain == cookieInfos._cookieDomain.textContent) {

					cookieInfos._currentCookiesData.splice(c, 1);

				}
			}
			cookieInfos.display(cookieInfos._domainName.textContent, cookieInfos._currentCookiesData);
		});
	},

	createRow: (data) => {
		let tr = document.createElement("tr");
		let td = document.createElement("td");
		td.textContent = data.name;
		td.setAttribute("data-name", data.name);
		td.setAttribute("data-domain", data.domain);
		tr.appendChild(td);
		return tr;
	},

	display: (domain, data) => {
		if (data == undefined) return;
		cookieInfos._currentCookiesData = data.concat();
		cookieInfos._popupContainer.style.display = "block";
		cookieInfos._domainName.textContent = domain;
		let fragment = document.createDocumentFragment();
		for (let c of data)
		{
			fragment.appendChild(cookieInfos.createRow(c));
		}
		cookieInfos._cookieTable.innerHTML = "";
		cookieInfos._cookieTable.appendChild(fragment);

		cookieInfos.showInfos(data[0]);
		cookieInfos.highlightCookie(cookieInfos._cookieTable.getElementsByTagName("td")[0]);
	},

	showInfos: (cookie) => {

		cookieInfos._cookieValue.textContent = cookie.value;
		cookieInfos._cookieName.textContent = cookie.name;
		cookieInfos._cookieDomain.textContent = cookie.domain;
		cookieInfos._cookieHostOnly.textContent = cookie.hostOnly;
		cookieInfos._cookiePath.textContent = cookie.path;
		cookieInfos._cookieHttpOnly.textContent = cookie.httpOnly;
		cookieInfos._cookieSession.textContent = cookie.session;
		cookieInfos._cookieSecure.textContent = cookie.secure;
		cookieInfos._cookieDate.textContent = stringUtil.dateToString(cookie.expirationDate) || "session";
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const cstoreList = {

	init: () => {
		cstoreList.populate();
		cstoreList.listenClicks();
	},

	listenClicks: () => {
		let sub = document.getElementById("selector-submenu");
		let store_butt = document.getElementById("store-button");
		document.getElementById("cstore-selector-dropdown").addEventListener("click", (e) => {
			if (e.target.getAttribute("data-id") != null)
			{
				cookieTable.setStore(e.target.textContent, e.target.getAttribute("data-id"));
				cookieTable.populate();
				sub.setAttribute("class", "selector-submenu");
			}
		});

		store_butt.addEventListener("click", (e) => {
			sub.setAttribute("class", "selector-submenu open");
		});
	},

	populate: async () => {
		let cstores = [];
		let stores = await browser.cookies.getAllCookieStores();

	    for(let store of stores) cstores.push({name: store.id, id: store.id} );
	 
		if (browser.contextualIdentities)
		{
			let contexts = await browser.contextualIdentities.query({});
		 	for (let context of contexts) cstores.push({name: context.name, id: context.cookieStoreId});
		}

		let selector_submenu = document.getElementById("selector-submenu");
		selector_submenu.innerHTML = "";
			  
	 	for (let store of cstores)
	 	{
	 		selector_submenu.appendChild(cstoreList.createStoreItem(store));
	 	}
	},

	createStoreItem: (store) => {

	 		let li = document.createElement("li");
	 		li.setAttribute("class", "cstore-item");
	 		li.textContent = store.name;
	 		li.setAttribute("data-id", store.id);
	 		return li;
	}
}


/* ################################################################################################## */
/* ################################################################################################## */

const cookieTable = {
	_template: document.getElementById("cookie-row-cloneme"),
	_body: document.getElementById("cookie-table-body"),
	_storeButtonTextId: document.getElementById("store-text"),
	_cookieData: [],
	_selectedStore: "firefox-default",
	displayInfosDomain: null,

	init: async () => {
		cookieTable.addListeners();
		await cookieTable.populate();
		cookieTable.updateStoreButton();
		cstoreList.init();
		if (cookieTable.displayInfosDomain != null) 
		{
			cookieTable.scrollDomainIntoView(cookieTable.displayInfosDomain);
			cookieTable.displayCookiesForDomain(cookieTable.displayInfosDomain);
		}
	},

	scrollDomainIntoView: (domain) => {
		let elements = cookieTable._body.getElementsByTagName("th");
		for (let element of elements)
		{
			if (element.textContent == domain) {
				element.parentNode.scrollIntoView(true);
				break;
			}
		}
	},

	getStoreName: () => {
		return cookieTable._selectedStore;
	},

	setStore: (name, id) => {
		cookieTable._selectedStore = id;
		cookieTable.updateStoreButton(name);
	},

	updateStoreButton: (name) => {
		cookieTable._storeButtonTextId.textContent = name || cookieTable._selectedStore;
	},

	displayCookiesForDomain: (domain) => {
		cookieInfos.display(domain, cookieTable._cookieData[domain]);
	},
	
	addListeners: () => {
		cookieTable._body.addEventListener("click", (e) => {
			switch(e.target.getAttribute("type")) {
				case "cookie-domain":
					cookieInfos.display(e.target.textContent, cookieTable._cookieData[e.target.textContent]);
					break;
				case "cookie-show":
					cookieTable.displayCookiesForDomain(e.target.parentNode.getElementsByTagName("th")[0].textContent);
					break;
				case "cookie-delete":
				    browser.runtime.sendMessage({
				      deletedomaincookies: e.target.parentNode.getElementsByTagName("th")[0].textContent,
				      store: cookieTable._selectedStore
				    });
				 	e.target.parentNode.parentNode.removeChild(e.target.parentNode);
					break;
				default:
					console.log(e.target.outerHTML);
			}
		});
	},

	createRow: (domain, count) => {
		let clone = cookieTable._template.cloneNode(true);
		clone.removeAttribute("id");
		clone.removeAttribute("style");

		let domain_field = clone.getElementsByTagName("th")[0];
		domain_field.textContent = domain;

		let counter_field = clone.getElementsByClassName("cookie-counter")[0];
		counter_field.textContent = count;
		return clone;
	},

	populate: async () => {
		cookieTable._cookieData = await cookieTable.getCookieData(cookieTable._selectedStore);
		cookieTable._body.innerHTML = "";
		let fragment = document.createDocumentFragment();
		for (let domain in cookieTable._cookieData)
		{
			let clone = cookieTable.createRow(domain, cookieTable._cookieData[domain].length);
			fragment.appendChild(clone);
		}
		cookieTable._body.appendChild(fragment);
	},

	getCookieForDomain: (domain, name) => {
		for (let d in cookieTable._cookieData)
		{
			for (let c of cookieTable._cookieData[d])
			{
				if (c.name == name && c.domain == domain) return c;
			}
		}
		return null;
	},

	getCookieData: async (cstore) => {
		let cookies = await browser.cookies.getAll({storeId: cstore});
		let cookie_data = [];
		for (let cookie of cookies)
		{
			let stripped_domain = domainConversion.hostnameToSld(domainConversion.stripDot(cookie.domain));
			if (cookie_data[stripped_domain] == undefined)
			{
				cookie_data[stripped_domain] = [cookie];
			} else {
				cookie_data[stripped_domain].push(cookie);
			}
		}
		return cookieTable.sortCookieData(cookie_data);
	},

	sortCookieData: (cookie_data) => {
		let keys = Object.keys(cookie_data);
		let tmp = [];
		keys.sort((a, b) => {
		  return a.localeCompare(b);
		});
		for (let k of keys) tmp[k] = cookie_data[k].slice();
		return tmp;
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const readGetParams = () => {
	let params = window.location.search.substr(1);
	if (params == "") return;
	if (params.indexOf("host=") != -1)
	{
		let host = params.substring(5);
		return host;
	}
	return false;
}

/* ################################################################################################## */
/* ################################################################################################## */

const handleMessage = (request, sender, sendResponse) => {

	if (request.reload != null)
	{
		permsTable.populate();
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const init = async () => {

	let domain = readGetParams();
	if (domain !== false) {
		cookieTable.displayInfosDomain = domain;
		permsTable.scrollIntoViewDomain = domain;
	}

	await domainConversion.readPublicSuffixesAsync();
	await cookieTable.init();
	permsTable.init();
	cookieInfos.init();
	browser.runtime.onMessage.addListener(handleMessage);
}

init();

/* ################################################################################################## */
/* ################################################################################################## */
