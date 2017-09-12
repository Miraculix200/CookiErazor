"use strict";

/* ################################################################################################## */
/* ################################################################################################## */

const optionsForm = {

  _cbAllStores: document.getElementById("monitor"),
  _cbStrict: document.getElementById("strict"),
  _cbDisable: document.getElementById("disable"),
  _cbNotifications: document.getElementById("notifications"),
  _pageContainer: document.getElementById("page-container"),

  init: () => {

    browser.runtime.onMessage.addListener(   (request, sender, sendResponse) => { 

      if (request.options != null)
      {
        optionsForm._cbStrict.checked = request.strict;
        optionsForm._cbAllStores.checked = request.allstores;
        optionsForm._cbDisable.checked = request.disable;
        optionsForm._cbNotifications.checked = request.notifications;
        optionsForm._pageContainer.style.display = "block";
      }
    });

    browser.runtime.sendMessage({getopts: true});
    document.getElementById("ce-form").addEventListener("click", (e) => {
    optionsForm.saveOptions();
    });
  },

  saveOptions: () => {

    let opts = {
      options: true,
      strict: optionsForm._cbStrict.checked,
      allstores: optionsForm._cbAllStores.checked,
      notifications: optionsForm._cbNotifications.checked,
      disable: optionsForm._cbDisable.checked
    };

    browser.runtime.sendMessage(opts);
  }
}

/* ################################################################################################## */
/* ################################################################################################## */

optionsForm.init();

/* ################################################################################################## */
/* ################################################################################################## */