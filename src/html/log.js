"use strict";

/* ################################################################################################## */
/* ################################################################################################## */
/* ################################################################################################## */

const LOG_DELETE_REASON_NEW_SESSION = 10;
const LOG_DELETE_REASON_MANUAL = 11;
const LOG_DELETE_REASON_TAB_CLOSED = 12;

/* ################################################################################################## */
/* ################################################################################################## */

const stringUtil = {

	daysSinceDateThen: (date_then) => {
		let diff = Date.now() - date_then;
		diff /= 1000;
		let days = Math.floor(diff / (3600*24));
		let hrs = Math.floor(diff / 3600);
		let mnts = Math.floor((diff - (hrs * 3600)) / 60);
		return days + "d " + hrs + "h " + mnts + "m";
	}
}

/* ################################################################################################## */

const handleMessage = (request, sender, sendResponse) => {

	if (request.deletedlog != null)
	{
		logTable.populate(request.deletedlog);
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const logTable = {

	_body: document.getElementById("log-table-body"),

	init: () => {
	    browser.runtime.sendMessage({
	      logdata: "ohai"
	    });
	},

	populate: (data) => {
		for (let i = data.length - 1; i>=0; i--)
		{
			let row = logTable.createRow(data[i]);
			logTable._body.appendChild(row);
		}
	},

	createRow: (data) => {

		let tr = document.createElement("tr");
		let reason = document.createElement("td");
		let time = document.createElement("td");
		let url = document.createElement("th");
		let name = document.createElement("td");

		data.url = data.url.substring(data.url.indexOf("://") + 3);

		switch(data.reason)
		{
			case LOG_DELETE_REASON_MANUAL:
				reason.textContent = "Manual";
				break;
			case LOG_DELETE_REASON_TAB_CLOSED:
				reason.textContent = "Closed Tab";
				break;
			case LOG_DELETE_REASON_NEW_SESSION:
				reason.textContent = "New Session";
				break;
			default:
				reason.textContent = "internet exploded";
		}
		
		time.textContent = stringUtil.daysSinceDateThen(data.time) + " ago";
		url.textContent = data.url;
		name.textContent = data.name;
		url.setAttribute("scope", "row");
		tr.appendChild(reason);
		tr.appendChild(time);
		tr.appendChild(url);
		tr.appendChild(name);
		return tr;
	}
}

/* ################################################################################################## */
/* ################################################################################################## */

const init = () => {
	browser.runtime.onMessage.addListener(handleMessage);
	logTable.init();
}

init();

/* ################################################################################################## */
/* ################################################################################################## */
