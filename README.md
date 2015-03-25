MediaBrowser.ApiClient.Javascript
=================================

ApiClient allows JavaScript apps to easily access the Emby API

The source can be found here:

https://github.com/MediaBrowser/MediaBrowser/tree/dev/MediaBrowser.WebDashboard/dashboard-ui/thirdparty/apiclient

This repository exists to bring awareness to the library, which is currently embedded within Emby Server.

Connectivity is established using the same guidelines as the Java version, as they are almost direct ports:

https://github.com/MediaBrowser/MediaBrowser.ApiClient.Java

# Usage #

Import all script files from the above location, except for the "alt" sub-folder. The files are independent and can be referenced in any order.

# jQuery #

The default implementation depends on jQuery, however this can easily be removed if desired. All jQuery usage has been isolated into three files:

- ajax.js
- deferred.js
- events.js

**To remove the jQuery dependency**:

1. Replace ajax.js with the version from the "alt" sub-folder. This will re-implement the ajax functions using angular. If angular is not desired, this can easily be rewritten to use a plain XmlHttpRequest.
2. Replace deferred.js with the version from the "alt" sub-folder. This will re-implement promises using stand-alone method.
3. Replace events.js with the version from the "alt" sub-folder. This will re-implement events using the [bean](https://github.com/fat/bean "bean") library.