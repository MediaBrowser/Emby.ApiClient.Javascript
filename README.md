Emby.ApiClient.Javascript
=================================

ApiClient allows JavaScript apps to easily access the Emby API

The source can be found here:

https://github.com/MediaBrowser/Emby/tree/dev/MediaBrowser.WebDashboard/dashboard-ui/apiclient

This repository exists to bring awareness to the library, which is currently embedded within Emby Server.

Connectivity is established using the same guidelines as the Java version, as they are almost direct ports:

https://github.com/MediaBrowser/Emby.ApiClient.Java

# Usage #

Import all script files from the above location, except for the "alt" sub-folder. The files are independent and can be referenced in any order.

# jQuery #

The default implementation depends on jQuery, however this can easily be removed if desired. All jQuery usage has been isolated into three files:

- ajax.js
- deferred.js
- events.js

**To remove the jQuery dependency**:

1. Replace ajax.js with the version from the "alt" sub-folder. This will reimplement the ajax functions using angular. If angular is not desired, this can easily be rewritten to use a plain XmlHttpRequest, as long as the original method signature is maintained.
2. Replace deferred.js with the version from the "alt" sub-folder. This will reimplement promises using a stand-alone method.
3. Replace events.js with the version from the "alt" sub-folder. This will reimplement events using the [bean](https://github.com/fat/bean "bean") library. The bean library will now be required, although it is much lighter and smaller than jQuery.

# Other Notes #

- Reimplement logger.js in order to route library logging to another logging mechanism.
- Reimplement network.js as needed to report whether or not a network connection is available. The default implementation uses navigator.onLine.
- If the udp protocol is supported, then you'll need to reimplement serverdiscovery.js to support locating servers on the network. The default implementation is empty.
- By default, the library stores data using localStorage. Reimplement store.js to store data elsewhere. The method signatures are all key-value based.

# Examples #

This is a port of the [Java version](https://github.com/MediaBrowser/Emby.ApiClient.Java "Java version"). Until this is fully documented it is best to refer to it for API usage as the signatures are closely aligned.

# Emby Mobile App #

A new mobile app for Emby is in development and is built with Appgyver:

https://github.com/MediaBrowser/MediaBrowser.Mobile

The app uses this library and removes the jQuery dependency. It also has a fully implemented startup wizard to guide users through the connection process. This is great sample code for new app development.
