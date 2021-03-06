﻿import common = require("./application-common");
import frame = require("ui/frame");
import definition = require("application");
import * as uiUtilsModule from "ui/utils";
import * as typesModule from "utils/types";
import * as fileResolverModule  from "file-system/file-name-resolver";
import * as enumsModule from "ui/enums";

global.moduleMerge(common, exports);

class Responder extends UIResponder {
    //
}

class Window extends UIWindow {

    private _content;

    initWithFrame(frame: CGRect): UIWindow {
        var window = super.initWithFrame(frame);
        if (window) {
            window.autoresizingMask = UIViewAutoresizing.UIViewAutoresizingNone;
        }
        return window;
    }

    public get content() {
        return this._content;
    }
    public set content(value) {
        this._content = value;
    }

    public layoutSubviews(): void {
        var uiUtils: typeof uiUtilsModule = require("ui/utils");

        uiUtils.ios._layoutRootView(this._content, UIScreen.mainScreen().bounds);
    }
}

class NotificationObserver extends NSObject {
    private _onReceiveCallback: (notification: NSNotification) => void;

    static new(): NotificationObserver {
        return <NotificationObserver>super.new();
    }

    public initWithCallback(onReceiveCallback: (notification: NSNotification) => void): NotificationObserver {
        this._onReceiveCallback = onReceiveCallback;
        return this;
    }

    public onReceive(notification: NSNotification): void {
        this._onReceiveCallback(notification);
    }

    public static ObjCExposedMethods = {
        "onReceive": { returns: interop.types.void, params: [NSNotification] }
    };
}

class IOSApplication implements definition.iOSApplication {
    public rootController: any;

    private _delegate: typeof UIApplicationDelegate;
    private _currentOrientation = UIDevice.currentDevice().orientation;
    private _window: Window;
    private _observers: Array<NotificationObserver>;

    constructor() {
        this._observers = new Array<NotificationObserver>();
        this.addNotificationObserver(UIApplicationDidFinishLaunchingNotification, this.didFinishLaunchingWithOptions.bind(this));
        this.addNotificationObserver(UIApplicationDidBecomeActiveNotification, this.didBecomeActive.bind(this));
        this.addNotificationObserver(UIApplicationDidEnterBackgroundNotification, this.didEnterBackground.bind(this));
        this.addNotificationObserver(UIApplicationWillTerminateNotification, this.willTerminate.bind(this));
        this.addNotificationObserver(UIApplicationDidReceiveMemoryWarningNotification, this.didReceiveMemoryWarning.bind(this));
        this.addNotificationObserver(UIDeviceOrientationDidChangeNotification, this.orientationDidChange.bind(this));
    }

    get nativeApp(): UIApplication {
        return UIApplication.sharedApplication();
    }

    get delegate(): typeof UIApplicationDelegate {
        return this._delegate;
    }
    set delegate(value: typeof UIApplicationDelegate) {
        if (this._delegate !== value) {
            this._delegate = value;
        }
    }

    public addNotificationObserver(notificationName: string, onReceiveCallback: (notification: NSNotification) => void): NotificationObserver {
        var observer = NotificationObserver.new().initWithCallback(onReceiveCallback);
        NSNotificationCenter.defaultCenter().addObserverSelectorNameObject(observer, "onReceive", notificationName, null);
        this._observers.push(observer);
        return observer;
    }

    public removeNotificationObserver(observer: any, notificationName: string) {
        var index = this._observers.indexOf(observer);
        if (index >= 0) {
            this._observers.splice(index, 1);
            NSNotificationCenter.defaultCenter().removeObserverNameObject(observer, notificationName, null);
        }
    }

