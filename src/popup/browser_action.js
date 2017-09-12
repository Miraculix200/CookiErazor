"use strict";

/* ################################################################################################## */
/* ################################################################################################## */

const razorBrowserAction = (() => {

  const COOKIE_ACCEPT_PERMANENT = 10;
  const COOKIE_ACCEPT_SESSION = 11;
  const COOKIE_ACCEPT_TAB = 12;

  const CLASS_SELECTION_ICON = "selection-icon";
  const CLASS_SUBMENU = "submenu";
  const CLASS_SUBMENU_OPEN = "submenu open";

  const ID_ACCEPT_PERMANENT = "accept-permanent";
  const ID_ACCEPT_SESSION = "accept-session";
  const ID_ACCEPT_TAB = "accept-tab";
  const ID_HEADER_HOST_VALUE = "header-host-value";

  const sendAcceptMessage = (hostname, duration) => {

    browser.runtime.sendMessage({
      accept: duration,
      host: hostname
    });
  }

  const setCheckmark = (id) => {
    let acc_perm = document.getElementById(ID_ACCEPT_PERMANENT);
    let acc_sess = document.getElementById(ID_ACCEPT_SESSION);
    let acc_tab = document.getElementById(ID_ACCEPT_TAB);

    for (let ele of [acc_perm, acc_sess, acc_tab]) 
        ele.getElementsByClassName(CLASS_SELECTION_ICON)[0].style.visibility = "hidden";
  
    document.getElementById(id).getElementsByClassName(CLASS_SELECTION_ICON)[0].style.visibility = "visible";

  }

  const addButtListeners = () => {
    let menu_list = document.getElementById("menu-list");
    let cookie_count = document.getElementById("cookie-count");

    cookie_count.addEventListener("click", (e) => {

      browser.tabs.create({ url: browser.extension.getURL("html/manager.html?host=" + 
        document.getElementById(ID_HEADER_HOST_VALUE).textContent) });
      window.close();

    });

    menu_list.addEventListener("click", (e) => {

      let target_id = e.target.id;
      let hostname = document.getElementById(ID_HEADER_HOST_VALUE).getAttribute("data-hostname");
      let close_popup = true;

      switch(target_id) {
        case ID_ACCEPT_PERMANENT:
          sendAcceptMessage(hostname, COOKIE_ACCEPT_PERMANENT);
          setCheckmark(target_id);
          break;
        case ID_ACCEPT_SESSION:
          sendAcceptMessage(hostname, COOKIE_ACCEPT_SESSION);
          setCheckmark(target_id);
          break;
        case ID_ACCEPT_TAB:
          sendAcceptMessage(hostname, COOKIE_ACCEPT_TAB);
          setCheckmark(target_id);
          break;
        case "manager":
          browser.tabs.create({ url: browser.extension.getURL("html/manager.html") });
          break;
        case "trim":
          browser.runtime.sendMessage({ trim: "ohai" });
          break;
        case "log":
          browser.tabs.create({ url: browser.extension.getURL("html/log.html") });
          break;
        case "dbg":
          browser.runtime.sendMessage({ debug: "ohai", showtabstores: true });
          break;
        case "manage-menu":
          e.target.parentNode.getElementsByClassName(CLASS_SUBMENU)[0].setAttribute("class", CLASS_SUBMENU_OPEN);
          close_popup = false;
          break;
        case "disable":
          e.target.getElementsByClassName(CLASS_SELECTION_ICON)[0].style.visibility = "visible";
          close_popup = false;
          break;
        case "options":
          browser.runtime.openOptionsPage();
          break;
        default:
          console.warn(e.target.parentNode.outerHTML);
      }

      if (close_popup) window.setTimeout(() => { window.close(); }, 200 );
    });
  }

  const displayCookieCount = (host) => {
    let getting = browser.cookies.getAll({ domain: host });
    getting.then((cookies) => {
      document.getElementById("header-cookie-value").textContent = cookies.length;
    });
  }

  const handleMessage = (request, sender, sendResponse) => {

    if (request.hostname != null)
    {
      let site_label = document.getElementById(ID_HEADER_HOST_VALUE);
      site_label.textContent = request.hostname;
      site_label.setAttribute("data-hostname", request.hostname);
      if (request.hostname != undefined && request.hostname != "none") {
        document.getElementById("accept-menu").style.display = "block";
        displayCookieCount(request.hostname);
        let perms = request.permissions;
        if (perms == COOKIE_ACCEPT_PERMANENT) setCheckmark(ID_ACCEPT_PERMANENT);
        else if (perms == COOKIE_ACCEPT_SESSION) setCheckmark(ID_ACCEPT_SESSION);
        else setCheckmark(ID_ACCEPT_TAB);
      } else {
        let mmenu = document.getElementById("manage-menu");
        mmenu.parentNode.getElementsByClassName(CLASS_SUBMENU)[0].setAttribute("class", CLASS_SUBMENU_OPEN);
      }
    }
  }

  const init = () => {
    browser.runtime.onMessage.addListener(handleMessage);
    browser.runtime.sendMessage({ need: "info" });
    addButtListeners();
  }

  init();
})();

/* ################################################################################################## */
/* ################################################################################################## */

