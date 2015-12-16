Emby.ApiClient.Javascript
=================================

# Usage #

This is a port of the [Java version](https://github.com/MediaBrowser/Emby.ApiClient.Java "Java version"). Until this is fully documented it is best to refer to it for API usage as the signatures are closely aligned.

# Notes #

- Reimplement logger.js in order to route library logging to another logging mechanism.
- If the udp protocol is supported, then you'll need to reimplement serverdiscovery.js to support locating servers on the network. The default implementation is empty.
- By default, the library stores data using localStorage. Reimplement store.js to store data elsewhere. The method signatures are all key-value based.

# Examples #

This is a port of the [Java version](https://github.com/MediaBrowser/Emby.ApiClient.Java "Java version"). Until this is fully documented it is best to refer to it for API usage as the signatures are closely aligned.

# Emby Mobile App #

A new mobile app for Emby is in development and is built with Appgyver:

https://github.com/MediaBrowser/MediaBrowser.Mobile