    private didFinishLaunchingWithOptions(notification: NSNotification) {
        this._window = <Window>Window.alloc().initWithFrame(UIScreen.mainScreen().bounds);
        this._window.backgroundColor = UIColor.whiteColor();

        if (exports.onLaunch) {
            exports.onLaunch();
        }

        exports.notify({
            eventName: exports.launchEvent,
            object: this,
            ios: notification.userInfo && notification.userInfo.objectForKey("UIApplicationLaunchOptionsLocalNotificationKey") || null
        });

        var topFrame = frame.topmost();
        if (!topFrame) {
            // try to navigate to the mainEntry/Module (if specified)
            var navParam = exports.mainEntry;
            if (!navParam) {
                navParam = exports.mainModule;
            }

            if (navParam) {
                topFrame = new frame.Frame();
                topFrame.navigate(navParam);
            } else {
                // TODO: Throw an exception?
                throw new Error("A Frame must be used to navigate to a Page.");
            }
        }

        this._window.content = topFrame;

        this.rootController = this._window.rootViewController = topFrame.ios.controller;

        this._window.makeKeyAndVisible();
    }

    private didBecomeActive(notification: NSNotification) {
        if (exports.onResume) {
            exports.onResume();
        }

        exports.notify({ eventName: exports.resumeEvent, object: this, ios: UIApplication.sharedApplication() });
    }

    private didEnterBackground(notification: NSNotification) {
        if (exports.onSuspend) {
            exports.onSuspend();
        }

        exports.notify({ eventName: exports.suspendEvent, object: this, ios: UIApplication.sharedApplication() });
    }

    private willTerminate(notification: NSNotification) {
        if (exports.onExit) {
            exports.onExit();
        }

        exports.notify({ eventName: exports.exitEvent, object: this, ios: UIApplication.sharedApplication() });
    }

    private didReceiveMemoryWarning(notification: NSNotification) {
        if (exports.onLowMemory) {
            exports.onLowMemory();
        }

        exports.notify({ eventName: exports.lowMemoryEvent, object: this, android: undefined, ios: UIApplication.sharedApplication() });
    }

    private orientationDidChange(notification: NSNotification) {
        var orientation = UIDevice.currentDevice().orientation;

        if (this._currentOrientation !== orientation) {
            this._currentOrientation = orientation;

            var enums: typeof enumsModule = require("ui/enums");

            var newValue;
            switch (orientation) {
                case UIDeviceOrientation.UIDeviceOrientationLandscapeRight:
                case UIDeviceOrientation.UIDeviceOrientationLandscapeLeft:
                    newValue = enums.DeviceOrientation.landscape;
                    break;
                case UIDeviceOrientation.UIDeviceOrientationPortrait:
                case UIDeviceOrientation.UIDeviceOrientationPortraitUpsideDown:
                    newValue = enums.DeviceOrientation.portrait;
                    break;
                default:
                    newValue = enums.DeviceOrientation.unknown;
                    break;
            }

            exports.notify(<definition.OrientationChangedEventData>{
                eventName: exports.orientationChangedEvent,
                ios: this,
                newValue: newValue,
                object: this
            });
        }
    }

}

var iosApp = new IOSApplication();
exports.ios = iosApp;

global.__onUncaughtError = function (error: Error) {
    var types: typeof typesModule = require("utils/types");

    // TODO: This should be obsoleted
    if (types.isFunction(exports.onUncaughtError)) {
        exports.onUncaughtError(error);
    }
    
    exports.notify({ eventName: exports.uncaughtErrorEvent, object: <any>exports.ios, ios: error });
}

var started: boolean = false;
exports.start = function () {
    if (!started) {
        started = true;
        exports.loadCss();
        UIApplicationMain(0, null, null, exports.ios && exports.ios.delegate ? NSStringFromClass(exports.ios.delegate) : NSStringFromClass(Responder));
    } else {
        throw new Error("iOS Application already started!");
    }
}

global.__onLiveSync = function () {
    if (!started) {
        return;
    }

    var fileResolver: typeof fileResolverModule = require("file-system/file-name-resolver");

    // Clear file resolver cache to respect newly added files.
    fileResolver.clearCache();

    // Reload app.css in case it was changed.
    exports.loadCss();

    // Reload current page.
    frame.reloadPage();
}